# Borean Astro — Personal Station Agent

Windows observatory PC app: **NINA agent** + single-page dashboard (checks · log · settings).

## Layout

| Column | Content |
|--------|---------|
| **Left** | System checks (green / amber / red) |
| **Center** | Live agent log |
| **Right** | Settings (Hub URL, NINA paths, secrets) |

## Develop

```bash
cd general-platforms/standard/station
npm install
npm run tauri dev
```

Run **Personal Hub** on the same machine (`http://127.0.0.1:7841`) before starting the agent.

## Agent core

`agent/nina_agent.py` — polls Personal Hub (`BOREAN_HUB_BASE_URL`), starts NINA, optional R2 upload.

Python deps (observatory PC):

```bash
pip install -r agent/requirements.txt
```

## Config

Stored at:

- Windows: `%LOCALAPPDATA%\BoreanAstro\Station\station-config.json`
- macOS (dev): `~/.boreanastro/station/station-config.json`

Logs: `agent.log` in the same folder.

## Build Windows installer (.exe)

Mac cannot cross-compile the NSIS installer. Build on your **Windows 11 VM** (shared folder from Mac is fine).

**Prerequisites (one-time):**

1. [Node.js 20+](https://nodejs.org/)
2. [Rust](https://rustup.rs) — use default MSVC toolchain
3. **Visual Studio Build Tools** → “Desktop development with C++”
4. WebView2 (already on Win11)

**Build:**

```powershell
cd general-platforms\personal\station
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

Output:

```text
src-tauri\target\release\bundle\nsis\Borean Astro Station_0.1.0_x64-setup.exe
```

After install, open Station, set NINA paths in Settings, install Python + `pip install -r agent/requirements.txt`, and run Personal Hub on `:7841`.

**Optional:** push this repo and run GitHub Actions workflow **Station Windows Installer** to download the `.exe` artifact.

## Next

- Windows Service + real autostart installer
- Bundle Python runtime in MSI
- Hub: `nina-sequence` + agent-events SSE
