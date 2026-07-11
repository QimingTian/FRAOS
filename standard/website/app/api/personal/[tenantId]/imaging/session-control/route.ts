import { NextRequest } from 'next/server'
import { imagingSessionControl } from '@/lib/cloud/personal-imaging/handlers'
import { resolveProTenantContext } from '@/lib/cloud/personal-imaging/pro-session-access'
import type { SessionControlAction } from '@/lib/imaging/session-control'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

const ACTIONS = new Set<SessionControlAction>([
  'run',
  'hold',
  'release_hold',
  'complete',
  'fail',
  'in_progress',
  'delete',
])

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
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''

  if (!sessionId) {
    return personalJson({ ok: false, error: 'sessionId is required' }, 400)
  }
  if (!ACTIONS.has(action as SessionControlAction)) {
    return personalJson(
      {
        ok: false,
        error: 'action must be run, hold, release_hold, complete, fail, in_progress, or delete',
      },
      400
    )
  }

  const result = await imagingSessionControl(tenantId, sessionId, action as SessionControlAction, proContext)
  if (result && typeof result === 'object' && 'error' in result) {
    const status = 'status' in result && typeof result.status === 'number' ? result.status : 400
    return personalJson({ ok: false, error: result.error }, status)
  }
  return personalJson({ ok: true })
}
