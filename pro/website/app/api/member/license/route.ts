import { NextRequest, NextResponse } from 'next/server'
import { primaryTenantConfigForMember } from '@/lib/cloud/tenant-registry'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const tenantConfig = await primaryTenantConfigForMember(auth.user.id)
  if (!tenantConfig) {
    return NextResponse.json(
      { ok: false, error: 'No FRAOS license found on this account. Redeem a promotion code on the website first.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    ok: true,
    tenantConfig,
  })
}
