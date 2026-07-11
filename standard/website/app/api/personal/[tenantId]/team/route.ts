import { NextRequest } from 'next/server'
import { getProTeamContextForMember } from '@/lib/cloud/pro-team'
import { resolveProMemberFromRequest } from '@/lib/cloud/personal-imaging/pro-session-access'
import { personalJson, personalOptions } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const member = await resolveProMemberFromRequest(tenantId, request)
  if (!member) {
    return personalJson({ ok: false, error: 'Pro team member authentication required.' }, 403)
  }

  const teamContext = await getProTeamContextForMember(member.memberId)
  if (!teamContext || teamContext.team.tenantId !== tenantId) {
    return personalJson({ ok: false, error: 'No Pro team found for this tenant.' }, 404)
  }

  return personalJson({
    ok: true,
    team: {
      teamId: teamContext.team.teamId,
      tenantId: teamContext.team.tenantId,
      displayName: teamContext.team.displayName,
      teamCode: teamContext.role === 'owner' ? teamContext.team.teamCode : undefined,
      role: teamContext.role,
    },
    members: teamContext.members,
  })
}
