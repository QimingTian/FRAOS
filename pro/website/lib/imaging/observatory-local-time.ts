import {
  getObservatorySite,
  type ObservatorySite,
} from '@/lib/cloud/personal-imaging/observatory-site'

export type ObservatoryCoords = Pick<ObservatorySite, 'lat' | 'lon' | 'elevationM'>

export function readObservatoryCoords(): ObservatoryCoords {
  const site = getObservatorySite()
  return { lat: site.lat, lon: site.lon, elevationM: site.elevationM }
}

export function observatoryUtcOffsetHours(lon: number): number {
  return Math.round(lon / 15)
}

export function observatoryUtcOffsetMs(lon: number): number {
  return observatoryUtcOffsetHours(lon) * 3_600_000
}

export type ObservatoryLocalParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function observatoryLocalParts(now: Date, lon: number): ObservatoryLocalParts {
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

export function observatoryLocalCalendarAnchorUtc(now: Date, lon?: number): Date {
  const obsLon = lon ?? readObservatoryCoords().lon
  const parts = observatoryLocalParts(now, obsLon)
  return new Date(Date.UTC(parts.year, parts.month, parts.day))
}

export function observatoryLocalWallTimeUtc(
  now: Date,
  hour: number,
  minute: number,
  second: number,
  lon?: number
): Date {
  const obsLon = lon ?? readObservatoryCoords().lon
  const parts = observatoryLocalParts(now, obsLon)
  const wallUtcMs =
    Date.UTC(parts.year, parts.month, parts.day, hour, minute, second) - observatoryUtcOffsetMs(obsLon)
  return new Date(wallUtcMs)
}

export function observatoryWallTimeOnLocalDateUtc(
  anchor: Date,
  hour: number,
  minute: number,
  second: number,
  lon?: number
): Date {
  const obsLon = lon ?? readObservatoryCoords().lon
  const parts = observatoryLocalParts(anchor, obsLon)
  const wallUtcMs =
    Date.UTC(parts.year, parts.month, parts.day, hour, minute, second) - observatoryUtcOffsetMs(obsLon)
  return new Date(wallUtcMs)
}
