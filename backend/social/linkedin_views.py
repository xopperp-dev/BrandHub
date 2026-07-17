"""
LinkedIn OAuth 2.0 flow (Marketing Developer Platform required for
organization posting).
Flow:
  1. Frontend calls GET /api/oauth/linkedin/start/?client_id=<uuid>&account_id=<uuid>
  2. Backend builds the LinkedIn authorization URL, returns it
  3. Frontend opens popup to that URL
  4. User logs in & authorizes on LinkedIn
  5. LinkedIn redirects to /api/oauth/linkedin/callback/?code=...&state=...
  6. Backend exchanges code for an access token, fetches the organizations
     the user administers (via the Marketing API), caches the choices
  7. Popup closes, frontend polls /api/oauth/linkedin/status/<state>/ → gets
     the list of organizations the user can post as
  8. Frontend shows a page-picker (same UX as Facebook), user picks one
  9. Frontend calls /api/oauth/linkedin/save/ with { state, org_id, org_name }

Note: LinkedIn access tokens are long-lived (~60 days) and LinkedIn does not
issue refresh tokens for the standard 3-legged flow used here — when a token
expires the user must reconnect. This app requires access to the Marketing
Developer Platform product (LinkedIn approval required) with the
r_organization_social and w_organization_social scopes.
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

LINKEDIN_OAUTH = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_API   = "https://api.linkedin.com/v2"

# openid/profile → identity (who authorized). w_organization_social/
# r_organization_social → post as & read organization pages. Requires the
# Marketing Developer Platform product to be approved on the LinkedIn app.
SCOPES = ["openid", "profile", "w_organization_social", "r_organization_social"]


def _client_id():
    return settings.LINKEDIN_CLIENT_ID

def _client_secret():
    return settings.LINKEDIN_CLIENT_SECRET

def _redirect_uri(request):
    # Must exactly match a "Authorized redirect URL" registered under the
    # LinkedIn app's Auth settings.
    return request.build_absolute_uri("/api/oauth/linkedin/callback/")


# ── Step 1: Start OAuth ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def linkedin_oauth_start(request):
    """
    Returns the LinkedIn OAuth 2.0 authorization URL to open in a popup.
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

    cache.set(f"linkedin_oauth_state:{state}", {
        "client_id":  str(client_id),
        "account_id": str(account_id),
        "user_id":    str(request.user.id),
        "org_id":     str(org.id),
    }, timeout=600)

    params = {
        "response_type": "code",
        "client_id":     _client_id(),
        "redirect_uri":  _redirect_uri(request),
        "scope":         " ".join(SCOPES),
        "state":         state,
    }
    url = LINKEDIN_OAUTH + "?" + "&".join(f"{k}={v}" for k, v in params.items())

    return Response({"oauth_url": url, "state": state})


# ── Step 2: Callback (LinkedIn redirects here) ─────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def linkedin_oauth_callback(request):
    """
    LinkedIn redirects here after user authorizes.
    Exchanges code → token, fetches the organizations the user can admin,
    stores the choices in cache for the frontend page-picker.
    """
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    state_data = cache.get(f"linkedin_oauth_state:{state}") if state else None

    if error or not code or not state_data:
        reason = error or "Invalid state or missing code."
        if state:
            cache.set(f"linkedin_oauth_result:{state}", {"success": False, "error": reason}, timeout=300)
        return _popup_close_html(success=False, error=reason)

    try:
        token_res = requests.post(
            LINKEDIN_TOKEN,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type":    "authorization_code",
                "code":          code,
                "redirect_uri":  _redirect_uri(request),
                "client_id":     _client_id(),
                "client_secret": _client_secret(),
            },
            timeout=10,
        ).json()

        if "error" in token_res:
            raise Exception(token_res.get("error_description", token_res.get("error", "Token exchange failed.")))

        access_token = token_res["access_token"]
        expires_in   = token_res.get("expires_in", 60 * 24 * 3600)  # ~60 days

        # Fetch organizations this user is an admin (ADMINISTRATOR role) of.
        # organizationAcls returns roleAssignee relationships for the user.
        acl_res = requests.get(
            f"{LINKEDIN_API}/organizationAcls",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "q": "roleAssignee",
                "role": "ADMINISTRATOR",
                "projection": "(elements*(organization~(localizedName,id)))",
            },
            timeout=10,
        ).json()

        orgs = []
        for el in acl_res.get("elements", []):
            org_data = el.get("organization~", {})
            org_urn = el.get("organization", "")
            org_id = org_urn.split(":")[-1] if org_urn else org_data.get("id")
            if org_id:
                orgs.append({
                    "id":   str(org_id),
                    "name": org_data.get("localizedName", f"Organization {org_id}"),
                })

        if not orgs:
            raise Exception(
                "No LinkedIn organization pages found for this account. "
                "You must be an admin of a LinkedIn Company Page to connect it."
            )

        cache.set(f"linkedin_oauth_result:{state}", {
            "success":      True,
            "state_data":   state_data,
            "access_token": access_token,
            "expires_in":   expires_in,
            "orgs":         orgs,
        }, timeout=300)

        return _popup_close_html(success=True)

    except Exception as exc:
        logger.exception("LinkedIn OAuth callback error: %s", exc)
        cache.set(f"linkedin_oauth_result:{state}", {"success": False, "error": str(exc)}, timeout=300)
        return _popup_close_html(success=False, error=str(exc))


def _popup_close_html(success, error=""):
    """Returns HTML that closes the popup and notifies the opener."""
    msg = json.dumps({"type": "LINKEDIN_OAUTH_DONE", "success": success, "error": error})
    html = f"""<!DOCTYPE html><html><body><script>
    window.opener && window.opener.postMessage({msg}, '*');
    window.close();
    </script><p>{'Connected! You may close this window.' if success else f'Error: {error}'}</p></body></html>"""
    from django.http import HttpResponse
    return HttpResponse(html)


# ── Step 3: Status poll ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def linkedin_oauth_status(request, state):
    """Frontend polls this after popup closes. Returns org list to pick from."""
    result = cache.get(f"linkedin_oauth_result:{state}")
    if result is None:
        return Response({"pending": True})
    return Response(result)


# ── Step 4: Save to DB (after user picks an organization) ─────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def linkedin_oauth_save(request):
    """
    Frontend calls this after the user picks an organization from the list
    returned by the status poll.
    Body: { state, org_id, org_name }
    """
    state   = request.data.get("state")
    org_id  = request.data.get("org_id")
    org_name = request.data.get("org_name", "")

    if not org_id:
        return Response({"detail": "org_id is required."}, status=400)

    result = cache.get(f"linkedin_oauth_result:{state}")
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

    account.page_id          = str(org_id)
    account.handle           = org_name
    account.access_token     = result["access_token"]
    account.token_expires_at = timezone.now() + timedelta(seconds=result.get("expires_in", 60 * 24 * 3600))
    account.is_connected     = True
    account.profile_url      = f"https://www.linkedin.com/company/{org_id}/"
    account.save()

    cache.delete(f"linkedin_oauth_result:{state}")
    cache.delete(f"linkedin_oauth_state:{state}")

    return Response({"account": SocialAccountSerializer(account).data})