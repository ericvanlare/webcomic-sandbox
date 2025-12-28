# Production Deployment Guide

This guide walks through deploying the webcomic site to Cloudflare.

## Prerequisites

- Cloudflare account (free tier works)
- Wrangler CLI authenticated

## Step 1: Authenticate Wrangler

```bash
cd ~/Workspace/webcomic-sandbox/apps/worker
npx wrangler login
```

This opens a browser for OAuth. After authenticating, verify with:

```bash
npx wrangler whoami
```

---

## Step 2: Deploy the Worker (API)

### 2a. Set Production Secrets

```bash
cd ~/Workspace/webcomic-sandbox/apps/worker

# Set each secret (you'll be prompted for values)
npx wrangler secret put SANITY_PROJECT_ID
npx wrangler secret put SANITY_DATASET
npx wrangler secret put SANITY_WRITE_TOKEN
npx wrangler secret put ADMIN_ORIGIN
```

For `ADMIN_ORIGIN`, use your production site URL (e.g., `https://webcomic-site.pages.dev`).
You can update this later once you know the Pages URL.

### 2b. Deploy

```bash
npx wrangler deploy
```

Note the worker URL (e.g., `https://webcomic-api.<your-subdomain>.workers.dev`).

---

## Step 3: Deploy the Site (Cloudflare Pages)

### Option A: Via Cloudflare Dashboard (Recommended for First Deploy)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
2. Click "Create a project" → "Connect to Git"
3. Select the `webcomic-sandbox` repo
4. Configure build settings:
   - **Build command:** `pnpm install && pnpm --filter @webcomic/shared build && pnpm --filter site build`
   - **Build output directory:** `apps/site/dist`
   - **Root directory:** `/` (leave as root)
5. Add environment variables:
   - `SANITY_PROJECT_ID` = your project ID
   - `SANITY_DATASET` = `production`
   - `SANITY_API_VERSION` = `2024-01-01`
6. Click "Save and Deploy"

### Option B: Via Wrangler CLI

```bash
cd ~/Workspace/webcomic-sandbox/apps/site

# Create the Pages project (first time only)
npx wrangler pages project create webcomic-site

# Deploy
npx wrangler pages deploy dist --project-name=webcomic-site
```

Then set environment variables in the Cloudflare dashboard under Pages → Settings → Environment variables.

---

## Step 4: Update ADMIN_ORIGIN

Once you have both URLs, update the worker's `ADMIN_ORIGIN` to match your Pages URL:

```bash
cd ~/Workspace/webcomic-sandbox/apps/worker
npx wrangler secret put ADMIN_ORIGIN
# Enter: https://webcomic-site.pages.dev (or your custom domain)
```

---

## Step 5: Update Admin UI Worker URL

Edit `apps/site/src/pages/admin/index.astro` to point to your production worker:

Find this line:
```javascript
const workerUrl = (window as any).WORKER_API_URL || 'http://localhost:8787';
```

Replace with:
```javascript
const workerUrl = import.meta.env.PUBLIC_WORKER_URL || 'http://localhost:8787';
```

Then add `PUBLIC_WORKER_URL` to your Pages environment variables:
- `PUBLIC_WORKER_URL` = `https://webcomic-api.<your-subdomain>.workers.dev`

---

## Step 6: Verify Deployment

1. Visit your Pages URL (e.g., `https://webcomic-site.pages.dev`)
2. Check that existing comics display
3. Go to `/admin` and test uploading a new comic
4. Verify the comic appears on the homepage

---

## Production URLs

After deployment, update these:

| Service | URL |
|---------|-----|
| Site | `https://webcomic-site.pages.dev` |
| Worker API | `https://webcomic-api.<subdomain>.workers.dev` |

---

## Troubleshooting

### "Invalid binding `SESSION`" error
The Astro Cloudflare adapter wants a KV namespace for sessions. Either:
1. Create a KV namespace in Cloudflare dashboard and add the binding
2. Or disable sessions by removing the session config (not recommended)

### CORS errors on admin
Make sure `ADMIN_ORIGIN` secret matches exactly your Pages URL (including `https://`).

### Comics not loading
Check that `SANITY_PROJECT_ID` and `SANITY_DATASET` are set correctly in Pages environment variables.
