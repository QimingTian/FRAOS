import { NextRequest, NextResponse } from 'next/server'
import { getProTeamContextForMember } from '@/lib/cloud/pro-team'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const context = await getProTeamContextForMember(auth.user.id)
  if (!context) {
    return NextResponse.json({ ok: false, error: 'No Pro team found for this account.' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    team: {
      teamId: context.team.teamId,
      tenantId: context.team.tenantId,
      displayName: context.team.displayName,
      teamCode: context.role === 'owner' ? context.team.teamCode : undefined,
      role: context.role,
    },
    members: context.members,
  })
}
