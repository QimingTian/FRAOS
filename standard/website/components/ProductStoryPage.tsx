'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ProductChapterHeading } from '@/components/product/ProductChapterHeading'
import { ProductFAQ } from '@/components/product/ProductFAQ'
import { ProductFeatureGrid } from '@/components/product/ProductFeatureGrid'
import { ProductHero } from '@/components/product/ProductHero'
import { ProductHubDiagram } from '@/components/product/ProductHubDiagram'
import { ProductMediaFrame } from '@/components/product/ProductMediaFrame'
import { ProductNightToggle } from '@/components/product/ProductNightToggle'
import { ProductPlanCallouts } from '@/components/product/ProductPlanCallouts'
import { ProductSchedulerMindMap } from '@/components/product/ProductSchedulerMindMap'
import { ProductStickyNav } from '@/components/product/ProductStickyNav'
import {
  ATLAS_CHIPS,
  ATLAS_FEATURES,
  CLOUD_FEATURES,
  CREATE_SESSION_FEATURES,
  FRAOS_STORY_NAV,
  FRAOS_TIER_DELTA,
  MEDIA,
  STATION_FEATURES,
  WEATHER_FEATURES,
  fraosFaqForPlan,
  fraosStorageLine,
} from '@/lib/fraos-product-story'
import type { ProductPlan } from '@/lib/site-config'
import { FRAOS, PLANS, planIsPurchasable } from '@/lib/site-config'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type ProductStoryPageProps = {
  plan: ProductPlan
}

