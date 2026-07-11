import {
  getObservatoryTonightWallWindow,
  getTonightScheduleEveningAstronomyUtc,
  getTonightScheduleMorningAstronomyUtc,
} from './sunrise-window'

/** Matches Remote "tonight" strip: observatory local 4pm → next day 8am. */
export type TonightScheduleStrip = {
  nightKey: string
  windowStartMs: number
  windowEndMs: number
  schedulingDeadlineMs: number
  nauticalDuskMs: number
}

export function getTonightScheduleStrip(now = new Date()): TonightScheduleStrip {
  const wall = getObservatoryTonightWallWindow(now)
  const { nauticalDuskUtc } = getTonightScheduleEveningAstronomyUtc(now)
  const { astronomicalDawnUtc } = getTonightScheduleMorningAstronomyUtc(now)

  return {
    nightKey: wall.nightKey,
    windowStartMs: wall.startMs,
    windowEndMs: wall.endMs,
    schedulingDeadlineMs: Math.min(wall.endMs, astronomicalDawnUtc.getTime()),
    nauticalDuskMs: nauticalDuskUtc.getTime(),
  }
}

/** Sunset → next sunrise (Open-Meteo daily indices). */
export function sunsetToSunriseWindow(daily: {
  sunset?: number[]
  sunrise?: number[]
}): { startSec: number; endSec: number } | null {
  const sunset = daily.sunset?.[0]
  const sunrise = daily.sunrise?.[1]
  if (sunset == null || sunrise == null || sunrise <= sunset) return null
  return { startSec: sunset, endSec: sunrise }
}

/** Fallback night window when weather API is unavailable. */
export async function fetchSunsetSunriseFallback(lat: number, lon: number): Promise<{
  startSec: number
  endSec: number
} | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&daily=sunrise,sunset&forecast_days=2&timezone=auto&timeformat=unixtime'
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { daily?: { sunrise?: number[]; sunset?: number[] } }
    return sunsetToSunriseWindow(data.daily ?? {})
  } catch {
    return null
  }
}
