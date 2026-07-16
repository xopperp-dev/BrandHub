from django.db import models
from django.conf import settings
from cryptography.fernet import Fernet
import uuid, base64, hashlib


def _fernet():
    """Return a Fernet cipher. Key is padded/hashed to 32 bytes and base64-urlsafe-encoded."""
    key = settings.ENCRYPTION_KEY
    raw = hashlib.sha256(key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


BRAND_COLORS = [
    ('#6366f1', 'Indigo'),
    ('#f59e0b', 'Amber'),
    ('#10b981', 'Emerald'),
    ('#ec4899', 'Pink'),
    ('#3b82f6', 'Blue'),
    ('#f97316', 'Orange'),
]

PLATFORM_CHOICES = [
    ('facebook', 'Facebook'),
    ('instagram', 'Instagram'),
    ('linkedin', 'LinkedIn'),
    ('x', 'X (Twitter)'),
    ('reddit', 'Reddit'),
    ('youtube', 'YouTube'),
    ('pinterest', 'Pinterest'),
    ('tumblr', 'Tumblr'),
]

PLATFORM_BASE_URLS = {
    'facebook':  'https://www.facebook.com/',
    'instagram': 'https://www.instagram.com/',
    'linkedin':  'https://www.linkedin.com/company/',
    'x':         'https://x.com/',
    'reddit':    'https://www.reddit.com/user/',
    'youtube':   'https://www.youtube.com/channel/',
    'pinterest': 'https://www.pinterest.com/',
    'tumblr':    'https://tumblr.com/',
}


class Client(models.Model):
    """A brand/client under the parent organization."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE, related_name='clients'
    )
    name = models.CharField(max_length=200)
    logo_initials = models.CharField(max_length=4, blank=True)
    color = models.CharField(max_length=7, default='#6366f1')  # hex
    industry = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        unique_together = [('organization', 'name')]

    def save(self, *args, **kwargs):
        if not self.logo_initials:
            words = self.name.strip().split()
            self.logo_initials = ''.join(w[0] for w in words).upper()[:2]
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.name} ({self.organization.name})'


class SocialAccount(models.Model):
    """A single platform account belonging to a client."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='accounts')
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    handle = models.CharField(max_length=200, blank=True)

    # Public profile URL (e.g. https://www.facebook.com/KIFRealty)
    profile_url = models.URLField(max_length=500, blank=True,
                                  help_text='Public social media profile link')

    # Facebook/Instagram specific
    page_id = models.CharField(max_length=100, blank=True,
                               help_text='FB Page ID or IG Business Account ID')

    # Encrypted access token
    _access_token_encrypted = models.TextField(blank=True, db_column='access_token_encrypted')

    # Encrypted refresh token — needed for platforms whose access tokens expire
    # quickly (Reddit ~1hr, YouTube/Google ~1hr). Facebook's long-lived tokens
    # don't need this, so it's left blank for those accounts.
    _refresh_token_encrypted = models.TextField(blank=True, db_column='refresh_token_encrypted')

    is_connected = models.BooleanField(default=False)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['platform']
        unique_together = [('client', 'platform')]

    @property
    def access_token(self):
        if not self._access_token_encrypted:
            return None
        try:
            return _fernet().decrypt(self._access_token_encrypted.encode()).decode()
        except Exception:
            return None

    @access_token.setter
    def access_token(self, value):
        if value:
            self._access_token_encrypted = _fernet().encrypt(value.encode()).decode()
        else:
            self._access_token_encrypted = ''

    @property
    def refresh_token(self):
        if not self._refresh_token_encrypted:
            return None
        try:
            return _fernet().decrypt(self._refresh_token_encrypted.encode()).decode()
        except Exception:
            return None

    @refresh_token.setter
    def refresh_token(self, value):
        if value:
            self._refresh_token_encrypted = _fernet().encrypt(value.encode()).decode()
        else:
            self._refresh_token_encrypted = ''

    def auto_profile_url(self):
        """Derive a profile URL from the handle if profile_url is not set."""
        if self.profile_url:
            return self.profile_url
        if self.handle:
            slug = self.handle.lstrip('@')
            base = PLATFORM_BASE_URLS.get(self.platform, '')
            return f'{base}{slug}' if base else ''
        return ''

    def __str__(self):
        return f'{self.client.name} · {self.platform} ({self.handle})'


class Post(models.Model):
    """A piece of content created by an org admin to distribute."""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('publishing', 'Publishing'),
        ('published', 'Published'),
        ('failed', 'Failed'),
        ('partial', 'Partial'),  # some deliveries failed
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'core.Organization', on_delete=models.CASCADE, related_name='posts'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='posts'
    )
    content = models.TextField(max_length=2000)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    scheduled_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        preview = self.content[:60]
        return f'[{self.status}] {preview}'

    @property
    def success_count(self):
        return self.distributions.filter(status='success').count()

    @property
    def fail_count(self):
        return self.distributions.filter(status='failed').count()

    @property
    def total_reach(self):
        return self.distributions.filter(status='success').aggregate(
            total=models.Sum('reach')
        )['total'] or 0


class Distribution(models.Model):
    """One delivery of a Post to one SocialAccount."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('skipped', 'Skipped'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='distributions')
    account = models.ForeignKey(SocialAccount, on_delete=models.CASCADE, related_name='distributions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # Platform-specific response
    platform_post_id = models.CharField(max_length=200, blank=True)  # e.g. FB post id
    error_message = models.TextField(blank=True)
    reach = models.PositiveIntegerField(default=0)

    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('post', 'account')]

    def __str__(self):
        return f'{self.post.id} → {self.account} [{self.status}]'