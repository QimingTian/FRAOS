import { NextRequest } from 'next/server'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import { memberHasActiveMaxLicense } from '@/lib/cloud/max-sites'
import { requireUser } from '@/lib/member/member-auth'
import { purchaseTypeForCycle, type BillingCycle } from '@/lib/checkout-pricing'
import { normalizeProductPlan } from '@/lib/plan-utils'
import {
  buildStripeLineItem,
  stripeCheckoutMode,
  stripeCheckoutPaymentMethodOptions,
  stripeCheckoutPaymentMethodTypes,
} from '@/lib/cloud/stripe-checkout'
import { checkoutBaseUrl, getStripe, stripeConfigured } from '@/lib/cloud/stripe-client'
import { PLANS, planIsPurchasable } from '@/lib/site-config'

export const runtime = 'nodejs'

type CreateSessionBody = {
  plan?: string
  billingCycle?: BillingCycle
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

  if (!stripeConfigured()) {
    return Response.json(
      { ok: false, error: 'Card checkout is not configured on this server yet.' },
      { status: 503 }
    )
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return Response.json(auth.body, { status: auth.status })
  }

  let body: CreateSessionBody
  try {
    body = (await request.json()) as CreateSessionBody
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

  if (plan === 'max' && (await memberHasActiveMaxLicense(auth.user.id))) {
    return Response.json(
      {
        ok: false,
        error:
          'You already have an active FRAOS Max subscription. Add more sites from your Account page — no extra charge.',
      },
      { status: 400 }
    )
  }

  const billingCycle = body.billingCycle
  if (billingCycle !== 'monthly' && billingCycle !== 'annual' && billingCycle !== 'lifetime') {
    return Response.json({ ok: false, error: 'Choose a billing option.' }, { status: 400 })
  }

  const baseUrl = checkoutBaseUrl()
  const stripe = getStripe()
  const mode = stripeCheckoutMode(billingCycle)
  const purchaseType = purchaseTypeForCycle(billingCycle)

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      payment_method_types: stripeCheckoutPaymentMethodTypes(),
      payment_method_options: stripeCheckoutPaymentMethodOptions(),
      line_items: [buildStripeLineItem(plan, billingCycle)],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout?plan=${plan}`,
      customer_email: auth.user.email,
      client_reference_id: auth.user.id,
      allow_promotion_codes: false,
      metadata: {
        memberId: auth.user.id,
        plan,
        billingCycle,
        purchaseType,
        email: auth.user.email,
        displayName: displayNameForUser(auth.user),
      },
      subscription_data:
        mode === 'subscription'
          ? {
              metadata: {
                memberId: auth.user.id,
                plan,
                billingCycle,
                purchaseType,
              },
            }
          : undefined,
    })

    if (!session.url) {
      return Response.json({ ok: false, error: 'Could not start checkout.' }, { status: 500 })
    }

    return Response.json({ ok: true, url: session.url, sessionId: session.id })
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : 'Could not start checkout.'
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
