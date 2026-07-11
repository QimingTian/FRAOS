import { NextRequest } from 'next/server'
import {
  controlReleaseManifest,
  stationReleaseManifest,
} from '@/lib/cloud/release-manifest'
import { orderAuthorized } from '@/lib/cloud/tenant-registry'

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

  const control = controlReleaseManifest(order.plan)
  const station = stationReleaseManifest()

  return Response.json({
    ok: true,
    orderId: order.orderId,
    tenantId: order.tenantId,
    displayName: order.displayName,
    plan: order.plan,
    tenantConfigUrl: `/api/checkout/order/${order.orderId}/tenant?token=${order.downloadToken}`,
    downloads: {
      controlWindows: control.downloadUrlWindows,
      controlMac: control.downloadUrlMac,
      stationWindows: station.downloadUrlWindows,
    },
  })
}
