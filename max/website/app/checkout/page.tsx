'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { CheckoutBillingCards } from '@/components/checkout/CheckoutBillingCards'
import { MemberAuthPanel } from '@/components/member-auth-panel'
import { useMember } from '@/hooks/use-member'
import {
  billingCycleLabel,
  checkoutPricingForPlan,
  type CheckoutPriceOption,
} from '@/lib/checkout-pricing'
import { normalizeProductPlan } from '@/lib/plan-utils'
import { PLANS, planIsPurchasable } from '@/lib/site-config'

type PromoPreview = {
  code: string
  finalPriceLabel: string
  label: string | null
}

type ProCheckoutMode = 'start' | 'join'

function ProModeToggle({
  mode,
  onChange,
}: {
  mode: ProCheckoutMode
  onChange: (mode: ProCheckoutMode) => void
}) {
  return (
    <div className="mt-8 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange('start')}
        className={`lg-nav-pill px-4 py-2 text-sm font-medium transition ${
          mode === 'start'
            ? 'lg-nav-pill-active text-fg'
            : 'text-muted hover:text-fg'
        }`}
      >
        Start a team
      </button>
      <button
        type="button"
        onClick={() => onChange('join')}
        className={`lg-nav-pill px-4 py-2 text-sm font-medium transition ${
          mode === 'join'
            ? 'lg-nav-pill-active text-fg'
            : 'text-muted hover:text-fg'
        }`}
      >
        Join with team code
      </button>
    </div>
  )
}

function ProJoinPanel({ memberEmail }: { memberEmail: string }) {
  const [teamCode, setTeamCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/pro/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ teamCode }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; successUrl?: string }
      if (!res.ok || !data.ok || !data.successUrl) {
        setError(data.error ?? 'Could not join team.')
        return
      }
      window.location.href = data.successUrl
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not join team.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mt-2 text-sm text-muted">
        Signed in as <span className="text-fg">{memberEmail}</span>
      </p>
      <div className="glass-card mt-10 p-8 md:p-10">
        <CheckoutProductHeader
          name="FRAOS Pro"
          tagline="Join your team’s shared observatory — no payment required."
        />
        <div className="glass-inset mt-8 p-6 md:p-8">
          <h3 className="font-display text-lg font-semibold text-fg">Team code</h3>
          <p className="mt-1 text-sm text-muted">
            Ask your team owner for the code from their account page.
          </p>
          <label className="mt-5 block">
            <span className="sr-only">Team code</span>
            <input
              type="text"
              value={teamCode}
              onChange={(e) => {
                setTeamCode(e.target.value.toUpperCase())
                setError(null)
              }}
              placeholder="Enter team code"
              className="glass-field w-full px-4 py-3 font-mono text-sm tracking-widest placeholder:font-sans placeholder:tracking-normal placeholder:text-muted/60"
              autoComplete="off"
              disabled={busy}
            />
          </label>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={() => void handleJoin()}
            disabled={busy || !teamCode.trim()}
            className="btn-primary px-10 py-3.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? 'Joining team…' : 'Join team'}
          </button>
        </div>
        {error ? <p className="mt-4 text-right text-sm text-red-300">{error}</p> : null}
      </div>
    </>
  )
}

function CheckoutProductHeader({ name, tagline }: { name: string; tagline: string }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-fg md:text-3xl">{name}</h2>
      <p className="mt-2 text-muted">{tagline}</p>
    </div>
  )
}

