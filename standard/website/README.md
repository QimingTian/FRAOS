# FRAOS Standard — Website + cloud API

Marketing site and cloud API for the **FRAOS Standard** edition.

Path in this repo: `standard/website/`

## Dev

```bash
cd standard/website
cp .env.example .env.local   # fill placeholders
npm install
npm run dev
```

## Required env (see `.env.example`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SITE_URL` | Your public site URL |
| `PERSONAL_TENANT_SECRETS` | JSON map of tenantId → Bearer secret |
| `PERSONAL_DEV_TENANT_SECRET` | Optional local-dev tenant secret |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis |
| `ASTROMETRY_API_KEY` | nova.astrometry.net API key |
| `STRIPE_*` | Optional card checkout |

**Never commit real secrets.** Use placeholders from `.env.example` only.
