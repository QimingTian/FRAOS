#!/usr/bin/env node
/**
 * Copy built Tauri installers into website/public/releases for checkout downloads.
 * Run from repo root or standard/ after `npm run tauri build`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const standardRoot = path.resolve(__dirname, '..')
const releasesDir = path.join(standardRoot, 'website/public/releases')
const releaseJsonPath = path.join(standardRoot, 'shared/fraos-release.json')
const websiteReleaseJsonPath = path.join(standardRoot, 'website/lib/fraos-release.json')

const controlPkg = JSON.parse(
  fs.readFileSync(path.join(standardRoot, 'control-client/package.json'), 'utf8')
)
const stationPkg = JSON.parse(
  fs.readFileSync(path.join(standardRoot, 'station/package.json'), 'utf8')
)
const CONTROL_VERSION = controlPkg.version
const STATION_VERSION = stationPkg.version
const SITE = 'https://www.boreanastro.com'

function readCargoVersion(cargoTomlPath) {
  const text = fs.readFileSync(cargoTomlPath, 'utf8')
  const match = text.match(/^version\s*=\s*"([^"]+)"/m)
  return match?.[1] ?? null
}

function assertTauriVersionsMatch(label, rootDir, pkgVersion) {
  const cargoVersion = readCargoVersion(path.join(rootDir, 'src-tauri/Cargo.toml'))
  const tauriVersion = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'src-tauri/tauri.conf.json'), 'utf8')
  ).version
  if (cargoVersion !== pkgVersion || tauriVersion !== pkgVersion) {
    console.error(
      `${label} version mismatch — package.json=${pkgVersion}, Cargo.toml=${cargoVersion}, tauri.conf.json=${tauriVersion}`
    )
    process.exit(1)
  }
}

assertTauriVersionsMatch('control-client', path.join(standardRoot, 'control-client'), CONTROL_VERSION)
assertTauriVersionsMatch('station', path.join(standardRoot, 'station'), STATION_VERSION)

const sources = [
  {
    key: 'controlMac',
    product: 'control',
    version: CONTROL_VERSION,
    candidates: [
      path.join(
        standardRoot,
        `control-client/src-tauri/target/release/bundle/dmg/Borean Astro Control_${CONTROL_VERSION}_aarch64.dmg`
      ),
      path.join(
        standardRoot,
        `control-client/src-tauri/target/release/bundle/dmg/Borean Astro Control_${CONTROL_VERSION}_x64.dmg`
      ),
      path.join(
        standardRoot,
        `control-client/dist-ci/Borean Astro Control_${CONTROL_VERSION}_aarch64.dmg`
      ),
      path.join(standardRoot, 'control-client/dist-ci/borean-control-macos.dmg'),
    ],
    dest: `borean-control-${CONTROL_VERSION}-macos.dmg`,
  },
  {
    key: 'controlWindows',
    product: 'control',
    version: CONTROL_VERSION,
    candidates: [
      path.join(
        standardRoot,
        `control-client/src-tauri/target/release/bundle/nsis/Borean Astro Control_${CONTROL_VERSION}_x64-setup.exe`
      ),
      path.join(standardRoot, `control-client/dist-ci/Borean Astro Control_${CONTROL_VERSION}_x64-setup.exe`),
    ],
    dest: `borean-control-${CONTROL_VERSION}-windows-setup.exe`,
  },
  {
    key: 'stationWindows',
    product: 'station',
    version: STATION_VERSION,
    candidates: [
      path.join(
        standardRoot,
        `station/src-tauri/target/release/bundle/nsis/Borean Astro Station_${STATION_VERSION}_x64-setup.exe`
      ),
      path.join(standardRoot, `station/dist-ci/Borean Astro Station_${STATION_VERSION}_x64-setup.exe`),
    ],
    dest: `borean-station-${STATION_VERSION}-windows-setup.exe`,
  },
]

fs.mkdirSync(releasesDir, { recursive: true })

const staged = {}

for (const item of sources) {
  const source = item.candidates.find((candidate) => fs.existsSync(candidate))
  if (!source) {
    console.warn(`skip ${item.key}: no build artifact found`)
    continue
  }
  const destPath = path.join(releasesDir, item.dest)
  fs.copyFileSync(source, destPath)
  staged[item.key] = `${SITE}/releases/${item.dest}`
  console.log(`staged ${item.key}: ${destPath} (${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB)`)
}

const release = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'))
release.station = release.station ?? {}
release.control = release.control ?? {}

if (staged.stationWindows) {
  release.station.latestVersion = STATION_VERSION
  release.station.downloadUrlWindows = staged.stationWindows
}
if (staged.controlMac) {
  release.control.latestVersion = CONTROL_VERSION
  release.control.downloadUrlMac = staged.controlMac
}
if (staged.controlWindows) {
  release.control.latestVersion = CONTROL_VERSION
  release.control.downloadUrlWindows = staged.controlWindows
}

const releaseJson = `${JSON.stringify(release, null, 2)}\n`
fs.writeFileSync(releaseJsonPath, releaseJson)
fs.writeFileSync(websiteReleaseJsonPath, releaseJson)
console.log(`updated ${releaseJsonPath}`)
console.log(`updated ${websiteReleaseJsonPath}`)
