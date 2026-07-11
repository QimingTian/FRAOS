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
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }
}

function observatoryLocalWallTimeUtc(
  now: Date,
  hour: number,
  minute: number,
  second: number,
  lon: number
): Date {
  const parts = observatoryLocalParts(now, lon)
  const wallUtcMs =
    Date.UTC(parts.year, parts.month, parts.day, hour, minute, second) - observatoryUtcOffsetMs(lon)
  return new Date(wallUtcMs)
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

function tonightScheduleAnchorUtc(now: Date, lat: number, lon: number): Date {
  let start = observatoryLocalWallTimeUtc(now, 16, 0, 0, lon)
  const anchor = observatoryLocalCalendarAnchorUtc(now, lon)
  const todaySunrise = solarEventUtcForDate(anchor, 90.833, true, lat, lon)
  if (now.getTime() < todaySunrise.getTime()) {
    start = new Date(start.getTime() - 86400000)
  }
  const startParts = observatoryLocalParts(start, lon)
  return new Date(Date.UTC(startParts.year, startParts.month, startParts.day))
}

export function getTonightSchedulingWindow(
  now = new Date(),
  lat = DEFAULT_OBS_LAT,
  lon = DEFAULT_OBS_LON
): {
  nauticalDuskUtc: Date
  nauticalDawnUtc: Date
} {
  const anchor = tonightScheduleAnchorUtc(now, lat, lon)
  const nextUtcDate = new Date(anchor)
  nextUtcDate.setUTCDate(nextUtcDate.getUTCDate() + 1)
  return {
    nauticalDuskUtc: solarEventUtcForDate(anchor, 102, false, lat, lon),
    nauticalDawnUtc: solarEventUtcForDate(nextUtcDate, 102, true, lat, lon),
  }
}
