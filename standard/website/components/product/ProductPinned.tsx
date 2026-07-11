'use client'

import { useEffect, useRef, useState } from 'react'
import { ProductMediaFrame } from '@/components/product/ProductMediaFrame'
import type { StoryFeature } from '@/lib/fraos-product-story'

type ProductPinnedProps = {
  mediaSrc?: string
  mediaAlt: string
  features: StoryFeature[]
  /** Reverse so the media sits on the right. */
  mediaRight?: boolean
}

export function ProductPinned({ mediaSrc, mediaAlt, features, mediaRight = false }: ProductPinnedProps) {
  const [active, setActive] = useState(0)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const nodes = itemRefs.current.filter((n): n is HTMLDivElement => n != null)
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const idxAttr = visible[0]?.target.getAttribute('data-index')
        if (idxAttr != null) setActive(Number(idxAttr))
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] }
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [features.length])

  return (
    <div className="page-shell grid gap-10 md:grid-cols-2 md:gap-16">
      <div className={`relative ${mediaRight ? 'md:order-2' : ''}`}>
        <div className="md:sticky md:top-28">
          <ProductMediaFrame src={mediaSrc} alt={mediaAlt} placeholderLabel={mediaAlt} aspect="hero" />
        </div>
      </div>

      <div className={mediaRight ? 'md:order-1' : ''}>
        <div className="flex flex-col gap-5 md:gap-7">
          {features.map((feature, index) => {
            const isActive = active === index
            return (
              <div
                key={feature.title}
                data-index={index}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                className={`rounded-2xl border-l-2 py-2 pl-5 transition-all duration-500 ${
                  isActive ? 'border-fg/70 opacity-100' : 'border-white/10 opacity-45'
                }`}
              >
                <h3 className="font-display text-2xl font-semibold tracking-tight text-fg md:text-3xl">
                  {feature.title}
                </h3>
                <p className="mt-3 text-lg leading-relaxed text-muted">{feature.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
