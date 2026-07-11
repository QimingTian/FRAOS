export type ProductPlan = 'standard' | 'pro' | 'max' | 'ultra'

const PLAN_SHORT: Record<ProductPlan, string> = {
  standard: 'Standard',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra',
}

export function normalizeProductPlan(raw: string | null | undefined): ProductPlan {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === 'pro' || value === 'max' || value === 'ultra') return value
  return 'standard'
}

export function planDisplayLabel(raw: string | null | undefined): string {
  return PLAN_SHORT[normalizeProductPlan(raw)]
}

export function missionControlSubtitle(raw: string | null | undefined): string {
  return `${planDisplayLabel(raw)} Mission Control`
}
