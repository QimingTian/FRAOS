export type LicenseSummary = {
  ok: boolean
  error?: string
  active?: boolean
  ownerName?: string
  plan?: string
  planLabel?: string
  purchaseType?: LicensePurchaseType
  purchaseTypeLabel?: string
  validUntil?: string | null
  nextBillAt?: string | null
}

export type LicensePurchaseType =
  | 'promo_code'
  | 'one_time'
  | 'monthly_subscription'
  | 'annual_subscription'

export function formatLicenseDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function purchaseTypeLabel(type: LicensePurchaseType | string | undefined): string {
  if (type === 'promo_code') return 'Promotion code'
  if (type === 'monthly_subscription') return 'Monthly subscription'
  if (type === 'annual_subscription') return 'Annual subscription'
  if (type === 'one_time') return 'One-time purchase'
  return '—'
}

export function inferLocalPurchaseType(plan: string | null | undefined): LicensePurchaseType {
  const value = (plan ?? '').toLowerCase()
  if (value === 'pro' || value === 'max') return 'annual_subscription'
  if (value === 'ultra') return 'annual_subscription'
  return 'one_time'
}
