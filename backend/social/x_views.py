"""
X (Twitter) OAuth 2.0 flow with PKCE.
Flow:
  1. Frontend calls GET /api/oauth/x/start/?client_id=<uuid>&account_id=<uuid>
  2. Backend generates a fresh PKCE code_verifier/code_challenge pair, builds
     the X authorization URL, returns it
  3. Frontend opens popup to that URL
  4. User logs in & authorizes on X
  5. X redirects to /api/oauth/x/callback/?code=...&state=...
  6. Backend exchanges code (+ stored code_verifier) for token, fetches the
     account's numeric ID and username, saves to DB
  7. Popup closes, frontend polls /api/oauth/x/status/<state>/ → gets result

Note: X OAuth 2.0 User Context access tokens are short-lived (~2 hours).
See refresh_x_token() below — call it before publishing if
account.token_expires_at has passed. Requires the "offline.access" scope,
which is included below, so every connection also receives a refresh_token.
"""

import uuid
import json
import base64
import hashlib
import secrets
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

X_OAUTH = "https://twitter.com/i/oauth2/authorize"
X_TOKEN = "https://api.twitter.com/2/oauth2/token"
X_API   = "https://api.twitter.com/2"

SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"]


def _client_id():
    return settings.X_CLIENT_ID

def _client_secret():
    return settings.X_CLIENT_SECRET

def _redirect_uri(request):
    # Must exactly match the callback URI registered in your X app's
    # "User authentication settings" (Web App / Confidential client).
    return request.build_absolute_uri("/api/oauth/x/callback/")

def _basic_auth_header():
    raw = f"{_client_id()}:{_client_secret()}".encode()
    return "Basic " + base64.b64encode(raw).decode()

def _make_pkce_pair():
    """
    Generates a fresh PKCE code_verifier + code_challenge (S256 method) for
    a single OAuth attempt. Each connection attempt gets its own pair —
    never reuse one across users/attempts.
    """
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


# ── Step 1: Start OAuth ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def x_oauth_start(request):
    """
    Returns the X OAuth 2.0 authorization URL to open in a popup.
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
    code_verifier, code_challenge = _make_pkce_pair()

    cache.set(f"x_oauth_state:{state}", {
        "client_id":     str(client_id),
        "account_id":    str(account_id),
        "user_id":       str(request.user.id),
        "org_id":        str(org.id),
        "code_verifier": code_verifier,
    }, timeout=600)

    params = {
        "response_type":        "code",
        "client_id":            _client_id(),
        "redirect_uri":         _redirect_uri(request),
        "scope":                " ".join(SCOPES),
        "state":                state,
        "code_challenge":       code_challenge,
        "code_challenge_method": "S256",
    }
    url = X_OAUTH + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    return Response({"oauth_url": url, "state": state})


# ── Step 2: Callback (X redirects here) ───────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def x_oauth_callback(request):
    """
    X redirects here after user authorizes.
    Exchanges code (+ code_verifier) → token, fetches account, stores in cache.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    state_data = cache.get(f"x_oauth_state:{state}") if state else None

    if error or not code or not state_data:
        reason = error or "Invalid state or missing code."
        if state:
            cache.set(f"x_oauth_result:{state}", {"success": False, "error": reason}, timeout=300)
        return _popup_close_html(success=False, error=reason)

    try:
        token_res = requests.post(
            X_TOKEN,
            headers={
                "Authorization": _basic_auth_header(),
                "Content-Type":  "application/x-www-form-urlencoded",
            },
            data={
                "code":          code,
                "grant_type":    "authorization_code",
                "client_id":     _client_id(),
                "redirect_uri":  _redirect_uri(request),
                "code_verifier": state_data["code_verifier"],
            },
            timeout=10,
        ).json()

        if "error" in token_res:
            raise Exception(token_res.get("error_description", token_res.get("error", "Token exchange failed.")))

        access_token  = token_res["access_token"]
        refresh_token = token_res.get("refresh_token", "")
        expires_in    = token_res.get("expires_in", 7200)  # ~2 hours

        # Fetch the account tied to this token
        me_res = requests.get(
            f"{X_API}/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        ).json()

        user_data = me_res.get("data", {})
        account_id_x = user_data.get("id", "")
        username     = user_data.get("username", "")

        if not account_id_x:
            raise Exception("Could not retrieve X account info.")

        cache.set(f"x_oauth_result:{state}", {
            "success":       True,
            "state_data":    state_data,
            "account_id_x":  account_id_x,
            "username":      username,
            "access_token":  access_token,
            "refresh_token": refresh_token,
            "expires_in":    expires_in,
        }, timeout=300)

        return _popup_close_html(success=True)

    except Exception as exc:
        logger.exception("X OAuth callback error: %s", exc)
        cache.set(f"x_oauth_result:{state}", {"success": False, "error": str(exc)}, timeout=300)
        return _popup_close_html(success=False, error=str(exc))


def _popup_close_html(success, error=""):
    """Returns HTML that closes the popup and notifies the opener."""
    msg = json.dumps({"type": "X_OAUTH_DONE", "success": success, "error": error})
    html = f"""<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({msg}, '*');
    window.close();
    </script><p>{'Connected! You may close this window.' if success else f'Error: {error}'}</p></body></html>"""
    from django.http import HttpResponse
    return HttpResponse(html)


# ── Step 3: Status poll ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def x_oauth_status(request, state):
    """Frontend polls this after popup closes."""
    result = cache.get(f"x_oauth_result:{state}")
    if result is None:
        return Response({"pending": True})
    return Response(result)


# ── Step 4: Save to DB ─────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def x_oauth_save(request):
    """
    Frontend calls this after status poll shows success.
    Body: { state }
    """
    state = request.data.get("state")

    result = cache.get(f"x_oauth_result:{state}")
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

    account.page_id          = result["account_id_x"]
    account.handle           = result["username"]
    account.access_token     = result["access_token"]
    account.refresh_token    = result.get("refresh_token", "")
    account.token_expires_at = timezone.now() + timedelta(seconds=result.get("expires_in", 7200))
    account.is_connected     = True
    account.profile_url      = f"https://x.com/{result['username']}"
    account.save()

    cache.delete(f"x_oauth_result:{state}")
    cache.delete(f"x_oauth_state:{state}")

    return Response({"account": SocialAccountSerializer(account).data})


# ── Helper: refresh an expired token (call before publishing) ────────────────

def refresh_x_token(account: SocialAccount) -> str:
    """
    X OAuth 2.0 User Context tokens expire in ~2 hours. Call this before
    publishing if account.token_expires_at is in the past. Returns the new
    access_token and updates the account in place. X issues a NEW
    refresh_token on each refresh — the old one stops working, so we must
    store the new one every time.
    """
    if not account.refresh_token:
        raise Exception("No refresh token stored for this X account. Reconnect required.")

    res = requests.post(
        X_TOKEN,
        headers={
            "Authorization": _basic_auth_header(),
            "Content-Type":  "application/x-www-form-urlencoded",
        },
        data={
            "grant_type":    "refresh_token",
            "refresh_token": account.refresh_token,
            "client_id":     _client_id(),
        },
        timeout=10,
    ).json()

    if "error" in res:
        raise Exception(res.get("error_description", res.get("error", "X token refresh failed.")))

    account.access_token = res["access_token"]
    if res.get("refresh_token"):
        account.refresh_token = res["refresh_token"]
    account.token_expires_at = timezone.now() + timedelta(seconds=res.get("expires_in", 7200))
    account.save(update_fields=["_access_token_encrypted", "_refresh_token_encrypted", "token_expires_at"])

    return account.access_token