import { NextRequest } from 'next/server'
import { imagingAgentPulse } from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

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
  const body = (await request.json().catch(() => ({}))) as { ninaRunning?: unknown }
  await imagingAgentPulse(tenantId, Boolean(body.ninaRunning))
  return personalJson({ ok: true })
}
