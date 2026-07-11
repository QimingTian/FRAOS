import { appendAuditLog } from '../db.js'
import { getObservatorySite } from '../observatory-site.js'
import { isWithinDaytimeClosedWindow } from '../astro/sunrise-window.js'
import { armEmergencyStop, isEmergencyStopBlocking } from '../personal-estop.js'
import { emitAgentWakePollSequence } from './live-bus.js'
import { fetchAscCloud } from './asc-cloud.js'

/** Lead-time ring for thunderstorm approach. */
export const STORM_APPROACH_RADIUS_KM = 20
export const PRECIP_ESTOP_THRESHOLD = 10
export const WEATHER_SAFETY_DEBOUNCE_MS = 45_000

const EARTH_RADIUS_KM = 6371
const THUNDERSTORM_CODES = new Set([95, 96, 99])

export type WeatherSafetyThreatKind = 'asc_rain' | 'storm_approach'

export type WeatherSafetyThreat = {
  kind: WeatherSafetyThreatKind
  reason: string
  detail: Record<string, unknown>
}

export type WeatherSafetyArmResult = {
  armed: boolean
  skipped?: 'no_threat' | 'daytime' | 'already_blocking' | 'debounced' | 'error'
  threat?: WeatherSafetyThreat
  queueId?: string
}

type GlobalWithWeatherSafety = typeof globalThis & {
  __fraos_weather_safety_last_arm_ms__?: number
  __fraos_weather_safety_arm_inflight__?: Promise<WeatherSafetyArmResult> | null
}

type ForecastHourSample = {
  timeSec: number
  precipProbability: number
  weatherCode: number
}

type LocationForecast = {
  lat: number
  lon: number
  distanceKm: number
  hours: ForecastHourSample[]
}

export function isThunderstormWeatherCode(code: number): boolean {
  return Number.isFinite(code) && THUNDERSTORM_CODES.has(Math.round(code))
}

export function precipThreatAtOrAbove(
  precipProbability: number,
  threshold = PRECIP_ESTOP_THRESHOLD
): boolean {
  return Number.isFinite(precipProbability) && precipProbability >= threshold
}

/** True between nautical dusk and next nautical dawn. */
export function isObservatoryNight(now = new Date()): boolean {
  return !isWithinDaytimeClosedWindow(now)
}

export function ringSampleCoordinates(
  latDeg: number,
  lonDeg: number,
  radiusKm: number,
  count = 8
): Array<{ lat: number; lon: number; bearingDeg: number; distanceKm: number }> {
  const out: Array<{ lat: number; lon: number; bearingDeg: number; distanceKm: number }> = [
    { lat: latDeg, lon: lonDeg, bearingDeg: 0, distanceKm: 0 },
  ]
  const latRad = (latDeg * Math.PI) / 180
  const angular = radiusKm / EARTH_RADIUS_KM
  for (let i = 0; i < count; i++) {
    const bearingDeg = (i * 360) / count
    const bearing = (bearingDeg * Math.PI) / 180
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angular) + Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing)
    )
    const lon2 =
      ((lonDeg * Math.PI) / 180) +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2)
      )
    out.push({
      lat: (lat2 * 180) / Math.PI,
      lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
      bearingDeg,
      distanceKm: radiusKm,
    })
  }
  return out
}

function currentAndNextHourSamples(
  hours: ForecastHourSample[],
  nowSec: number
): { current: ForecastHourSample | null; next: ForecastHourSample | null } {
  if (hours.length === 0) return { current: null, next: null }
  const sorted = [...hours].sort((a, b) => a.timeSec - b.timeSec)
  let current: ForecastHourSample | null = null
  let next: ForecastHourSample | null = null
  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i]!
    const end = h.timeSec + 3600
    if (h.timeSec <= nowSec && nowSec < end) {
      current = h
      next = sorted[i + 1] ?? null
      break
    }
    if (h.timeSec > nowSec) {
      current = null
      next = h
      break
    }
  }
  if (!current && !next && sorted.length > 0) {
    const last = sorted[sorted.length - 1]!
    if (nowSec < last.timeSec + 3600) current = last
  }
  return { current, next }
}

