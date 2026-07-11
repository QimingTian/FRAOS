import { NextRequest } from 'next/server'
import { validatePromoCode } from '@/lib/cloud/promo-codes'
import { normalizeProductPlan } from '@/lib/plan-utils'
import { PLANS, planIsPurchasable } from '@/lib/site-config'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  let body: { plan?: string; promoCode?: string }
  try {
    body = (await request.json()) as { plan?: string; promoCode?: string }
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const plan = normalizeProductPlan(body.plan)
  if (!planIsPurchasable(plan)) {
    return Response.json(
      { ok: false, error: `${PLANS[plan].name} is not available for checkout yet.` },
      { status: 400 }
    )
  }
  const result = await validatePromoCode(body.promoCode ?? '', plan)
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 })
  }

  return Response.json({
    ok: true,
    code: result.code,
    plan: result.plan,
    percentOff: result.percentOff,
    label: result.label,
    finalPriceLabel: result.finalPriceLabel,
  })
}
