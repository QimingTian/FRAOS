import { NextRequest } from 'next/server'
import { getSessionById } from '@/lib/cloud/personal-imaging/db'
import { runWithTenantImaging } from '@/lib/cloud/personal-imaging/ctx'
import {
  pickBestObjectKey,
  pickUploadSizeBytes,
  recordSessionUpload,
} from '@/lib/cloud/session-storage'
import { personalJson, personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return personalOptions()
}

type UploadedFileRow = {
  fileName?: unknown
  objectKey?: unknown
  sizeBytes?: unknown
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return personalJson({ ok: false, error: 'Invalid JSON body' }, 400)
  }

  const queueId =
    typeof (body as Record<string, unknown>).queueId === 'string'
      ? ((body as Record<string, unknown>).queueId as string).trim()
      : ''
  const files = Array.isArray((body as Record<string, unknown>).files)
    ? ((body as Record<string, unknown>).files as UploadedFileRow[])
    : []

  if (!queueId) return personalJson({ ok: false, error: 'queueId is required' }, 400)
  if (files.length === 0) return personalJson({ ok: false, error: 'files is required' }, 400)

  const chosen = pickBestObjectKey(queueId, files)
  if (!chosen) return personalJson({ ok: false, error: 'No valid objectKey found in files' }, 400)

  const sizeBytes = pickUploadSizeBytes(queueId, files, chosen)

  const target = await runWithTenantImaging(tenantId, () => getSessionById(queueId)?.target ?? null, {
    persist: false,
  })

  const recorded = await recordSessionUpload({
    tenantId,
    queueId,
    objectKey: chosen,
    sizeBytes,
    target,
  })
  if (!recorded.ok) {
    return personalJson({ ok: false, error: recorded.error }, recorded.status)
  }

  return personalJson({ ok: true, queueId, objectKey: chosen, sizeBytes })
}
