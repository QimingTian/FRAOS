import {
  observatoryLocalCalendarAnchorUtc,
  observatoryLocalParts,
  observatoryLocalWallTimeUtc,
  observatoryWallTimeOnLocalDateUtc,
  readObservatoryCoords,
} from '../observatory-local-time'

export { observatoryLocalCalendarAnchorUtc } from '../observatory-local-time'

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

function dayOfYearUTC(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.floor((current - start) / 86400000) + 1
}

function solarEventUtcForDate(
  date: Date,
  zenithDeg: number,
  isSunrise: boolean,
  lat: number,
  lon: number
): Date {
  const n = dayOfYearUTC(date)
  const gamma = (2 * Math.PI / 365) * (n - 1)

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  const latRad = degToRad(lat)
  const zenithRad = degToRad(zenithDeg)
  const cosH =
    (Math.cos(zenithRad) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl))
  const clamped = Math.max(-1, Math.min(1, cosH))
  const hourAngleDeg = radToDeg(Math.acos(clamped))

  const solarNoonMin = 720 - 4 * lon - eqTime
  const eventMin = isSunrise ? solarNoonMin - 4 * hourAngleDeg : solarNoonMin + 4 * hourAngleDeg

  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return new Date(midnightUtc + eventMin * 60000)
}

function readSiteCoords(): { lat: number; lon: number } {
  const { lat, lon } = readObservatoryCoords()
  return { lat, lon }
}

function sunriseUtcForDate(date: Date, lat: number, lon: number): Date {
  return solarEventUtcForDate(date, 90.833, true, lat, lon)
}

function sunsetUtcForDate(date: Date, lat: number, lon: number): Date {
  return solarEventUtcForDate(date, 90.833, false, lat, lon)
}

function nauticalDawnUtcForDate(date: Date, lat: number, lon: number): Date {
  return solarEventUtcForDate(date, 102, true, lat, lon)
}

function nauticalDuskUtcForDate(date: Date, lat: number, lon: number): Date {
  return solarEventUtcForDate(date, 102, false, lat, lon)
}

function tonightScheduleAnchorUtc(now = new Date()): Date {
  const { lat, lon } = readSiteCoords()
  let start = observatoryLocalWallTimeUtc(now, 16, 0, 0, lon)
  const anchor = observatoryLocalCalendarAnchorUtc(now, lon)
  const todaySunrise = sunriseUtcForDate(anchor, lat, lon)
  if (now.getTime() < todaySunrise.getTime()) {
    start = new Date(start.getTime() - 86400000)
  }
  const startParts = observatoryLocalParts(start, lon)
  return new Date(Date.UTC(startParts.year, startParts.month, startParts.day))
}

/** Nautical dawn/dusk (UTC) and daytime-closed band for the observatory local day of `now`. */
export function getDaytimeClosedWindowDetail(now = new Date()): {
  within: boolean
  nauticalDawnUtc: string
  nauticalDuskUtc: string
  sunriseUtc: string
  sunsetUtc: string
  closedStartUtc: string
  closedEndUtc: string
} {
  const { lat, lon } = readSiteCoords()
  const today = observatoryLocalCalendarAnchorUtc(now, lon)
  const nauticalDawn = nauticalDawnUtcForDate(today, lat, lon)
  const nauticalDusk = nauticalDuskUtcForDate(today, lat, lon)
  const sunrise = sunriseUtcForDate(today, lat, lon)
  const sunset = sunsetUtcForDate(today, lat, lon)
  const closedStart = nauticalDawn
  const closedEnd = nauticalDusk
  return {
    within: now >= closedStart && now <= closedEnd,
    nauticalDawnUtc: nauticalDawn.toISOString(),
    nauticalDuskUtc: nauticalDusk.toISOString(),
    sunriseUtc: sunrise.toISOString(),
    sunsetUtc: sunset.toISOString(),
    closedStartUtc: closedStart.toISOString(),
    closedEndUtc: closedEnd.toISOString(),
  }
}

export function isWithinDaytimeClosedWindow(now = new Date()): boolean {
  return getDaytimeClosedWindowDetail(now).within
}

export function nextSunriseUtc(now = new Date()): Date {
  const { lat, lon } = readSiteCoords()
  const today = observatoryLocalCalendarAnchorUtc(now, lon)
  const sunriseToday = sunriseUtcForDate(today, lat, lon)
  if (sunriseToday > now) return sunriseToday

  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return sunriseUtcForDate(tomorrow, lat, lon)
}

export function canFinishBeforeSunriseBuffer(
  exposureSeconds: number,
  count: number,
  now = new Date()
): { ok: boolean; requiredSeconds: number; secondsUntilDeadline: number; sunriseUtc: Date; deadlineUtc: Date } {
  const requiredSeconds = Math.max(0, exposureSeconds * count)
  const sunriseUtc = nextSunriseUtc(now)
  const deadlineUtc = new Date(sunriseUtc.getTime() - 60 * 60 * 1000)
  const secondsUntilDeadline = (deadlineUtc.getTime() - now.getTime()) / 1000
  return {
    ok: requiredSeconds <= secondsUntilDeadline,
    requiredSeconds,
    secondsUntilDeadline,
    sunriseUtc,
    deadlineUtc,
  }
}

