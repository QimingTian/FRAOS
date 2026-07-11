import { NextRequest } from 'next/server'
import { imagingGetSessionProgress } from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; sessionId: string }> }
) {
  const { tenantId, sessionId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  const result = await imagingGetSessionProgress(tenantId, sessionId)
  if ('error' in result) {
    return personalJson({ ok: false, error: result.error }, result.status)
  }
  return personalJson({ ok: true, queueStatus: result.queueStatus, lines: result.lines })
}
