import { contentApiPath } from '../content-base'
import { getTonightSchedulingWindow } from '../site/sunrise-window'
import { sunsetToSunriseWindow } from '../site/schedule-strip'
import { evaluateGlobalTonightWeatherPermitted } from './tonight-weather-gate'

export type AstroTimelineBlock = {
  startIndex: number
  span: number
  transparencyMag: number | null
  seeingArcsec: number | null
}

export type AstroTimelineHour = {
  hourStartSec: number
  label: string
  cloudCover: number | null
  cloudLow: number | null
  cloudMid: number | null
  cloudHigh: number | null
  visibilityKm: number | null
  precipProb: number | null
  windKmh: number | null
  /** 7Timer astro model — 3h resolution */
  seeingArcsec: number | null
  transparencyMag: number | null
  astroCloudCover: number | null
  astroSource: 'open-meteo' | '7timer' | 'both'
}

export type AstroForecastSnapshot = {
  ok: boolean
  permitted: boolean
  current: {
    tempC: number | null
    humidity: number | null
    cloudCover: number | null
    windKmh: number | null
  }
  hours: AstroTimelineHour[]
  astroBlocks: AstroTimelineBlock[]
  gateStartSec: number
  gateEndSec: number
  error?: string
}

type SevenTimerPoint = {
  time: string
  cloudCover: number | null
  transparency: number | null
  seeing: number | null
  humidity: number | null
}

const KMH_TO_MS = 1 / 3.6

function hourLabel(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function nearestSevenTimerPoint(
  points: SevenTimerPoint[] | undefined,
  targetSec: number,
): SevenTimerPoint | null {
  if (!points?.length) return null
  let best = points[0]!
  let bestDelta = Math.abs(new Date(best.time).getTime() / 1000 - targetSec)
  for (const p of points) {
    const delta = Math.abs(new Date(p.time).getTime() / 1000 - targetSec)
    if (delta < bestDelta) {
      best = p
      bestDelta = delta
    }
  }
  return bestDelta <= 5400 ? best : null
}

function assignSevenTimerBlocks(
  hours: AstroTimelineHour[],
  points: SevenTimerPoint[],
): { hours: AstroTimelineHour[]; blocks: AstroTimelineBlock[] } {
  if (!hours.length) return { hours, blocks: [] }
  if (!points.length) return { hours, blocks: [] }

  const sorted = [...points].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  )

  const hoursWithAstro = hours.map((h) => {
    const sec = h.hourStartSec
    let match: SevenTimerPoint | null = null
    for (const p of sorted) {
      const ps = Math.floor(new Date(p.time).getTime() / 1000)
      if (ps <= sec && sec < ps + 3 * 3600) {
        match = p
        break
      }
    }
    if (!match) match = nearestSevenTimerPoint(sorted, sec)
    if (!match) return h
    const seeing = match.seeing
    const transparency = match.transparency
    return {
      ...h,
      seeingArcsec: Number.isFinite(Number(seeing)) ? Number(seeing) : null,
      transparencyMag: Number.isFinite(Number(transparency)) ? Number(transparency) : null,
      astroCloudCover: match.cloudCover ?? null,
      astroSource: 'both' as const,
    }
  })

  const blocks: AstroTimelineBlock[] = []
  let i = 0
  while (i < hoursWithAstro.length) {
    const sec = hoursWithAstro[i]!.hourStartSec
    let match: SevenTimerPoint | null = null
    for (const p of sorted) {
      const ps = Math.floor(new Date(p.time).getTime() / 1000)
      if (ps <= sec && sec < ps + 3 * 3600) {
        match = p
        break
      }
    }
    if (!match) match = nearestSevenTimerPoint(sorted, sec)

    const blockEndSec = match
      ? Math.floor(new Date(match.time).getTime() / 1000) + 3 * 3600
      : sec + 3600

    let span = 0
    while (i + span < hoursWithAstro.length && hoursWithAstro[i + span]!.hourStartSec < blockEndSec) {
      span += 1
    }
    if (span < 1) span = 1

    const seeing = match?.seeing
    const transparency = match?.transparency
    blocks.push({
      startIndex: i,
      span,
      transparencyMag: Number.isFinite(Number(transparency)) ? Number(transparency) : null,
      seeingArcsec: Number.isFinite(Number(seeing)) ? Number(seeing) : null,
    })
    i += span
  }

  return { hours: hoursWithAstro, blocks }
}

async function fetchSevenTimer(lat: number, lon: number): Promise<SevenTimerPoint[]> {
  const url = contentApiPath(`/api/astro/7timer?lat=${lat}&lon=${lon}`)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return []
  const data = (await res.json()) as { points?: SevenTimerPoint[] }
  return data.points ?? []
}

async function fetchOpenMeteo(lat: number, lon: number) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m' +
    '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation_probability,wind_speed_10m' +
    '&daily=sunrise,sunset&forecast_days=2&timezone=auto&timeformat=unixtime'

  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo forecast unavailable')
  return (await res.json()) as {
    current?: {
      temperature_2m?: number
      relative_humidity_2m?: number
      cloud_cover?: number
      wind_speed_10m?: number
    }
    hourly?: {
      time?: number[]
      cloud_cover?: number[]
      cloud_cover_low?: number[]
      cloud_cover_mid?: number[]
      cloud_cover_high?: number[]
      visibility?: number[]
      precipitation_probability?: number[]
      wind_speed_10m?: number[]
    }
    daily?: { sunrise?: number[]; sunset?: number[] }
  }
}

