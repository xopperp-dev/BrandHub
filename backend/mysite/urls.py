from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from core import views as core_views
from social import oauth_views
from social import views as social_views

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

    # ── Dashboard ────────────────────────────────────────────────────────────
    path('api/dashboard/stats/', social_views.dashboard_stats),
]

# Serve uploaded media locally in dev. In production, Nginx should serve
# /media/ directly from MEDIA_ROOT — Django doesn't serve it efficiently
# and this static() helper is a no-op when DEBUG=False.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)