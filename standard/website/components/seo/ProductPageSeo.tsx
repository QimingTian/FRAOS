import { JsonLd } from '@/components/seo/JsonLd'
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from '@/lib/seo'
import type { ProductPlan } from '@/lib/site-config'
import { PLANS } from '@/lib/site-config'

type ProductPageSeoProps = {
  plan: ProductPlan
}

export function ProductPageSeo({ plan }: ProductPageSeoProps) {
  const product = PLANS[plan]
  return (
    <JsonLd
      data={[
        organizationJsonLd(),
        softwareApplicationJsonLd(plan),
        faqPageJsonLd(plan),
        breadcrumbJsonLd([
          { name: 'FRAOS', path: '/fraos' },
          { name: product.shortName, path: `/fraos/${plan}` },
        ]),
      ]}
    />
  )
}
