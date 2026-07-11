import type Database from 'better-sqlite3'
import { subtractOccupiedFromFree } from '../imaging/free-intervals.js'
import { getObservatorySite } from '../observatory-site.js'
import {
  readWeatherCache,
  resolveHubLat,
  resolveHubLon,
  writeWeatherCache,
} from '../db.js'

const KMH_TO_MS = 1 / 3.6

export const MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS = 2

export type TimeInterval = { startMs: number; endMs: number }

type OpenMeteoResponse = {
  hourly?: {
    time?: number[]
    cloud_cover?: number[]
    precipitation_probability?: number[]
    wind_speed_10m?: number[]
  }
  daily?: {
    sunrise?: number[]
    sunset?: number[]
  }
}

export type TonightWeatherIntervalsResult = {
  status: 'ok' | 'unknown'
  permittedIntervals: TimeInterval[]
  nightStartMs?: number
  nightEndMs?: number
  globalHardBlocked?: boolean
  globalHardBlockReason?: string
  reason?: string
}

export function weatherPermittedCoverageMs(
  permittedIntervals: TimeInterval[],
  startMs: number,
  endMs: number
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  let covered = 0
  for (const interval of permittedIntervals) {
    const overlapStart = Math.max(startMs, interval.startMs)
    const overlapEnd = Math.min(endMs, interval.endMs)
    if (overlapEnd > overlapStart) covered += overlapEnd - overlapStart
  }
  return covered
}

export function weatherCoverageOk(
  permittedIntervals: TimeInterval[],
  startMs: number,
  endMs: number,
  requiredFraction = 0.8
): boolean {
  const duration = endMs - startMs
  if (!Number.isFinite(duration) || duration <= 0) return false
  const covered = weatherPermittedCoverageMs(permittedIntervals, startMs, endMs)
  return covered >= duration * requiredFraction
}

export async function getTonightWeatherPermittedIntervals(): Promise<TonightWeatherIntervalsResult> {
  const { lat, lon } = getObservatorySite()
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return {
      status: 'unknown',
      permittedIntervals: [],
      reason: 'Observatory coordinates not configured.',
    }
  }

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&hourly=cloud_cover,precipitation_probability,wind_speed_10m' +
    '&daily=sunrise,sunset' +
    '&forecast_days=2&timezone=auto&timeformat=unixtime'

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return { status: 'unknown', permittedIntervals: [], reason: 'Weather forecast unavailable' }
    }
    const data = (await res.json()) as OpenMeteoResponse
    const times = data.hourly?.time ?? []
    const clouds = data.hourly?.cloud_cover ?? []
    const precip = data.hourly?.precipitation_probability ?? []
    const wind = data.hourly?.wind_speed_10m ?? []
    const sunset = data.daily?.sunset?.[0]
    const sunrise = data.daily?.sunrise?.[1]
    if (
      !Number.isFinite(sunset) ||
      !Number.isFinite(sunrise) ||
      Number(sunrise) <= Number(sunset) ||
      times.length === 0 ||
      clouds.length !== times.length ||
      precip.length !== times.length ||
      wind.length !== times.length
    ) {
      return { status: 'unknown', permittedIntervals: [], reason: 'Weather forecast data incomplete' }
    }

    const nightStartMs = Number(sunset) * 1000
    const nightEndMs = Number(sunrise) * 1000
    const nightIndices: number[] = []
    for (let i = 0; i < times.length; i += 1) {
      if (times[i]! >= Number(sunset) && times[i]! < Number(sunrise)) nightIndices.push(i)
    }
    if (nightIndices.length === 0) {
      return { status: 'unknown', permittedIntervals: [], reason: 'No forecast samples for tonight window' }
    }

    const nowMs = Date.now()
    const beforeAstroNight = nowMs < nightStartMs

    const permittedIntervals: TimeInterval[] = []
    let anyPrecipOver10 = false
    let windOver10Count = 0
    let consecutiveCloudUnder10 = 0
    let hasMinConsecutiveCloudClearRun = false
    for (const i of nightIndices) {
      const hourStartMs = times[i]! * 1000
      const hourEndMs = hourStartMs + 60 * 60 * 1000
      const hourFullyEnded = hourEndMs <= nowMs
      const countsTowardGlobalHard = beforeAstroNight || !hourFullyEnded

      const c = Number(clouds[i])
      const p = Number(precip[i])
      const wKmh = Number(wind[i])
      const wMs = Number.isFinite(wKmh) ? wKmh * KMH_TO_MS : Number.NaN
      if (countsTowardGlobalHard) {
        if (!Number.isFinite(p) || p >= 10) anyPrecipOver10 = true
        if (!Number.isFinite(wMs) || wMs > 10) windOver10Count += 1
        if (Number.isFinite(c) && c < 10) {
          consecutiveCloudUnder10 += 1
          if (consecutiveCloudUnder10 >= MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS) {
            hasMinConsecutiveCloudClearRun = true
          }
        } else {
          consecutiveCloudUnder10 = 0
        }
      }
      const isPermitted =
        Number.isFinite(c) &&
        c < 10 &&
        Number.isFinite(p) &&
        p < 10 &&
        Number.isFinite(wMs) &&
        wMs <= 10
      if (!isPermitted) continue
      const startMs = Math.max(hourStartMs, nightStartMs)
      const endMs = Math.min(hourEndMs, nightEndMs)
      if (endMs > startMs) permittedIntervals.push({ startMs, endMs })
    }
    const windTooMuch = windOver10Count > 3
    const cloudRunMissing = !hasMinConsecutiveCloudClearRun
    const globalHardBlocked = anyPrecipOver10 || windTooMuch || cloudRunMissing
    const globalHardBlockReason = anyPrecipOver10
      ? 'Global weather trigger: at least one night hour has precipitation probability >= 10%.'
      : windTooMuch
        ? 'Global weather trigger: more than 3 night hours have wind speed > 10 m/s.'
        : cloudRunMissing
          ? `Global weather trigger: no ${MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS}-hour consecutive run with cloud cover < 10%.`
          : ''

    return {
      status: 'ok',
      permittedIntervals,
      nightStartMs,
      nightEndMs,
      globalHardBlocked,
      globalHardBlockReason,
    }
  } catch {
    return { status: 'unknown', permittedIntervals: [], reason: 'Weather forecast evaluation failed' }
  }
}

