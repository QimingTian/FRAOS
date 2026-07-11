import { NextRequest } from 'next/server'
import { appendAuditLog } from '@/lib/cloud/personal-imaging/db'
import { runWithTenantImaging } from '@/lib/cloud/personal-imaging/ctx'
import { deleteSessionStorage } from '@/lib/cloud/session-storage'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return personalOptions()
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; sessionId: string }> }
) {
  const { tenantId, sessionId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied

  const queueId = sessionId.trim()
  if (!queueId) return personalJson({ ok: false, error: 'sessionId is required' }, 400)

  const result = await deleteSessionStorage(tenantId, queueId)
  if (!result.ok) return personalJson({ ok: false, error: result.error }, 404)

  await runWithTenantImaging(tenantId, () => {
    appendAuditLog({
      kind: 'storage.deleted',
      message: `Cloud storage cleared for session ${queueId}`,
      detail: { queueId, freedBytes: result.freedBytes },
    })
  })

  return personalJson({ ok: true, freedBytes: result.freedBytes })
}
