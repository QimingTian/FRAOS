import { stripeConfigured } from '@/lib/cloud/stripe-client'

export const runtime = 'nodejs'

export async function GET() {
  return Response.json({
    ok: true,
    stripeEnabled: stripeConfigured(),
  })
}
