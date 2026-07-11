const LOCATION_KEY = 'borean.personal.observatoryLocation'
const CONFIGURED_KEY = 'borean.personal.observatoryConfigured'

export const OBSERVATORY_LOCATION_CHANGED = 'borean:observatory-location-changed'

export const DEFAULT_OBS_LAT = 0
export const DEFAULT_OBS_LON = 0
export const DEFAULT_ELEVATION_M = 0

export type ObservatoryLocation = {
  lat: number
  lon: number
  label: string
  elevationM: number
}

function normalizeLocation(parsed: Partial<ObservatoryLocation>): ObservatoryLocation | null {
  const lat = Number(parsed.lat)
  const lon = Number(parsed.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  const elevationM = Number(parsed.elevationM)
  return {
    lat,
    lon,
    label: typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim() : 'Observatory',
    elevationM: Number.isFinite(elevationM) ? elevationM : 0,
  }
}

export function getObservatoryLocation(): ObservatoryLocation {
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (raw) {
      const parsed = normalizeLocation(JSON.parse(raw) as Partial<ObservatoryLocation>)
      if (parsed) return parsed
    }
  } catch {
    // ignore
  }
  return {
    lat: DEFAULT_OBS_LAT,
    lon: DEFAULT_OBS_LON,
    label: 'Observatory',
    elevationM: DEFAULT_ELEVATION_M,
  }
}

export function setObservatoryLocation(loc: ObservatoryLocation): void {
  const normalized = normalizeLocation(loc)
  if (!normalized) return
  localStorage.setItem(LOCATION_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(OBSERVATORY_LOCATION_CHANGED, { detail: normalized }))
}

export function isObservatoryConfigured(): boolean {
  if (import.meta.env.DEV) return true
  return localStorage.getItem(CONFIGURED_KEY) === '1'
}

export function markObservatoryConfigured(): void {
  localStorage.setItem(CONFIGURED_KEY, '1')
}

export function validateObservatoryInput(input: {
  label: string
  lat: string
  lon: string
  elevationM: string
}): { ok: true; location: ObservatoryLocation } | { ok: false; error: string } {
  const lat = Number(input.lat)
  const lon = Number(input.lon)
  const elevationM = input.elevationM.trim() === '' ? 0 : Number(input.elevationM)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: 'Latitude must be between -90 and 90.' }
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { ok: false, error: 'Longitude must be between -180 and 180.' }
  }
  if (!Number.isFinite(elevationM)) {
    return { ok: false, error: 'Elevation must be a number (meters).' }
  }
  return {
    ok: true,
    location: {
      lat,
      lon,
      elevationM,
      label: input.label.trim() || 'Observatory',
    },
  }
}
