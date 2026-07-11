import { NextRequest, NextResponse } from 'next/server'
import { checkAuthRateLimitAsync } from '@/lib/member/auth-rate-limit'
import { buildSessionCookie, createMemberSession } from '@/lib/member/member-auth'
import { createMember } from '@/lib/member/member-store'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!(await checkAuthRateLimitAsync(request, 'signup', 10))) {
    return NextResponse.json(
      { ok: false, error: 'Too many signup attempts. Try again later.' },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const firstName = typeof body.firstName === 'string' ? body.firstName : ''
  const lastName = typeof body.lastName === 'string' ? body.lastName : ''
  const username = typeof body.username === 'string' ? body.username : ''

  const result = await createMember({ email, password, firstName, lastName, username })
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  const session = await createMemberSession(result.user.id)
  const response = NextResponse.json({ ok: true, user: result.user })
  response.cookies.set(buildSessionCookie(session.token, session.maxAgeSec))
  return response
}
