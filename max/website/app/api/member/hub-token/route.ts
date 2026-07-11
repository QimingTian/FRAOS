import { NextRequest, NextResponse } from 'next/server'
import { issueMemberHubToken } from '@/lib/cloud/member-hub-token'
import { requireUser } from '@/lib/member/member-auth'
import { loadTenantSecret, primaryTenantConfigForMember } from '@/lib/cloud/tenant-registry'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const access = await primaryTenantConfigForMember(auth.user.id)
  if (!access?.teamRole) {
    return NextResponse.json(
      { ok: false, error: 'Hub member tokens are only issued for Pro team accounts.' },
      { status: 404 }
    )
  }

  const apiSecret = await loadTenantSecret(access.tenantConfig.tenantId)
  if (!apiSecret) {
    return NextResponse.json({ ok: false, error: 'Tenant secret not found.' }, { status: 404 })
  }

  const memberHubToken = issueMemberHubToken({
    memberId: auth.user.id,
    tenantId: access.tenantConfig.tenantId,
    role: access.teamRole,
    apiSecret,
  })

  return NextResponse.json({
    ok: true,
    memberId: auth.user.id,
    teamRole: access.teamRole,
    memberHubToken,
  })
}