export async function fetchAstroForecast(lat: number, lon: number): Promise<AstroForecastSnapshot> {
  try {
    const [openMeteo, sevenTimer] = await Promise.all([
      fetchOpenMeteo(lat, lon),
      fetchSevenTimer(lat, lon),
    ])

    const times = openMeteo.hourly?.time ?? []
    const clouds = openMeteo.hourly?.cloud_cover ?? []
    const cloudLow = openMeteo.hourly?.cloud_cover_low ?? []
    const cloudMid = openMeteo.hourly?.cloud_cover_mid ?? []
    const cloudHigh = openMeteo.hourly?.cloud_cover_high ?? []
    const visibility = openMeteo.hourly?.visibility ?? []
    const precip = openMeteo.hourly?.precipitation_probability ?? []
    const wind = openMeteo.hourly?.wind_speed_10m ?? []

    const sunsetWindow = sunsetToSunriseWindow(openMeteo.daily ?? {})
    const { nauticalDuskUtc, nauticalDawnUtc } = getTonightSchedulingWindow()
    const gateStartSec = sunsetWindow?.startSec ?? Math.floor(nauticalDuskUtc.getTime() / 1000)
    const gateEndSec = sunsetWindow?.endSec ?? Math.floor(nauticalDawnUtc.getTime() / 1000)

    const nightIndices: number[] = []
    for (let i = 0; i < times.length; i += 1) {
      if (times[i] >= gateStartSec && times[i] < gateEndSec) nightIndices.push(i)
    }

    const hours: AstroTimelineHour[] = nightIndices.map((i) => {
      const sec = times[i]!
      return {
        hourStartSec: sec,
        label: hourLabel(sec),
        cloudCover: Number.isFinite(Number(clouds[i])) ? Number(clouds[i]) : null,
        cloudLow: Number.isFinite(Number(cloudLow[i])) ? Number(cloudLow[i]) : null,
        cloudMid: Number.isFinite(Number(cloudMid[i])) ? Number(cloudMid[i]) : null,
        cloudHigh: Number.isFinite(Number(cloudHigh[i])) ? Number(cloudHigh[i]) : null,
        visibilityKm: Number.isFinite(Number(visibility[i])) ? Number(visibility[i]) / 1000 : null,
        precipProb: Number.isFinite(Number(precip[i])) ? Number(precip[i]) : null,
        windKmh: Number.isFinite(Number(wind[i])) ? Number(wind[i]) : null,
        seeingArcsec: null,
        transparencyMag: null,
        astroCloudCover: null,
        astroSource: 'open-meteo',
      }
    })

    const hoursWithAstro = assignSevenTimerBlocks(hours, sevenTimer)

    const nowSec = Math.floor(Date.now() / 1000)
    const { nauticalDuskUtc: permitStart, nauticalDawnUtc: permitEnd } = getTonightSchedulingWindow()
    const permitted = evaluateGlobalTonightWeatherPermitted({
      hours: hoursWithAstro.hours.map((h) => ({
        hourStartSec: h.hourStartSec,
        cloudCover: h.cloudCover ?? NaN,
        precipProbability: h.precipProb ?? NaN,
        windSpeedMs: Number.isFinite(h.windKmh ?? NaN) ? (h.windKmh as number) * KMH_TO_MS : NaN,
      })),
      gateStartSec: Math.floor(permitStart.getTime() / 1000),
      gateEndSec: Math.floor(permitEnd.getTime() / 1000),
      nowSec,
    })

    return {
      ok: true,
      permitted,
      current: {
        tempC: openMeteo.current?.temperature_2m ?? null,
        humidity: openMeteo.current?.relative_humidity_2m ?? null,
        cloudCover: openMeteo.current?.cloud_cover ?? null,
        windKmh: openMeteo.current?.wind_speed_10m ?? null,
      },
      hours: hoursWithAstro.hours,
      astroBlocks: hoursWithAstro.blocks,
      gateStartSec,
      gateEndSec,
    }
  } catch (ex) {
    return {
      ok: false,
      permitted: false,
      current: { tempC: null, humidity: null, cloudCover: null, windKmh: null },
      hours: [],
      astroBlocks: [],
      gateStartSec: 0,
      gateEndSec: 0,
      error: ex instanceof Error ? ex.message : 'Forecast unavailable',
    }
  }
}

/** Color scale for metric cells: green / yellow / red */
export function metricColor(metric: 'cloud' | 'seeing' | 'transparency' | 'wind' | 'precip', value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'rgba(255,255,255,0.12)'
  switch (metric) {
    case 'cloud':
      if (value < 20) return '#22c55e'
      if (value < 50) return '#eab308'
      return '#ef4444'
    case 'precip':
      if (value < 10) return '#22c55e'
      if (value < 30) return '#eab308'
      return '#ef4444'
    case 'wind':
      if (value < 15) return '#22c55e'
      if (value < 25) return '#eab308'
      return '#ef4444'
    case 'seeing':
      if (value <= 1.5) return '#22c55e'
      if (value <= 2.5) return '#eab308'
      return '#ef4444'
    case 'transparency':
      if (value >= 5) return '#22c55e'
      if (value >= 3) return '#eab308'
      return '#ef4444'
    default:
      return 'rgba(255,255,255,0.12)'
  }
}
