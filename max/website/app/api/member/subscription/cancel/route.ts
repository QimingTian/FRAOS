import { NextRequest, NextResponse } from 'next/server'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { requireUser } from '@/lib/member/member-auth'
import { cancelMemberSubscriptionAtPeriodEnd } from '@/lib/cloud/subscription-billing'

export const runtime = 'nodejs'

type CancelBody = {
  orderId?: string
}

export async function POST(request: NextRequest) {
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  let body: CancelBody
  try {
    body = (await request.json()) as CancelBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const orderId = body.orderId?.trim() ?? ''
  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'orderId is required.' }, { status: 400 })
  }

  const result = await cancelMemberSubscriptionAtPeriodEnd(auth.user.id, orderId)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    validUntil: result.validUntil,
    message: 'Subscription will cancel at the end of the current billing period.',
  })
}
