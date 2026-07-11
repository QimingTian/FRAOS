import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import { loadTenantRegistry } from '@/lib/cloud/tenant-registry'
import type { ProductPlan } from '@/lib/site-config'
import { siteStorageLimitBytes } from '@/lib/site-storage-quota'

const DEFAULT_SIGN_TTL_SEC = 300
const DEFAULT_CACHE_MS = 30_000

export type SessionStorageRecord = {
  queueId: string
  objectKey: string
  sizeBytes: number
  uploadedAt: string
  target?: string | null
}

type TenantStoragePayload = {
  sessions: Record<string, SessionStorageRecord>
  usedBytes: number
}

type CacheEntry = { expiresAt: number; exists: boolean }
type GlobalWithCache = typeof globalThis & { __borean_r2_exists_cache__?: Map<string, CacheEntry> }

function storageKvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:session-storage`
}

function cacheMap(): Map<string, CacheEntry> {
  const g = globalThis as GlobalWithCache
  if (!g.__borean_r2_exists_cache__) g.__borean_r2_exists_cache__ = new Map()
  return g.__borean_r2_exists_cache__
}

function r2Enabled(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
  )
}

function r2Bucket(): string {
  return (process.env.R2_BUCKET ?? '').trim()
}

function signTtlSec(): number {
  const n = Number(process.env.R2_PRESIGN_TTL_SEC ?? DEFAULT_SIGN_TTL_SEC)
  if (!Number.isFinite(n) || n < 30) return DEFAULT_SIGN_TTL_SEC
  return Math.min(Math.floor(n), 3600)
}

function createR2Client(): S3Client {
  return new S3Client({
    region: process.env.R2_REGION ?? 'auto',
    endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  })
}

export function sanitizeForR2RunId(queueId: string): string {
  return queueId.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function imagingAgentObjectPrefix(): string {
  const raw = (process.env.R2_PREFIX ?? 'imaging').trim().replace(/\/+$/, '')
  return raw || 'imaging'
}

function imagingAgentKeyPrefix(queueId: string): string {
  return `${imagingAgentObjectPrefix()}/${sanitizeForR2RunId(queueId)}/`
}

function sessionKeyPrefix(queueId: string): string {
  return `sessions/${queueId}/`
}

export function isAllowedSessionObjectKey(queueId: string, objectKey: string): boolean {
  const key = objectKey.trim()
  if (!key || key.includes('..')) return false
  if (key.startsWith('gallery-submissions/')) return false
  if (key.startsWith(sessionKeyPrefix(queueId))) return true
  if (key.startsWith(imagingAgentKeyPrefix(queueId))) return true
  const suffix = (process.env.R2_SESSION_OBJECT_SUFFIX ?? '').trim()
  const legacy = suffix ? `${queueId}${suffix}` : queueId
  return key === legacy || key === queueId
}

function emptyPayload(): TenantStoragePayload {
  return { sessions: {}, usedBytes: 0 }
}

function recomputeUsedBytes(sessions: Record<string, SessionStorageRecord>): number {
  let total = 0
  for (const rec of Object.values(sessions)) {
    if (Number.isFinite(rec.sizeBytes) && rec.sizeBytes > 0) total += rec.sizeBytes
  }
  return total
}

async function loadPayload(tenantId: string): Promise<TenantStoragePayload> {
  const remote = await kvGetJson<TenantStoragePayload>(storageKvKey(tenantId))
  if (!remote || typeof remote !== 'object') return emptyPayload()
  const sessions =
    remote.sessions && typeof remote.sessions === 'object' ? remote.sessions : {}
  const usedBytes =
    typeof remote.usedBytes === 'number' && Number.isFinite(remote.usedBytes)
      ? remote.usedBytes
      : recomputeUsedBytes(sessions)
  return { sessions, usedBytes }
}

async function savePayload(tenantId: string, payload: TenantStoragePayload): Promise<void> {
  payload.usedBytes = recomputeUsedBytes(payload.sessions)
  await kvSetJson(storageKvKey(tenantId), payload)
}

async function tenantPlan(tenantId: string): Promise<ProductPlan> {
  const registry = await loadTenantRegistry(tenantId)
  return registry?.plan ?? 'standard'
}

export async function getStorageLimitBytes(tenantId: string): Promise<number> {
  const plan = await tenantPlan(tenantId)
  return siteStorageLimitBytes(plan)
}

export type StorageQuotaStatus = {
  usedBytes: number
  limitBytes: number
  overQuota: boolean
  sessions: SessionStorageRecord[]
}

export async function getStorageQuotaStatus(tenantId: string): Promise<StorageQuotaStatus> {
  const payload = await loadPayload(tenantId)
  const limitBytes = await getStorageLimitBytes(tenantId)
  const usedBytes = payload.usedBytes
  return {
    usedBytes,
    limitBytes,
    overQuota: usedBytes >= limitBytes,
    sessions: Object.values(payload.sessions).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
  }
}

export async function getSessionStorageRecord(
  tenantId: string,
  queueId: string
): Promise<SessionStorageRecord | null> {
  const payload = await loadPayload(tenantId)
  return payload.sessions[queueId] ?? null
}

async function objectExists(objectKey: string): Promise<boolean> {
  if (!r2Enabled()) return false
  const cache = cacheMap()
  const now = Date.now()
  const cached = cache.get(objectKey)
  if (cached && cached.expiresAt > now) return cached.exists
  try {
    const client = createR2Client()
    await client.send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: objectKey }))
    cache.set(objectKey, { exists: true, expiresAt: now + DEFAULT_CACHE_MS })
    return true
  } catch {
    cache.set(objectKey, { exists: false, expiresAt: now + DEFAULT_CACHE_MS })
    return false
  }
}

function fileNameFromObjectKey(objectKey: string): string {
  const cleaned = objectKey.trim().replace(/\/+$/, '')
  const slash = cleaned.lastIndexOf('/')
  return slash === -1 ? cleaned : cleaned.slice(slash + 1)
}

type UploadedFileRow = {
  fileName?: unknown
  objectKey?: unknown
  sizeBytes?: unknown
}

export function pickBestObjectKey(queueId: string, files: UploadedFileRow[]): string | null {
  const normalized = files
    .map((f) => {
      const fileName = typeof f.fileName === 'string' ? f.fileName : ''
      const objectKey = typeof f.objectKey === 'string' ? f.objectKey : ''
      const sizeBytes =
        typeof f.sizeBytes === 'number'
          ? f.sizeBytes
          : typeof f.sizeBytes === 'string'
            ? Number(f.sizeBytes)
            : 0
      return { fileName, objectKey, sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0 }
    })
    .filter((f) => f.objectKey)

  if (normalized.length === 0) return null

  const queueLower = queueId.toLowerCase()
  const exactName = normalized.find((f) => f.fileName.toLowerCase() === queueLower)
  if (exactName) return exactName.objectKey

  const stemMatch = normalized.find((f) => {
    const n = f.fileName.toLowerCase()
    const dot = n.lastIndexOf('.')
    const stem = dot === -1 ? n : n.slice(0, dot)
    return stem === queueLower
  })
  if (stemMatch) return stemMatch.objectKey

  const zip = normalized
    .filter((f) => f.fileName.toLowerCase().endsWith('.zip'))
    .sort((a, b) => b.sizeBytes - a.sizeBytes)[0]
  if (zip) return zip.objectKey

  return normalized.sort((a, b) => b.sizeBytes - a.sizeBytes)[0]?.objectKey ?? null
}

export function pickUploadSizeBytes(queueId: string, files: UploadedFileRow[], objectKey: string): number {
  for (const f of files) {
    if (typeof f.objectKey === 'string' && f.objectKey === objectKey) {
      const n = typeof f.sizeBytes === 'number' ? f.sizeBytes : Number(f.sizeBytes)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  const zip = files.find(
    (f) => typeof f.fileName === 'string' && f.fileName.toLowerCase().endsWith('.zip')
  )
  if (zip && typeof zip.sizeBytes === 'number' && zip.sizeBytes > 0) return zip.sizeBytes
  return 0
}

export async function recordSessionUpload(input: {
  tenantId: string
  queueId: string
  objectKey: string
  sizeBytes: number
  target?: string | null
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!isAllowedSessionObjectKey(input.queueId, input.objectKey)) {
    return { ok: false, error: 'Invalid object key for session', status: 400 }
  }

  const payload = await loadPayload(input.tenantId)
  const limitBytes = await getStorageLimitBytes(input.tenantId)
  const previous = payload.sessions[input.queueId]
  const previousSize = previous?.sizeBytes ?? 0
  const nextSize = Math.max(0, input.sizeBytes)
  const projected = payload.usedBytes - previousSize + nextSize

  if (projected > limitBytes) {
    return {
      ok: false,
      error: `Cloud storage quota exceeded (${Math.round(limitBytes / (1024 ** 3))} GB site limit).`,
      status: 409,
    }
  }

  payload.sessions[input.queueId] = {
    queueId: input.queueId,
    objectKey: input.objectKey,
    sizeBytes: nextSize,
    uploadedAt: new Date().toISOString(),
    target: input.target ?? previous?.target ?? null,
  }
  await savePayload(input.tenantId, payload)
  return { ok: true }
}

export async function hasStoredFileForQueue(tenantId: string, queueId: string): Promise<boolean> {
  const rec = await getSessionStorageRecord(tenantId, queueId)
  if (!rec?.objectKey) return false
  return objectExists(rec.objectKey)
}

export async function buildSignedDownloadUrl(tenantId: string, queueId: string): Promise<string | null> {
  if (!r2Enabled()) return null
  const rec = await getSessionStorageRecord(tenantId, queueId)
  if (!rec?.objectKey) return null
  if (!(await objectExists(rec.objectKey))) return null

  const client = createR2Client()
  const filename = fileNameFromObjectKey(rec.objectKey) || `${queueId}.zip`
  const command = new GetObjectCommand({
    Bucket: r2Bucket(),
    Key: rec.objectKey,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
    ResponseContentType: 'application/octet-stream',
  })
  return getSignedUrl(client, command, { expiresIn: signTtlSec() })
}

export async function deleteSessionStorage(
  tenantId: string,
  queueId: string
): Promise<{ ok: true; freedBytes: number } | { ok: false; error: string }> {
  const payload = await loadPayload(tenantId)
  const rec = payload.sessions[queueId]
  if (!rec) return { ok: false, error: 'No stored files for this session' }

  if (r2Enabled() && rec.objectKey) {
    const client = createR2Client()
    try {
      await client.send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: rec.objectKey }))
    } catch {
      // Object may already be gone — still clear registry.
    }
    cacheMap().delete(rec.objectKey)
  }

  delete payload.sessions[queueId]
  await savePayload(tenantId, payload)
  return { ok: true, freedBytes: rec.sizeBytes }
}
