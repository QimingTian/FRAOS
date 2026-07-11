import { NextRequest, NextResponse } from 'next/server'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { requireAdmin } from '@/lib/member/member-auth'
import { createAdminPromoCode, listAdminPromoCodes } from '@/lib/cloud/promo-codes'
import { normalizeProductPlan } from '@/lib/plan-utils'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }
  const promos = await listAdminPromoCodes()
  return NextResponse.json({ ok: true as const, promos, total: promos.length })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const plan = normalizeProductPlan(typeof rec.plan === 'string' ? rec.plan : undefined)
  const validDays =
    typeof rec.validDays === 'number' && Number.isFinite(rec.validDays)
      ? rec.validDays
      : typeof rec.validDays === 'string'
        ? Number.parseInt(rec.validDays, 10)
        : 30
  const label = typeof rec.label === 'string' ? rec.label : null

  const result = await createAdminPromoCode({
    plan,
    validDays,
    createdByUserId: auth.user.id,
    label,
  })
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  const promos = await listAdminPromoCodes()
  return NextResponse.json({ ok: true as const, promo: result.promo, promos, total: promos.length })
}
