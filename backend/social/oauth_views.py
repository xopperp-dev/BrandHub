"""
Facebook OAuth flow — no manual token copy-pasting.
Flow:
  1. Frontend calls GET /api/oauth/facebook/start/?client_id=<uuid>&account_id=<uuid>
  2. Backend builds Facebook OAuth URL with state param, returns it
  3. Frontend opens popup to that URL
  4. User logs in & grants permissions on Facebook
  5. Facebook redirects to /api/oauth/facebook/callback/?code=...&state=...
  6. Backend exchanges code for token, fetches pages, auto-selects the first
     Page (same one-click behavior as X/Reddit/etc — no page-picker shown)
  7. Popup closes, frontend polls /api/oauth/facebook/status/<state>/, then
     calls /api/oauth/facebook/save/ with just { state } to persist it

Note: if a client manages more than one Facebook Page, the first one returned
by /me/accounts is used automatically. To connect a different Page, manage
Page order/permissions on the Facebook side, or disconnect and reconnect
after removing access to the unwanted Page from the Business Settings.
"""

import uuid
import json
import requests
import logging

from django.conf import settings
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from social.models import SocialAccount, Client
from social.serializers import SocialAccountSerializer

logger = logging.getLogger(__name__)

GRAPH = f"https://graph.facebook.com/{settings.META_GRAPH_API_VERSION}"
FB_OAUTH = "https://www.facebook.com/dialog/oauth"
FB_TOKEN = f"{GRAPH}/oauth/access_token"

SCOPES = [
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_show_list",
    "instagram_basic",
    "instagram_content_publish",
]


def _app_id():
    return settings.META_APP_ID

def _app_secret():
    return settings.META_APP_SECRET

def _redirect_uri(request):
    # Must exactly match the URI registered in Meta App → Valid OAuth Redirect URIs
    return request.build_absolute_uri("/api/oauth/facebook/callback/")


# ── Step 1: Start OAuth ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def facebook_oauth_start(request):
    """
    Returns the Facebook OAuth URL to open in a popup.
    Query params: client_id, account_id (both UUIDs)
    """
    client_id  = request.query_params.get("client_id")
    account_id = request.query_params.get("account_id")

    if not client_id or not account_id:
        return Response({"detail": "client_id and account_id are required."}, status=400)

    # Verify ownership
    try:
        org = request.user.organization
        account = SocialAccount.objects.get(
            id=account_id,
            client__id=client_id,
            client__organization=org,
        )
    except SocialAccount.DoesNotExist:
        return Response({"detail": "Account not found."}, status=404)

    # Build state param — store mapping in cache for 10 minutes
    state = uuid.uuid4().hex
    cache.set(f"oauth_state:{state}", {
        "client_id":  str(client_id),
        "account_id": str(account_id),
        "user_id":    str(request.user.id),
        "org_id":     str(org.id),
    }, timeout=600)

    params = {
        "client_id":     _app_id(),
        "redirect_uri":  _redirect_uri(request),
        "scope":         ",".join(SCOPES),
        "response_type": "code",
        "state":         state,
    }
    url = FB_OAUTH + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    return Response({"oauth_url": url, "state": state})


