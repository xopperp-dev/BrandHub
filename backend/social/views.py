import logging
import uuid
from django.conf import settings
from django.core.files.storage import default_storage
from django.db import IntegrityError
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Client, SocialAccount, Post, Distribution
from .serializers import (
    ClientSerializer, SocialAccountSerializer, SocialAccountWriteSerializer,
    PostSerializer, PublishPostSerializer, DistributionSerializer,
)
from .meta_api import verify_page_token, verify_instagram_token, MetaAPIError
from .publisher import publish_post

logger = logging.getLogger(__name__)


from rest_framework.exceptions import PermissionDenied

def get_org(request):
    org = request.user.organization
    if org is None:
        raise PermissionDenied("Your account has no organization assigned.")
    return org


ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB — Meta's own limit is higher, but keep uploads light


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def media_upload(request):
    """
    Accepts a single image file and stores it under MEDIA_ROOT, returning a
    publicly accessible absolute URL.

    Facebook/Instagram's Graph API fetches images by URL server-side, so a
    browser-only base64/blob URL will never work — the image has to be
    reachable over the public internet first. That's what this endpoint is for.

    Request: multipart/form-data with a 'file' field.
    Response: { "url": "https://your-domain/media/uploads/<uuid>.jpg" }
    """
    upload = request.FILES.get('file')
    if not upload:
        return Response({'detail': 'No file provided. Send it as multipart/form-data under "file".'},
                         status=status.HTTP_400_BAD_REQUEST)

    if upload.content_type not in ALLOWED_IMAGE_TYPES:
        return Response({'detail': f'Unsupported file type: {upload.content_type}. Use JPEG, PNG, WEBP, or GIF.'},
                         status=status.HTTP_400_BAD_REQUEST)

    if upload.size > MAX_UPLOAD_BYTES:
        return Response({'detail': 'File too large. Max size is 8MB.'},
                         status=status.HTTP_400_BAD_REQUEST)

    ext = upload.name.rsplit('.', 1)[-1].lower() if '.' in upload.name else 'jpg'
    filename = f'uploads/{uuid.uuid4().hex}.{ext}'
    saved_path = default_storage.save(filename, upload)
    file_url = default_storage.url(saved_path)

    # Build an absolute URL — Meta needs a fully-qualified, internet-reachable
    # address, not a relative /media/... path.
    #
    # On your real deployed server (EC2 + Nginx), build_absolute_uri() picks
    # up the correct public domain automatically from the request.
    #
    # Running `manage.py runserver` locally, the Host header is
    # localhost/127.0.0.1 — which Meta's servers cannot reach. If you're
    # testing locally through an ngrok tunnel (or similar), set
    # PUBLIC_BASE_URL in your .env to that tunnel's https URL and this will
    # use it instead, e.g. PUBLIC_BASE_URL=https://abcd1234.ngrok-free.app
    if settings.PUBLIC_BASE_URL:
        absolute_url = f'{settings.PUBLIC_BASE_URL.rstrip("/")}{file_url}'
    else:
        absolute_url = request.build_absolute_uri(file_url)

    return Response({'url': absolute_url}, status=status.HTTP_201_CREATED)


