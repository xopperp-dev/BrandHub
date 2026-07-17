import os
from pathlib import Path
from datetime import timedelta
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Security ───────────────────────────────────────────────────────────────────
# Set these in your .env file / server environment — never hardcode in production
SECRET_KEY = config('DJANGO_SECRET_KEY', default='django-insecure-dev-only-change-before-deploy')
DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',   # required for logout blacklisting
    'corsheaders',
    # Local
    'core',
    'social',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'mysite.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'mysite.wsgi.application'

# ── Database ───────────────────────────────────────────────────────────────────
# SQLite for local dev. Switch to PostgreSQL for production.
if config('DB_NAME', default=None):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME':     config('DB_NAME'),
            'USER':     config('DB_USER'),
            'PASSWORD': config('DB_PASSWORD'),
            'HOST':     config('DB_HOST', default='localhost'),
            'PORT':     config('DB_PORT', default='5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Dubai'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'     # needed for collectstatic
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Optional override for the public host used when building absolute media
# URLs (e.g. for images sent to Meta's Graph API). Leave unset in production
# on a real domain — build_absolute_uri() will detect it correctly from the
# request. Set this when testing locally through a tunnel, e.g.:
#   PUBLIC_BASE_URL=https://abcd1234.ngrok-free.app
PUBLIC_BASE_URL = config('PUBLIC_BASE_URL', default='')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'core.User'

# ── Django REST Framework ──────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# ── JWT Settings ───────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS':  True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ── CORS ───────────────────────────────────────────────────────────────────────
_cors_env = config('CORS_ALLOWED_ORIGINS', default='')
if _cors_env:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_env.split(',')]
else:
    # Dev defaults
    CORS_ALLOWED_ORIGINS = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
    ]
CORS_ALLOW_CREDENTIALS = True

# ── Meta / Facebook Graph API ─────────────────────────────────────────────────
META_GRAPH_API_VERSION = 'v21.0'
META_APP_ID     = config('META_APP_ID', default='')
META_APP_SECRET = config('META_APP_SECRET', default='')
META_GRAPH_API_BASE = f'https://graph.facebook.com/{META_GRAPH_API_VERSION}'

# ── Reddit OAuth ───────────────────────────────────────────────────────────────
# Create at: https://www.reddit.com/prefs/apps  (type: web app)
REDDIT_CLIENT_ID     = config('REDDIT_CLIENT_ID', default='')
REDDIT_CLIENT_SECRET = config('REDDIT_CLIENT_SECRET', default='')

# ── YouTube / Google OAuth ─────────────────────────────────────────────────────
# Create at: https://console.cloud.google.com  → Credentials → OAuth Client ID
GOOGLE_CLIENT_ID     = config('GOOGLE_CLIENT_ID', default='')
GOOGLE_CLIENT_SECRET = config('GOOGLE_CLIENT_SECRET', default='')

# ── Pinterest OAuth ────────────────────────────────────────────────────────────
# Create at: https://developers.pinterest.com  → Apps → Connect app
PINTEREST_CLIENT_ID     = config('PINTEREST_CLIENT_ID', default='')
PINTEREST_CLIENT_SECRET = config('PINTEREST_CLIENT_SECRET', default='')

# ── Tumblr OAuth ───────────────────────────────────────────────────────────────
# Create at: https://www.tumblr.com/oauth/apps
TUMBLR_CLIENT_ID     = config('TUMBLR_CLIENT_ID', default='')
TUMBLR_CLIENT_SECRET = config('TUMBLR_CLIENT_SECRET', default='')

# ── X (Twitter) OAuth ──────────────────────────────────────────────────────────
X_CLIENT_ID     = config('X_CLIENT_ID', default='')
X_CLIENT_SECRET = config('X_CLIENT_SECRET', default='')

# ── LinkedIn OAuth ─────────────────────────────────────────────────────────────
# Create at: https://www.linkedin.com/developers/apps
# Requires the "Marketing Developer Platform" product (LinkedIn approval
# needed) for w_organization_social / r_organization_social scopes.
LINKEDIN_CLIENT_ID     = config('LINKEDIN_CLIENT_ID', default='')
LINKEDIN_CLIENT_SECRET = config('LINKEDIN_CLIENT_SECRET', default='')

# ── Token Encryption ──────────────────────────────────────────────────────────
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY = config('BRANDHUB_ENCRYPTION_KEY', default='dev-placeholder-replace-before-deploy')