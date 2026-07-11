import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildClearSessionCookie,
  destroyMemberSession,
  MEMBER_SESSION_COOKIE,
} from '@/lib/member/member-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  await destroyMemberSession(request)
  const jar = await cookies()
  jar.delete(MEMBER_SESSION_COOKIE)
  const response = NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
  response.cookies.set(buildClearSessionCookie())
  return response
}
