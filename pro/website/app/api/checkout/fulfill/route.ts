import { NextRequest } from 'next/server'
import { fulfillStripeCheckoutSession } from '@/lib/cloud/checkout-fulfillment'
import { stripeConfigured } from '@/lib/cloud/stripe-client'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!stripeConfigured()) {
    return Response.json({ ok: false, error: 'Stripe is not configured.' }, { status: 503 })
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim()
  if (!sessionId) {
    return Response.json({ ok: false, error: 'Missing session_id.' }, { status: 400 })
  }

  const result = await fulfillStripeCheckoutSession(sessionId)
  if (!result.ok) {
    return Response.json(result, { status: result.pending ? 202 : 400 })
  }

  return Response.json(result)
}
