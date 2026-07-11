import { NextRequest } from 'next/server'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { requireUser } from '@/lib/member/member-auth'
import { consumePromoCode, licenseValidUntilFromDays, validatePromoCode } from '@/lib/cloud/promo-codes'
import {
  controlReleaseManifest,
  stationReleaseManifest,
} from '@/lib/cloud/release-manifest'
import { provisionPersonalTenant } from '@/lib/cloud/tenant-registry'
import { normalizeProductPlan } from '@/lib/plan-utils'
import { PLANS, planIsPurchasable } from '@/lib/site-config'

export const runtime = 'nodejs'

type RedeemBody = {
  plan?: string
  promoCode?: string
}

function displayNameForUser(user: {
  firstName: string
  lastName: string
  username: string
}): string {
  const fullName = `${user.firstName} ${user.lastName}`.trim()
  return fullName || user.username
}

export async function POST(request: NextRequest) {
  if (!isSameSiteMutation(request)) {
    return Response.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return Response.json(auth.body, { status: auth.status })
  }

  let body: RedeemBody
  try {
    body = (await request.json()) as RedeemBody
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
  const promoCode = body.promoCode?.trim() ?? ''
  if (!promoCode) {
    return Response.json({ ok: false, error: 'Promotion code is required.' }, { status: 400 })
  }

  const validation = await validatePromoCode(promoCode, plan)
  if (!validation.ok) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 })
  }
  if (validation.percentOff < 100) {
    return Response.json(
      { ok: false, error: 'Paid checkout is not enabled yet — use a 100% promotion code.' },
      { status: 400 }
    )
  }

  const redeemedAt = new Date()
  const { order, tenantConfig } = await provisionPersonalTenant({
    plan,
    email: auth.user.email,
    displayName: displayNameForUser(auth.user),
    memberId: auth.user.id,
    promoCode: validation.code,
    purchaseType: 'promo_code',
    validUntil: licenseValidUntilFromDays(validation.licenseValidDays, redeemedAt),
  })

  await consumePromoCode(validation.code, auth.user.id)

  const control = controlReleaseManifest()
  const station = stationReleaseManifest()

  return Response.json({
    ok: true,
    orderId: order.orderId,
    downloadToken: order.downloadToken,
    tenantId: tenantConfig.tenantId,
    displayName: tenantConfig.displayName,
    plan,
    promoCode: validation.code,
    downloads: {
      controlWindows: control.downloadUrlWindows,
      controlMac: control.downloadUrlMac,
      stationWindows: station.downloadUrlWindows,
    },
    tenantConfigUrl: `/api/checkout/order/${order.orderId}/tenant?token=${order.downloadToken}`,
    successUrl: `/checkout/success?order=${order.orderId}&token=${order.downloadToken}`,
  })
}
