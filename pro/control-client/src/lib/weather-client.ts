import { buildHourKey } from './site/tonight-schedule'
import { getTonightScheduleStrip } from './site/schedule-strip'
import { getObservatoryLocation } from './settings'
import { loadRuntimeTenant } from './tenant'

export type WeatherPrediction = 'permitted' | 'not_permitted' | 'unavailable'

export type WeatherHourCell = {
  hourStartSec: number
  label: string
  cloudCover: number
  precipProb: number
  windKmh: number
  permitted: boolean
  reasons: Array<'cloud' | 'rain' | 'wind'>
}

export type CurrentConditions = {
  tempC: number | null
  humidity: number | null
  cloudCover: number | null
  windKmh: number | null
}

export type TonightWeatherSnapshot = {
  ok: boolean
  prediction: WeatherPrediction
  current: CurrentConditions
  hours: WeatherHourCell[]
  readyHours: number
  totalNightHours: number
  hasAnyPrecipitationTonight: boolean
  readyWeatherHourKeys: string[]
  nightWeatherHourKeys: string[]
  notPermittedReasonByHourKey: Record<string, Array<'cloud' | 'rain' | 'wind'>>
  error?: string
}

const KMH_TO_MS = 1 / 3.6

function hourLabel(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function evaluateHour(
  cloud: number,
  precip: number,
  windKmh: number
): { permitted: boolean; reasons: Array<'cloud' | 'rain' | 'wind'> } {
  const reasons: Array<'cloud' | 'rain' | 'wind'> = []
  if (!Number.isFinite(cloud) || cloud >= 10) reasons.push('cloud')
  if (!Number.isFinite(precip) || precip >= 10) reasons.push('rain')
  const windMs = Number.isFinite(windKmh) ? windKmh * KMH_TO_MS : Number.NaN
  if (!Number.isFinite(windMs) || windMs > 10) reasons.push('wind')
  return { permitted: reasons.length === 0, reasons }
}

async function fetchOpenMeteoTonight(): Promise<TonightWeatherSnapshot> {
  const { lat, lon } = getObservatoryLocation()
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m,precipitation_probability' +
    '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation_probability,wind_speed_10m,is_day' +
    '&daily=sunrise,sunset&forecast_days=2&timezone=auto&timeformat=unixtime'

  const res = await fetch(url)
  if (!res.ok) throw new Error('Weather forecast unavailable')
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number
      relative_humidity_2m?: number
      cloud_cover?: number
      wind_speed_10m?: number
      precipitation_probability?: number
    }
    hourly?: {
      time?: number[]
      cloud_cover?: number[]
      precipitation_probability?: number[]
      wind_speed_10m?: number[]
    }
    daily?: { sunrise?: number[]; sunset?: number[] }
  }

  const times = data.hourly?.time ?? []
  const clouds = data.hourly?.cloud_cover ?? []
  const precip = data.hourly?.precipitation_probability ?? []
  const wind = data.hourly?.wind_speed_10m ?? []
  const sunset = data.daily?.sunset?.[0]
  const sunrise = data.daily?.sunrise?.[1]
  if (!sunset || !sunrise || times.length === 0) {
    throw new Error('Incomplete forecast window')
  }

  const nightIndices: number[] = []
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] >= sunset && times[i] < sunrise) nightIndices.push(i)
  }

  const hours: WeatherHourCell[] = nightIndices.map((i) => {
    const cloud = Number(clouds[i])
    const p = Number(precip[i])
    const w = Number(wind[i])
    const { permitted, reasons } = evaluateHour(cloud, p, w)
    return {
      hourStartSec: times[i],
      label: hourLabel(times[i]),
      cloudCover: cloud,
      precipProb: p,
      windKmh: w,
      permitted,
      reasons,
    }
  })

  const readyHours = hours.filter((h) => h.permitted).length
  const hasAnyPrecipitationTonight = hours.some((h) => h.precipProb >= 10)
  const nowSec = Math.floor(Date.now() / 1000)
  const isNight = nowSec >= sunset && nowSec < sunrise

  let prediction: WeatherPrediction = 'not_permitted'
  if (isNight) {
    prediction = 'unavailable'
  } else if (readyHours >= 3) {
    prediction = 'permitted'
  }

  const readyWeatherHourKeys = hours.filter((h) => h.permitted).map((h) => buildHourKey(new Date(h.hourStartSec * 1000)))
  const nightWeatherHourKeys = hours.map((h) => buildHourKey(new Date(h.hourStartSec * 1000)))
  const notPermittedReasonByHourKey: Record<string, Array<'cloud' | 'rain' | 'wind'>> = {}
  for (const h of hours) {
    if (h.permitted) continue
    if (h.reasons.length === 0) continue
    notPermittedReasonByHourKey[buildHourKey(new Date(h.hourStartSec * 1000))] = h.reasons
  }

  return {
    ok: true,
    prediction,
    current: {
      tempC: data.current?.temperature_2m ?? null,
      humidity: data.current?.relative_humidity_2m ?? null,
      cloudCover: data.current?.cloud_cover ?? null,
      windKmh: data.current?.wind_speed_10m ?? null,
    },
    hours,
    readyHours,
    totalNightHours: hours.length,
    hasAnyPrecipitationTonight,
    readyWeatherHourKeys,
    nightWeatherHourKeys,
    notPermittedReasonByHourKey,
  }
}

