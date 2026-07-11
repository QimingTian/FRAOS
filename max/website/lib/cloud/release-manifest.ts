import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeProductPlan } from '@/lib/plan-utils'
import type { ProductPlan } from '@/lib/site-config'

export type AppReleaseInfo = {
  latestVersion: string
  downloadUrlWindows: string | null
  downloadUrlMac: string | null
  releaseNotes: string | null
  channel: string
}

type FraosReleaseFile = {
  channel?: string
  station?: {
    latestVersion?: string
    downloadUrlWindows?: string | null
    releaseNotes?: string | null
  }
  control?: {
    latestVersion?: string
    downloadUrlWindows?: string | null
    downloadUrlMac?: string | null
    releaseNotes?: string | null
    editions?: Partial<
      Record<
        ProductPlan,
        {
          downloadUrlWindows?: string | null
          downloadUrlMac?: string | null
        }
      >
    >
  }
}

function readReleaseFile(): FraosReleaseFile {
  const candidates = [
    join(process.cwd(), 'lib/fraos-release.json'),
    join(process.cwd(), '../general-platforms/standard/shared/fraos-release.json'),
    join(process.cwd(), '../shared/fraos-release.json'),
  ]
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as FraosReleaseFile
    } catch {
      // try next path
    }
  }
  return {}
}

function envOr(value: string | null | undefined, envKey: string): string | null {
  const fromEnv = process.env[envKey]?.trim()
  if (fromEnv) return fromEnv
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

export function stationReleaseManifest(): AppReleaseInfo {
  const file = readReleaseFile()
  const channel = process.env.FRAOS_RELEASE_CHANNEL ?? file.channel ?? 'stable'
  return {
    latestVersion:
      process.env.STATION_LATEST_VERSION?.trim() ??
      file.station?.latestVersion?.trim() ??
      '0.1.0',
    downloadUrlWindows: envOr(
      file.station?.downloadUrlWindows,
      'FRAOS_STATION_DOWNLOAD_URL_WINDOWS'
    ),
    downloadUrlMac: null,
    releaseNotes: file.station?.releaseNotes?.trim() ?? null,
    channel,
  }
}

export function controlReleaseManifest(plan?: ProductPlan | string | null): AppReleaseInfo {
  const file = readReleaseFile()
  const channel = process.env.FRAOS_RELEASE_CHANNEL ?? file.channel ?? 'stable'
  const normalizedPlan = plan ? normalizeProductPlan(plan) : 'standard'
  const edition = file.control?.editions?.[normalizedPlan]
  const defaultWindows = envOr(file.control?.downloadUrlWindows, 'FRAOS_CONTROL_DOWNLOAD_URL_WINDOWS')
  const defaultMac = envOr(file.control?.downloadUrlMac, 'FRAOS_CONTROL_DOWNLOAD_URL_MAC')
  const editionWindows =
    typeof edition?.downloadUrlWindows === 'string' && edition.downloadUrlWindows.trim()
      ? edition.downloadUrlWindows.trim()
      : null
  const editionMac =
    typeof edition?.downloadUrlMac === 'string' && edition.downloadUrlMac.trim()
      ? edition.downloadUrlMac.trim()
      : null
  return {
    latestVersion:
      process.env.CONTROL_LATEST_VERSION?.trim() ??
      file.control?.latestVersion?.trim() ??
      '0.1.0',
    downloadUrlWindows: editionWindows ?? defaultWindows,
    downloadUrlMac: editionMac ?? defaultMac,
    releaseNotes: file.control?.releaseNotes?.trim() ?? null,
    channel,
  }
}

export function pickDownloadUrl(
  manifest: AppReleaseInfo,
  platform: 'windows' | 'mac' | 'unknown'
): string | null {
  if (platform === 'mac') return manifest.downloadUrlMac ?? manifest.downloadUrlWindows
  if (platform === 'windows') return manifest.downloadUrlWindows ?? manifest.downloadUrlMac
  return manifest.downloadUrlWindows ?? manifest.downloadUrlMac
}

export function detectPlatform(userAgent: string | null): 'windows' | 'mac' | 'unknown' {
  const ua = (userAgent ?? '').toLowerCase()
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'mac'
  return 'unknown'
}
