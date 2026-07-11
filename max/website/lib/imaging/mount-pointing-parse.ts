import type { MountPointingPayload } from '@/lib/imaging/mount-pointing-store'

function numOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return v as undefined
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function boolOrUndef(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

export function parseMountPointingPayload(body: Record<string, unknown>): MountPointingPayload | null {
  const connected = boolOrUndef(body.connected)
  if (connected === undefined) return null

  const stationId = strOrUndef(body.stationId)
  const ra = numOrNull(body.raHours)
  const dec = numOrNull(body.decDeg)
  const sidereal = numOrNull(body.siderealTimeHours)
  const siteLatitude = numOrNull(body.siteLatitudeDeg)
  const alt = numOrNull(body.altitudeDeg)
  const az = numOrNull(body.azimuthDeg)

  return {
    source: strOrUndef(body.source) ?? 'nina-plugin',
    stationId,
    connected,
    raHours: ra === undefined ? null : ra,
    decDeg: dec === undefined ? null : dec,
    siderealTimeHours: sidereal === undefined ? null : sidereal,
    siteLatitudeDeg: siteLatitude === undefined ? null : siteLatitude,
    altitudeDeg: alt === undefined ? null : alt,
    azimuthDeg: az === undefined ? null : az,
    slewing: boolOrUndef(body.slewing),
    atPark: boolOrUndef(body.atPark),
    trackingEnabled: boolOrUndef(body.trackingEnabled),
    sideOfPier: strOrUndef(body.sideOfPier) ?? null,
    epoch: strOrUndef(body.epoch) ?? null,
    clientUtc: strOrUndef(body.clientUtc) ?? null,
    pluginVersion: strOrUndef(body.pluginVersion) ?? null,
  }
}
