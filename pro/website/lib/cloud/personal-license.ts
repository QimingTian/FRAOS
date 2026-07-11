import type { ProductPlan } from '@/lib/site-config'
import { normalizeProductPlan, planDisplayName } from '@/lib/plan-utils'
import { getMemberById } from '@/lib/member/member-store'
import {
  loadOrder,
  loadTenantRegistry,
  loadTenantSecret,
  type LicensePurchaseType,
  type PersonalOrderRecord,
  inferPurchaseType,
} from '@/lib/cloud/tenant-registry'

export type { LicensePurchaseType } from '@/lib/cloud/tenant-registry'

export type PersonalLicenseSummary = {
  active: boolean
  ownerName: string
  plan: ProductPlan
  planLabel: string
  purchaseType: LicensePurchaseType
  purchaseTypeLabel: string
  validUntil: string | null
  nextBillAt: string | null
}

function memberFullName(user: {
  firstName: string
  lastName: string
  username: string
}): string {
  const full = `${user.firstName} ${user.lastName}`.trim()
  return full || user.username
}

export function purchaseTypeLabel(type: LicensePurchaseType): string {
  if (type === 'promo_code') return 'Promotion code'
  if (type === 'monthly_subscription') return 'Monthly subscription'
  if (type === 'annual_subscription') return 'Annual subscription'
  return 'One-time purchase'
}

function licenseIsActive(order: PersonalOrderRecord | null, hasSecret: boolean): boolean {
  if (!hasSecret) return false
  if (!order?.validUntil) return true
  const expiresMs = Date.parse(order.validUntil)
  if (!Number.isFinite(expiresMs)) return true
  return expiresMs > Date.now()
}

export async function personalIsTenantLicenseActive(tenantId: string): Promise<boolean> {
  const hasSecret = Boolean(await loadTenantSecret(tenantId))
  if (!hasSecret) return false
  const registry = await loadTenantRegistry(tenantId)
  const order = registry ? await loadOrder(registry.orderId) : null
  return licenseIsActive(order ?? null, hasSecret)
}

export async function personalLicenseSummaryForTenant(
  tenantId: string
): Promise<PersonalLicenseSummary | null> {
  const hasSecret = Boolean(await loadTenantSecret(tenantId))
  if (!hasSecret) return null

  const registry = await loadTenantRegistry(tenantId)
  const order = registry ? await loadOrder(registry.orderId) : null

  let ownerName = order?.displayName?.trim() || registry?.displayName?.trim() || '—'
  if (order?.memberId) {
    const member = await getMemberById(order.memberId)
    if (member) ownerName = memberFullName(member)
  }

  const plan = normalizeProductPlan(order?.plan ?? registry?.plan)
  const purchaseType = order?.purchaseType ?? inferPurchaseType(plan, order?.promoCode)

  return {
    active: licenseIsActive(order ?? null, hasSecret),
    ownerName,
    plan,
    planLabel: planDisplayName(plan),
    purchaseType,
    purchaseTypeLabel: purchaseTypeLabel(purchaseType),
    validUntil: order?.validUntil ?? null,
    nextBillAt: order?.nextBillAt ?? null,
  }
}
