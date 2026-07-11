import { NextRequest } from 'next/server'
import { personalListAuditLog } from '@/lib/cloud/personal-audit-log'
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

  const raw = request.nextUrl.searchParams.get('limit')
  const limit = raw != null ? Number(raw) : 200
  const safe = Number.isFinite(limit) ? Math.min(400, Math.max(1, Math.floor(limit))) : 200

  const entries = await personalListAuditLog(tenantId, safe)
  return personalJson({ ok: true as const, entries })
}
