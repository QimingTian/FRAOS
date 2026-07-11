import { NextRequest } from 'next/server'
import { orderAuthorized, tenantConfigForOrder } from '@/lib/cloud/tenant-registry'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params
  const token = request.nextUrl.searchParams.get('token')
  const order = await orderAuthorized(orderId, token)
  if (!order) {
    return Response.json({ ok: false, error: 'Order not found.' }, { status: 404 })
  }

  const tenantConfig = await tenantConfigForOrder(order)
  if (!tenantConfig) {
    return Response.json({ ok: false, error: 'Tenant config unavailable.' }, { status: 404 })
  }

  const filename = `borean-tenant-${tenantConfig.tenantId.slice(0, 8)}.json`
  return new Response(JSON.stringify(tenantConfig, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
