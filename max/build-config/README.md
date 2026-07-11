# FRAOS Standard — per-customer build config

Each purchased FRAOS Standard license ships with a **`tenant.json`** baked into Control Client and Station. That file defines the customer's cloud hub on **www.boreanastro.com** (license = hub identity).

## Development

Use the committed default:

- `tenant.dev.json` — tenant `dev-local`, local Personal Hub at `http://127.0.0.1:7841`

Start the dev hub:

```bash
cd general-platforms/standard/hub && npm run dev
```

## Production builds

CI creates `tenant.json` per order (never commit), or customers import it after checkout:

```json
{
  "tenantId": "customer-uuid",
  "apiBaseUrl": "https://www.boreanastro.com",
  "apiSecret": "generated-secret",
  "displayName": "Customer Name"
}
```

**Runtime license file:** Control Client and Station also read `%LOCALAPPDATA%/BoreanAstro/tenant.json` (Windows) or `~/.boreanastro/tenant.json` (macOS). This overrides the baked dev config so one universal installer works for all customers.

Both Tauri apps read baked `tenant.json` when present at build time, otherwise fall back to `tenant.dev.json`.
