import { NextRequest, NextResponse } from 'next/server'
import { regenerateProTeamCode } from '@/lib/cloud/pro-team'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  try {
    const team = await regenerateProTeamCode(auth.user.id)
    return NextResponse.json({
      ok: true,
      teamCode: team.teamCode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to regenerate team code.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
