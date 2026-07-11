const DEFAULT_BASE = 'https://api.librewxr.net'

export function librewxrApiBaseUrl(): string {
  const raw = process.env.LIBREWXR_API_BASE_URL?.trim() || DEFAULT_BASE
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return DEFAULT_BASE
    return u.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_BASE
  }
}

export type LibrewxrFrame = { time: number; path: string }

export type LibrewxrWeatherMaps = {
  version?: string
  host?: string
  radar?: {
    past?: LibrewxrFrame[]
    nowcast?: LibrewxrFrame[]
  }
}

const TILE_PATH_RE =
  /^\/v2\/(radar|satellite)\/\d+\/\d+\/\d+\/\d+\/\d+\/\d+\/\d+_\d+\.png$/

export function isAllowedLibrewxrTilePath(path: string): boolean {
  return TILE_PATH_RE.test(path)
}
