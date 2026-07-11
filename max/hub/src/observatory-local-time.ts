import tzlookup from 'tz-lookup'
import { getObservatorySite, type ObservatorySite } from './observatory-site.js'

export type ObservatoryCoords = Pick<ObservatorySite, 'lat' | 'lon' | 'elevationM'>

export function readObservatoryCoords(): ObservatoryCoords {
  const site = getObservatorySite()
  return { lat: site.lat, lon: site.lon, elevationM: site.elevationM }
}

function resolveCoords(lon?: number): { lat: number; lon: number } {
  const base = readObservatoryCoords()
  return { lat: base.lat, lon: lon ?? base.lon }
}

export function observatoryTimeZone(lat: number, lon: number): string {
  try {
    const tz = tzlookup(lat, lon)
    if (typeof tz === 'string' && tz.trim()) return tz
  } catch {
    // ignore
  }
  const hours = Math.round(lon / 15)
  const sign = hours <= 0 ? '+' : '-'
  return `Etc/GMT${sign}${Math.abs(hours)}`
}

export function observatoryUtcOffsetMsAt(date: Date, lat: number, lon: number): number {
  const timeZone = observatoryTimeZone(lat, lon)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  )
  return asUtc - date.getTime()
}

export function observatoryUtcOffsetHours(lon: number): number {
  return Math.round(lon / 15)
}

export function observatoryUtcOffsetMs(lon: number): number {
  return observatoryUtcOffsetHours(lon) * 3600_000
}

export type ObservatoryLocalParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function observatoryLocalParts(now: Date, lon?: number): ObservatoryLocalParts {
  const { lat, lon: obsLon } = resolveCoords(lon)
  const timeZone = observatoryTimeZone(lat, obsLon)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
  const map: Record<string, string> = {}
  for (const part of dtf.formatToParts(now)) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month) - 1,
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

export function observatoryLocalCalendarAnchorUtc(now: Date, lon?: number): Date {
  const parts = observatoryLocalParts(now, lon)
  return new Date(Date.UTC(parts.year, parts.month, parts.day))
}

export function observatoryLocalWallTimeUtc(
  now: Date,
  hour: number,
  minute: number,
  second: number,
  lon?: number
): Date {
  const parts = observatoryLocalParts(now, lon)
  return observatoryWallTimeOnLocalDateUtc(
    new Date(Date.UTC(parts.year, parts.month, parts.day)),
    hour,
    minute,
    second,
    lon
  )
}

export function observatoryWallTimeOnLocalDateUtc(
  anchor: Date,
  hour: number,
  minute: number,
  second: number,
  lon?: number
): Date {
  const parts = observatoryLocalParts(anchor, lon)
  return wallTimeOnLocalDateUtc(parts.year, parts.month, parts.day, hour, minute, second, lon)
}

function wallTimeOnLocalDateUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  lon?: number
): Date {
  const { lat, lon: obsLon } = resolveCoords(lon)
  let utcMs = Date.UTC(year, month, day, hour, minute, second)
  for (let i = 0; i < 4; i += 1) {
    const offset = observatoryUtcOffsetMsAt(new Date(utcMs), lat, obsLon)
    utcMs = Date.UTC(year, month, day, hour, minute, second) - offset
  }
  return new Date(utcMs)
}
