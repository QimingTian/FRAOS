import { NextRequest, NextResponse } from 'next/server'
import {
  controlReleaseManifest,
  stationReleaseManifest,
} from '@/lib/cloud/release-manifest'
import {
  subscriptionCanCancel,
  subscriptionCanResume,
} from '@/lib/cloud/subscription-billing'
import { getProTeamContextForMember } from '@/lib/cloud/pro-team'
import {
  listOrdersForMember,
  purchaseTypeLabel,
  type LicensePurchaseType,
} from '@/lib/cloud/tenant-registry'
import { requireUser } from '@/lib/member/member-auth'
import { normalizeProductPlan } from '@/lib/plan-utils'
import { PLANS } from '@/lib/site-config'

export const runtime = 'nodejs'

function isRecurringPurchase(purchaseType: LicensePurchaseType): boolean {
  return purchaseType === 'monthly_subscription' || purchaseType === 'annual_subscription'
}

function licenseActive(validUntil: string | null): boolean {
  if (!validUntil) return true
  const expiresMs = Date.parse(validUntil)
  if (!Number.isFinite(expiresMs)) return true
  return expiresMs > Date.now()
}

function orderSummary(
  order: Awaited<ReturnType<typeof listOrdersForMember>>[number],
  proTeam: Awaited<ReturnType<typeof getProTeamContextForMember>>
) {
  const plan = normalizeProductPlan(String(order.plan))
  const control = controlReleaseManifest(plan)
  const station = stationReleaseManifest()
  const product = PLANS[plan]
  const teamCode =
    plan === 'pro' &&
    proTeam?.role === 'owner' &&
    proTeam.team.tenantId === order.tenantId
      ? proTeam.team.teamCode
      : undefined
  return {
    orderId: order.orderId,
    plan,
    planName: product.name,
    displayName: order.displayName,
    tenantId: order.tenantId,
    promoCode: order.promoCode,
    purchaseType: order.purchaseType,
    purchaseTypeLabel: purchaseTypeLabel(order.purchaseType),
    validUntil: order.validUntil,
    nextBillAt: order.nextBillAt,
    cancelAtPeriodEnd: Boolean(order.cancelAtPeriodEnd),
    licenseActive: licenseActive(order.validUntil),
    isSubscription: isRecurringPurchase(order.purchaseType),
    canCancelSubscription: subscriptionCanCancel(order),
    canResumeSubscription: subscriptionCanResume(order),
    createdAt: order.createdAt,
    tenantConfigUrl: `/api/member/orders/${order.orderId}/tenant`,
    teamCode,
    downloads: {
      controlWindows: control.downloadUrlWindows,
      controlMac: control.downloadUrlMac,
      stationWindows: station.downloadUrlWindows,
    },
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const [orders, proTeam] = await Promise.all([
    listOrdersForMember(auth.user.id),
    getProTeamContextForMember(auth.user.id),
  ])
  return NextResponse.json({
    ok: true as const,
    orders: orders.map((order) => orderSummary(order, proTeam)),
    total: orders.length,
  })
}
