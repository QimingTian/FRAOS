import { NextRequest, NextResponse } from 'next/server'
import {
  controlReleaseManifest,
  stationReleaseManifest,
} from '@/lib/cloud/release-manifest'
import {
  subscriptionCanCancel,
  subscriptionCanResume,
} from '@/lib/cloud/subscription-billing'
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

function orderSummary(order: Awaited<ReturnType<typeof listOrdersForMember>>[number]) {
  const control = controlReleaseManifest()
  const station = stationReleaseManifest()
  const plan = normalizeProductPlan(String(order.plan))
  const product = PLANS[plan]
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

  const orders = await listOrdersForMember(auth.user.id)
  return NextResponse.json({
    ok: true as const,
    orders: orders.map(orderSummary),
    total: orders.length,
  })
}
