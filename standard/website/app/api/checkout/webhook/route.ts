import { fulfillStripeCheckoutSession } from '@/lib/cloud/checkout-fulfillment'
import { applyStripeSubscriptionUpdate } from '@/lib/cloud/subscription-billing'
import { getStripe, stripeWebhookSecret } from '@/lib/cloud/stripe-client'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stripe = getStripe()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return Response.json({ ok: false, error: 'Missing Stripe signature.' }, { status: 400 })
  }

  const body = await request.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret())
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : 'Invalid webhook signature.'
    return Response.json({ ok: false, error: message }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    if (session.id) {
      await fulfillStripeCheckoutSession(session.id)
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    await applyStripeSubscriptionUpdate(event.data.object)
  }

  return Response.json({ ok: true, received: true })
}
