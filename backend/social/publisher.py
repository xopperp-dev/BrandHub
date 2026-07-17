"""
Core publishing logic.
Iterates over target accounts, calls the correct platform API,
and records each Distribution result.
"""
import logging
from datetime import datetime, timezone

from django.db import transaction

from .models import Post, Distribution, SocialAccount
from .meta_api import (
    publish_to_facebook_page,
    publish_photo_to_facebook_page,
    publish_to_instagram,
    get_facebook_post_insights,
    MetaAPIError,
)

logger = logging.getLogger(__name__)


def _publish_facebook(account: SocialAccount, content: str, image_url: str = None) -> tuple[str, int, str]:
    """Returns (platform_post_id, reach, error_message)."""
    token = account.access_token
    if not token:
        return '', 0, 'No access token stored. Add a Page Access Token in the Clients page.'

    page_id = account.page_id or account.handle.lstrip('@')
    if not page_id:
        return '', 0, 'No Page ID set. Edit this account and add the Facebook Page ID.'

    if image_url:
        # Photo posts go to /{page-id}/photos and return {'id', 'post_id'}.
        # 'post_id' is the feed post identifier (needed for insights lookups);
        # 'id' alone is just the photo object id.
        result = publish_photo_to_facebook_page(page_id, token, content, image_url)
        post_id = result.get('post_id') or result.get('id', '')
    else:
        result = publish_to_facebook_page(page_id, token, content)
        post_id = result.get('id', '')

    # Best-effort reach fetch (non-blocking)
    reach = 0
    if post_id:
        insights = get_facebook_post_insights(post_id, token)
        reach = insights.get('reach', 0)

    return post_id, reach, ''


def _publish_instagram(account: SocialAccount, content: str, image_url: str = None) -> tuple[str, int, str]:
    """Returns (platform_post_id, reach, error_message)."""
    token = account.access_token
    if not token:
        return '', 0, 'No access token stored. Add an Access Token in the Clients page.'

    ig_user_id = account.page_id or account.handle.lstrip('@')
    if not ig_user_id:
        return '', 0, 'No Instagram Business Account ID set. Edit this account and add the IG Account ID.'

    if not image_url:
        # Instagram API does not support text-only posts — an image is required.
        # Skipping gracefully instead of failing so other platforms still publish.
        return '', 0, 'SKIP:Instagram requires an image. Attach an image to publish to Instagram.'

    result = publish_to_instagram(ig_user_id, token, caption=content, image_url=image_url)
    return result.get('id', ''), 0, ''


def _publish_linkedin(account: SocialAccount, content: str) -> tuple[str, int, str]:
    """Placeholder — LinkedIn publishing not yet implemented."""
    return '', 0, 'SKIP:LinkedIn publishing is not implemented yet.'


def _publish_x(account: SocialAccount, content: str) -> tuple[str, int, str]:
    """Placeholder — X (Twitter) publishing not yet implemented."""
    return '', 0, 'SKIP:X (Twitter) publishing is not implemented yet.'


def _publish_tiktok(account: SocialAccount, content: str) -> tuple[str, int, str]:
    """Placeholder — TikTok publishing not yet implemented.

    TikTok's Content Posting API requires video (not text/image) content and
    a separate app audit before it can post outside sandbox mode, so this is
    left as a connect-only integration for now, same as Reddit/YouTube/
    Pinterest/Tumblr above.
    """
    return '', 0, 'SKIP:TikTok publishing is not implemented yet.'


def publish_post(post: Post, account_ids: list, image_url: str = None) -> Post:
    """
    Publish `post` to all SocialAccounts in `account_ids`.
    Creates Distribution records and updates post.status.

    `image_url` — optional publicly accessible image URL. Required for Instagram.
    Called synchronously — wrap in Celery task for async publishing.
    """
    accounts = SocialAccount.objects.filter(
        id__in=account_ids,
        client__organization=post.organization,
        is_connected=True,
    ).select_related('client')

    if not accounts.exists():
        post.status = 'failed'
        post.save(update_fields=['status'])
        return post

    post.status = 'publishing'
    post.save(update_fields=['status'])

    results = []

    for account in accounts:
        dist, _ = Distribution.objects.get_or_create(post=post, account=account)

        try:
            if account.platform == 'facebook':
                pid, reach, err = _publish_facebook(account, post.content, image_url=image_url)
            elif account.platform == 'instagram':
                pid, reach, err = _publish_instagram(account, post.content, image_url=image_url)
            elif account.platform == 'linkedin':
                pid, reach, err = _publish_linkedin(account, post.content)
            elif account.platform == 'x':
                pid, reach, err = _publish_x(account, post.content)
            elif account.platform == 'tiktok':
                pid, reach, err = _publish_tiktok(account, post.content)
            else:
                dist.status = 'skipped'
                dist.error_message = f'{account.platform} publishing not supported.'
                dist.save()
                results.append('skipped')
                continue

            # SKIP: prefix means graceful skip (not an API failure)
            if err and err.startswith('SKIP:'):
                dist.status = 'skipped'
                dist.error_message = err[5:]  # strip prefix for clean display
                dist.save()
                results.append('skipped')
                continue

            if err:
                dist.status = 'failed'
                dist.error_message = err
            else:
                dist.status = 'success'
                dist.platform_post_id = pid
                dist.reach = reach
                dist.sent_at = datetime.now(timezone.utc)

        except MetaAPIError as exc:
            logger.exception('Meta API error for account %s: %s', account.id, exc)
            dist.status = 'failed'
            dist.error_message = str(exc)

        except Exception as exc:
            logger.exception('Unexpected error for account %s: %s', account.id, exc)
            dist.status = 'failed'
            dist.error_message = f'Unexpected error: {exc}'

        dist.save()
        results.append(dist.status)

    # Determine final post status:
    # - skipped-only = published (nothing to fail, platforms just not supported yet)
    # - any success = published or partial
    # - all failed = failed
    successes = results.count('success')
    failures  = results.count('failed')
    skips     = results.count('skipped')

    if successes > 0 and failures == 0:
        final_status = 'published'
    elif successes > 0:
        final_status = 'partial'
    elif failures == 0 and skips > 0:
        # All platforms skipped (e.g. LinkedIn/X only) — treat as published
        final_status = 'published'
    else:
        final_status = 'failed'

    post.status = final_status
    post.published_at = datetime.now(timezone.utc)
    post.save(update_fields=['status', 'published_at'])

    return post