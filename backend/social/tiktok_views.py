"""
TikTok Login Kit OAuth 2.0 (with mandatory PKCE) flow.
Flow:
  1. Frontend calls GET /api/oauth/tiktok/start/?client_id=<uuid>&account_id=<uuid>
  2. Backend generates a fresh PKCE code_verifier/code_challenge pair, builds
     the TikTok authorization URL, returns it
  3. Frontend opens popup to that URL
  4. User logs in & authorizes on TikTok
  5. TikTok redirects to /api/oauth/tiktok/callback/?code=...&state=...
  6. Backend exchanges code (+ stored code_verifier) for token, fetches the
     account's open_id and display name, saves to DB
  7. Popup closes, frontend polls /api/oauth/tiktok/status/<state>/ → gets result

Notes:
  - TikTok's API uses "client_key" (not "client_id") as the param name.
  - Access tokens last ~24 hours; refresh tokens last ~1 year and rotate on
    every use — see refresh_tiktok_token() below, call it before publishing
    if account.token_expires_at has passed.
  - Posting video content requires the Content Posting API and a separate app
    review/audit from TikTok before it can be used outside sandbox mode; the
    scopes below only cover login + reading basic profile info.
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

TIKTOK_OAUTH = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_API   = "https://open.tiktokapis.com/v2"

SCOPES = ["user.info.basic", "video.publish"]


def _client_key():
    return settings.TIKTOK_CLIENT_KEY

def _client_secret():
    return settings.TIKTOK_CLIENT_SECRET

def _redirect_uri(request):
    # Must exactly match the redirect URI registered in your TikTok app's
    # Login Kit settings.
    return request.build_absolute_uri("/api/oauth/tiktok/callback/")

def _make_pkce_pair():
    """
    Generates a fresh PKCE code_verifier + code_challenge (S256 method) for
    a single OAuth attempt. Each connection attempt gets its own pair —
    never reuse one across users/attempts. TikTok requires the verifier to
    be 43-128 chars.
    """
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


# ── Step 1: Start OAuth ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tiktok_oauth_start(request):
    """
    Returns the TikTok OAuth authorization URL to open in a popup.
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

    cache.set(f"tiktok_oauth_state:{state}", {
        "client_id":     str(client_id),
        "account_id":    str(account_id),
        "user_id":       str(request.user.id),
        "org_id":        str(org.id),
        "code_verifier": code_verifier,
    }, timeout=600)

    params = {
        "client_key":            _client_key(),
        "redirect_uri":          _redirect_uri(request),
        "response_type":         "code",
        "scope":                 ",".join(SCOPES),
        "state":                 state,
        "code_challenge":        code_challenge,
        "code_challenge_method": "S256",
    }
    url = TIKTOK_OAUTH + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    return Response({"oauth_url": url, "state": state})


