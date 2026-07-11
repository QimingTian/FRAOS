import { NextRequest } from 'next/server'
import { imagingArmEmergencyStop, imagingEmergencyStopPublic } from '@/lib/cloud/personal-imaging/handlers'
import { resolveProTenantContext } from '@/lib/cloud/personal-imaging/pro-session-access'
import { emitAgentWakePollSequence } from '@/lib/imaging/live-bus'
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
  const publicState = await imagingEmergencyStopPublic(tenantId)
  return personalJson({ ok: true as const, ...publicState })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const proContext = await resolveProTenantContext(tenantId, request)

  const publicBefore = await imagingEmergencyStopPublic(tenantId)
  if (!publicBefore.agentConnected) {
    return personalJson(
      { ok: false as const, error: 'NINA agent is disconnected. ESTOP is unavailable.' },
      409
    )
  }

  try {
    const result = await imagingArmEmergencyStop(tenantId, 'control-client', proContext)
    if (result && typeof result === 'object' && 'error' in result) {
      return personalJson({ ok: false as const, error: result.error }, result.status ?? 403)
    }
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : 'Emergency STOP failed.'
    return personalJson({ ok: false as const, error: message }, 409)
  }

  void emitAgentWakePollSequence(tenantId)
  const publicState = await imagingEmergencyStopPublic(tenantId)
  return personalJson({ ok: true as const, ...publicState })
}
