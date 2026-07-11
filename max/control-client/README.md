# Borean Astro Control — FRAOS Standard

Windows desktop control client (Tauri + React). Talks to a **Personal Hub** (embedded API server — coming next), not www.boreanastro.com.

## Requirements

- Node.js 20+
- Rust toolchain (for `tauri dev` / `tauri build`)
- On Windows: WebView2 (usually preinstalled on Windows 11)

## Develop

```bash
npm install
npm run tauri dev
```

Stellarium sky atlas data (`public/skydata/`) is committed in-repo. To refresh from upstream:

```bash
npm run sync:skydata
```

Requires `third-party/stellarium-web-engine` at the repo root.

## Build (Windows installer)

On a Windows machine:

```bash
npm run tauri build
```

Artifacts under `src-tauri/target/release/bundle/`.

## Settings

- Default Hub URL: `http://127.0.0.1:7841`
- Production cloud: set Hub to `https://www.boreanastro.com` in **Settings → Test connection**

## Output modes (Submit page)

| Mode | Storage |
|------|---------|
| `none` | Local disk on observatory PC |
| `raw_zip` | Agent uploads session ZIP to included cloud storage |

## Project layout

```
src/
  lib/           Hub client + settings
  pages/         Dashboard, Sessions, Submit, Settings
  components/    Layout, badges
../shared/       output-mode.ts (shared with Station later)
```
