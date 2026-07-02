from django.contrib import admin
from .models import Client, SocialAccount, Post, Distribution


class SocialAccountInline(admin.TabularInline):
    model = SocialAccount
    extra = 0
    fields = ['platform', 'handle', 'page_id', 'is_connected', 'last_verified_at']
    readonly_fields = ['last_verified_at']


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'industry', 'is_active', 'created_at']
    list_filter = ['is_active', 'organization']
    search_fields = ['name', 'industry']
    inlines = [SocialAccountInline]


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ['client', 'platform', 'handle', 'is_connected', 'last_verified_at']
    list_filter = ['platform', 'is_connected']
    search_fields = ['handle', 'client__name']
    readonly_fields = ['last_verified_at', 'created_at', 'updated_at']


class DistributionInline(admin.TabularInline):
    model = Distribution
    extra = 0
    fields = ['account', 'status', 'platform_post_id', 'reach', 'sent_at', 'error_message']
    readonly_fields = fields


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['id', 'content_preview', 'organization', 'status', 'success_count', 'created_at']
    list_filter = ['status', 'organization']
    search_fields = ['content']
    readonly_fields = ['published_at', 'created_at', 'updated_at']
    inlines = [DistributionInline]

    def content_preview(self, obj):
        return obj.content[:60]
    content_preview.short_description = 'Content'
