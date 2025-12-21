# DubSH v1.0.10 — Self‑Hosted Dub with Local Services & Docker Compose

DubSH is a self‑hosting focused fork of the Dub URL shortener that keeps the **Next.js** app, but makes it practical to run without a pile of managed third‑party accounts.

**Upstream basis:** Based on **dubinc/dub** (branch `main`) as of **2025‑12‑18** (commit **a4ec17b**).  
(That commit/date is the point-in-time reference for “upstream Dub” used for this DubSH release.)

---

## What’s changed from upstream Dub

### Local-first infrastructure (no required managed accounts)
DubSH is designed to run with self-hosted services:

| Component | Dub (upstream) | DubSH (self-host) |
|---|---|---|
| Database | PlanetScale (MySQL) | **MySQL** via Docker Compose |
| Redis | Upstash | **Redis** via Docker Compose |
| Analytics | Tinybird | **ClickHouse** optional (local target) |
| Email | Resend (often) | **Mailpit** (local) or **any SMTP** |
| Storage | Cloud storage assumptions | **Local filesystem** or **S3** |
| OG image picker | Unsplash | **Local stock images** |

### Storage options: Local filesystem **or** S3
Storage is configurable via environment variables:

- `STORAGE_DRIVER=local`  
  Files are stored on disk under `STORAGE_LOCAL_DIR` and served via:
  `GET /storage/<bucket>/<path...>`

- `STORAGE_DRIVER=s3`  
  Files are stored in S3 (or S3-compatible). Public objects can be returned as direct URLs
  (if `STORAGE_PUBLIC_URL` is set) or proxied through `/storage/...` for private buckets.

### SMTP options
- Local dev: **Mailpit**
- Production: configure **any SMTP provider/account** (host/port/user/pass)

### Unsplash removed for custom social cards
The social/OG background picker uses local images instead of Unsplash.

Add images to:
```
apps/web/public/stock/
```

---

## Requirements
- Docker + Docker Compose
- (Optional for local dev) Node.js + pnpm

---

## Quick start (Docker Compose)

### 1) Configure environment variables

You can use either:
- a `.env` file in the repo root, **or**
- container environment variables (Coolify, Portainer, etc.)

### Copy/paste environment block (Coolify / container platforms)

```env
############################################################
# Core
############################################################
APP_URL=http://localhost:3000
NODE_ENV=production

# Database (compose default host is "mysql")
DATABASE_URL=mysql://dub:dub@mysql:3306/dub

# Redis (compose default host is "redis")
REDIS_URL=redis://redis:6379

############################################################
# Storage (choose: local or s3)
############################################################
# local | s3
STORAGE_DRIVER=local

# Local storage
# Mount a persistent volume here in production
STORAGE_LOCAL_DIR=./storage

# --- S3 settings (only if STORAGE_DRIVER=s3) ---
# AWS: https://s3.amazonaws.com
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_REGION=us-east-1

# true for many S3-compatible providers; AWS typically false
STORAGE_FORCE_PATH_STYLE=false

STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=

STORAGE_PUBLIC_BUCKET=
STORAGE_PRIVATE_BUCKET=

# Optional: If set, public objects can be returned as direct URLs.
# Example: https://your-public-bucket.s3.amazonaws.com
STORAGE_PUBLIC_URL=

############################################################
# SMTP / Email
############################################################
# Local dev (Mailpit)
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
SMTP_FROM=no-reply@localhost

# External SMTP example:
# SMTP_HOST=smtp.yourprovider.com
# SMTP_PORT=587
# SMTP_USER=your-user
# SMTP_PASSWORD=your-pass
# SMTP_SECURE=false
# SMTP_FROM=no-reply@yourdomain.com

############################################################
# Analytics (optional)
############################################################
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default

############################################################
# Security
############################################################
AUTH_SECRET=change-this-to-a-long-random-string

############################################################
# Platform / Proxy
############################################################
TRUST_PROXY=true
LOCAL_MODE=true
```

**Coolify note:** container environment variables **override** values in `.env`.

---

### 2) Start the stack

From the repo root:

```bash
docker compose up -d --build
```

Tail app logs:

```bash
docker compose logs -f app
```

---

## Service URLs (defaults)

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Mailpit UI | http://localhost:8025 |
| MySQL | localhost:3306 |
| Redis | localhost:6379 |
| ClickHouse | http://localhost:8123 |

---

## Adding custom OG/social background images
Drop images into:

```
apps/web/public/stock/
```

They will appear in the OG image picker UI.

---

## Git & Windows notes

### “LF will be replaced by CRLF”
This warning is normal on Windows and safe to ignore.

### GitHub rejects push (“fetch first”)
If GitHub rejects your push:

```bash
git pull origin main --allow-unrelated-histories
git push
```

---

## Credits
Based on the upstream **Dub** project, adapted for self-hosting with reduced external dependencies and container-friendly deployment.


### App Port
The Docker Compose file maps the container port `3000` to a host port controlled by `APP_PORT`.
- Default: `4455`
- Override example: `APP_PORT=8080`


## Coolify Deployment (Monorepo / Next.js)

Use the following settings in **Coolify → Application Settings**:

**Root Directory**
```
apps/web
```

**Install Command**
```
cd ../.. && pnpm install --frozen-lockfile
```

**Build Command**
```
pnpm prisma:generate && next build
```

**Start Command**
```
next start
```

**Build Pack**
- Use **Nixpacks** (default)
- If pnpm issues persist, switch to **Dockerfile**

**Environment Variables**
- Set all required variables directly in Coolify
- `.env.production` is included as a fallback for `dotenv-flow`
- Environment variables defined in Coolify override `.env.production`



## Docker Compose Notes
- App container built from root Dockerfile
- Default port: 4455 (override with APP_PORT)


## Build env files (Coolify / Docker)

During builds, `dotenv-flow` expects `.env*` files inside `apps/web/`. This repo includes placeholder `apps/web/.env` and `apps/web/.env.production` files so builds do not fail. Set real values via your deployment platform environment variables.


## Monorepo build (Dockerfile)

The web app imports workspace packages like `@dub/ui` and `@dub/utils` which publish their build output in `dist/`. The Dockerfile builds these packages before running `next build`.


### Docker build note
The Dockerfile runs `pnpm -r --filter "./packages/**" run build --if-present` before `next build` to ensure workspace packages (e.g. `@dub/ui`, `@dub/utils`, `@dub/embed-react`) are compiled and resolvable.


### Docker build note (workspace packages)
The Dockerfile builds only the workspace packages required by the web app (`@dub/utils`, `@dub/ui`, `@dub/embed-react`) before running `next build`. This avoids building optional packages (like `@dub/cli`) that can fail in container builds.
