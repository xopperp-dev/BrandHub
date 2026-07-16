"""
Pinterest OAuth flow.
Flow:
  1. Frontend calls GET /api/oauth/pinterest/start/?client_id=<uuid>&account_id=<uuid>
  2. Backend builds Pinterest OAuth URL with state param, returns it
  3. Frontend opens popup to that URL
  4. User logs in & grants permissions on Pinterest
  5. Pinterest redirects to /api/oauth/pinterest/callback/?code=...&state=...
  6. Backend exchanges code for token (+ refresh token), fetches account, saves to DB
  7. Popup closes, frontend polls /api/oauth/pinterest/status/<state>/ → gets result

Note: Pinterest access tokens last ~30 days and require the "continuous refresh
token" to renew — see refresh_pinterest_token() below, call it before publishing
if account.token_expires_at has passed.
"""

import uuid
import json
import base64
import requests
import logging
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from social.models import SocialAccount
from social.serializers import SocialAccountSerializer

logger = logging.getLogger(__name__)

PINTEREST_OAUTH = "https://www.pinterest.com/oauth/"
PINTEREST_TOKEN = "https://api.pinterest.com/v5/oauth/token"
PINTEREST_API   = "https://api.pinterest.com/v5"

SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"]


def _client_id():
    return settings.PINTEREST_CLIENT_ID

def _client_secret():
    return settings.PINTEREST_CLIENT_SECRET

def _redirect_uri(request):
    # Must exactly match a redirect URI registered in your Pinterest app settings
    return request.build_absolute_uri("/api/oauth/pinterest/callback/")

def _basic_auth_header():
    raw = f"{_client_id()}:{_client_secret()}".encode()
    return "Basic " + base64.b64encode(raw).decode()


# ── Step 1: Start OAuth ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pinterest_oauth_start(request):
    """
    Returns the Pinterest OAuth URL to open in a popup.
    Query params: client_id, account_id (both UUIDs)
    """
    client_id  = request.query_params.get("client_id")
    account_id = request.query_params.get("account_id")

    if not client_id or not account_id:
        return Response({"detail": "client_id and account_id are required."}, status=400)

    try:
        org = request.user.organization
        account = SocialAccount.objects.get(
            id=account_id, client__id=client_id, client__organization=org,
        )
    except SocialAccount.DoesNotExist:
        return Response({"detail": "Account not found."}, status=404)

    state = uuid.uuid4().hex
    cache.set(f"pinterest_oauth_state:{state}", {
        "client_id":  str(client_id),
        "account_id": str(account_id),
        "user_id":    str(request.user.id),
        "org_id":     str(org.id),
    }, timeout=600)

    params = {
        "client_id":     _client_id(),
        "redirect_uri":  _redirect_uri(request),
        "response_type": "code",
        "scope":         ",".join(SCOPES),
        "state":         state,
    }
    url = PINTEREST_OAUTH + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    return Response({"oauth_url": url, "state": state})


