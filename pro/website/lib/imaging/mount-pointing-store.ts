import { kvEnabled, kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'

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

function stationKey(stationId: string | undefined | null): string {
  const t = typeof stationId === 'string' ? stationId.trim() : ''
  return t.length > 0 ? t : 'default'
}

function storageKey(tenantId: string | undefined | null, stationId: string | undefined | null): string {
  const tenant = typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : 'global'
  return `${tenant}:${stationKey(stationId)}`
}

function kvKey(tenantId: string | undefined | null, stationId: string | undefined | null): string {
  return `mount-pointing:${storageKey(tenantId, stationId)}`
}

export function liveMountChannel(tenantId: string | undefined | null, stationId?: string | null) {
  const tenant = typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : 'global'
  return `mount:${tenant}:${stationKey(stationId)}` as const
}

export async function setMountPointingSample(
  stationId: string | undefined | null,
  payload: MountPointingPayload,
  tenantId?: string | null
): Promise<StoredMountSample> {
  const key = storageKey(tenantId, stationId)
  const receivedAtUtc = new Date().toISOString()
  const stored: StoredMountSample = {
    ...payload,
    receivedAtUtc,
  }
  latestByKey.set(key, stored)
  if (kvEnabled()) {
    await kvSetJson(kvKey(tenantId, stationId), stored)
  }
  const { emitLiveEvent } = await import('@/lib/imaging/live-bus')
  void emitLiveEvent(liveMountChannel(tenantId, stationId), { type: 'sample', sample: stored })
  return stored
}

export async function getMountPointingSample(
  stationId: string | undefined | null,
  tenantId?: string | null
): Promise<StoredMountSample | null> {
  const key = storageKey(tenantId, stationId)
  if (kvEnabled()) {
    const remote = await kvGetJson<StoredMountSample>(kvKey(tenantId, stationId))
    if (remote && typeof remote === 'object') {
      latestByKey.set(key, remote)
      return remote
    }
  }
  return latestByKey.get(key) ?? null
}
