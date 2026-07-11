export const NOAA_GOES_CDN_HOST = 'cdn.star.nesdis.noaa.gov'
export const NOAA_GOES_GEOCOLOR_DIR = '/GOES19/ABI/CONUS/GEOCOLOR/'
export const NOAA_GOES_GEOCOLOR_INDEX_URL = `https://${NOAA_GOES_CDN_HOST}${NOAA_GOES_GEOCOLOR_DIR}`

/** CONUS GeoColor 625×375 frames: `YYYYDDDHHMM_GOES19-ABI-CONUS-GEOCOLOR-625x375.jpg` */
export const GEOCOLOR_FRAME_FILENAME_RE =
  /^(\d{11})_GOES19-ABI-CONUS-GEOCOLOR-625x375\.jpg$/

export const GEOCOLOR_FRAME_PATH_RE =
  /^\/GOES19\/ABI\/CONUS\/GEOCOLOR\/\d{11}_GOES19-ABI-CONUS-GEOCOLOR-625x375\.jpg$/

/** Recent frames to animate (~2 h at 5 min cadence). */
export const GEOCOLOR_FRAME_LIMIT = 24

export function resolveNoaaGoesUrl(raw: string | null): string | null {
  if (!raw?.trim()) return null

  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname.toLowerCase() !== NOAA_GOES_CDN_HOST) return null
  if (!GEOCOLOR_FRAME_PATH_RE.test(parsed.pathname)) return null
  return parsed.toString()
}

export function parseGeocolorFrameFilenames(html: string): string[] {
  const names = new Set<string>()
  const re = /(\d{11}_GOES19-ABI-CONUS-GEOCOLOR-625x375\.jpg)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const name = match[1]
    if (name && GEOCOLOR_FRAME_FILENAME_RE.test(name)) names.add(name)
  }
  return Array.from(names).sort()
}

export function geocolorFramePaths(filenames: string[], limit = GEOCOLOR_FRAME_LIMIT): string[] {
  const slice = filenames.slice(-limit)
  return slice.map((name) => `${NOAA_GOES_GEOCOLOR_DIR}${name}`)
}

import { contentApiPath } from '../content-base'

export function noaaGoesProxyUrl(path: string): string {
  const upstream = `https://${NOAA_GOES_CDN_HOST}${path}`
  return contentApiPath(`/api/noaa-goes?url=${encodeURIComponent(upstream)}`)
}

/** Parse UTC observation time from GeoColor frame path or filename (`YYYY` + Julian `DDD` + `HHMM`). */
export function parseGeocolorFrameUtc(pathOrName: string): Date | null {
  const basename = pathOrName.split('/').pop() ?? pathOrName
  const match = GEOCOLOR_FRAME_FILENAME_RE.exec(basename)
  if (!match?.[1] || match[1].length !== 11) return null

  const stamp = match[1]
  const year = Number(stamp.slice(0, 4))
  const dayOfYear = Number(stamp.slice(4, 7))
  const hour = Number(stamp.slice(7, 9))
  const minute = Number(stamp.slice(9, 11))

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(dayOfYear) ||
    dayOfYear < 1 ||
    dayOfYear > 366 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null
  }

  const ms = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86_400_000 + hour * 3_600_000 + minute * 60_000
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date
}
