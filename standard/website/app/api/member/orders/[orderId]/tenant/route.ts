import { NextRequest } from 'next/server'
import { resolveMemberOrderTenant } from '@/lib/cloud/tenant-registry'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return Response.json(auth.body, { status: auth.status })
  }

  const { orderId } = await context.params
  const resolved = await resolveMemberOrderTenant(orderId, auth.user.id)
  if (!resolved) {
    return Response.json({ ok: false, error: 'Order not found.' }, { status: 404 })
  }

  const filename = `borean-tenant-${resolved.tenantConfig.tenantId.slice(0, 8)}.json`
  return new Response(JSON.stringify(resolved.tenantConfig, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
