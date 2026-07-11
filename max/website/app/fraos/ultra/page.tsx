import Link from 'next/link'
import type { Metadata } from 'next'
import { ProductPageSeo } from '@/components/seo/ProductPageSeo'
import { tierPageMetadata } from '@/lib/seo'
import { PLANS } from '@/lib/site-config'

export const metadata: Metadata = tierPageMetadata('ultra')

export default function FraosUltraPage() {
  const product = PLANS.ultra

  return (
    <>
      <ProductPageSeo plan="ultra" />
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <p className="label-caps text-muted">{product.shortName}</p>
      <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-fg md:text-5xl">
        In development
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        {product.name} is not available yet. We are building multi-site observatory networks for
        organizations — check back soon.
      </p>
      <Link href="/fraos" className="btn-secondary mt-10 px-8 py-3 text-sm">
        Back to FRAOS
      </Link>
    </main>
    </>
  )
}
