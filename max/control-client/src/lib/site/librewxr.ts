const DEFAULT_BASE = 'https://api.librewxr.net'

/** Upstream LibreWXR API — Personal client uses www.boreanastro.com proxy routes. */
export function librewxrApiBaseUrl(): string {
  return DEFAULT_BASE
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

/** Rain Viewer–style radar tile path (256px, color 7 = NEXRAD III, smooth + snow overlay). */
export function librewxrRadarTilePath(
  framePath: string,
  z: number,
  x: number,
  y: number,
  colorScheme = 7
): string {
  const base = framePath.replace(/\/$/, '')
  return `${base}/256/${z}/${x}/${y}/${colorScheme}/1_1.png`
}

const TILE_PATH_RE =
  /^\/v2\/(radar|satellite)\/\d+\/\d+\/\d+\/\d+\/\d+\/\d+\/\d+_\d+\.png$/

/** SSRF guard for tile proxy: only LibreWXR v2 tile URLs. */
export function isAllowedLibrewxrTilePath(path: string): boolean {
  return TILE_PATH_RE.test(path)
}

export function librewxrRadarFrames(meta: LibrewxrWeatherMaps): LibrewxrFrame[] {
  const past = meta.radar?.past ?? []
  const nowcast = meta.radar?.nowcast ?? []
  return [...past, ...nowcast]
}
