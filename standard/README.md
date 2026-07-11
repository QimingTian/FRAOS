# Borean Astro — FRAOS Standard

**One telescope · one operator** — Control Client + Station Agent, both talking to a **licensed cloud hub** on **YOUR_DOMAIN**.

This folder was previously named `personal/`. Product marketing now uses **FRAOS Standard**.

## License = cloud hub identity

Each customer build embeds `build-config/tenant.json`:

- `tenantId` — their hub on YOUR_DOMAIN
- `apiSecret` — Bearer token for Control + Station
- `apiBaseUrl` — `https://YOUR_DOMAIN` (production) or local dev hub

Sharing the installer does not give someone their own hub — it only connects to the original tenant.

## Output modes

| Mode | Meaning |
|------|---------|
| `none` | Data stays on the observatory PC |
| `raw_zip` | Agent uploads session ZIP to included cloud storage (optional) |

## Packages

| Path | Role |
|------|------|
| [`website/`](../website/) | **Marketing site + cloud API** (YOUR_DOMAIN) |
| [`control-client/`](control-client/) | Remote control UI (Tauri) |
| [`station/`](station/) | Observatory agent + NINA (Tauri) |
| [`hub/`](hub/) | **Dev-only** local cloud hub mock (`/api/personal/{tenantId}/…`) |
| [`shared/`](shared/) | Tenant config, output modes |
| [`build-config/`](build-config/) | Per-customer baked identity |

Other FRAOS tiers: [`../pro/`](../pro), [`../max/`](../max), [`../ultra/`](../ultra) — scaffolds only for now.

## Mac dev flow

```bash
# Terminal 1 — dev cloud hub (tenant dev-local)
cd general-platforms/standard/hub && npm install && npm run dev

# Terminal 2 — Station
cd general-platforms/standard/station && npm install && npm run tauri dev

# Terminal 3 — Control Client
cd general-platforms/standard/control-client && npm install && npm run tauri dev

# Terminal 4 — Borean website (marketing + cloud API)
cd website && npm install && npm run dev
```

Both apps use `build-config/tenant.dev.json` (`dev-local` @ `http://127.0.0.1:7841`).

Production API shape: `GET /api/personal/{tenantId}/health`, `POST /api/personal/{tenantId}/imaging/queue`, etc.

# Release installers on YOUR_DOMAIN (checkout downloads + OTA)

```bash
# 0. Regenerate app icons from brand logo (B mark only)
python3 general-platforms/standard/scripts/extract-app-icon-source.py
node general-platforms/standard/scripts/generate-app-icons.mjs

# 1. Build Control Client (macOS on your Mac)
cd general-platforms/standard/control-client && npm run tauri build

# 2. Build Station on Windows (GitHub Actions → Station Windows Installer), or use dist-ci artifact

# 3. Stage into website/public/releases and update shared/fraos-release.json
node general-platforms/standard/scripts/stage-release-installers.mjs

# 4. Deploy website
cd website && npm run deploy
```

After promo checkout, users download `tenant.json` plus installers from `/checkout/success`.

- Per-order CI: generate `tenant.json` → build Control + Station installers
- Agent-events SSE on cloud hub
- Stripe card checkout on YOUR_DOMAIN (promotion codes work today for **Standard** only)
