from rest_framework import serializers
from .models import Client, SocialAccount, Post, Distribution


class SocialAccountSerializer(serializers.ModelSerializer):
    """Safe serializer — never exposes the token."""
    platform_display = serializers.CharField(source='get_platform_display', read_only=True)

    class Meta:
        model = SocialAccount
        fields = [
            'id', 'platform', 'platform_display', 'handle',
            'page_id', 'profile_url', 'is_connected', 'token_expires_at',
            'last_verified_at', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'last_verified_at']


class SocialAccountWriteSerializer(serializers.ModelSerializer):
    """Used for creating/updating an account — accepts the token."""
    access_token = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = SocialAccount
        fields = ['platform', 'handle', 'page_id', 'profile_url', 'access_token', 'is_connected']

    def update(self, instance, validated_data):
        token = validated_data.pop('access_token', None)
        if token:
            instance.access_token = token
        return super().update(instance, validated_data)


class ClientSerializer(serializers.ModelSerializer):
    accounts = SocialAccountSerializer(many=True, read_only=True)
    connected_count = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            'id', 'name', 'logo_initials', 'color', 'industry',
            'is_active', 'accounts', 'connected_count', 'created_at',
        ]
        read_only_fields = ['id', 'logo_initials', 'created_at']

    def get_connected_count(self, obj):
        return obj.accounts.filter(is_connected=True).count()

    def create(self, validated_data):
        # Auto-create all 4 platform slots on client creation
        client = Client.objects.create(**validated_data)
        for platform in ['facebook', 'instagram', 'linkedin', 'x']:
            SocialAccount.objects.create(client=client, platform=platform)
        return client


class DistributionSerializer(serializers.ModelSerializer):
    account = SocialAccountSerializer(read_only=True)
    client_name = serializers.CharField(source='account.client.name', read_only=True)
    client_color = serializers.CharField(source='account.client.color', read_only=True)

    class Meta:
        model = Distribution
        fields = [
            'id', 'account', 'client_name', 'client_color',
            'status', 'platform_post_id', 'error_message',
            'reach', 'sent_at',
        ]
        read_only_fields = fields


class PostSerializer(serializers.ModelSerializer):
    distributions = DistributionSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    success_count = serializers.ReadOnlyField()
    fail_count = serializers.ReadOnlyField()
    total_reach = serializers.ReadOnlyField()

    class Meta:
        model = Post
        fields = [
            'id', 'content', 'status', 'scheduled_at', 'published_at',
            'created_by_name', 'distributions',
            'success_count', 'fail_count', 'total_reach',
            'created_at',
        ]
        read_only_fields = ['id', 'status', 'published_at', 'created_at', 'distributions']


class PublishPostSerializer(serializers.Serializer):
    """Input for the publish endpoint."""
    content = serializers.CharField(max_length=2000)
    account_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1,
        help_text='List of SocialAccount UUIDs to publish to',
    )
    image_url = serializers.URLField(
        required=False, allow_blank=True, default=None,
        help_text='Publicly accessible image URL. Required for Instagram posts.',
    )