import { NextRequest, NextResponse } from 'next/server'
import { checkAuthRateLimitAsync } from '@/lib/member/auth-rate-limit'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { requireAdmin } from '@/lib/member/member-auth'
import {
  deleteMemberById,
  isBootstrapAdminEmail,
  listMembersForAdminDirectory,
  setMemberAsAdmin,
  setMemberAsMember,
} from '@/lib/member/member-store'

export const runtime = 'nodejs'

async function membersResponse(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }
  const members = await listMembersForAdminDirectory()
  return NextResponse.json({
    ok: true as const,
    total: members.length,
    members,
    canManageAdmins: isBootstrapAdminEmail(auth.user.email),
    currentUserId: auth.user.id,
  })
}

export async function GET(request: NextRequest) {
  return membersResponse(request)
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }
  if (!(await checkAuthRateLimitAsync(request, 'admin-members-patch', 30))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const id = typeof rec.id === 'string' ? rec.id.trim() : ''
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  }

  const roleAction = rec.roleAction
  if (roleAction === 'member') {
    const result = await setMemberAsMember(auth.user.id, id)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    }
    return membersResponse(request)
  }

  const result = await setMemberAsAdmin(id)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return membersResponse(request)
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }
  if (!(await checkAuthRateLimitAsync(request, 'admin-members-delete', 20))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  }

  const result = await deleteMemberById(auth.user.id, id)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return membersResponse(request)
}
