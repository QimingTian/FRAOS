import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/member/member-auth'
import { toPublicMemberUser } from '@/lib/member/member-store'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Not authenticated.' },
      { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
  return NextResponse.json(
    { ok: true, user: toPublicMemberUser(user) },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
