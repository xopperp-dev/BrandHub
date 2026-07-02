# BrandHub — Django Backend

Django + DRF backend for the BrandHub social media distribution platform.

## Stack
- **Django 5** + **Django REST Framework**
- **SimpleJWT** for authentication
- **Fernet (cryptography)** for token encryption at rest
- **Meta Graph API v21.0** for Facebook Page & Instagram publishing
- **SQLite** (dev) / **PostgreSQL** (production)

---

## Quick Start

```bash
cd brandhub_backend

# 1. Install dependencies
pip install -r requirements.txt

# 2. Run migrations
python manage.py migrate

# 3. Create your account
python manage.py createsuperuser
# or just register through the app's Register page — either works

# 4. Start dev server
python manage.py runserver
```

Frontend: add `VITE_API_BASE=http://localhost:8000` to `BrandHub/.env.local`

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register/` | Register user + create org |
| POST | `/api/auth/login/` | Login → JWT tokens |
| POST | `/api/auth/token/refresh/` | Refresh access token |
| POST | `/api/auth/logout/` | Blacklist refresh token |
| GET  | `/api/auth/me/` | Current user profile |
| PATCH | `/api/auth/organization/` | Update org name/plan |

### Clients
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/clients/` | List all clients |
| POST | `/api/clients/` | Add a client (auto-creates 4 account slots) |
| GET  | `/api/clients/{id}/` | Client detail |
| PATCH | `/api/clients/{id}/` | Update name / color / industry |
| DELETE | `/api/clients/{id}/` | Soft-delete client |

### Social Accounts
| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/clients/{cid}/accounts/{aid}/` | Save handle + token |
| POST  | `/api/clients/{cid}/accounts/{aid}/verify/` | Call Graph API to verify token |
| POST  | `/api/clients/{cid}/accounts/{aid}/disconnect/` | Remove token, mark disconnected |

### Posts & Publishing
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/publish/` | Create post + distribute to selected accounts |
| GET  | `/api/posts/` | Full post history with distributions |
| GET  | `/api/posts/{id}/` | Single post + all distribution results |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/stats/` | Aggregate stats for the dashboard |

---

## Key Design Decisions

### Token Encryption
Access tokens are encrypted with **Fernet** before hitting the DB. The key comes from `BRANDHUB_ENCRYPTION_KEY` in `.env`. Never commit the key. The `access_token` property is write-only from any serializer — tokens are never returned in API responses.

### Meta Graph API
- **Facebook**: posts to `/{page_id}/feed` using a Page Access Token
- **Instagram**: two-step container → publish flow; requires an image URL
- Verification calls `/me` to confirm the token is still valid
- `social/meta_api.py` is the only file that talks to Meta; swap it out for other platforms

### Publishing Flow
`POST /api/publish/` → creates `Post` → calls `publisher.publish_post()` → iterates accounts → calls Meta API → writes `Distribution` records → returns final `Post` with all results.

**For production**: wrap `publish_post()` in a Celery task so the HTTP response isn't held open for N × API calls.

### Platforms Not Yet Implemented
LinkedIn and X are stubbed as `'skipped'` in publisher.py. The account model and slot creation already handle them — only the API calls in `meta_api.py` need to be added.

---

## File Structure

```
brandhub_backend/
├── brandhub_backend/
│   ├── settings.py       # All config
│   └── urls.py           # URL routing
├── core/
│   ├── models.py         # User, Organization
│   ├── serializers.py    # Auth serializers
│   ├── views.py          # Auth endpoints
│   └── admin.py
├── social/
│   ├── models.py         # Client, SocialAccount, Post, Distribution
│   ├── serializers.py    # API serializers (token never exposed)
│   ├── views.py          # All social/publish endpoints
│   ├── meta_api.py       # Facebook & Instagram Graph API calls
│   ├── publisher.py      # Publishing orchestrator
│   └── admin.py
└── .env.example
```

## Frontend Integration

Import from `src/api/client.js`:

```js
import { auth, clients, accounts, posts, dashboard } from './api/client';

// Login
const { user, tokens } = await auth.login({ email, password });

// Fetch clients
const clientList = await clients.list();

// Connect a Facebook account
await accounts.update(clientId, accountId, {
  handle: '@KIFRealty',
  page_id: '123456789',
  access_token: 'EAAxxxxx...',
  is_connected: true,
});

// Verify token is still valid
await accounts.verify(clientId, accountId);

// Publish a post
const post = await posts.publish({
  content: 'Hello from BrandHub!',
  account_ids: ['uuid1', 'uuid2'],
});
```