# ── Step 2: Callback (TikTok redirects here) ──────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def tiktok_oauth_callback(request):
    """
    TikTok redirects here after user authorizes.
    Exchanges code (+ code_verifier) → token, fetches account, stores in cache.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    state_data = cache.get(f"tiktok_oauth_state:{state}") if state else None

    if error or not code or not state_data:
        reason = error or "Invalid state or missing code."
        if state:
            cache.set(f"tiktok_oauth_result:{state}", {"success": False, "error": reason}, timeout=300)
        return _popup_close_html(success=False, error=reason)

    try:
        token_res = requests.post(
            TIKTOK_TOKEN,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Cache-Control": "no-cache",
            },
            data={
                "client_key":     _client_key(),
                "client_secret":  _client_secret(),
                "code":           code,
                "grant_type":     "authorization_code",
                "redirect_uri":   _redirect_uri(request),
                "code_verifier":  state_data["code_verifier"],
            },
            timeout=10,
        ).json()

        if "error" in token_res or not token_res.get("access_token"):
            raise Exception(token_res.get("error_description", token_res.get("error", "Token exchange failed.")))

        access_token   = token_res["access_token"]
        refresh_token  = token_res.get("refresh_token", "")
        expires_in     = token_res.get("expires_in", 86400)  # ~24 hours
        open_id        = token_res.get("open_id", "")

        # Fetch the account's display name tied to this token
        me_res = requests.get(
            f"{TIKTOK_API}/user/info/",
            params={"fields": "open_id,display_name"},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        ).json()

        user_data = (me_res.get("data") or {}).get("user", {})
        display_name = user_data.get("display_name", "")
        open_id = user_data.get("open_id", open_id)

        if not open_id:
            raise Exception("Could not retrieve TikTok account info.")

        cache.set(f"tiktok_oauth_result:{state}", {
            "success":       True,
            "state_data":    state_data,
            "open_id":       open_id,
            "display_name":  display_name,
            "access_token":  access_token,
            "refresh_token": refresh_token,
            "expires_in":    expires_in,
        }, timeout=300)

        return _popup_close_html(success=True)

    except Exception as exc:
        logger.exception("TikTok OAuth callback error: %s", exc)
        cache.set(f"tiktok_oauth_result:{state}", {"success": False, "error": str(exc)}, timeout=300)
        return _popup_close_html(success=False, error=str(exc))


def _popup_close_html(success, error=""):
    """Returns HTML that closes the popup and notifies the opener."""
    msg = json.dumps({"type": "TIKTOK_OAUTH_DONE", "success": success, "error": error})
    html = f"""<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({msg}, '*');
    window.close();
    </script><p>{'Connected! You may close this window.' if success else f'Error: {error}'}</p></body></html>"""
    from django.http import HttpResponse
    return HttpResponse(html)


# ── Step 3: Status poll ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tiktok_oauth_status(request, state):
    """Frontend polls this after popup closes."""
    result = cache.get(f"tiktok_oauth_result:{state}")
    if result is None:
        return Response({"pending": True})
    return Response(result)


# ── Step 4: Save to DB ─────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tiktok_oauth_save(request):
    """
    Frontend calls this after status poll shows success.
    Body: { state }
    """
    state = request.data.get("state")

    result = cache.get(f"tiktok_oauth_result:{state}")
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

    account.page_id          = result["open_id"]
    account.handle           = result.get("display_name", "")
    account.access_token     = result["access_token"]
    account.refresh_token    = result.get("refresh_token", "")
    account.token_expires_at = timezone.now() + timedelta(seconds=result.get("expires_in", 86400))
    account.is_connected     = True
    # TikTok's Display API doesn't expose the @handle here, so profile_url
    # falls back to the generic base URL set in auto_profile_url().
    account.save()

    cache.delete(f"tiktok_oauth_result:{state}")
    cache.delete(f"tiktok_oauth_state:{state}")

    return Response({"account": SocialAccountSerializer(account).data})


# ── Helper: refresh an expired token (call before publishing) ────────────────

def refresh_tiktok_token(account: SocialAccount) -> str:
    """
    TikTok access tokens expire in ~24 hours. Call this before publishing if
    account.token_expires_at is in the past. Returns the new access_token
    and updates the account in place. TikTok issues a NEW refresh_token on
    each refresh — the old one stops working, so we must store the new one
    every time. Requires no user re-consent.
    """
    if not account.refresh_token:
        raise Exception("No refresh token stored for this TikTok account. Reconnect required.")

    res = requests.post(
        TIKTOK_TOKEN,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache",
        },
        data={
            "client_key":     _client_key(),
            "client_secret":  _client_secret(),
            "grant_type":     "refresh_token",
            "refresh_token":  account.refresh_token,
        },
        timeout=10,
    ).json()

    if "error" in res or not res.get("access_token"):
        raise Exception(res.get("error_description", res.get("error", "TikTok token refresh failed.")))

    account.access_token = res["access_token"]
    if res.get("refresh_token"):
        account.refresh_token = res["refresh_token"]
    account.token_expires_at = timezone.now() + timedelta(seconds=res.get("expires_in", 86400))
    account.save(update_fields=["_access_token_encrypted", "_refresh_token_encrypted", "token_expires_at"])

    return account.access_token