import type { Metadata } from 'next'
import { ProductStoryPage } from '@/components/ProductStoryPage'
import { ProductPageSeo } from '@/components/seo/ProductPageSeo'
import { tierPageMetadata } from '@/lib/seo'
import type { ProductPlan } from '@/lib/site-config'

type PageProps = {
  params: Promise<{ plan: ProductPlan }>
}

export function generateFraosTierMetadata(plan: ProductPlan): Metadata {
  return tierPageMetadata(plan)
}

export function FraosTierPage({ plan }: { plan: ProductPlan }) {
  return (
    <>
      <ProductPageSeo plan={plan} />
      <ProductStoryPage plan={plan} />
    </>
  )
}

export type { PageProps }
