"""
YouTube (Google) OAuth flow.
Flow:
  1. Frontend calls GET /api/oauth/youtube/start/?client_id=<uuid>&account_id=<uuid>
  2. Backend builds Google OAuth URL with state param, returns it
  3. Frontend opens popup to that URL
  4. User logs in & grants permissions on Google
  5. Google redirects to /api/oauth/youtube/callback/?code=...&state=...
  6. Backend exchanges code for token (+ refresh token), fetches channel, saves to DB
  7. Popup closes, frontend polls /api/oauth/youtube/status/<state>/ → gets result
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

GOOGLE_OAUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
YOUTUBE_API  = "https://www.googleapis.com/youtube/v3"

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]


def _client_id():
    return settings.GOOGLE_CLIENT_ID

def _client_secret():
    return settings.GOOGLE_CLIENT_SECRET

def _redirect_uri(request):
    # Must exactly match the URI registered in Google Cloud Console → Credentials
    return request.build_absolute_uri("/api/oauth/youtube/callback/")


# ── Step 1: Start OAuth ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def youtube_oauth_start(request):
    """
    Returns the Google OAuth URL to open in a popup.
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
    cache.set(f"yt_oauth_state:{state}", {
        "client_id":  str(client_id),
        "account_id": str(account_id),
        "user_id":    str(request.user.id),
        "org_id":     str(org.id),
    }, timeout=600)

    params = {
        "client_id":     _client_id(),
        "redirect_uri":  _redirect_uri(request),
        "response_type": "code",
        "scope":         " ".join(SCOPES),
        "access_type":   "offline",  # required to receive a refresh_token
        "prompt":        "consent",  # forces refresh_token even on repeat auths
        "state":         state,
    }
    url = GOOGLE_OAUTH + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    return Response({"oauth_url": url, "state": state})


# ── Step 2: Callback (Google redirects here) ──────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def youtube_oauth_callback(request):
    """
    Google redirects here after user grants permission.
    Exchanges code → token, fetches channel, stores result in cache.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    state_data = cache.get(f"yt_oauth_state:{state}") if state else None

    if error or not code or not state_data:
        reason = error or "Invalid state or missing code."
        if state:
            cache.set(f"yt_oauth_result:{state}", {"success": False, "error": reason}, timeout=300)
        return _popup_close_html(success=False, error=reason)

    try:
        token_res = requests.post(GOOGLE_TOKEN, data={
            "client_id":     _client_id(),
            "client_secret": _client_secret(),
            "code":          code,
            "redirect_uri":  _redirect_uri(request),
            "grant_type":    "authorization_code",
        }, timeout=10).json()

        if "error" in token_res:
            raise Exception(token_res.get("error_description", "Token exchange failed."))

        access_token  = token_res["access_token"]
        refresh_token = token_res.get("refresh_token", "")
        expires_in    = token_res.get("expires_in", 3600)

        # Fetch the YouTube channel tied to this account
        channel_res = requests.get(f"{YOUTUBE_API}/channels", params={
            "part": "snippet",
            "mine": "true",
        }, headers={"Authorization": f"Bearer {access_token}"}, timeout=10).json()

        items = channel_res.get("items", [])
        if not items:
            raise Exception("No YouTube channel found for this account. Make sure the Google account has a YouTube channel.")

        channel_id   = items[0]["id"]
        channel_name = items[0]["snippet"]["title"]

        cache.set(f"yt_oauth_result:{state}", {
            "success":       True,
            "state_data":    state_data,
            "channel_id":    channel_id,
            "channel_name":  channel_name,
            "access_token":  access_token,
            "refresh_token": refresh_token,
            "expires_in":    expires_in,
        }, timeout=300)

        return _popup_close_html(success=True)

    except Exception as exc:
        logger.exception("YouTube OAuth callback error: %s", exc)
        cache.set(f"yt_oauth_result:{state}", {"success": False, "error": str(exc)}, timeout=300)
        return _popup_close_html(success=False, error=str(exc))


def _popup_close_html(success, error=""):
    """Returns HTML that closes the popup and notifies the opener."""
    msg = json.dumps({"type": "YT_OAUTH_DONE", "success": success, "error": error})
    html = f"""<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({msg}, '*');
    window.close();
    </script><p>{'Connected! You may close this window.' if success else f'Error: {error}'}</p></body></html>"""
    from django.http import HttpResponse
    return HttpResponse(html)


# ── Step 3: Status poll ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def youtube_oauth_status(request, state):
    """Frontend polls this after popup closes."""
    result = cache.get(f"yt_oauth_result:{state}")
    if result is None:
        return Response({"pending": True})
    return Response(result)


# ── Step 4: Save to DB ─────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def youtube_oauth_save(request):
    """
    Frontend calls this after status poll shows success.
    Body: { state }
    """
    state = request.data.get("state")

    result = cache.get(f"yt_oauth_result:{state}")
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

    account.page_id          = result["channel_id"]
    account.handle           = result["channel_name"]
    account.access_token     = result["access_token"]
    account.refresh_token    = result.get("refresh_token", "")
    account.token_expires_at = timezone.now() + timedelta(seconds=result.get("expires_in", 3600))
    account.is_connected     = True
    account.profile_url      = f"https://www.youtube.com/channel/{result['channel_id']}"
    account.save()

    cache.delete(f"yt_oauth_result:{state}")
    cache.delete(f"yt_oauth_state:{state}")

    return Response({"account": SocialAccountSerializer(account).data})


# ── Helper: refresh an expired token (call before publishing) ────────────────

def refresh_youtube_token(account: SocialAccount) -> str:
    """
    Google access tokens expire in ~1 hour. Call this before publishing
    if account.token_expires_at is in the past. Returns the new access_token
    and updates the account in place.
    """
    if not account.refresh_token:
        raise Exception("No refresh token stored for this YouTube account. Reconnect required.")

    res = requests.post(GOOGLE_TOKEN, data={
        "client_id":     _client_id(),
        "client_secret": _client_secret(),
        "refresh_token": account.refresh_token,
        "grant_type":    "refresh_token",
    }, timeout=10).json()

    if "error" in res:
        raise Exception(res.get("error_description", "YouTube token refresh failed."))

    account.access_token = res["access_token"]
    account.token_expires_at = timezone.now() + timedelta(seconds=res.get("expires_in", 3600))
    account.save(update_fields=["_access_token_encrypted", "token_expires_at"])

    return account.access_token