# ── Step 2: Callback (Facebook redirects here) ────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def facebook_oauth_callback(request):
    """
    Facebook redirects here after user grants permission.
    Exchanges code → token, fetches pages, saves to DB, stores result in cache.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    # Retrieve state data
    state_data = cache.get(f"oauth_state:{state}") if state else None

    if error or not code or not state_data:
        reason = request.query_params.get("error_description", error or "Invalid state or missing code.")
        if state:
            cache.set(f"oauth_result:{state}", {"success": False, "error": reason}, timeout=300)
        return _popup_close_html(success=False, error=reason)

    try:
        # Exchange code for short-lived token
        token_res = requests.get(FB_TOKEN, params={
            "client_id":     _app_id(),
            "client_secret": _app_secret(),
            "redirect_uri":  _redirect_uri(request),
            "code":          code,
        }, timeout=10).json()

        if "error" in token_res:
            raise Exception(token_res["error"].get("message", "Token exchange failed."))

        short_token = token_res["access_token"]

        # Exchange for long-lived token (60 days)
        ll_res = requests.get(FB_TOKEN, params={
            "grant_type":        "fb_exchange_token",
            "client_id":         _app_id(),
            "client_secret":     _app_secret(),
            "fb_exchange_token": short_token,
        }, timeout=10).json()

        long_token = ll_res.get("access_token", short_token)

        # Fetch all pages the user manages
        pages_res = requests.get(f"{GRAPH}/me/accounts", params={
            "access_token": long_token,
            "fields": "id,name,access_token,picture",
        }, timeout=10).json()

        pages = pages_res.get("data", [])

        if not pages:
            raise Exception("No Facebook Pages found for this account. Make sure you manage at least one Page.")

        # Auto-select the first Page — same one-click behavior as X/Reddit/etc,
        # no page-picker shown to the user.
        chosen_page = pages[0]

        # Store result in cache for frontend to poll
        cache.set(f"oauth_result:{state}", {
            "success":              True,
            "state_data":           state_data,
            "chosen_page_id":       chosen_page.get("id"),
            "chosen_page_name":     chosen_page.get("name", ""),
            "chosen_page_token":    chosen_page.get("access_token", ""),
        }, timeout=300)

        return _popup_close_html(success=True)

    except Exception as exc:
        logger.exception("Facebook OAuth callback error: %s", exc)
        cache.set(f"oauth_result:{state}", {"success": False, "error": str(exc)}, timeout=300)
        return _popup_close_html(success=False, error=str(exc))


def _popup_close_html(success, error=""):
    """Returns HTML that closes the popup and notifies the opener."""
    msg = json.dumps({"type": "FB_OAUTH_DONE", "success": success, "error": error})
    html = f"""<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({msg}, '*');
    window.close();
    </script><p>{'Connected! You may close this window.' if success else f'Error: {error}'}</p></body></html>"""
    from django.http import HttpResponse
    return HttpResponse(html)


# ── Step 3: Status poll + page select ─────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def facebook_oauth_status(request, state):
    """
    Frontend polls this after popup closes.
    Returns {success} once the Page has been auto-selected server-side —
    no page list is sent to the frontend anymore.
    """
    result = cache.get(f"oauth_result:{state}")
    if result is None:
        return Response({"pending": True})
    return Response(result)


# ── Step 4: Save the auto-selected page to DB ─────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def facebook_oauth_save(request):
    """
    Frontend calls this after status poll shows success.
    Body: { state }  — same shape as the other one-click OAuth platforms.
    Fetches the never-expiring page token for the auto-selected Page and saves.
    """
    state = request.data.get("state")

    result = cache.get(f"oauth_result:{state}")
    if not result or not result.get("success"):
        return Response({"detail": "OAuth session expired or invalid."}, status=400)

    state_data        = result["state_data"]
    chosen_page_id    = result["chosen_page_id"]
    page_access_token = result["chosen_page_token"]

    # Verify ownership again
    try:
        org     = request.user.organization
        account = SocialAccount.objects.get(
            id=state_data["account_id"],
            client__id=state_data["client_id"],
            client__organization=org,
        )
    except SocialAccount.DoesNotExist:
        return Response({"detail": "Account not found."}, status=404)

    try:
        # Get never-expiring page token
        never_expire_res = requests.get(f"{GRAPH}/{chosen_page_id}", params={
            "fields":       "access_token,name,fan_count,picture",
            "access_token": page_access_token,
        }, timeout=10).json()

        never_expire_token = never_expire_res.get("access_token", page_access_token)
        page_name = never_expire_res.get("name", "")

        # Also check for linked Instagram Business Account
        ig_res = requests.get(f"{GRAPH}/{chosen_page_id}", params={
            "fields":       "instagram_business_account",
            "access_token": never_expire_token,
        }, timeout=10).json()
        ig_id = ig_res.get("instagram_business_account", {}).get("id", "")

        # Save Facebook account
        account.page_id      = chosen_page_id
        account.handle       = page_name
        account.access_token = never_expire_token
        account.is_connected = True
        account.profile_url  = f"https://www.facebook.com/{chosen_page_id}"
        account.save()

        # Auto-connect Instagram account if found
        ig_connected = None
        if ig_id:
            try:
                ig_account = SocialAccount.objects.get(
                    client=account.client, platform="instagram"
                )
                ig_account.page_id      = ig_id
                ig_account.handle       = page_name
                ig_account.access_token = never_expire_token
                ig_account.is_connected = True
                ig_account.save()
                ig_connected = SocialAccountSerializer(ig_account).data
            except SocialAccount.DoesNotExist:
                pass

        cache.delete(f"oauth_result:{state}")
        cache.delete(f"oauth_state:{state}")

        return Response({
            "account":      SocialAccountSerializer(account).data,
            "ig_connected": ig_connected,
        })

    except Exception as exc:
        logger.exception("Error saving OAuth page: %s", exc)
        return Response({"detail": str(exc)}, status=500)