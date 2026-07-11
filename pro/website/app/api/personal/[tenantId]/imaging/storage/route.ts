import { NextRequest } from 'next/server'
import { getStorageQuotaStatus } from '@/lib/cloud/session-storage'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const status = await getStorageQuotaStatus(tenantId)
  return personalJson({
    ok: true,
    usedBytes: status.usedBytes,
    limitBytes: status.limitBytes,
    overQuota: status.overQuota,
    sessions: status.sessions,
  })
}
