'use client'

import type { CheckoutPriceOption } from '@/lib/checkout-pricing'

type CheckoutBillingCardsProps = {
  options: CheckoutPriceOption[]
  selected: CheckoutPriceOption['cycle']
  onSelect: (cycle: CheckoutPriceOption['cycle']) => void
  disabled?: boolean
}

export function CheckoutBillingCards({
  options,
  selected,
  onSelect,
  disabled = false,
}: CheckoutBillingCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {options.map((option) => {
        const active = selected === option.cycle
        return (
          <button
            key={option.cycle}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.cycle)}
            className={`checkout-billing-card glass-card relative flex flex-col p-6 text-left transition ${
              active ? 'checkout-billing-card-active' : ''
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            aria-pressed={active}
          >
            {option.badge ? (
              <span className="absolute right-4 top-4 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/90">
                {option.badge}
              </span>
            ) : null}
            <span className="label-caps text-xs">{option.title}</span>
            <p className="mt-3 font-display text-3xl font-semibold text-fg">{option.price}</p>
            <p className="mt-1 text-sm text-muted">{option.period}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted/85">{option.detail}</p>
            <span
              className={`mt-6 inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                active ? 'border-fg bg-fg' : 'border-white/25'
              }`}
              aria-hidden
            >
              {active ? <span className="h-2 w-2 rounded-full bg-bg" /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
