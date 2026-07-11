# FRAOS Max

**Multiple telescopes · one operator** — unlimited observatories under a single owner account.

| | |
|---|---|
| Sites | Unlimited (one hub per site) |
| Seats | 1 operator |
| Status | **Forked from Standard** — Max multi-site development |

## Product model

- Pay once for **FRAOS Max** — add as many sites as you need from Account (no per-site billing).
- Each site = download **Borean Station** again on that observatory PC, activate with that site&apos;s license, and **name the site** in Station settings.
- **Borean Control** (one install): pick which site to queue a session against when creating a session.

## Package layout (copied from [`../standard/`](../standard/))

- `control-client/` — multi-site site picker on Create Session
- `station/` — required site name in Settings (syncs to cloud)
- `hub/` — dev cloud hub
- `shared/` — tenant config + Max site types
- `build-config/` — per-customer baked identity (`plan: "max"`)
- `website/` — symlink to production site when needed

Cloud APIs live in repo-root [`website/`](website/) (`/api/max/sites`, extended `/api/member/license`).

Marketing: **YOUR_DOMAIN/fraos/max**