export function pickWeatherSafetyThreat(input: {
  ascRainDetected: boolean
  ringLocations: LocationForecast[]
  nowSec?: number
}): WeatherSafetyThreat | null {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000)
  if (input.ascRainDetected) {
    return {
      kind: 'asc_rain',
      reason: 'ASC AI detected rain during nautical night (dusk→dawn).',
      detail: { ascRainDetected: true },
    }
  }
  return pickStormApproachThreat({ ringLocations: input.ringLocations, nowSec })
}

export function pickStormApproachThreat(input: {
  ringLocations: LocationForecast[]
  nowSec?: number
}): WeatherSafetyThreat | null {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000)
  for (const loc of input.ringLocations) {
    if (loc.distanceKm <= 0) continue
    const { current, next } = currentAndNextHourSamples(loc.hours, nowSec)
    for (const label of ['current', 'next'] as const) {
      const hour = label === 'current' ? current : next
      if (!hour) continue
      if (!isThunderstormWeatherCode(hour.weatherCode)) continue
      return {
        kind: 'storm_approach',
        reason: `Thunderstorm weather code ${hour.weatherCode} within ${STORM_APPROACH_RADIUS_KM} km during nautical night (${label} hour, ~${loc.distanceKm.toFixed(0)} km away).`,
        detail: {
          hour: label,
          weatherCode: hour.weatherCode,
          precipProbability: hour.precipProbability,
          lat: loc.lat,
          lon: loc.lon,
          distanceKm: loc.distanceKm,
          hourStartSec: hour.timeSec,
          radiusKm: STORM_APPROACH_RADIUS_KM,
        },
      }
    }
  }
  return null
}

function parseOpenMeteoMulti(
  data: unknown,
  points: Array<{ lat: number; lon: number; distanceKm: number }>
): LocationForecast[] {
  const asArray = Array.isArray(data) ? data : data != null ? [data] : []
  const out: LocationForecast[] = []
  for (let i = 0; i < points.length; i++) {
    const block = asArray[i] as
      | {
          latitude?: number
          longitude?: number
          hourly?: {
            time?: number[]
            precipitation_probability?: number[]
            weather_code?: number[]
          }
        }
      | undefined
    const point = points[i]!
    const times = block?.hourly?.time ?? []
    const precip = block?.hourly?.precipitation_probability ?? []
    const codes = block?.hourly?.weather_code ?? []
    const hours: ForecastHourSample[] = []
    for (let j = 0; j < times.length; j++) {
      const timeSec = Number(times[j])
      if (!Number.isFinite(timeSec)) continue
      hours.push({
        timeSec,
        precipProbability: Number(precip[j]),
        weatherCode: Number(codes[j]),
      })
    }
    out.push({
      lat: typeof block?.latitude === 'number' ? block.latitude : point.lat,
      lon: typeof block?.longitude === 'number' ? block.longitude : point.lon,
      distanceKm: point.distanceKm,
      hours,
    })
  }
  return out
}