function CheckoutMain({
  plan,
  product,
  memberEmail,
}: {
  plan: ReturnType<typeof normalizeProductPlan>
  product: (typeof PLANS)[typeof plan]
  memberEmail: string
}) {
  const priceOptions = checkoutPricingForPlan(plan)
  const [billingCycle, setBillingCycle] = useState<CheckoutPriceOption['cycle']>('monthly')
  const [promoCode, setPromoCode] = useState('')
  const [promoPreview, setPromoPreview] = useState<PromoPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeEnabled, setStripeEnabled] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/checkout/config')
        const data = (await res.json()) as { stripeEnabled?: boolean }
        setStripeEnabled(Boolean(data.stripeEnabled))
      } catch {
        setStripeEnabled(false)
      }
    })()
  }, [])

  const selectedOption = useMemo(
    () => priceOptions.find((o) => o.cycle === billingCycle) ?? priceOptions[0],
    [priceOptions, billingCycle]
  )

  const promoActive = promoPreview?.finalPriceLabel === 'Free'

  const displayTotal = promoActive ? 'Free' : selectedOption.price
  const displayPeriod = promoActive
    ? 'promotion applied'
    : promoPreview
      ? `${promoPreview.finalPriceLabel} with code`
      : selectedOption.period

  async function handleValidatePromo() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/checkout/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, promoCode }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        code?: string
        finalPriceLabel?: string
        label?: string | null
      }
      if (!res.ok || !data.ok || !data.code || !data.finalPriceLabel) {
        setPromoPreview(null)
        setError(data.error ?? 'Promotion code could not be applied.')
        return
      }
      setPromoPreview({
        code: data.code,
        finalPriceLabel: data.finalPriceLabel,
        label: data.label ?? null,
      })
    } catch (ex) {
      setPromoPreview(null)
      setError(ex instanceof Error ? ex.message : 'Could not validate promotion code.')
    } finally {
      setBusy(false)
    }
  }

  async function handleStripeCheckout() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan, billingCycle }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; url?: string }
      if (!res.ok || !data.ok || !data.url) {
        setError(data.error ?? 'Could not start card checkout.')
        return
      }
      window.location.href = data.url
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not start card checkout.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCompletePurchase() {
    if (promoActive) {
      await handleRedeem()
      return
    }
    await handleStripeCheckout()
  }

  const canComplete = promoActive || stripeEnabled

  async function handleRedeem() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/checkout/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan,
          promoCode: promoPreview?.code ?? promoCode,
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        successUrl?: string
      }
      if (!res.ok || !data.ok || !data.successUrl) {
        setError(data.error ?? 'Checkout failed.')
        return
      }
      window.location.href = data.successUrl
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Checkout failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mt-2 text-sm text-muted">
        Signed in as <span className="text-fg">{memberEmail}</span>
      </p>

      <div className="glass-card mt-10 p-8 md:p-10">
        <CheckoutProductHeader name={product.name} tagline={product.tagline} />

        <div className="mt-10">
          <h3 className="font-display text-lg font-semibold text-fg">Choose a plan</h3>
          <p className="mt-1 text-sm text-muted">Monthly, annual, or pay once — same full {product.shortName} stack.</p>
          <div className="mt-6">
            <CheckoutBillingCards
              options={priceOptions}
              selected={billingCycle}
              onSelect={(cycle) => {
                setBillingCycle(cycle)
                if (promoPreview) {
                  setPromoPreview(null)
                  setPromoCode('')
                }
              }}
              disabled={promoActive}
            />
          </div>
        </div>

        <div className="glass-inset mt-6 p-6 md:p-8">
          <h3 className="font-display text-lg font-semibold text-fg">Promotion code</h3>
          <label className="mt-5 block">
            <span className="sr-only">Promotion code</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value)
                  setPromoPreview(null)
                  setError(null)
                }}
                placeholder="Enter promotion code"
                className="glass-field min-w-0 flex-1 px-4 py-3 text-sm placeholder:text-muted/60"
                autoComplete="off"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void handleValidatePromo()}
                disabled={busy || !promoCode.trim()}
                className="btn-secondary shrink-0 px-6 py-3 text-sm disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </label>
          {promoPreview ? (
            <p className="mt-3 text-sm text-fg">
              {promoPreview.label ? `${promoPreview.label} · ` : ''}
              {promoPreview.code} applied — {promoPreview.finalPriceLabel}
            </p>
          ) : null}
        </div>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted">
              {promoActive ? 'Promotion code' : billingCycleLabel(billingCycle)}
            </p>
            <p className="mt-1 font-display text-4xl font-bold text-fg">{displayTotal}</p>
            <p className="mt-1 text-sm text-muted">{displayPeriod}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCompletePurchase()}
            disabled={busy || !canComplete}
            className="btn-primary w-full shrink-0 px-10 py-3.5 sm:w-auto disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy
              ? promoActive
                ? 'Provisioning license…'
                : 'Redirecting to checkout…'
              : promoActive
                ? 'Activate license'
                : 'Continue to payment'}
          </button>
        </div>

        {error ? <p className="mt-4 text-center text-sm text-red-300 sm:text-right">{error}</p> : null}
      </div>
    </>
  )
}

