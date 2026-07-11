# Borean Astro — NINA Plugin

Windows NINA 3.x plugin that POSTs live mount pointing to **your** Borean Astro hub (cloud or local Personal Hub).

## Build (Windows + Visual Studio or `dotnet`)

```powershell
cd general-platforms\standard\nina-plugins\BoreanAstro.Plugin
dotnet build -c Debug
```

Debug builds copy the DLL to `%LOCALAPPDATA%\NINA\Plugins\3.0.0\BoreanAstro.Plugin\`.

Release: copy `bin\Release\net8.0-windows\BoreanAstro.Plugin.dll` (and dependencies) into the same NINA plugins folder.

## License auto-config

After activating **Borean Astro Station** or **Control Client**, `tenant.json` lives at:

```text
%LOCALAPPDATA%\BoreanAstro\tenant.json
```

On startup the plugin reads:

- `apiBaseUrl` + `tenantId` → POST URL  
  `{apiBaseUrl}/api/personal/{tenantId}/imaging/mount-pointing`
- `apiSecret` → Bearer token on each POST

No manual URL/secret entry needed when the license file is present.

## Requirements

- NINA 3.0.0.1085+
- .NET 8 (Windows)
- Personal Hub running on the observatory PC (embedded in Control) or cloud hub at www.boreanastro.com
