import { NextRequest, NextResponse } from 'next/server'
import { removeProTeamMember, updateProTeamMemberRole, type ProTeamRole } from '@/lib/cloud/pro-team'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ memberId: string }>
}

type PatchBody = {
  role?: ProTeamRole
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { memberId } = await context.params
  if (!memberId?.trim()) {
    return NextResponse.json({ ok: false, error: 'Member id is required.' }, { status: 400 })
  }

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (body.role !== 'admin' && body.role !== 'member') {
    return NextResponse.json({ ok: false, error: 'Role must be admin or member.' }, { status: 400 })
  }

  try {
    const members = await updateProTeamMemberRole({
      ownerMemberId: auth.user.id,
      memberId: memberId.trim(),
      role: body.role,
    })
    return NextResponse.json({ ok: true, members })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update member role.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { memberId } = await context.params
  if (!memberId?.trim()) {
    return NextResponse.json({ ok: false, error: 'Member id is required.' }, { status: 400 })
  }

  try {
    const members = await removeProTeamMember({
      ownerMemberId: auth.user.id,
      memberId: memberId.trim(),
    })
    return NextResponse.json({ ok: true, members })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove member.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
