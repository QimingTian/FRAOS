import { NextRequest } from 'next/server'
import { personalLicenseSummaryForTenant } from '@/lib/cloud/personal-license'
import { personalJson, personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  const summary = await personalLicenseSummaryForTenant(tenantId)
  if (!summary) {
    return personalJson({ ok: false as const, error: 'License not found for this tenant.' }, 404)
  }

  return personalJson({ ok: true as const, ...summary })
}
