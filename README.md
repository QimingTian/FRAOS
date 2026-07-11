# FRAOS

**Fully Remote Automated Observatory System** — open-source Control Client, Station agent, cloud hub, and marketing/API website for each edition.

| Folder | Matrix | Status |
|--------|--------|--------|
| [`standard/`](standard/) | 1 telescope · 1 operator | Active |
| [`pro/`](pro/) | 1 telescope · team | In progress |
| [`max/`](max/) | multiple telescopes · 1 operator | In progress |
| [`ultra/`](ultra/) | multiple telescopes · organization | Scaffold only |

```
                 1 operator              team
         ┌────────────────────┬─────────────────────┐
 1 scope  │  standard/         │  pro/               │
         ├────────────────────┼─────────────────────┤
 N scopes │  max/              │  ultra/             │
         └────────────────────┴─────────────────────┘
```

## Configure your own keys (required)

This repository ships **placeholders only**. Copy examples and fill in your own values — do not commit secrets.

### Website / cloud API (`*/website`)

```bash
cp standard/website/.env.example standard/website/.env.local
# Set at least:
#   NEXT_PUBLIC_SITE_URL, KV_*, PERSONAL_TENANT_SECRETS,
#   ASTROMETRY_API_KEY (nova.astrometry.net), optional STRIPE_*
```

Same pattern for `pro/website` and `max/website`.

### Tenant (Control Client + hub)

```bash
cp standard/build-config/tenant.dev.json.example standard/build-config/tenant.dev.json
# Edit YOUR_TENANT_ID / YOUR_API_SECRET / apiBaseUrl
```

### Station agent (R2 + queue auth)

```bash
# On the observatory PC, set env vars (see station/agent/.env.example):
#   IMAGING_QUEUE_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
#   R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
```

### Plate solve (Control Client)

```bash
export FRAOS_ASTROMETRY_SOLVE_URL=https://YOUR_DOMAIN/api/astrometry/solve
```

The website route `/api/astrometry/solve` needs `ASTROMETRY_API_KEY` from [nova.astrometry.net](https://nova.astrometry.net).

## Quick start (Standard)

```bash
# Cloud website + API
cd standard/website && npm install && npm run dev

# Local hub (if used)
cd standard/hub && npm install && npm run dev

# Control Client (Tauri)
cd standard/control-client && npm install && npm run tauri dev
```

See each edition’s `README.md` for package layout (Control, Station, hub, shared, website).

## License / contributing

Configure your own Cloudflare R2, Astrometry.net, Stripe, Upstash KV, and domain. Nothing in this tree should contain production credentials.