async function fetchRingForecasts(lat: number, lon: number): Promise<LocationForecast[] | null> {
  const points = ringSampleCoordinates(lat, lon, STORM_APPROACH_RADIUS_KM, 8)
  const lats = points.map((p) => p.lat.toFixed(4)).join(',')
  const lons = points.map((p) => p.lon.toFixed(4)).join(',')
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lats}&longitude=${lons}` +
    '&hourly=precipitation_probability,weather_code' +
    '&forecast_days=1&timezone=auto&timeformat=unixtime'
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return parseOpenMeteoMulti(
      (await res.json()) as unknown,
      points.map((p) => ({ lat: p.lat, lon: p.lon, distanceKm: p.distanceKm }))
    )
  } catch {
    return null
  }
}

export async function evaluateWeatherSafetyThreat(): Promise<WeatherSafetyThreat | null> {
  const site = getObservatorySite()
  const [ascCloud, ringLocations] = await Promise.all([
    fetchAscCloud(),
    fetchRingForecasts(site.lat, site.lon),
  ])
  const ascRainDetected = ascCloud?.rain?.detected === true
  if (!ringLocations) {
    if (ascRainDetected) {
      return {
        kind: 'asc_rain',
        reason: 'ASC AI detected rain during nautical night (dusk→dawn).',
        detail: { ascRainDetected: true, forecastUnavailable: true },
      }
    }
    return null
  }
  return pickWeatherSafetyThreat({ ascRainDetected, ringLocations })
}

export type StormApproachStatus = {
  safe: boolean
  radiusKm: number
  threat: WeatherSafetyThreat | null
}

export async function evaluateStormApproachStatus(): Promise<StormApproachStatus | null> {
  const site = getObservatorySite()
  const ringLocations = await fetchRingForecasts(site.lat, site.lon)
  if (!ringLocations) return null
  const threat = pickStormApproachThreat({ ringLocations })
  return { safe: threat == null, radiusKm: STORM_APPROACH_RADIUS_KM, threat }
}

function readDebounceMs(): number {
  const mem = (globalThis as GlobalWithWeatherSafety).__fraos_weather_safety_last_arm_ms__
  return typeof mem === 'number' && Number.isFinite(mem) ? mem : 0
}

function writeDebounceMs(atMs: number): void {
  ;(globalThis as GlobalWithWeatherSafety).__fraos_weather_safety_last_arm_ms__ = atMs
}

function armWeatherSafetyEmergencyStop(threat: WeatherSafetyThreat): WeatherSafetyArmResult {
  const state = armEmergencyStop('Weather Safety (auto)')
  writeDebounceMs(Date.now())
  appendAuditLog({
    kind: 'emergency_stop',
    message: `Emergency STOP armed (${state.queueId}) (triggered by Weather Safety (auto)) by weather safety: ${threat.reason} ${state.heldSessionIds.length} session(s) on hold.`,
    detail: {
      queueId: state.queueId,
      requestedAt: state.requestedAt,
      requestedBy: state.requestedBy,
      event: 'armed',
      source: 'weather_safety_auto',
      threatKind: threat.kind,
      threatReason: threat.reason,
      threatDetail: threat.detail,
      heldSessionIds: state.heldSessionIds,
      gate: 'nautical_night',
    },
  })
  emitAgentWakePollSequence()
  return { armed: true, threat, queueId: state.queueId }
}

/**
 * During nautical night (dusk→dawn), arm ESTOP on ASC rain and/or 20 km thunderstorm.
 * Daytime is a no-op. Ignores session in-progress.
 */
export async function maybeArmWeatherSafetyEmergencyStop(): Promise<WeatherSafetyArmResult> {
  const g = globalThis as GlobalWithWeatherSafety
  if (g.__fraos_weather_safety_arm_inflight__) {
    return g.__fraos_weather_safety_arm_inflight__
  }

  const run = (async (): Promise<WeatherSafetyArmResult> => {
    try {
      if (!isObservatoryNight()) return { armed: false, skipped: 'daytime' }
      if (isEmergencyStopBlocking()) return { armed: false, skipped: 'already_blocking' }
      if (Date.now() - readDebounceMs() < WEATHER_SAFETY_DEBOUNCE_MS) {
        return { armed: false, skipped: 'debounced' }
      }
      const threat = await evaluateWeatherSafetyThreat()
      if (!threat) return { armed: false, skipped: 'no_threat' }
      if (isEmergencyStopBlocking()) return { armed: false, skipped: 'already_blocking', threat }
      return armWeatherSafetyEmergencyStop(threat)
    } catch {
      return { armed: false, skipped: 'error' }
    }
  })()

  g.__fraos_weather_safety_arm_inflight__ = run
  try {
    return await run
  } finally {
    if (g.__fraos_weather_safety_arm_inflight__ === run) {
      g.__fraos_weather_safety_arm_inflight__ = null
    }
  }
}

export function triggerWeatherSafetyEmergencyStopCheck(): void {
  void maybeArmWeatherSafetyEmergencyStop()
}
