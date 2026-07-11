# Build Borean Astro Station NSIS installer on Windows.
# Prerequisites: Node.js 20+, Rust (https://rustup.rs), VS Build Tools (C++ workload), WebView2 (Win11 OK).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Installing npm dependencies..."
npm ci

Write-Host "Building NINA plugin bundle..."
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-nina-plugin.ps1")

Write-Host "Building Windows installer (first run may take 10-20 min)..."
npm run tauri build

$installer = Get-ChildItem -Path "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue
if ($installer) {
    Write-Host ""
    Write-Host "Done. Installer:" -ForegroundColor Green
    $installer | ForEach-Object { Write-Host $_.FullName -ForegroundColor Green }
} else {
    Write-Error "Installer not found under src-tauri\target\release\bundle\nsis\"
}
