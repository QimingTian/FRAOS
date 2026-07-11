# FRAOS Pro

**One telescope · your team** — multi-seat access to a single observatory.

| | |
|---|---|
| Sites | 1 |
| Seats | Unlimited |
| Status | **Pomfret feature parity (excl. Gallery / Team)** |

## Package layout

- `control-client/` — Control Client (Atlas, Remote, Weather/ASC, Settings)
- `station/` — Station agent (NINA bridge)
- `hub/` — Local/dev cloud hub (SQLite sessions, schedule, ESTOP, weather-safety)
- `website/` — Pro marketing + personal-tenant cloud APIs (KV mirror of hub imaging)
- `shared/` — tenant + output-mode types
- `asc/` — docs for Pi all-sky camera + ASC AI (`HUB_ASC_STATUS_URL`)
- `build-config/` — per-customer baked identity
- `scripts/` — release / staging helpers
- `nina-plugins/` — NINA integration

Marketing pages (Standard deploy): **YOUR_DOMAIN/fraos/pro**

Reference implementation: Pomfret Astro [`website/`](../../website/) (sibling repo path).

## Parity notes (vs Pomfret, excl. Gallery / Team)

| Area | Hub | Website | Control |
|------|-----|---------|---------|
| Weather-safety ESTOP (ASC rain + 20 km thunder) | ✅ | ✅ mirror + `/api/weather/storm-approach` | ASC overlay + `fetchStormApproach` |
| Admin closed windows | ✅ SQLite + `/imaging/schedule-control` | ✅ tenant schedule-control | Settings panel + timeline |
| Variable-star catalog | — | ✅ `/api/imaging/variable-stars` + `Variables/index.csv` | `contentApiPath` |
| Altitude hold (in-progress project ≥30°) | ✅ reconcile | ✅ reconcile | — |
| Mosaic grid + planner interleave | ✅ store + planner | ✅ create fields | Atlas Framing mode + multi-panel FOV overlays → Remote draft |
| Force-run | ✅ Admin force-run occupancy reservation (matches Pomfret) | ✅ mirror | Remote Run → hub/website |
| ASC Pi package | docs in `asc/` | env `ASC_*` / `HUB_ASC_*` | Settings stream URL |

### Not in scope for this parity pass

- Gallery
- Team / multi-seat RBAC product surface (Pro package retains team panels; Pomfret Gallery/Team features excluded)

### Force-run

`session-control` admin **Run** validates altitude for the full session from now, sets `planned_start_iso = now`, reserves free time via `admin_force_run_until_iso` through the end of the run, marks the session scheduled, and wakes the agent. Reconcile subtracts active force-run occupancy from `fifoFree` before planning so other sessions schedule around it.
