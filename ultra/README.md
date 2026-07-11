# FRAOS Ultra

**Multiple telescopes · your organization** — enterprise multi-site, multi-team operations.

| | |
|---|---|
| Sites | Unlimited |
| Seats | Unlimited (org-wide) |
| Status | **Not started** — scaffold only |

## When development starts

Combine patterns from:

- [`../standard/`](../standard/) — cloud hub, Control Client, Station
- [`../pro/`](../pro/) — RBAC and team seats
- [`../max/`](../max/) — multi-site dashboard

Expected packages:

- `control-client/` — org dashboard + site/team RBAC
- `station/` — per-site agents
- `hub/` — org-level cloud API
- `shared/` — organization tenant model
- `website/` — until Ultra needs a separate deploy, reuse `standard/website/`

For clubs, schools, and commercial observatory networks — bring your own cloud keys (R2, Astrometry, Stripe, KV) via env placeholders.
