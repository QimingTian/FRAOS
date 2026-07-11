import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured.')
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      typescript: true,
    })
  }
  return stripeClient
}

export function stripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.')
  }
  return secret
}

export function checkoutBaseUrl(): string {
  return (
    process.env.STRIPE_CHECKOUT_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://YOUR_DOMAIN'
  ).replace(/\/$/, '')
}
