'use client'

import Link from 'next/link'
import type { ProductPlan } from '@/lib/site-config'
import { PLANS, planIsPurchasable } from '@/lib/site-config'

type FraosEditionPanelProps = {
  plan: ProductPlan
}

export function FraosEditionPanel({ plan }: FraosEditionPanelProps) {
  const product = PLANS[plan]
  const learnHref = `/fraos/${plan}`
  const buyHref = `/checkout?plan=${plan}`
  const purchasable = planIsPurchasable(plan)

  return (
    <div className="glass-card flex h-full flex-col items-center p-8 text-center md:p-10">
      <p className="label-caps">
        {product.shortName}
        {product.availability === 'coming-soon' ? (
          <span className="ml-2 rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200/90">
            Coming soon
          </span>
        ) : null}
      </p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-fg md:text-4xl">
        {product.name}
      </h2>
      <p className="mt-4 text-lg text-muted">{product.tagline}</p>
      <p className="mt-6 font-display text-2xl text-fg">
        {product.price === 'Custom' ? 'Custom pricing' : product.price}
        <span className="ml-2 text-base font-sans font-normal text-muted">{product.period}</span>
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-center gap-4 pt-10">
        <Link href={learnHref} className="text-link text-base">
          Learn more
        </Link>
        <span className="hidden text-muted/40 sm:inline" aria-hidden>
          |
        </span>
        {purchasable ? (
          <Link href={buyHref} className="btn-primary px-7 py-2.5 text-sm">
            Buy
          </Link>
        ) : (
          <span className="rounded-full border border-white/20 px-7 py-2.5 text-sm text-muted">
            Coming soon
          </span>
        )}
      </div>
    </div>
  )
}