/* ------------------------------------------------------------------ */
/*  Cached gate (SQLite weather_cache, 30-min TTL, hub_config coords) */
/* ------------------------------------------------------------------ */

/**
 * Top-level "is tonight permitted?" verdict used by the schedule-insight
 * and tonight-weather-prediction routes.
 */
export type TonightWeatherGateResult = {
  status: 'permitted' | 'not_permitted' | 'unknown'
  reason: string
  /** Underlying interval breakdown when available. */
  intervals?: TonightWeatherIntervalsResult
}

/**
 * Evaluate tonight's weather gate, using the SQLite `weather_cache` table
 * (30-minute TTL) to avoid hammering Open-Meteo on every poll. Observatory
 * latitude/longitude are read from `hub_config` (default 41.87, -72.01).
 *
 * On a cache miss (or stale entry) the raw Open-Meteo response is fetched,
 * persisted to `weather_cache`, and intervals re-derived from the cached
 * payload so subsequent calls within the TTL are served from SQLite.
 *
 * @param db open database handle (hub.db)
 */
export async function getTonightWeatherGate(db: Database.Database): Promise<TonightWeatherGateResult> {
  const intervals = await getCachedTonightWeatherPermittedIntervals(db)
  if (intervals.status !== 'ok' || !intervals.nightStartMs || !intervals.nightEndMs) {
    return {
      status: 'unknown',
      reason: intervals.reason ?? 'Weather forecast unavailable',
      intervals,
    }
  }
  const coverage = weatherPermittedCoverageMs(
    intervals.permittedIntervals,
    intervals.nightStartMs,
    intervals.nightEndMs
  )
  const duration = intervals.nightEndMs - intervals.nightStartMs
  const permitted = duration > 0 && coverage >= duration * 0.8
  return {
    status: permitted ? 'permitted' : 'not_permitted',
    reason: permitted
      ? 'Tonight weather permits >=80% coverage of full-night window'
      : 'Tonight weather does not permit >=80% coverage of full-night window',
    intervals,
  }
}

/**
 * Same interval computation as {@link getTonightWeatherPermittedIntervals},
 * but served from the SQLite `weather_cache` table with a 30-minute TTL.
 * Coordinates come from `hub_config` (default Pomfret: 41.87, -72.01).
 */
export async function getCachedTonightWeatherPermittedIntervals(
  db: Database.Database
): Promise<TonightWeatherIntervalsResult> {
  const lat = resolveHubLat()
  const lon = resolveHubLon()
  const cached = readWeatherCache(db)
  let data: OpenMeteoResponse | null = null
  if (cached) {
    try {
      data = JSON.parse(cached.dataJson) as OpenMeteoResponse
    } catch {
      data = null
    }
  }
  if (!data) {
    data = await fetchOpenMeteo(lat, lon)
    if (data) writeWeatherCache(db, JSON.stringify(data))
  }
  if (!data) {
    return { status: 'unknown', permittedIntervals: [], reason: 'Weather forecast unavailable' }
  }
  return deriveIntervalsFromOpenMeteo(data)
}

