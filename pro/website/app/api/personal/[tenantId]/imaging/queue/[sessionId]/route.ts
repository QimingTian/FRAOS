import { NextRequest } from 'next/server'
import {
  imagingUpdateSession,
  parseQueueBody,
} from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'
import { emitAgentWakePollSequence } from '@/lib/imaging/live-bus'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; sessionId: string }> }
) {
  const { tenantId, sessionId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const id = sessionId.trim()
  if (!id) return personalJson({ ok: false, error: 'sessionId is required' }, 400)
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = parseQueueBody(body)
  if (!parsed.target) {
    return personalJson({ ok: false, error: 'target is required' }, 400)
  }
  const result = await imagingUpdateSession(tenantId, id, parsed)
  if ('error' in result) {
    const status = typeof result.status === 'number' ? result.status : 400
    return personalJson({ ok: false, error: result.error }, status)
  }
  void emitAgentWakePollSequence(tenantId)
  return personalJson({ ok: true, request: result })
}
