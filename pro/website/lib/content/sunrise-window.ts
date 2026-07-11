import { DEFAULT_OBS_LAT, DEFAULT_OBS_LON } from '@/lib/content/observatory-coords'

function observatoryUtcOffsetMs(lon: number): number {
  return Math.round(lon / 15) * 3_600_000
}

function observatoryLocalParts(now: Date, lon: number) {
  const shifted = new Date(now.getTime() + observatoryUtcOffsetMs(lon))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  }
}

function observatoryLocalCalendarAnchorUtc(now: Date, lon: number): Date {
  const parts = observatoryLocalParts(now, lon)
  return new Date(Date.UTC(parts.year, parts.month, parts.day))
}

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

/** True between nautical dawn and nautical dusk at the observatory site. */
export function isWithinDaytimeClosedWindow(
  now = new Date(),
  lat = DEFAULT_OBS_LAT,
  lon = DEFAULT_OBS_LON
): boolean {
  const today = observatoryLocalCalendarAnchorUtc(now, lon)
  const nauticalDawn = solarEventUtcForDate(today, 102, true, lat, lon)
  const nauticalDusk = solarEventUtcForDate(today, 102, false, lat, lon)
  return now >= nauticalDawn && now <= nauticalDusk
}

function solarEventUtcForDateFixed(
  date: Date,
  zenithDeg: number,
  isSunrise: boolean
): Date {
  return solarEventUtcForDate(date, zenithDeg, isSunrise, DEFAULT_OBS_LAT, DEFAULT_OBS_LON)
}

export function getTonightSchedulingWindow(now = new Date()): {
  nauticalDuskUtc: Date
  nauticalDawnUtc: Date
} {
  const nowUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todaySunrise = solarEventUtcForDateFixed(nowUtcMidnight, 90.833, true)
  const baseUtcDate = new Date(nowUtcMidnight)
  if (now.getTime() < todaySunrise.getTime()) {
    baseUtcDate.setUTCDate(baseUtcDate.getUTCDate() - 1)
  }
  const nextUtcDate = new Date(baseUtcDate)
  nextUtcDate.setUTCDate(nextUtcDate.getUTCDate() + 1)
  return {
    nauticalDuskUtc: solarEventUtcForDateFixed(baseUtcDate, 102, false),
    nauticalDawnUtc: solarEventUtcForDateFixed(nextUtcDate, 102, true),
  }
}
