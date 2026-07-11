export const NOAA_GOES_CDN_HOST = 'cdn.star.nesdis.noaa.gov'
export const NOAA_GOES_GEOCOLOR_DIR = '/GOES19/ABI/CONUS/GEOCOLOR/'
export const NOAA_GOES_GEOCOLOR_INDEX_URL = `https://${NOAA_GOES_CDN_HOST}${NOAA_GOES_GEOCOLOR_DIR}`

export const GEOCOLOR_FRAME_FILENAME_RE =
  /^(\d{11})_GOES19-ABI-CONUS-GEOCOLOR-625x375\.jpg$/

export const GEOCOLOR_FRAME_PATH_RE =
  /^\/GOES19\/ABI\/CONUS\/GEOCOLOR\/\d{11}_GOES19-ABI-CONUS-GEOCOLOR-625x375\.jpg$/

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
  return filenames.slice(-limit).map((name) => `${NOAA_GOES_GEOCOLOR_DIR}${name}`)
}
