import { kvDel, kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'

const MAX_ENTRIES = 50

export type PreviewEntry = {
  imageId: string
  queueId: string
  updatedAt: string
  contentType: string
  dataBase64: string
  frameNumber?: number
}

type PreviewIndexRow = { queueId: string; updatedAt: string }

type GlobalWithPreview = typeof globalThis & {
  __borean_imaging_preview_by_tenant__?: Record<string, Record<string, PreviewEntry>>
  __borean_imaging_preview_frame__?: Record<string, number>
}

function memoryForTenant(tenantId: string): Record<string, PreviewEntry> {
  const g = globalThis as GlobalWithPreview
  if (!g.__borean_imaging_preview_by_tenant__) g.__borean_imaging_preview_by_tenant__ = {}
  if (!g.__borean_imaging_preview_by_tenant__[tenantId]) {
    g.__borean_imaging_preview_by_tenant__[tenantId] = {}
  }
  return g.__borean_imaging_preview_by_tenant__[tenantId]
}

function previewKvKey(tenantId: string, queueId: string): string {
  return `personal-hub:${tenantId}:preview:${queueId}`
}

function previewIndexKvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:preview-index`
}

function frameKey(tenantId: string, queueId: string): string {
  return `${tenantId}:${queueId}`
}

function nextFrameNumber(tenantId: string, queueId: string): number {
  const g = globalThis as GlobalWithPreview
  if (!g.__borean_imaging_preview_frame__) g.__borean_imaging_preview_frame__ = {}
  const key = frameKey(tenantId, queueId)
  const prev = g.__borean_imaging_preview_frame__[key] ?? 0
  const next = prev + 1
  g.__borean_imaging_preview_frame__[key] = next
  return next
}

async function trimPreviewIndex(tenantId: string, keepQueueId: string, updatedAt: string): Promise<void> {
  const prev = (await kvGetJson<PreviewIndexRow[]>(previewIndexKvKey(tenantId))) ?? []
  const next = [
    { queueId: keepQueueId, updatedAt },
    ...prev.filter((r) => r.queueId !== keepQueueId),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_ENTRIES)

  const dropped = prev.filter((r) => !next.some((n) => n.queueId === r.queueId))
  await kvSetJson(previewIndexKvKey(tenantId), next)
  for (const row of dropped) {
    await kvDel(previewKvKey(tenantId, row.queueId))
  }
}

export async function upsertPreviewImage(
  tenantId: string,
  queueId: string,
  imageId: string,
  contentType: string,
  dataBase64: string
): Promise<number> {
  const frameNumber = nextFrameNumber(tenantId, queueId)
  const entry: PreviewEntry = {
    imageId,
    queueId,
    updatedAt: new Date().toISOString(),
    contentType,
    dataBase64,
    frameNumber,
  }

  memoryForTenant(tenantId)[queueId] = entry
  await kvSetJson(previewKvKey(tenantId, queueId), entry)
  await trimPreviewIndex(tenantId, queueId, entry.updatedAt)
  return frameNumber
}

export async function getPreviewImage(tenantId: string, queueId: string): Promise<PreviewEntry | null> {
  const mem = memoryForTenant(tenantId)[queueId]
  if (mem?.dataBase64) return mem

  const fromKv = await kvGetJson<PreviewEntry>(previewKvKey(tenantId, queueId))
  if (fromKv?.dataBase64) {
    memoryForTenant(tenantId)[queueId] = fromKv
    return fromKv
  }
  return null
}

export async function removePreviewImage(tenantId: string, queueId: string): Promise<void> {
  const mem = memoryForTenant(tenantId)
  delete mem[queueId]
  const g = globalThis as GlobalWithPreview
  if (g.__borean_imaging_preview_frame__) {
    delete g.__borean_imaging_preview_frame__[frameKey(tenantId, queueId)]
  }
  await kvDel(previewKvKey(tenantId, queueId))
  const prev = (await kvGetJson<PreviewIndexRow[]>(previewIndexKvKey(tenantId))) ?? []
  const next = prev.filter((r) => r.queueId !== queueId)
  if (next.length !== prev.length) {
    await kvSetJson(previewIndexKvKey(tenantId), next)
  }
}
