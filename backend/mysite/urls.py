from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from core import views as core_views
from social import oauth_views
from social import reddit_views
from social import youtube_views
from social import pinterest_views
from social import tumblr_views
from social import tiktok_views
from social import views as social_views
from social import x_views
from social import linkedin_views

urlpatterns = [
    path('admin/', admin.site.urls),

    # ── Media uploads (images attached to posts) ────────────────────────────
    path('api/media/upload/', social_views.media_upload),

    # ── Auth ────────────────────────────────────────────────────────────────
    path('api/auth/register/', core_views.register),
    path('api/auth/login/', core_views.login),
    path('api/auth/token/refresh/', core_views.token_refresh),
    path('api/auth/logout/', core_views.logout),
    path('api/auth/me/', core_views.me),
    path('api/auth/organization/', core_views.update_organization),

    # ── Clients ─────────────────────────────────────────────────────────────
    path('api/clients/', social_views.client_list),
    path('api/clients/<uuid:client_id>/', social_views.client_detail),

    # ── Social Accounts ─────────────────────────────────────────────────────
    path('api/clients/<uuid:client_id>/accounts/<uuid:account_id>/', social_views.account_update),
    path('api/clients/<uuid:client_id>/accounts/<uuid:account_id>/connect/', social_views.account_connect_simple),
    path('api/clients/<uuid:client_id>/accounts/<uuid:account_id>/verify/', social_views.account_verify),
    path('api/clients/<uuid:client_id>/accounts/<uuid:account_id>/disconnect/', social_views.account_disconnect),

    # ── Posts & Publishing ───────────────────────────────────────────────────
    path('api/posts/', social_views.post_list),
    path('api/posts/<uuid:post_id>/', social_views.post_detail),
    path('api/publish/', social_views.publish),

    # ── Facebook OAuth ──────────────────────────────────────────────────────────
    path('api/oauth/facebook/start/',              oauth_views.facebook_oauth_start),
    path('api/oauth/facebook/callback/',           oauth_views.facebook_oauth_callback),
    path('api/oauth/facebook/status/<str:state>/', oauth_views.facebook_oauth_status),
    path('api/oauth/facebook/save/',               oauth_views.facebook_oauth_save),

    # ── Reddit OAuth ─────────────────────────────────────────────────────────────
    path('api/oauth/reddit/start/',              reddit_views.reddit_oauth_start),
    path('api/oauth/reddit/callback/',           reddit_views.reddit_oauth_callback),
    path('api/oauth/reddit/status/<str:state>/', reddit_views.reddit_oauth_status),
    path('api/oauth/reddit/save/',               reddit_views.reddit_oauth_save),

    # ── YouTube OAuth ────────────────────────────────────────────────────────────
    path('api/oauth/youtube/start/',              youtube_views.youtube_oauth_start),
    path('api/oauth/youtube/callback/',           youtube_views.youtube_oauth_callback),
    path('api/oauth/youtube/status/<str:state>/', youtube_views.youtube_oauth_status),
    path('api/oauth/youtube/save/',               youtube_views.youtube_oauth_save),

    # ── Pinterest OAuth ──────────────────────────────────────────────────────────
    path('api/oauth/pinterest/start/',              pinterest_views.pinterest_oauth_start),
    path('api/oauth/pinterest/callback/',           pinterest_views.pinterest_oauth_callback),
    path('api/oauth/pinterest/status/<str:state>/', pinterest_views.pinterest_oauth_status),
    path('api/oauth/pinterest/save/',               pinterest_views.pinterest_oauth_save),

    # ── Tumblr OAuth ─────────────────────────────────────────────────────────────
    path('api/oauth/tumblr/start/',              tumblr_views.tumblr_oauth_start),
    path('api/oauth/tumblr/callback/',           tumblr_views.tumblr_oauth_callback),
    path('api/oauth/tumblr/status/<str:state>/', tumblr_views.tumblr_oauth_status),
    path('api/oauth/tumblr/save/',               tumblr_views.tumblr_oauth_save),

    # ── X (Twitter) OAuth ────────────────────────────────────────────────────────
    path('api/oauth/x/start/',              x_views.x_oauth_start),
    path('api/oauth/x/callback/',           x_views.x_oauth_callback),
    path('api/oauth/x/status/<str:state>/', x_views.x_oauth_status),
    path('api/oauth/x/save/',               x_views.x_oauth_save),

    # ── TikTok OAuth ─────────────────────────────────────────────────────────────
    path('api/oauth/tiktok/start/',              tiktok_views.tiktok_oauth_start),
    path('api/oauth/tiktok/callback/',           tiktok_views.tiktok_oauth_callback),
    path('api/oauth/tiktok/status/<str:state>/', tiktok_views.tiktok_oauth_status),
    path('api/oauth/tiktok/save/',               tiktok_views.tiktok_oauth_save),

    # ── LinkedIn OAuth ───────────────────────────────────────────────────────────
    path('api/oauth/linkedin/start/',              linkedin_views.linkedin_oauth_start),
    path('api/oauth/linkedin/callback/',           linkedin_views.linkedin_oauth_callback),
    path('api/oauth/linkedin/status/<str:state>/', linkedin_views.linkedin_oauth_status),
    path('api/oauth/linkedin/save/',               linkedin_views.linkedin_oauth_save),

    # ── Dashboard ────────────────────────────────────────────────────────────
    path('api/dashboard/stats/', social_views.dashboard_stats),
]

# Serve uploaded media locally in dev. In production, Nginx should serve
# /media/ directly from MEDIA_ROOT — Django doesn't serve it efficiently
# and this static() helper is a no-op when DEBUG=False.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)