# ── Step 2: Callback (Pinterest redirects here) ───────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def pinterest_oauth_callback(request):
    """
    Pinterest redirects here after user grants permission.
    Exchanges code → token, fetches account info, stores result in cache.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    state_data = cache.get(f"pinterest_oauth_state:{state}") if state else None

    if error or not code or not state_data:
        reason = error or "Invalid state or missing code."
        if state:
            cache.set(f"pinterest_oauth_result:{state}", {"success": False, "error": reason}, timeout=300)
        return _popup_close_html(success=False, error=reason)

    try:
        token_res = requests.post(
            PINTEREST_TOKEN,
            headers={
                "Authorization": _basic_auth_header(),
                "Content-Type":  "application/x-www-form-urlencoded",
            },
            data={
                "grant_type":   "authorization_code",
                "code":         code,
                "redirect_uri": _redirect_uri(request),
            },
            timeout=10,
        ).json()

        if "error" in token_res:
            raise Exception(token_res.get("message", token_res.get("error", "Token exchange failed.")))

        access_token  = token_res["access_token"]
        refresh_token = token_res.get("refresh_token", "")
        expires_in    = token_res.get("expires_in", 2592000)  # ~30 days

        # Fetch the Pinterest account tied to this token
        me_res = requests.get(
            f"{PINTEREST_API}/user_account",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        ).json()

        username = me_res.get("username", "")
        if not username:
            raise Exception("Could not retrieve Pinterest account info.")

        cache.set(f"pinterest_oauth_result:{state}", {
            "success":       True,
            "state_data":    state_data,
            "username":      username,
            "access_token":  access_token,
            "refresh_token": refresh_token,
            "expires_in":    expires_in,
        }, timeout=300)

        return _popup_close_html(success=True)

    except Exception as exc:
        logger.exception("Pinterest OAuth callback error: %s", exc)
        cache.set(f"pinterest_oauth_result:{state}", {"success": False, "error": str(exc)}, timeout=300)
        return _popup_close_html(success=False, error=str(exc))


def _popup_close_html(success, error=""):
    """Returns HTML that closes the popup and notifies the opener."""
    msg = json.dumps({"type": "PINTEREST_OAUTH_DONE", "success": success, "error": error})
    html = f"""<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({msg}, '*');
    window.close();
    </script><p>{'Connected! You may close this window.' if success else f'Error: {error}'}</p></body></html>"""
    from django.http import HttpResponse
    return HttpResponse(html)


# ── Step 3: Status poll ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def pinterest_oauth_status(request, state):
    """Frontend polls this after popup closes."""
    result = cache.get(f"pinterest_oauth_result:{state}")
    if result is None:
        return Response({"pending": True})
    return Response(result)


# ── Step 4: Save to DB ─────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pinterest_oauth_save(request):
    """
    Frontend calls this after status poll shows success.
    Body: { state }
    """
    state = request.data.get("state")

    result = cache.get(f"pinterest_oauth_result:{state}")
    if not result or not result.get("success"):
        return Response({"detail": "OAuth session expired or invalid."}, status=400)

    state_data = result["state_data"]

    try:
        org = request.user.organization
        account = SocialAccount.objects.get(
            id=state_data["account_id"],
            client__id=state_data["client_id"],
            client__organization=org,
        )
    except SocialAccount.DoesNotExist:
        return Response({"detail": "Account not found."}, status=404)

    account.handle           = result["username"]
    account.access_token     = result["access_token"]
    account.refresh_token    = result.get("refresh_token", "")
    account.token_expires_at = timezone.now() + timedelta(seconds=result.get("expires_in", 2592000))
    account.is_connected     = True
    account.profile_url      = f"https://www.pinterest.com/{result['username']}/"
    account.save()

    cache.delete(f"pinterest_oauth_result:{state}")
    cache.delete(f"pinterest_oauth_state:{state}")

    return Response({"account": SocialAccountSerializer(account).data})


# ── Helper: refresh an expired token (call before publishing) ────────────────

def refresh_pinterest_token(account: SocialAccount) -> str:
    """
    Pinterest access tokens last ~30 days. Call this before publishing if
    account.token_expires_at is in the past. Returns the new access_token
    and updates the account in place. Pinterest issues a NEW refresh_token
    on each refresh — the old one stops working, so we must store the new one.
    """
    if not account.refresh_token:
        raise Exception("No refresh token stored for this Pinterest account. Reconnect required.")

    res = requests.post(
        PINTEREST_TOKEN,
        headers={
            "Authorization": _basic_auth_header(),
            "Content-Type":  "application/x-www-form-urlencoded",
        },
        data={
            "grant_type":    "refresh_token",
            "refresh_token": account.refresh_token,
        },
        timeout=10,
    ).json()

    if "error" in res:
        raise Exception(res.get("message", res.get("error", "Pinterest token refresh failed.")))

    account.access_token = res["access_token"]
    if res.get("refresh_token"):
        account.refresh_token = res["refresh_token"]
    account.token_expires_at = timezone.now() + timedelta(seconds=res.get("expires_in", 2592000))
    account.save(update_fields=["_access_token_encrypted", "_refresh_token_encrypted", "token_expires_at"])

    return account.access_token