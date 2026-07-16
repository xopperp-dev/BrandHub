"""
Reddit OAuth flow.
Flow:
  1. Frontend calls GET /api/oauth/reddit/start/?client_id=<uuid>&account_id=<uuid>
  2. Backend builds Reddit OAuth URL with state param, returns it
  3. Frontend opens popup to that URL
  4. User logs in & grants permissions on Reddit
  5. Reddit redirects to /api/oauth/reddit/callback/?code=...&state=...
  6. Backend exchanges code for token (+ refresh token), fetches username, saves to DB
  7. Popup closes, frontend polls /api/oauth/reddit/status/<state>/ → gets result
"""

import uuid
import json
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

REDDIT_OAUTH = "https://www.reddit.com/api/v1/authorize"
REDDIT_TOKEN = "https://www.reddit.com/api/v1/access_token"
REDDIT_API   = "https://oauth.reddit.com"
USER_AGENT   = "BrandHub/1.0 (by /u/brandhub_app)"

SCOPES = ["identity", "submit", "read"]


def _client_id():
    return settings.REDDIT_CLIENT_ID

def _client_secret():
    return settings.REDDIT_CLIENT_SECRET

def _redirect_uri(request):
    # Must exactly match the URI registered in your Reddit app settings
    return request.build_absolute_uri("/api/oauth/reddit/callback/")


# ── Step 1: Start OAuth ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reddit_oauth_start(request):
    """
    Returns the Reddit OAuth URL to open in a popup.
    Query params: client_id, account_id (both UUIDs)
    """
    client_id  = request.query_params.get("client_id")
    account_id = request.query_params.get("account_id")

    if not client_id or not account_id:
        return Response({"detail": "client_id and account_id are required."}, status=400)

    try:
        org = request.user.organization
        account = SocialAccount.objects.get(
            id=account_id,
            client__id=client_id,
            client__organization=org,
        )
    except SocialAccount.DoesNotExist:
        return Response({"detail": "Account not found."}, status=404)

    state = uuid.uuid4().hex
    cache.set(f"reddit_oauth_state:{state}", {
        "client_id":  str(client_id),
        "account_id": str(account_id),
        "user_id":    str(request.user.id),
        "org_id":     str(org.id),
    }, timeout=600)

    params = {
        "client_id":     _client_id(),
        "response_type": "code",
        "state":         state,
        "redirect_uri":  _redirect_uri(request),
        "duration":      "permanent",  # required to receive a refresh_token
        "scope":         " ".join(SCOPES),
    }
    url = REDDIT_OAUTH + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    return Response({"oauth_url": url, "state": state})


# ── Step 2: Callback (Reddit redirects here) ──────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def reddit_oauth_callback(request):
    """
    Reddit redirects here after user grants permission.
    Exchanges code → token, fetches username, stores result in cache.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    state_data = cache.get(f"reddit_oauth_state:{state}") if state else None

    if error or not code or not state_data:
        reason = error or "Invalid state or missing code."
        if state:
            cache.set(f"reddit_oauth_result:{state}", {"success": False, "error": reason}, timeout=300)
        return _popup_close_html(success=False, error=reason)

    try:
        token_res = requests.post(
            REDDIT_TOKEN,
            auth=(_client_id(), _client_secret()),
            data={
                "grant_type":   "authorization_code",
                "code":         code,
                "redirect_uri": _redirect_uri(request),
            },
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        ).json()

        if "error" in token_res:
            raise Exception(token_res.get("error", "Token exchange failed."))

        access_token  = token_res["access_token"]
        refresh_token = token_res.get("refresh_token", "")
        expires_in    = token_res.get("expires_in", 3600)

        # Fetch the Reddit username tied to this token
        me_res = requests.get(
            f"{REDDIT_API}/api/v1/me",
            headers={
                "Authorization": f"Bearer {access_token}",
                "User-Agent":    USER_AGENT,
            },
            timeout=10,
        ).json()

        username = me_res.get("name", "")
        if not username:
            raise Exception("Could not retrieve Reddit username for this account.")

        cache.set(f"reddit_oauth_result:{state}", {
            "success":       True,
            "state_data":    state_data,
            "username":      username,
            "access_token":  access_token,
            "refresh_token": refresh_token,
            "expires_in":    expires_in,
        }, timeout=300)

        return _popup_close_html(success=True)

    except Exception as exc:
        logger.exception("Reddit OAuth callback error: %s", exc)
        cache.set(f"reddit_oauth_result:{state}", {"success": False, "error": str(exc)}, timeout=300)
        return _popup_close_html(success=False, error=str(exc))


def _popup_close_html(success, error=""):
    """Returns HTML that closes the popup and notifies the opener."""
    msg = json.dumps({"type": "REDDIT_OAUTH_DONE", "success": success, "error": error})
    html = f"""<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({msg}, '*');
    window.close();
    </script><p>{'Connected! You may close this window.' if success else f'Error: {error}'}</p></body></html>"""
    from django.http import HttpResponse
    return HttpResponse(html)


# ── Step 3: Status poll ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reddit_oauth_status(request, state):
    """Frontend polls this after popup closes."""
    result = cache.get(f"reddit_oauth_result:{state}")
    if result is None:
        return Response({"pending": True})
    return Response(result)


# ── Step 4: Save to DB ─────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reddit_oauth_save(request):
    """
    Frontend calls this after status poll shows success.
    Body: { state }
    """
    state = request.data.get("state")

    result = cache.get(f"reddit_oauth_result:{state}")
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
    account.token_expires_at = timezone.now() + timedelta(seconds=result.get("expires_in", 3600))
    account.is_connected     = True
    account.profile_url      = f"https://www.reddit.com/user/{result['username']}"
    account.save()

    cache.delete(f"reddit_oauth_result:{state}")
    cache.delete(f"reddit_oauth_state:{state}")

    return Response({"account": SocialAccountSerializer(account).data})


# ── Helper: refresh an expired token (call before publishing) ────────────────

def refresh_reddit_token(account: SocialAccount) -> str:
    """
    Reddit access tokens expire in ~1 hour. Call this before publishing
    if account.token_expires_at is in the past. Returns the new access_token
    and updates the account in place.
    """
    if not account.refresh_token:
        raise Exception("No refresh token stored for this Reddit account. Reconnect required.")

    res = requests.post(
        REDDIT_TOKEN,
        auth=(_client_id(), _client_secret()),
        data={
            "grant_type":    "refresh_token",
            "refresh_token": account.refresh_token,
        },
        headers={"User-Agent": USER_AGENT},
        timeout=10,
    ).json()

    if "error" in res:
        raise Exception(res.get("error", "Reddit token refresh failed."))

    account.access_token = res["access_token"]
    account.token_expires_at = timezone.now() + timedelta(seconds=res.get("expires_in", 3600))
    account.save(update_fields=["_access_token_encrypted", "token_expires_at"])

    return account.access_token