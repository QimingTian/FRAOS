import type { ProductPlan } from '@/lib/site-config'
import { PLANS, PRODUCT_PLANS } from '@/lib/site-config'

const LEGACY_PLAN_ALIASES: Record<string, ProductPlan> = {
  personal: 'standard',
  organization: 'ultra',
}

export function normalizeProductPlan(raw: string | null | undefined): ProductPlan {
  const value = raw?.trim().toLowerCase() ?? ''
  if (LEGACY_PLAN_ALIASES[value]) return LEGACY_PLAN_ALIASES[value]
  if ((PRODUCT_PLANS as readonly string[]).includes(value)) return value as ProductPlan
  return 'standard'
}

export function isProductPlan(value: string | null | undefined): value is ProductPlan {
  const normalized = normalizeProductPlan(value)
  return normalized === value?.trim().toLowerCase()
}

export function planDisplayName(plan: ProductPlan | string | null | undefined): string {
  const normalized = typeof plan === 'string' ? normalizeProductPlan(plan) : plan
  if (!normalized) return PLANS.standard.name
  return PLANS[normalized]?.name ?? normalized
}

export function storedPlanLabel(plan: ProductPlan | string | null | undefined): string {
  return planDisplayName(plan)
}

/** Higher rank wins when an account owns multiple FRAOS plans. */
export function planTierRank(plan: ProductPlan | string | null | undefined): number {
  switch (normalizeProductPlan(typeof plan === 'string' ? plan : plan ?? '')) {
    case 'ultra':
      return 4
    case 'max':
      return 3
    case 'pro':
      return 2
    case 'standard':
      return 1
    default:
      return 0
  }
}
