"""
Facebook & Instagram Graph API helpers.
Docs: https://developers.facebook.com/docs/graph-api
"""
import requests
from django.conf import settings

BASE = settings.META_GRAPH_API_BASE


class MetaAPIError(Exception):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def _get(endpoint: str, params: dict) -> dict:
    url = f'{BASE}/{endpoint}'
    resp = requests.get(url, params=params, timeout=15)
    data = resp.json()
    if 'error' in data:
        err = data['error']
        raise MetaAPIError(err.get('message', 'Unknown error'), code=err.get('code'))
    return data


def _post(endpoint: str, data: dict, params: dict = None) -> dict:
    url = f'{BASE}/{endpoint}'
    resp = requests.post(url, data=data, params=params or {}, timeout=15)
    result = resp.json()
    if 'error' in result:
        err = result['error']
        raise MetaAPIError(err.get('message', 'Unknown error'), code=err.get('code'))
    return result


# ── Token Validation ───────────────────────────────────────────────────────────

def verify_page_token(page_access_token: str) -> dict:
    """
    Verify a Page Access Token by calling /me on the Pages API.
    Returns basic page info on success.
    """
    return _get('me', {
        'fields': 'id,name,fan_count',
        'access_token': page_access_token,
    })


def verify_instagram_token(ig_user_id: str, access_token: str) -> dict:
    """Verify an Instagram Business account token."""
    return _get(ig_user_id, {
        'fields': 'id,name,username,followers_count',
        'access_token': access_token,
    })


# ── Facebook Page Publishing ───────────────────────────────────────────────────

def publish_to_facebook_page(page_id: str, page_access_token: str, message: str) -> dict:
    """
    Publish a text post to a Facebook Page.
    Returns: { 'id': '<page-id>_<post-id>' }
    Docs: https://developers.facebook.com/docs/pages/publishing
    """
    return _post(f'{page_id}/feed', {
        'message': message,
        'access_token': page_access_token,
    })


def publish_photo_to_facebook_page(page_id: str, page_access_token: str, message: str,
                                    image_url: str) -> dict:
    """
    Publish a photo post (image + caption) to a Facebook Page.
    Returns: { 'id': '<photo-id>', 'post_id': '<page-id>_<post-id>' }
    Docs: https://developers.facebook.com/docs/graph-api/reference/page/photos/
    """
    return _post(f'{page_id}/photos', {
        'url': image_url,
        'caption': message,
        'access_token': page_access_token,
    })


def get_facebook_post_insights(post_id: str, page_access_token: str) -> dict:
    """
    Fetch reach/impressions for a published page post.
    Useful for updating the `reach` field on Distribution.
    Docs: https://developers.facebook.com/docs/graph-api/reference/insights
    """
    try:
        data = _get(f'{post_id}/insights', {
            'metric': 'post_impressions_unique',
            'access_token': page_access_token,
        })
        # Return the first value if present
        if data.get('data'):
            values = data['data'][0].get('values', [])
            if values:
                return {'reach': list(values[-1].values())[0]}
        return {'reach': 0}
    except MetaAPIError:
        return {'reach': 0}


# ── Instagram Publishing ───────────────────────────────────────────────────────

def publish_to_instagram(ig_user_id: str, access_token: str, caption: str,
                          image_url: str = None) -> dict:
    """
    Publish a caption-only post (or image post) to an Instagram Business Account.
    Instagram requires a two-step process: create container → publish container.

    For caption-only posts (no media) we must include a placeholder image.
    In production, pass a publicly accessible image_url.

    Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
    """
    if not image_url:
        # Caption-only posts are not supported by IG API without an image.
        # Return a descriptive error so the caller can handle gracefully.
        raise MetaAPIError(
            'Instagram requires an image. Provide image_url to publish to Instagram.',
            code='NO_IMAGE'
        )

    # Step 1: Create media container
    container = _post(f'{ig_user_id}/media', {
        'image_url': image_url,
        'caption': caption,
        'access_token': access_token,
    })
    container_id = container['id']

    # Step 2: Publish the container
    result = _post(f'{ig_user_id}/media_publish', {
        'creation_id': container_id,
        'access_token': access_token,
    })
    return result