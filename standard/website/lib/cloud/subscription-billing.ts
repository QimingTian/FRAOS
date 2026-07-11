import type Stripe from 'stripe'
import { getStripe, stripeConfigured } from '@/lib/cloud/stripe-client'
import {
  listAllOrders,
  orderByStripeSubscription,
  orderOwnedByMember,
  saveOrder,
  type LicensePurchaseType,
  type PersonalOrderRecord,
} from '@/lib/cloud/tenant-registry'

function isRecurringPurchase(purchaseType: LicensePurchaseType): boolean {
  return purchaseType === 'monthly_subscription' || purchaseType === 'annual_subscription'
}

function subscriptionCustomerId(subscription: Stripe.Subscription): string | null {
  const customer = subscription.customer
  if (typeof customer === 'string') return customer
  return customer?.id ?? null
}

export async function applyStripeSubscriptionUpdate(
  subscription: Stripe.Subscription
): Promise<PersonalOrderRecord | null> {
  let order = await orderByStripeSubscription(subscription.id)
  if (!order) {
    const orders = await listAllOrders()
    order = orders.find((row) => row.stripeSubscriptionId === subscription.id)
  }
  if (!order) return null

  const periodEnd = subscription.current_period_end
  const validUntil =
    periodEnd && Number.isFinite(periodEnd)
      ? new Date(periodEnd * 1000).toISOString()
      : order.validUntil

  const terminal = ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)
  const nextBillAt =
    terminal || subscription.cancel_at_period_end || subscription.status !== 'active'
      ? null
      : validUntil

  const updated: PersonalOrderRecord = {
    ...order,
    validUntil,
    nextBillAt,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscriptionCustomerId(subscription) ?? order.stripeCustomerId ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  }

  await saveOrder(updated)
  return updated
}

export async function cancelMemberSubscriptionAtPeriodEnd(
  memberId: string,
  orderId: string
): Promise<{ ok: true; validUntil: string | null } | { ok: false; error: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: 'Stripe is not configured on this server.' }
  }

  const order = await orderOwnedByMember(orderId, memberId)
  if (!order) {
    return { ok: false, error: 'Order not found.' }
  }

  const subscriptionId = order.stripeSubscriptionId?.trim()
  if (!subscriptionId || !isRecurringPurchase(order.purchaseType)) {
    return { ok: false, error: 'This purchase is not a cancellable Stripe subscription.' }
  }

  const stripe = getStripe()
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  })
  const updated = await applyStripeSubscriptionUpdate(subscription)
  if (!updated) {
    return { ok: false, error: 'Subscription was updated in Stripe but could not be linked to your order.' }
  }

  return { ok: true, validUntil: updated.validUntil }
}

export async function resumeMemberSubscription(
  memberId: string,
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: 'Stripe is not configured on this server.' }
  }

  const order = await orderOwnedByMember(orderId, memberId)
  if (!order) {
    return { ok: false, error: 'Order not found.' }
  }

  const subscriptionId = order.stripeSubscriptionId?.trim()
  if (!subscriptionId || !isRecurringPurchase(order.purchaseType)) {
    return { ok: false, error: 'This purchase is not a Stripe subscription.' }
  }

  const stripe = getStripe()
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  })
  const updated = await applyStripeSubscriptionUpdate(subscription)
  if (!updated) {
    return { ok: false, error: 'Subscription was updated in Stripe but could not be linked to your order.' }
  }

  return { ok: true }
}

export function subscriptionCanCancel(order: PersonalOrderRecord): boolean {
  if (!isRecurringPurchase(order.purchaseType)) return false
  if (!order.stripeSubscriptionId?.trim()) return false
  if (order.cancelAtPeriodEnd) return false
  if (order.validUntil) {
    const expiresMs = Date.parse(order.validUntil)
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return false
  }
  return true
}

export function subscriptionCanResume(order: PersonalOrderRecord): boolean {
  if (!isRecurringPurchase(order.purchaseType)) return false
  if (!order.stripeSubscriptionId?.trim()) return false
  if (!order.cancelAtPeriodEnd) return false
  if (order.validUntil) {
    const expiresMs = Date.parse(order.validUntil)
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return false
  }
  return true
}
