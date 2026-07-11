export type MountPointingPayload = {
  source?: string
  stationId?: string
  connected: boolean
  raHours?: number | null
  decDeg?: number | null
  siderealTimeHours?: number | null
  siteLatitudeDeg?: number | null
  altitudeDeg?: number | null
  azimuthDeg?: number | null
  slewing?: boolean
  atPark?: boolean
  trackingEnabled?: boolean
  sideOfPier?: string | null
  epoch?: string | null
  clientUtc?: string | null
  pluginVersion?: string | null
}

export type StoredMountSample = MountPointingPayload & {
  receivedAtUtc: string
}

const latestByKey = new Map<string, StoredMountSample>()

type MountListener = (payload: unknown) => void
const mountListeners = new Map<string, Set<MountListener>>()

function stationKey(stationId: string | undefined | null): string {
  const t = typeof stationId === 'string' ? stationId.trim() : ''
  return t.length > 0 ? t : 'default'
}

function storageKey(tenantId: string, stationId: string | undefined | null): string {
  return `${tenantId}:${stationKey(stationId)}`
}

export function liveMountChannel(tenantId: string, stationId?: string | null): string {
  return `mount:${tenantId}:${stationKey(stationId)}`
}

function notifyMount(channel: string, payload: unknown): void {
  const set = mountListeners.get(channel)
  if (!set) return
  for (const fn of Array.from(set)) {
    try {
      fn(payload)
    } catch {
      // ignore
    }
  }
}

export function subscribeMountEvents(
  channel: string,
  listener: MountListener,
  signal?: AbortSignal
): () => void {
  const set = mountListeners.get(channel) ?? new Set<MountListener>()
  set.add(listener)
  mountListeners.set(channel, set)
  const cleanup = () => {
    const current = mountListeners.get(channel)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) mountListeners.delete(channel)
  }
  signal?.addEventListener('abort', cleanup, { once: true })
  return cleanup
}

export function setMountPointingSample(
  tenantId: string,
  stationId: string | undefined | null,
  payload: MountPointingPayload
): StoredMountSample {
  const key = storageKey(tenantId, stationId)
  const receivedAtUtc = new Date().toISOString()
  const stored: StoredMountSample = { ...payload, receivedAtUtc }
  latestByKey.set(key, stored)
  notifyMount(liveMountChannel(tenantId, stationId), { type: 'sample', sample: stored })
  return stored
}

export function getMountPointingSample(
  tenantId: string,
  stationId: string | undefined | null
): StoredMountSample | null {
  return latestByKey.get(storageKey(tenantId, stationId)) ?? null
}

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
