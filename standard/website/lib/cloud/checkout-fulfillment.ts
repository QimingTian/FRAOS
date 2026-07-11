import type Stripe from 'stripe'
import { purchaseTypeForCycle, type BillingCycle } from '@/lib/checkout-pricing'
import { normalizeProductPlan } from '@/lib/plan-utils'
import {
  controlReleaseManifest,
  stationReleaseManifest,
} from '@/lib/cloud/release-manifest'
import { getStripe } from '@/lib/cloud/stripe-client'
import { githubActionsTriggerConfigured, triggerPerOrderBuild } from '@/lib/cloud/github-actions-trigger'
import { setOrderBuildStatus } from '@/lib/cloud/order-build-status'
import type { LicensePurchaseType } from '@/lib/cloud/tenant-registry'
import {
  linkStripeSession,
  orderByStripeSession,
  provisionPersonalTenant,
  saveOrder,
  type PersonalOrderRecord,
} from '@/lib/cloud/tenant-registry'

export type FulfillmentSummary = {
  ok: true
  orderId: string
  tenantId: string
  displayName: string
  plan: PersonalOrderRecord['plan']
  downloadToken: string
  tenantConfigUrl: string
  downloads: {
    controlWindows: string | null
    controlMac: string | null
    stationWindows: string | null
  }
  /** Per-order custom build is in progress; poll /api/orders/status for completion. */
  buildStatus?: 'building' | 'ready' | 'failed'
}

export type FulfillmentResult =
  | FulfillmentSummary
  | { ok: false; error: string; pending?: boolean }

function displayNameFromMetadata(session: Stripe.Checkout.Session): string {
  const raw = session.metadata?.displayName?.trim()
  return raw || 'Borean Astro customer'
}

function billingCycleFromMetadata(session: Stripe.Checkout.Session): BillingCycle {
  const raw = session.metadata?.billingCycle
  if (raw === 'monthly' || raw === 'annual' || raw === 'lifetime') return raw
  return 'monthly'
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription | null): {
  validUntil: string | null
  nextBillAt: string | null
} {
  if (!subscription || subscription.status === 'canceled') {
    return { validUntil: null, nextBillAt: null }
  }
  const end = subscription.current_period_end
  if (!end) return { validUntil: null, nextBillAt: null }
  const iso = new Date(end * 1000).toISOString()
  return { validUntil: iso, nextBillAt: iso }
}

export async function fulfillStripeCheckoutSession(sessionId: string): Promise<FulfillmentResult> {
  const existing = await orderByStripeSession(sessionId)
  if (existing) {
    return buildSummary(existing)
  }

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  })

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return { ok: false, error: 'Payment is not complete yet.', pending: true }
  }

  const memberId = session.metadata?.memberId?.trim()
  const plan = normalizeProductPlan(session.metadata?.plan)
  const billingCycle = billingCycleFromMetadata(session)
  const purchaseType: LicensePurchaseType = purchaseTypeForCycle(billingCycle)
  const email =
    session.customer_details?.email?.trim() ||
    session.customer_email?.trim() ||
    session.metadata?.email?.trim() ||
    null

  if (!memberId) {
    return { ok: false, error: 'Checkout session is missing account metadata.' }
  }

  const subscription =
    typeof session.subscription === 'string'
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription

  const period =
    purchaseType === 'one_time'
      ? { validUntil: null, nextBillAt: null }
      : subscriptionPeriodEnd(subscription)

  const { order, tenantConfig } = await provisionPersonalTenant({
    plan,
    email,
    displayName: displayNameFromMetadata(session),
    memberId,
    purchaseType,
    validUntil: period.validUntil,
    nextBillAt: period.nextBillAt,
  })

  const enriched: PersonalOrderRecord = {
    ...order,
    stripeSessionId: session.id,
    stripeCustomerId:
      typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
    stripeSubscriptionId:
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id ?? null,
  }

  await saveOrder(enriched)
  await linkStripeSession(session.id, enriched.orderId)

  // Fire the per-order custom build (non-blocking — the order is already
  // provisioned; the build produces custom installers with baked-in tenant
  // credentials). If GitHub Actions is not configured, the checkout falls
  // back to the generic release manifest download URLs.
  let buildStatus: 'building' | 'ready' | 'failed' | undefined
  if (githubActionsTriggerConfigured()) {
    try {
      await setOrderBuildStatus(session.id, {
        tenantId: enriched.tenantId,
        customerEmail: email,
        plan,
        status: 'building',
        startedAt: new Date().toISOString(),
      })

      const trigger = await triggerPerOrderBuild({
        tenantId: enriched.tenantId,
        apiSecret: tenantConfig.apiSecret,
        plan,
        customerEmail: email ?? '',
        stripeSessionId: session.id,
      })

      if (!trigger.ok) {
        // Build trigger failed — mark as failed but don't block checkout.
        // The customer still gets generic download links from the manifest.
        buildStatus = 'failed'
        await setOrderBuildStatus(session.id, {
          tenantId: enriched.tenantId,
          status: 'failed',
          failedAt: new Date().toISOString(),
          failureReason: trigger.error,
        })
      } else {
        buildStatus = 'building'
      }
    } catch {
      // Non-fatal: build status tracking is best-effort.
      buildStatus = undefined
    }
  }

  return buildSummary(enriched, buildStatus)
}

function buildSummary(
  order: PersonalOrderRecord,
  buildStatus?: 'building' | 'ready' | 'failed'
): FulfillmentSummary {
  const control = controlReleaseManifest(order.plan)
  const station = stationReleaseManifest()
  return {
    ok: true,
    orderId: order.orderId,
    tenantId: order.tenantId,
    displayName: order.displayName,
    plan: order.plan,
    downloadToken: order.downloadToken,
    tenantConfigUrl: `/api/checkout/order/${order.orderId}/tenant?token=${order.downloadToken}`,
    downloads: {
      controlWindows: control.downloadUrlWindows,
      controlMac: control.downloadUrlMac,
      stationWindows: station.downloadUrlWindows,
    },
    buildStatus,
  }
}