function CheckoutContent() {
  const searchParams = useSearchParams()
  const rawPlan = searchParams.get('plan')
  const plan = normalizeProductPlan(rawPlan)
  const product = PLANS[plan]
  const purchasable = planIsPurchasable(plan)
  const member = useMember()
  const priceOptions = checkoutPricingForPlan(plan)
  const [proMode, setProMode] = useState<ProCheckoutMode>('start')

  if (member.status === 'loading') {
    return (
      <section className="page-shell-checkout py-16 md:py-20">
        <p className="text-muted">Loading…</p>
      </section>
    )
  }

  if (!purchasable) {
    return (
      <section className="page-shell-checkout py-16 md:py-20">
        <Link href="/fraos" className="text-sm text-muted hover:text-fg">
          ← Back to FRAOS
        </Link>
        <h1 className="mt-8 font-display text-3xl font-bold text-fg">Checkout</h1>
        <p className="mt-4 text-muted">
          {product.name} is not available for purchase yet. Explore other tiers or check back when this
          edition launches.
        </p>
        <Link href={`/fraos/${plan}`} className="btn-secondary mt-8 inline-flex px-6 py-2.5 text-sm">
          View {product.shortName}
        </Link>
      </section>
    )
  }

  if (member.status === 'guest') {
    return (
      <section className="page-shell-checkout py-16 md:py-20">
        <Link href={`/fraos/${plan}`} className="text-sm text-muted hover:text-fg">
          ← Back to {product.shortName}
        </Link>
        <h1 className="mt-8 font-display text-3xl font-bold text-fg">Checkout</h1>
        <p className="mt-2 text-muted">Log in or create an account to complete your purchase.</p>

        <div className="glass-card mt-10 p-8 md:p-10">
          <CheckoutProductHeader name={product.name} tagline={product.tagline} />
          <div className="mt-10">
            <h3 className="font-display text-lg font-semibold text-fg">Choose a plan</h3>
            <p className="mt-1 text-sm text-muted">Preview pricing — sign in below to checkout.</p>
            <div className="mt-6 pointer-events-none opacity-80">
              <CheckoutBillingCards options={priceOptions} selected="monthly" onSelect={() => {}} disabled />
            </div>
          </div>
          <div className="glass-inset mt-6 p-6 opacity-80">
            <h3 className="font-display text-lg font-semibold text-fg">Promotion code</h3>
            <p className="mt-1 text-sm text-muted">Available after you sign in.</p>
          </div>
        </div>

        <div className="mt-8">
          <MemberAuthPanel
            onSignedIn={(user) => {
              if (user) member.completeSignIn(user)
              else void member.refresh()
            }}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="page-shell-checkout py-16 md:py-20">
      <Link href={`/fraos/${plan}`} className="text-sm text-muted hover:text-fg">
        ← Back to {product.shortName}
      </Link>
      <h1 className="mt-8 font-display text-3xl font-bold text-fg">Checkout</h1>
      {plan === 'pro' ? <ProModeToggle mode={proMode} onChange={setProMode} /> : null}
      {plan === 'pro' && proMode === 'join' ? (
        <ProJoinPanel memberEmail={member.user.email} />
      ) : (
        <CheckoutMain plan={plan} product={product} memberEmail={member.user.email} />
      )}
    </section>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="px-6 py-20 text-muted">Loading checkout…</div>}>
      <CheckoutContent />
    </Suspense>
  )
}
