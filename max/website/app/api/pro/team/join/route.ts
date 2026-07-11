import { NextRequest, NextResponse } from 'next/server'
import { kvIncrWithExpire } from '@/lib/cloud/kv-rest'
import { joinProTeamWithCode } from '@/lib/cloud/pro-team'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

const JOIN_RATE_LIMIT = 12
const JOIN_RATE_WINDOW_SEC = 15 * 60

type JoinBody = {
  teamCode?: string
}

export async function POST(request: NextRequest) {
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const rateKey = `pro-team-join-rate:${auth.user.id}`
  const attempts = await kvIncrWithExpire(rateKey, JOIN_RATE_WINDOW_SEC)
  if (attempts !== undefined && attempts > JOIN_RATE_LIMIT) {
    return NextResponse.json(
      { ok: false, error: 'Too many join attempts. Try again later.' },
      { status: 429 }
    )
  }

  let body: JoinBody
  try {
    body = (await request.json()) as JoinBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const teamCode = body.teamCode?.trim() ?? ''
  if (!teamCode) {
    return NextResponse.json({ ok: false, error: 'Team code is required.' }, { status: 400 })
  }

  try {
    const { team, members } = await joinProTeamWithCode({
      memberId: auth.user.id,
      email: auth.user.email,
      teamCode,
    })

    return NextResponse.json({
      ok: true,
      team: {
        teamId: team.teamId,
        tenantId: team.tenantId,
        displayName: team.displayName,
      },
      members,
      successUrl: '/checkout/success?joined=1',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to join team.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
