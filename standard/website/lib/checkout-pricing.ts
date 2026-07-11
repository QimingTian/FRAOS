import type { ProductPlan } from '@/lib/site-config'

export type BillingCycle = 'monthly' | 'annual' | 'lifetime'

export type CheckoutPriceOption = {
  cycle: BillingCycle
  title: string
  price: string
  period: string
  detail: string
  badge?: string
  /** Numeric amount for display math (USD). */
  amountUsd: number
}

const STANDARD_PRICING: CheckoutPriceOption[] = [
  {
    cycle: 'monthly',
    title: 'Monthly',
    price: '$15',
    period: 'per month',
    detail: 'Cancel anytime. Billed monthly.',
    amountUsd: 15,
  },
  {
    cycle: 'annual',
    title: 'Annual',
    price: '$149',
    period: 'per year',
    detail: 'Equivalent to $12.42 per month.',
    badge: 'Save 17%',
    amountUsd: 149,
  },
  {
    cycle: 'lifetime',
    title: 'Lifetime',
    price: '$499',
    period: 'one-time',
    detail: 'Pay once. Use forever on one pier.',
    amountUsd: 499,
  },
]

const PRO_PRICING: CheckoutPriceOption[] = [
  {
    cycle: 'monthly',
    title: 'Monthly',
    price: '$49',
    period: 'per month',
    detail: 'Cancel anytime. Billed monthly.',
    amountUsd: 49,
  },
  {
    cycle: 'annual',
    title: 'Annual',
    price: '$490',
    period: 'per year',
    detail: 'Equivalent to $40.83 per month.',
    badge: 'Save 17%',
    amountUsd: 490,
  },
  {
    cycle: 'lifetime',
    title: 'Lifetime',
    price: '$1,299',
    period: 'one-time',
    detail: 'Pay once for perpetual access on one pier.',
    amountUsd: 1299,
  },
]

const MAX_PRICING: CheckoutPriceOption[] = [
  {
    cycle: 'monthly',
    title: 'Monthly',
    price: '$99',
    period: 'per month',
    detail: 'Cancel anytime. Billed monthly.',
    amountUsd: 99,
  },
  {
    cycle: 'annual',
    title: 'Annual',
    price: '$990',
    period: 'per year',
    detail: 'Equivalent to $82.50 per month.',
    badge: 'Save 17%',
    amountUsd: 990,
  },
  {
    cycle: 'lifetime',
    title: 'Lifetime',
    price: '$2,499',
    period: 'one-time',
    detail: 'Pay once for perpetual multi-site access.',
    amountUsd: 2499,
  },
]

export const CHECKOUT_PRICING: Record<ProductPlan, CheckoutPriceOption[] | null> = {
  standard: STANDARD_PRICING,
  pro: PRO_PRICING,
  max: MAX_PRICING,
  ultra: null,
}

export function checkoutPricingForPlan(plan: ProductPlan): CheckoutPriceOption[] {
  return CHECKOUT_PRICING[plan] ?? STANDARD_PRICING
}

export function billingCycleLabel(cycle: BillingCycle): string {
  switch (cycle) {
    case 'monthly':
      return 'Monthly subscription'
    case 'annual':
      return 'Annual subscription'
    case 'lifetime':
      return 'Lifetime license'
  }
}

export function purchaseTypeForCycle(cycle: BillingCycle): 'monthly_subscription' | 'annual_subscription' | 'one_time' {
  if (cycle === 'monthly') return 'monthly_subscription'
  if (cycle === 'annual') return 'annual_subscription'
  return 'one_time'
}