export function getTonightAstronomicalNightWindow(now = new Date()): {
  astronomicalDuskUtc: Date
  astronomicalDawnUtc: Date
  durationSeconds: number
} {
  const { lat, lon } = readSiteCoords()
  const anchor = tonightScheduleAnchorUtc(now)
  const nextUtcDate = new Date(anchor)
  nextUtcDate.setUTCDate(nextUtcDate.getUTCDate() + 1)

  const astronomicalDuskUtc = solarEventUtcForDate(anchor, 108, false, lat, lon)
  const astronomicalDawnUtc = solarEventUtcForDate(nextUtcDate, 108, true, lat, lon)
  const durationSeconds = Math.max(
    0,
    (astronomicalDawnUtc.getTime() - astronomicalDuskUtc.getTime()) / 1000
  )

  return { astronomicalDuskUtc, astronomicalDawnUtc, durationSeconds }
}

/** Imaging queue / placement window: nautical dusk → nautical dawn. */
export function getTonightSchedulingWindow(now = new Date()): {
  nauticalDuskUtc: Date
  nauticalDawnUtc: Date
  astronomicalDawnUtc: Date
} {
  const { lat, lon } = readSiteCoords()
  const anchor = tonightScheduleAnchorUtc(now)
  const nextUtcDate = new Date(anchor)
  nextUtcDate.setUTCDate(nextUtcDate.getUTCDate() + 1)

  const nauticalDuskUtc = solarEventUtcForDate(anchor, 102, false, lat, lon)
  const nauticalDawnUtc = solarEventUtcForDate(nextUtcDate, 102, true, lat, lon)
  const astronomicalDawnUtc = solarEventUtcForDate(nextUtcDate, 108, true, lat, lon)
  return { nauticalDuskUtc, nauticalDawnUtc, astronomicalDawnUtc }
}

export function getCivilTwilightNightWindowUtc(now = new Date()): { civilDuskUtc: Date; civilDawnUtc: Date } {
  const { lat, lon } = readSiteCoords()
  const anchor = tonightScheduleAnchorUtc(now)
  const nextUtcDate = new Date(anchor)
  nextUtcDate.setUTCDate(nextUtcDate.getUTCDate() + 1)
  return {
    civilDuskUtc: solarEventUtcForDate(anchor, 96, false, lat, lon),
    civilDawnUtc: solarEventUtcForDate(nextUtcDate, 96, true, lat, lon),
  }
}

export function getTonightScheduleEveningAstronomyUtc(now = new Date()): {
  sunsetUtc: Date
  civilDuskUtc: Date
  nauticalDuskUtc: Date
  astronomicalDarkUtc: Date
} {
  const { lat, lon } = readSiteCoords()
  const baseUtc = tonightScheduleAnchorUtc(now)
  return {
    sunsetUtc: solarEventUtcForDate(baseUtc, 90.833, false, lat, lon),
    civilDuskUtc: solarEventUtcForDate(baseUtc, 96, false, lat, lon),
    nauticalDuskUtc: solarEventUtcForDate(baseUtc, 102, false, lat, lon),
    astronomicalDarkUtc: solarEventUtcForDate(baseUtc, 108, false, lat, lon),
  }
}

export function getTonightScheduleMorningAstronomyUtc(now = new Date()): {
  sunriseUtc: Date
  civilDawnUtc: Date
  nauticalDawnUtc: Date
  astronomicalDawnUtc: Date
} {
  const { lat, lon } = readSiteCoords()
  const anchor = tonightScheduleAnchorUtc(now)
  const nextUtc = new Date(anchor)
  nextUtc.setUTCDate(nextUtc.getUTCDate() + 1)
  return {
    sunriseUtc: solarEventUtcForDate(nextUtc, 90.833, true, lat, lon),
    civilDawnUtc: solarEventUtcForDate(nextUtc, 96, true, lat, lon),
    nauticalDawnUtc: solarEventUtcForDate(nextUtc, 102, true, lat, lon),
    astronomicalDawnUtc: solarEventUtcForDate(nextUtc, 108, true, lat, lon),
  }
}

/** Remote tonight strip window: observatory local 16:00 → next day 08:00. */
export function getObservatoryTonightWallWindow(now = new Date()): {
  startMs: number
  endMs: number
  nightKey: string
} {
  const { lon } = readSiteCoords()
  let start = observatoryLocalWallTimeUtc(now, 16, 0, 0, lon)
  const { lat } = readSiteCoords()
  const anchor = observatoryLocalCalendarAnchorUtc(now, lon)
  const todaySunrise = sunriseUtcForDate(anchor, lat, lon)
  if (now.getTime() < todaySunrise.getTime()) {
    start = new Date(start.getTime() - 86400000)
  }
  const startParts = observatoryLocalParts(start, lon)
  const end = observatoryWallTimeOnLocalDateUtc(
    startParts.year,
    startParts.month,
    startParts.day + 1,
    8,
    0,
    0,
    lon
  )
  const nightKey = `${startParts.year}-${String(startParts.month + 1).padStart(2, '0')}-${String(startParts.day).padStart(2, '0')}`
  return { startMs: start.getTime(), endMs: end.getTime(), nightKey }
}