/** Fetch the raw Open-Meteo hourly forecast payload for the given coords. */
async function fetchOpenMeteo(lat: number, lon: number): Promise<OpenMeteoResponse | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&hourly=cloud_cover,precipitation_probability,wind_speed_10m' +
    '&daily=sunrise,sunset' +
    '&forecast_days=2&timezone=auto&timeformat=unixtime'
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as OpenMeteoResponse
  } catch {
    return null
  }
}

/**
 * Pure interval derivation from an Open-Meteo payload. Mirrors the rule set
 * in {@link getTonightWeatherPermittedIntervals} (cloud < 10%, precip < 10%,
 * wind <= 10 m/s; global hard gate on precip / wind / consecutive clear run).
 */
function deriveIntervalsFromOpenMeteo(data: OpenMeteoResponse): TonightWeatherIntervalsResult {
  const times = data.hourly?.time ?? []
  const clouds = data.hourly?.cloud_cover ?? []
  const precip = data.hourly?.precipitation_probability ?? []
  const wind = data.hourly?.wind_speed_10m ?? []
  const sunset = data.daily?.sunset?.[0]
  const sunrise = data.daily?.sunrise?.[1]
  if (
    !Number.isFinite(sunset) ||
    !Number.isFinite(sunrise) ||
    Number(sunrise) <= Number(sunset) ||
    times.length === 0 ||
    clouds.length !== times.length ||
    precip.length !== times.length ||
    wind.length !== times.length
  ) {
    return { status: 'unknown', permittedIntervals: [], reason: 'Weather forecast data incomplete' }
  }

  const nightStartMs = Number(sunset) * 1000
  const nightEndMs = Number(sunrise) * 1000
  const nightIndices: number[] = []
  for (let i = 0; i < times.length; i += 1) {
    if (times[i]! >= Number(sunset) && times[i]! < Number(sunrise)) nightIndices.push(i)
  }
  if (nightIndices.length === 0) {
    return { status: 'unknown', permittedIntervals: [], reason: 'No forecast samples for tonight window' }
  }

  const nowMs = Date.now()
  const beforeAstroNight = nowMs < nightStartMs

  const permittedIntervals: TimeInterval[] = []
  let anyPrecipOver10 = false
  let windOver10Count = 0
  let consecutiveCloudUnder10 = 0
  let hasMinConsecutiveCloudClearRun = false
  for (const i of nightIndices) {
    const hourStartMs = times[i]! * 1000
    const hourEndMs = hourStartMs + 60 * 60 * 1000
    const hourFullyEnded = hourEndMs <= nowMs
    const countsTowardGlobalHard = beforeAstroNight || !hourFullyEnded

    const c = Number(clouds[i])
    const p = Number(precip[i])
    const wKmh = Number(wind[i])
    const wMs = Number.isFinite(wKmh) ? wKmh * KMH_TO_MS : Number.NaN
    if (countsTowardGlobalHard) {
      if (!Number.isFinite(p) || p >= 10) anyPrecipOver10 = true
      if (!Number.isFinite(wMs) || wMs > 10) windOver10Count += 1
      if (Number.isFinite(c) && c < 10) {
        consecutiveCloudUnder10 += 1
        if (consecutiveCloudUnder10 >= MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS) {
          hasMinConsecutiveCloudClearRun = true
        }
      } else {
        consecutiveCloudUnder10 = 0
      }
    }
    const isPermitted =
      Number.isFinite(c) &&
      c < 10 &&
      Number.isFinite(p) &&
      p < 10 &&
      Number.isFinite(wMs) &&
      wMs <= 10
    if (!isPermitted) continue
    const startMs = Math.max(hourStartMs, nightStartMs)
    const endMs = Math.min(hourEndMs, nightEndMs)
    if (endMs > startMs) permittedIntervals.push({ startMs, endMs })
  }
  const windTooMuch = windOver10Count > 3
  const cloudRunMissing = !hasMinConsecutiveCloudClearRun
  const globalHardBlocked = anyPrecipOver10 || windTooMuch || cloudRunMissing
  const globalHardBlockReason = anyPrecipOver10
    ? 'Global weather trigger: at least one night hour has precipitation probability >= 10%.'
    : windTooMuch
      ? 'Global weather trigger: more than 3 night hours have wind speed > 10 m/s.'
      : cloudRunMissing
        ? `Global weather trigger: no ${MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS}-hour consecutive run with cloud cover < 10%.`
        : ''

  return {
    status: 'ok',
    permittedIntervals,
    nightStartMs,
    nightEndMs,
    globalHardBlocked,
    globalHardBlockReason,
  }
}
