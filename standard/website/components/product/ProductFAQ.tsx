'use client'

import { useState } from 'react'
import type { FaqItem } from '@/lib/fraos-product-story'

type ProductFAQProps = {
  items: FaqItem[]
}

export function ProductFAQ({ items }: ProductFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="mx-auto mt-12 max-w-3xl divide-y divide-white/10">
      {items.map((item, index) => {
        const open = openIndex === index
        return (
          <div key={item.question} data-reveal-item>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 py-5 text-left"
              aria-expanded={open}
              onClick={() => setOpenIndex(open ? null : index)}
            >
              <span className="font-display text-lg font-medium text-fg">{item.question}</span>
              <span className="mt-1 shrink-0 text-muted" aria-hidden>
                {open ? '−' : '+'}
              </span>
            </button>
            {open ? (
              <p className="pb-5 text-base leading-relaxed text-muted">{item.answer}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