export function ProductStoryPage({ plan }: ProductStoryPageProps) {
  const product = PLANS[plan]
  const tierDelta = FRAOS_TIER_DELTA[plan]
  const faqItems = fraosFaqForPlan(plan)
  const buyHref = `/checkout?plan=${plan}`
  const purchasable = planIsPurchasable(plan)
  const comingSoon = product.availability === 'coming-soon'
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      root.querySelectorAll('[data-reveal]').forEach((block) => {
        const items = block.querySelectorAll('[data-reveal-item]')
        if (!items.length) return
        gsap.from(items, {
          y: 32,
          autoAlpha: 0,
          duration: 0.7,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: { trigger: block, start: 'top 82%', toggleActions: 'play none none none' },
        })
      })
    },
    { scope: rootRef }
  )

  return (
    <div ref={rootRef}>
      <ProductHero
        eyebrow={`${FRAOS.name} · ${product.shortName}`}
        headline={product.headline}
        tagline={product.tagline}
        price={product.price}
        period={product.period}
        comingSoon={comingSoon}
        buyHref={buyHref}
        purchasable={purchasable}
        shortName={product.shortName}
        mediaSrc={MEDIA.remote}
        mediaAlt="Borean Control Client — Remote console with tonight's schedule, current sessions, and live telescope status"
      />

      <ProductStickyNav
        items={FRAOS_STORY_NAV}
        productName={product.name}
        shortName={product.shortName}
        buyHref={buyHref}
        purchasable={purchasable}
      />

      {/* Two apps + hub */}
      <section id="apps" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Two apps. One private hub."
          subheadline="No VPN. No screen sharing."
          intro="Control Client plans and monitors from anywhere. Borean Station runs at the pier and drives NINA. Every license gets a dedicated cloud hub on www.boreanastro.com."
        />
        <div data-reveal-item className="mt-16">
          <ProductHubDiagram />
        </div>
      </section>

      {/* Plan — pinned Remote console */}
      <section id="plan" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Plan the night in seconds."
          subheadline="See tonight before you sleep."
          intro="The Remote console is your command center — schedule on the left, the live queue in the middle, your rig on the right."
        />
        <ProductPlanCallouts
          mediaSrc={MEDIA.remote}
          mediaAlt="Remote console showing tonight's schedule, current sessions, and telescope status"
        />
      </section>

      {/* Create session */}
      <section data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Build a session like a pro."
          subheadline="From target to filters to frames."
          intro="One form turns a catalog search into a fully planned imaging run — and Project Mode stretches it across nights."
        />
        <div data-reveal-item className="page-shell mt-14">
          <ProductMediaFrame
            src={MEDIA.createSession}
            alt="New Imaging Session form beside tonight's schedule"
            aspect="hero"
            className="mx-auto max-w-5xl"
          />
        </div>
        <div className="page-shell">
          <ProductFeatureGrid features={CREATE_SESSION_FEATURES} columns={3} />
        </div>
      </section>

      {/* Automate / execute */}
      <section id="execute" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Let the scheduler think."
          subheadline="Weather, altitude, and the Moon — handled."
          intro="FRAOS places each session where it actually fits, or holds it until conditions improve."
        />
        <ProductSchedulerMindMap />
      </section>

      {/* Atlas */}
      <section id="sky" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Know your sky."
          subheadline="Then send a target to Remote in one tap."
          intro="Atlas is an interactive sky map built for imagers — search, frame, and push coordinates straight into a new session."
        />
        <div data-reveal-item className="page-shell mt-14">
          <ProductMediaFrame
            src={MEDIA.atlas}
            alt="Atlas interactive sky map with planets, horizon, and the Milky Way"
            aspect="hero"
            className="mx-auto max-w-5xl"
          />
          <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
            {ATLAS_CHIPS.map((chip) => (
              <span
                key={chip}
                className="lg-surface-sm inline-flex items-center rounded-full px-3 py-1 text-xs text-muted"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div className="page-shell">
          <ProductFeatureGrid features={ATLAS_FEATURES} columns={3} />
        </div>
      </section>

      {/* Night mode — signature interactive moment */}
      <section id="night" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Protect your night vision."
          subheadline="One switch turns the whole app red."
          intro="Night mode shifts every screen to deep red so you can check the plan at the eyepiece without losing dark adaptation."
        />
        <div data-reveal-item className="mt-16">
          <ProductNightToggle
            daySrc={MEDIA.atlas}
            nightSrc={MEDIA.atlasNight}
            dayAlt="Atlas in standard dark mode"
            nightAlt="Atlas in red night-vision mode"
          />
        </div>
      </section>

      {/* Weather */}
      <section id="weather" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Read the weather."
          subheadline="Know if tonight is worth staying up."
          intro="Forecast, radar, and satellite cloud cover — aligned with the same gates the scheduler uses."
        />
        <div data-reveal-item className="page-shell mt-14">
          <ProductMediaFrame
            src={MEDIA.weather}
            alt="Weather dashboard with tonight's grid, precipitation radar, and NOAA cloud map"
            aspect="hero"
            className="mx-auto max-w-5xl"
          />
        </div>
        <div className="page-shell">
          <ProductFeatureGrid features={WEATHER_FEATURES} columns={3} />
        </div>
      </section>

      {/* Station */}
      <section id="station" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Run unattended."
          subheadline="Close the laptop. The observatory keeps working."
          intro="Borean Station polls your hub, delivers sequences to NINA, and streams progress back to Control."
        />
        <div data-reveal-item className="page-shell mt-14">
          <ProductMediaFrame
            src={MEDIA.station}
            alt="Borean Station dashboard with system checks, agent log, license, and settings"
            aspect="station"
            className="mx-auto max-w-5xl"
          />
        </div>
        <div className="page-shell">
          <ProductFeatureGrid features={STATION_FEATURES} columns={4} />
        </div>
      </section>

      {/* Cloud */}
      <section id="cloud" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <ProductChapterHeading
          headline="Your data. Your hub."
          subheadline="Not a shared account."
          intro="Every license embeds a tenant on Borean Astro cloud. Sessions, audit, and delivery flow through your hub — isolated from everyone else."
        />
        <p data-reveal-item className="mx-auto mt-6 max-w-2xl px-5 text-center text-base text-muted">
          {fraosStorageLine(plan)}
        </p>
        <div className="page-shell">
          <ProductFeatureGrid features={CLOUD_FEATURES} columns={3} />
        </div>
      </section>

      {/* Tier delta */}
      <section data-reveal className="scroll-mt-24 border-y border-white/10 py-20 md:py-28">
        <div className="page-shell grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <div data-reveal-item>
            <p className="label-caps">{product.name}</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-fg md:text-4xl">
              {tierDelta.headline}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">{tierDelta.body}</p>
            <ul className="mt-8 space-y-3">
              {tierDelta.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-muted">
                  <span className="text-fg" aria-hidden>
                    ✦
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal-item>
            <ProductMediaFrame
              src={MEDIA.remote}
              alt={`${product.name} in Control Client`}
              aspect="hero"
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" data-reveal className="scroll-mt-24 py-24 md:py-32">
        <div className="page-shell">
          <h2
            data-reveal-item
            className="text-center font-display text-3xl font-bold tracking-tight text-fg md:text-4xl"
          >
            Questions? Answers.
          </h2>
          <ProductFAQ items={faqItems} />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-white/10 py-20 md:py-24">
        <div className="page-shell-narrow text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-fg md:text-4xl">
            {purchasable ? `Get ${product.shortName}` : `${product.shortName} is coming soon`}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">{product.tierBlurb}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {purchasable ? (
              <Link href={buyHref} className="btn-primary px-10 py-3.5">
                Buy {product.shortName}
              </Link>
            ) : (
              <span className="btn-secondary cursor-default px-10 py-3.5 opacity-70">Coming soon</span>
            )}
            <Link href="/fraos" className="btn-secondary px-10 py-3.5">
              Compare all tiers
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
