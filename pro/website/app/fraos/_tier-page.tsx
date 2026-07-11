import type { Metadata } from 'next'
import { ProductStoryPage } from '@/components/ProductStoryPage'
import { PLANS, type ProductPlan } from '@/lib/site-config'

type PageProps = {
  params: Promise<{ plan: ProductPlan }>
}

export function generateFraosTierMetadata(plan: ProductPlan): Metadata {
  const product = PLANS[plan]
  return {
    title: `${product.name} — FRAOS — Borean Astro`,
    description: product.headline,
  }
}

export function FraosTierPage({ plan }: { plan: ProductPlan }) {
  return <ProductStoryPage plan={plan} />
}

export type { PageProps }
