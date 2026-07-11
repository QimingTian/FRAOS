import { NextRequest } from 'next/server'
import {
  removeProTeamMember,
  updateProTeamMemberRole,
  type ProTeamRole,
} from '@/lib/cloud/pro-team'
import { resolveProMemberFromRequest } from '@/lib/cloud/personal-imaging/pro-session-access'
import { personalJson, personalOptions } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

type PatchBody = {
  role?: ProTeamRole
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; memberId: string }> }
) {
  const { tenantId, memberId } = await context.params
  const actor = await resolveProMemberFromRequest(tenantId, request)
  if (!actor) {
    return personalJson({ ok: false, error: 'Pro team member authentication required.' }, 403)
  }
  if (actor.role !== 'owner') {
    return personalJson({ ok: false, error: 'Only the team owner can change member roles.' }, 403)
  }

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return personalJson({ ok: false, error: 'Invalid JSON body.' }, 400)
  }

  const nextRole = body.role
  if (nextRole !== 'admin' && nextRole !== 'member') {
    return personalJson({ ok: false, error: 'Role must be admin or member.' }, 400)
  }

  try {
    const members = await updateProTeamMemberRole({
      ownerMemberId: actor.memberId,
      memberId: memberId.trim(),
      role: nextRole,
    })
    return personalJson({ ok: true, members })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update member role.'
    return personalJson({ ok: false, error: message }, 400)
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; memberId: string }> }
) {
  const { tenantId, memberId } = await context.params
  const actor = await resolveProMemberFromRequest(tenantId, request)
  if (!actor) {
    return personalJson({ ok: false, error: 'Pro team member authentication required.' }, 403)
  }
  if (actor.role !== 'owner') {
    return personalJson({ ok: false, error: 'Only the team owner can remove members.' }, 403)
  }

  try {
    const members = await removeProTeamMember({
      ownerMemberId: actor.memberId,
      memberId: memberId.trim(),
    })
    return personalJson({ ok: true, members })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove member.'
    return personalJson({ ok: false, error: message }, 400)
  }
}