# ══════════════════════════════════════════════════════════════════════════════
# CLIENT ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def client_list(request):
    org = get_org(request)

    if request.method == 'GET':
        clients = Client.objects.filter(organization=org, is_active=True).prefetch_related('accounts')
        return Response(ClientSerializer(clients, many=True).data)

    # POST — create a new client
    serializer = ClientSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        serializer.save(organization=org)
    except IntegrityError:
        name = request.data.get('name', '').strip()
        return Response(
            {'detail': f'A client named "{name}" already exists in your organization. '
                       f'Choose a different name (this includes deleted/archived clients).'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def client_detail(request, client_id):
    org = get_org(request)
    try:
        client = Client.objects.get(id=client_id, organization=org)
    except Client.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(ClientSerializer(client).data)

    if request.method == 'PATCH':
        serializer = ClientSerializer(client, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except IntegrityError:
            name = request.data.get('name', client.name).strip()
            return Response(
                {'detail': f'A client named "{name}" already exists in your organization. '
                           f'Choose a different name (this includes deleted/archived clients).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data)

    # DELETE — soft delete
    client.is_active = False
    client.save(update_fields=['is_active'])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ══════════════════════════════════════════════════════════════════════════════
# SOCIAL ACCOUNT ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def account_update(request, client_id, account_id):
    """Update handle / token / page_id for a social account."""
    org = get_org(request)
    try:
        account = SocialAccount.objects.get(
            id=account_id, client__id=client_id, client__organization=org
        )
    except SocialAccount.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = SocialAccountWriteSerializer(account, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(SocialAccountSerializer(account).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def account_verify(request, client_id, account_id):
    """
    Verify that the stored token is still valid by calling the Meta Graph API.
    Updates is_connected and last_verified_at accordingly.
    """
    org = get_org(request)
    try:
        account = SocialAccount.objects.get(
            id=account_id, client__id=client_id, client__organization=org
        )
    except SocialAccount.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    token = account.access_token
    if not token:
        return Response({'detail': 'No token stored.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        if account.platform == 'facebook':
            info = verify_page_token(token)
            account.page_id = info.get('id', account.page_id)
        elif account.platform == 'instagram':
            ig_id = account.page_id or account.handle.lstrip('@')
            info = verify_instagram_token(ig_id, token)
        else:
            return Response({'detail': f'{account.platform} verification not implemented.'})

        from django.utils import timezone
        account.is_connected = True
        account.last_verified_at = timezone.now()
        account.save(update_fields=['is_connected', 'last_verified_at', 'page_id'])
        return Response({'verified': True, 'info': info})

    except MetaAPIError as exc:
        account.is_connected = False
        account.save(update_fields=['is_connected'])
        return Response({'verified': False, 'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def account_disconnect(request, client_id, account_id):
    """Mark an account as disconnected and clear its token."""
    org = get_org(request)
    try:
        account = SocialAccount.objects.get(
            id=account_id, client__id=client_id, client__organization=org
        )
    except SocialAccount.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    account.access_token = None
    account.is_connected = False
    account.handle = ''
    account.page_id = ''
    account.save()
    return Response({'detail': 'Account disconnected.'})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def account_connect_simple(request, client_id, account_id):
    """Connect by saving just handle + profile_url. No token needed."""
    org = get_org(request)
    try:
        account = SocialAccount.objects.get(
            id=account_id, client__id=client_id, client__organization=org
        )
    except SocialAccount.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    handle = request.data.get('handle', '').strip()
    profile_url = request.data.get('profile_url', '').strip()

    if not handle and not profile_url:
        return Response({'detail': 'Provide at least a handle or profile URL.'}, status=400)

    account.handle = handle
    account.profile_url = profile_url
    account.is_connected = True
    account.save(update_fields=['handle', 'profile_url', 'is_connected'])

    return Response(SocialAccountSerializer(account).data)


# ══════════════════════════════════════════════════════════════════════════════
# POST / PUBLISH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def post_list(request):
    """Return all posts for the org, paginated."""
    org = get_org(request)
    posts = Post.objects.filter(organization=org).prefetch_related(
        'distributions__account__client'
    )
    serializer = PostSerializer(posts, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def publish(request):
    """
    Create a Post and distribute it to the selected accounts.

    Request body:
        {
          "content": "Hello world!",
          "account_ids": ["uuid1", "uuid2", ...]
        }
    """
    org = get_org(request)

    serializer = PublishPostSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    content = serializer.validated_data['content']
    account_ids = serializer.validated_data['account_ids']
    image_url = serializer.validated_data.get('image_url', None)

    # Create the post record
    post = Post.objects.create(
        organization=org,
        created_by=request.user,
        content=content,
        status='draft',
    )

    # Publish synchronously (swap for Celery in production)
    post = publish_post(post, account_ids, image_url=image_url)

    return Response(PostSerializer(post).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def post_detail(request, post_id):
    org = get_org(request)
    try:
        post = Post.objects.prefetch_related(
            'distributions__account__client'
        ).get(id=post_id, organization=org)
    except Post.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(PostSerializer(post).data)


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS
# ══════════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """
    Returns aggregate stats for the Dashboard page.
    Mirrors the hardcoded values in the React frontend.
    """
    org = get_org(request)

    total_clients = Client.objects.filter(organization=org, is_active=True).count()
    total_accounts = SocialAccount.objects.filter(
        client__organization=org, is_connected=True
    ).count()

    from django.utils import timezone
    import datetime
    month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    posts_this_month = Post.objects.filter(
        organization=org,
        status__in=['published', 'partial'],
        published_at__gte=month_start,
    ).count()

    total_dists = Distribution.objects.filter(post__organization=org).count()
    success_dists = Distribution.objects.filter(post__organization=org, status='success').count()
    delivery_rate = round((success_dists / total_dists * 100) if total_dists else 100)

    return Response({
        'total_clients': total_clients,
        'posts_this_month': posts_this_month,
        'connected_accounts': total_accounts,
        'delivery_rate': f'{delivery_rate}%',
    })
