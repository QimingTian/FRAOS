import { NextRequest, NextResponse } from 'next/server'
import { listAllOrders, purchaseTypeLabel } from '@/lib/cloud/tenant-registry'
import { listMembersForAdminDirectory } from '@/lib/member/member-store'
import { requireAdmin } from '@/lib/member/member-auth'
import { normalizeProductPlan } from '@/lib/plan-utils'
import { PLANS } from '@/lib/site-config'

export const runtime = 'nodejs'

function buyerDisplayName(input: {
  firstName: string
  lastName: string
  username: string
  email: string
}): string {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
  return fullName || input.username || input.email
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const [orders, members] = await Promise.all([listAllOrders(), listMembersForAdminDirectory()])
  const memberById = new Map(members.map((member) => [member.id, member]))

  const purchases = orders.map((order) => {
    const buyer = order.memberId ? memberById.get(order.memberId) : null
    const plan = normalizeProductPlan(String(order.plan))
    return {
      orderId: order.orderId,
      plan,
      planName: PLANS[plan].name,
      purchaseType: order.purchaseType,
      purchaseTypeLabel: purchaseTypeLabel(order.purchaseType),
      observatoryName: order.displayName,
      tenantId: order.tenantId,
      buyerEmail: buyer?.email ?? order.email,
      buyerUsername: buyer?.username ?? null,
      buyerName: buyer ? buyerDisplayName(buyer) : null,
      promoCode: order.promoCode,
      createdAt: order.createdAt,
      validUntil: order.validUntil,
    }
  })

  return NextResponse.json({
    ok: true as const,
    purchases,
    total: purchases.length,
  })
}