async function fetchHubTonightWeather(): Promise<TonightWeatherSnapshot | null> {
  const base = (await loadRuntimeTenant()).apiBaseUrl
  if (!base.includes('www.boreanastro.com')) return null

  const strip = getTonightScheduleStrip()
  const scheduleStart = new Date(strip.windowStartMs)
  const scheduleEnd = new Date(strip.windowEndMs)

  const url =
    `${base.replace(/\/+$/, '')}/api/imaging/tonight-weather-prediction` +
    `?startSec=${Math.floor(scheduleStart.getTime() / 1000)}` +
    `&endSec=${Math.floor(scheduleEnd.getTime() / 1000)}`

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    prediction?: WeatherPrediction
    readyHourStartsSec?: number[]
    nightHourStartsSec?: number[]
    notPermittedHourReasons?: Array<{ hourStartSec: number; reasons: string[] }>
    hasAnyPrecipitationTonight?: boolean
  }
  if (!res.ok || !data.ok || !data.prediction) return null

  const reasonsBySec = new Map<number, Array<'cloud' | 'rain' | 'wind'>>()
  for (const row of data.notPermittedHourReasons ?? []) {
    const reasons = (row.reasons ?? []).filter(
      (r): r is 'cloud' | 'rain' | 'wind' => r === 'cloud' || r === 'rain' || r === 'wind'
    )
    reasonsBySec.set(row.hourStartSec, reasons)
  }
  const readySet = new Set(data.readyHourStartsSec ?? [])
  const nightSecs = data.nightHourStartsSec ?? []

  const hours: WeatherHourCell[] = nightSecs.map((sec) => {
    const permitted = readySet.has(sec)
    return {
      hourStartSec: sec,
      label: hourLabel(sec),
      cloudCover: NaN,
      precipProb: NaN,
      windKmh: NaN,
      permitted,
      reasons: reasonsBySec.get(sec) ?? (permitted ? [] : ['cloud']),
    }
  })

  const openMeteo = await fetchOpenMeteoTonight().catch(() => null)

  const readyWeatherHourKeys = (data.readyHourStartsSec ?? [])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map((sec) => buildHourKey(new Date(sec * 1000)))
  const nightWeatherHourKeys = nightSecs.map((sec) => buildHourKey(new Date(sec * 1000)))
  const notPermittedReasonByHourKey: Record<string, Array<'cloud' | 'rain' | 'wind'>> = {}
  for (const row of data.notPermittedHourReasons ?? []) {
    if (!row || typeof row !== 'object') continue
    const hourStartSec =
      typeof (row as { hourStartSec?: unknown }).hourStartSec === 'number'
        ? (row as { hourStartSec: number }).hourStartSec
        : null
    const reasonsRaw = (row as { reasons?: unknown }).reasons
    if (hourStartSec == null || !Array.isArray(reasonsRaw)) continue
    const reasons = reasonsRaw.filter(
      (r): r is 'cloud' | 'rain' | 'wind' => r === 'cloud' || r === 'rain' || r === 'wind'
    )
    if (reasons.length === 0) continue
    notPermittedReasonByHourKey[buildHourKey(new Date(hourStartSec * 1000))] = reasons
  }

  return {
    ok: true,
    prediction: data.prediction,
    current: openMeteo?.current ?? {
      tempC: null,
      humidity: null,
      cloudCover: null,
      windKmh: null,
    },
    hours: hours.length > 0 ? hours : (openMeteo?.hours ?? []),
    readyHours: data.readyHourStartsSec?.length ?? 0,
    totalNightHours: nightSecs.length,
    hasAnyPrecipitationTonight: data.hasAnyPrecipitationTonight === true,
    readyWeatherHourKeys:
      readyWeatherHourKeys.length > 0 ? readyWeatherHourKeys : (openMeteo?.readyWeatherHourKeys ?? []),
    nightWeatherHourKeys:
      nightWeatherHourKeys.length > 0 ? nightWeatherHourKeys : (openMeteo?.nightWeatherHourKeys ?? []),
    notPermittedReasonByHourKey:
      Object.keys(notPermittedReasonByHourKey).length > 0
        ? notPermittedReasonByHourKey
        : (openMeteo?.notPermittedReasonByHourKey ?? {}),
  }
}

export async function fetchTonightWeather(): Promise<TonightWeatherSnapshot> {
  try {
    const hub = await fetchHubTonightWeather()
    if (hub) return hub
    return await fetchOpenMeteoTonight()
  } catch (ex) {
    return {
      ok: false,
      prediction: 'not_permitted',
      current: { tempC: null, humidity: null, cloudCover: null, windKmh: null },
      hours: [],
      readyHours: 0,
      totalNightHours: 0,
      hasAnyPrecipitationTonight: false,
      readyWeatherHourKeys: [],
      nightWeatherHourKeys: [],
      notPermittedReasonByHourKey: {},
      error: ex instanceof Error ? ex.message : 'Weather unavailable',
    }
  }
}
