# Borean Astro — Personal Hub

Embedded local API server for **FRAOS Standard**. Runs on the observatory PC (or dev machine) at **`http://127.0.0.1:7841`**.

The Control Client and Station Agent talk to this Hub — not www.boreanastro.com.

## Quick start

```bash
cd general-platforms/standard/hub
npm install
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:7841/api/health
```

## Data directory

| OS | Path |
|----|------|
| macOS / Linux | `~/.boreanastro/personal-hub/` |
| Windows | `%LOCALAPPDATA%\BoreanAstro\PersonalHub\` |

SQLite database: `hub.sqlite`

## API (MVP)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Hub alive |
| GET | `/api/imaging/observatory-status` | Agent connection + mode |
| PATCH | `/api/imaging/observatory-status` | Set manual/auto mode |
| GET | `/api/imaging/current-sessions` | Session queue |
| POST | `/api/imaging/queue` | Submit session (Control Client) |
| POST | `/api/imaging/agent-pulse` | Station Agent heartbeat |
| GET | `/api/imaging/nina-sequence` | Sequence for agent (404 until scheduling ported) |

### Submit session

```bash
curl -X POST http://127.0.0.1:7841/api/imaging/queue \
  -H 'Content-Type: application/json' \
  -d '{"target":"M42","outputMode":"none","filter":"L","exposureSeconds":600,"count":10}'
```

### Agent auth (optional)

Set `IMAGING_QUEUE_SECRET` in the environment. Agent routes then require:

```
Authorization: Bearer <secret>
```

## With Control Client

1. Start Hub: `npm run dev` (this folder)
2. Start client: `cd ../control-client && npm run tauri dev`
3. Submit a target on **Submit** — appears on **Sessions**

Sessions can be queued before the Station Agent is online.

## Next steps

- Port weather reconcile + NINA sequence builder from `website-code/`
- Agent-events SSE + ESTOP delivery
- Windows service packaging alongside Station
