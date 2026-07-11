import { getTonightSchedulingWindow } from '@/lib/content/sunrise-window'
import {
  evaluateGlobalTonightWeatherPermitted,
  MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS,
  type HourlyForecastSample,
} from '@/lib/content/tonight-weather-gate'

const KMH_TO_MS = 1 / 3.6

export type TonightWeatherPredictionResult =
  | {
      ok: true
      prediction: 'permitted' | 'not_permitted' | 'unavailable'
      permitted?: boolean
      message?: string
      readyHourStartsSec: number[]
      nightHourStartsSec: number[]
      notPermittedHourReasons: Array<{ hourStartSec: number; reasons: Array<'cloud' | 'rain' | 'wind'> }>
      hasAnyPrecipitationTonight: boolean
      precipitationHits: Array<{
        hourStartSec: number
        precipitationProbability: number
        cloudCover: number | null
      }>
      rule?: string
    }
  | { ok: false; error: string }

export async function evaluateTonightWeatherPrediction(input: {
  lat: number
  lon: number
  startSec?: number
  endSec?: number
}): Promise<TonightWeatherPredictionResult> {
  const lat = input.lat
  const lon = input.lon
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return { ok: false, error: 'Observatory coordinates are not configured.' }
  }

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&hourly=cloud_cover,precipitation_probability,wind_speed_10m,is_day' +
    '&daily=sunrise,sunset' +
    '&forecast_days=2&timezone=auto&timeformat=unixtime'

  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    return { ok: false, error: 'Failed to fetch weather forecast' }
  }

  const data = (await response.json()) as {
    hourly?: {
      time?: number[]
      cloud_cover?: number[]
      precipitation_probability?: number[]
      wind_speed_10m?: number[]
      is_day?: number[]
    }
    daily?: { sunrise?: number[]; sunset?: number[] }
  }
  const hourly = data.hourly
  const times = hourly?.time ?? []
  const clouds = hourly?.cloud_cover ?? []
  const precipProb = hourly?.precipitation_probability ?? []
  const windSpeed = hourly?.wind_speed_10m ?? []
  const isDay = hourly?.is_day ?? []
  const dailySunrise = data.daily?.sunrise ?? []
  const dailySunset = data.daily?.sunset ?? []

  if (
    times.length === 0 ||
    clouds.length !== times.length ||
    precipProb.length !== times.length ||
    windSpeed.length !== times.length
  ) {
    return { ok: false, error: 'Forecast data is incomplete' }
  }
  if (dailySunset.length < 1 || dailySunrise.length < 2) {
    return { ok: false, error: 'Daily sunrise/sunset data is incomplete' }
  }

  const parsedStartSec = input.startSec ?? NaN
  const parsedEndSec = input.endSec ?? NaN
  const hasExternalWindow =
    Number.isFinite(parsedStartSec) && Number.isFinite(parsedEndSec) && parsedEndSec > parsedStartSec
  const windowStartSec = hasExternalWindow ? parsedStartSec : dailySunset[0]
  const windowEndSec = hasExternalWindow ? parsedEndSec : dailySunrise[1]

  const nowSec = Math.floor(Date.now() / 1000)
  const nightIndices: number[] = []
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] >= windowStartSec && times[i] < windowEndSec) nightIndices.push(i)
  }
  const nightHourStartsSec = nightIndices.map((i) => times[i])
  const readyHourStartsSec: number[] = []
  const notPermittedHourReasons: Array<{ hourStartSec: number; reasons: Array<'cloud' | 'rain' | 'wind'> }> = []

  for (const i of nightIndices) {
    const cloud = Number(clouds[i])
    const precip = Number(precipProb[i])
    const windRaw = Number(windSpeed[i])
    const wind = Number.isFinite(windRaw) ? windRaw * KMH_TO_MS : Number.NaN
    const reasons: Array<'cloud' | 'rain' | 'wind'> = []
    if (!Number.isFinite(cloud) || cloud >= 10) reasons.push('cloud')
    if (!Number.isFinite(precip) || precip >= 10) reasons.push('rain')
    if (!Number.isFinite(wind) || wind > 10) reasons.push('wind')
    if (reasons.length === 0) readyHourStartsSec.push(times[i])
    else notPermittedHourReasons.push({ hourStartSec: times[i], reasons })
  }

  const { nauticalDuskUtc, nauticalDawnUtc } = getTonightSchedulingWindow(new Date(), lat, lon)
  const globalGateStartSec = Math.floor(nauticalDuskUtc.getTime() / 1000)
  const globalGateEndSec = Math.floor(nauticalDawnUtc.getTime() / 1000)

  let isNighttimeNow = nowSec >= windowStartSec && nowSec < windowEndSec
  if (isDay.length === times.length) {
    let idx = -1
    for (let i = 0; i < times.length; i += 1) {
      if (times[i] <= nowSec) idx = i
      else break
    }
    if (idx >= 0) isNighttimeNow = Number(isDay[idx]) === 0
  }

  const precipitationHits = nightIndices
    .map((i) => {
      const precip = Number(precipProb[i])
      const cloud = Number(clouds[i])
      if (!Number.isFinite(precip) || precip < 10) return null
      return {
        hourStartSec: times[i],
        precipitationProbability: precip,
        cloudCover: Number.isFinite(cloud) ? cloud : null,
      }
    })
    .filter(
      (x): x is { hourStartSec: number; precipitationProbability: number; cloudCover: number | null } =>
        x != null
    )

  if (isNighttimeNow) {
    return {
      ok: true,
      prediction: 'unavailable',
      message: 'nighttime now, prediction not available',
      readyHourStartsSec,
      nightHourStartsSec,
      notPermittedHourReasons,
      hasAnyPrecipitationTonight: precipitationHits.length > 0,
      precipitationHits,
    }
  }

  const hourlySamples: HourlyForecastSample[] = times.map((hourStartSec, i) => {
    const windRaw = Number(windSpeed[i])
    return {
      hourStartSec,
      cloudCover: Number(clouds[i]),
      precipProbability: Number(precipProb[i]),
      windSpeedMs: Number.isFinite(windRaw) ? windRaw * KMH_TO_MS : Number.NaN,
    }
  })
  const permitted = evaluateGlobalTonightWeatherPermitted({
    hours: hourlySamples,
    gateStartSec: globalGateStartSec,
    gateEndSec: globalGateEndSec,
    nowSec,
  })
  const prediction = permitted ? 'permitted' : 'not_permitted'

  return {
    ok: true,
    prediction,
    permitted,
    readyHourStartsSec,
    nightHourStartsSec,
    notPermittedHourReasons,
    hasAnyPrecipitationTonight: precipitationHits.length > 0,
    precipitationHits,
    rule:
      `Tonight (nautical dusk → nautical dawn): (1) ${MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS} consecutive hours with cloud_cover < 10%; ` +
      '(2) every hour precipitation_probability < 10%; (3) hours with wind_speed_10m > 10 m/s must be <= 3.',
  }
}
