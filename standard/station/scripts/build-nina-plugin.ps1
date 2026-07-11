# Build BoreanAstro.Plugin and stage files for Station NSIS bundle.
$ErrorActionPreference = "Stop"
$StationRoot = Join-Path $PSScriptRoot ".."
$PluginProject = Join-Path $StationRoot "..\nina-plugins\BoreanAstro.Plugin\BoreanAstro.Plugin.csproj"
$OutDir = Join-Path $StationRoot "nina-plugin-bundle\BoreanAstro.Plugin"

if (-not (Test-Path $PluginProject)) {
    Write-Error "Plugin project not found: $PluginProject"
}

Write-Host "Publishing Borean Astro NINA plugin (Release)..."
dotnet publish $PluginProject -c Release -o $OutDir
if ($LASTEXITCODE -ne 0) {
    Write-Error "dotnet publish failed"
}

$dll = Join-Path $OutDir "BoreanAstro.Plugin.dll"
if (-not (Test-Path $dll)) {
    Write-Error "Expected output missing: $dll"
}

$VersionFile = Join-Path (Split-Path $PluginProject -Parent) "version.txt"
if (Test-Path $VersionFile) {
    Copy-Item $VersionFile (Join-Path $OutDir "version.txt") -Force
    Write-Host "Copied plugin version.txt to bundle"
} else {
    Write-Warning "version.txt missing next to plugin project"
}

Write-Host "Plugin staged at $OutDir" -ForegroundColor Green
