import { NextRequest } from 'next/server'
import { resolveProTenantContext } from '@/lib/cloud/personal-imaging/pro-session-access'
import {
  imagingCreateSession,
  parseQueueBody,
} from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'
import { emitAgentWakePollSequence } from '@/lib/imaging/live-bus'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const proContext = await resolveProTenantContext(tenantId, request)
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = parseQueueBody(body)
  if (!parsed.target) {
    return personalJson({ ok: false, error: 'target is required' }, 400)
  }
  const requestRow = await imagingCreateSession(tenantId, parsed, proContext)
  if (requestRow && typeof requestRow === 'object' && 'error' in requestRow) {
    const status = typeof requestRow.status === 'number' ? requestRow.status : 403
    return personalJson({ ok: false, error: requestRow.error }, status)
  }
  if ('error' in requestRow) {
    const status = typeof requestRow.status === 'number' ? requestRow.status : 409
    return personalJson({ ok: false, error: requestRow.error }, status)
  }
  void emitAgentWakePollSequence(tenantId)
  return personalJson({ ok: true, request: requestRow }, 201)
}
