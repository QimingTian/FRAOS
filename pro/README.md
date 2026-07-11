# FRAOS Pro

**One telescope · your team** — multi-seat access to a single observatory.

| | |
|---|---|
| Sites | 1 |
| Seats | Unlimited |
| Status | **Forked from Standard** — ready for Pro development |

## Package layout (copied from [`../standard/`](../standard/))

- `control-client/` — team-aware Control Client (Pro RBAC TBD)
- `station/` — same Station agent as Standard (one site)
- `hub/` — dev cloud hub with RBAC
- `shared/` — tenant + org config
- `build-config/` — per-customer baked identity
- `website/` — Pro marketing + account pages (separate deploy when needed)
- `scripts/` — release / staging helpers
- `nina-plugins/` — NINA integration

Marketing pages (Standard deploy): **YOUR_DOMAIN/fraos/pro**

Reference implementation for multi-user observatory: [`../`](../) (Pomfret).
