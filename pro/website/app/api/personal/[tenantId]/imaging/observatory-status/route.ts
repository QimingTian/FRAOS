import { NextRequest } from 'next/server'
import { imagingGetObservatory, imagingPatchObservatory } from '@/lib/cloud/personal-imaging/handlers'
import { personalAppendAuditLog } from '@/lib/cloud/personal-audit-log'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const { mode, status } = await imagingGetObservatory(tenantId)
  return personalJson({ ok: true, mode, status })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const before = await imagingGetObservatory(tenantId)
  const body = (await request.json().catch(() => ({}))) as { mode?: string; status?: string }
  if (body.mode !== 'manual' && body.mode !== 'auto' && body.mode != null) {
    return personalJson({ ok: false, error: 'Invalid mode' }, 400)
  }
  const next = await imagingPatchObservatory(tenantId, {
    mode: body.mode as 'manual' | 'auto' | undefined,
    status: body.status,
  })
  if (body.mode && body.mode !== before.mode) {
    void personalAppendAuditLog(tenantId, {
      kind: 'observatory.mode_changed',
      message: `Observatory mode: ${before.mode} → ${next.mode}`,
      detail: { previousMode: before.mode, nextMode: next.mode },
    })
  }
  if (body.status && body.status !== before.status) {
    void personalAppendAuditLog(tenantId, {
      kind: 'observatory.status_changed',
      message: `Observatory status: ${before.status} → ${next.status}`,
      detail: { previousStatus: before.status, nextStatus: next.status },
    })
  }
  return personalJson({ ok: true, ...next })
}
