'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type ProductHeroProps = {
  eyebrow: string
  headline: string
  tagline: string
  price: string
  period: string
  comingSoon: boolean
  buyHref: string
  purchasable: boolean
  shortName: string
  mediaSrc: string
  mediaAlt: string
}

export function ProductHero({
  eyebrow,
  headline,
  tagline,
  price,
  period,
  comingSoon,
  buyHref,
  purchasable,
  shortName,
  mediaSrc,
  mediaAlt,
}: ProductHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return

      gsap.from(root.querySelectorAll('[data-hero]'), {
        y: 30,
        autoAlpha: 0,
        duration: 0.85,
        stagger: 0.09,
        ease: 'power3.out',
      })

      const media = root.querySelector('[data-hero-media]')
      if (media) {
        gsap.fromTo(
          media,
          { scale: 0.92, y: 40, autoAlpha: 0 },
          {
            scale: 1,
            y: 0,
            autoAlpha: 1,
            duration: 1.1,
            delay: 0.25,
            ease: 'power3.out',
          }
        )
        // Subtle parallax drift as the hero scrolls away.
        gsap.to(media, {
          yPercent: -6,
          ease: 'none',
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        })
      }
    },
    { scope: rootRef }
  )

  return (
    <section
      id="overview"
      ref={rootRef}
      className="scroll-mt-24 overflow-hidden pb-2 pt-16 text-center md:pt-24"
    >
      <div className="page-shell">
        <p data-hero className="label-caps">
          {eyebrow}
        </p>
        <h1
          data-hero
          className="mx-auto mt-4 max-w-4xl font-display text-5xl font-bold tracking-tight text-fg md:text-7xl"
        >
          {headline}
        </h1>
        <p data-hero className="mx-auto mt-5 max-w-2xl text-lg text-muted md:text-xl">
          {tagline}
        </p>
        <p data-hero className="mt-5 font-display text-2xl text-fg md:text-3xl">
          {price === 'Custom' ? 'Custom pricing' : price}
          <span className="ml-2 text-base font-sans font-normal text-muted md:text-lg">{period}</span>
        </p>
        {comingSoon ? (
          <p data-hero className="mt-3 text-sm text-amber-200/90">
            In development — checkout opens when this tier launches.
          </p>
        ) : null}
        <div data-hero className="mt-8 flex flex-wrap justify-center gap-3">
          {purchasable ? (
            <Link href={buyHref} className="btn-primary px-8">
              Buy {shortName}
            </Link>
          ) : (
            <span className="btn-secondary cursor-default px-8 opacity-70">Coming soon</span>
          )}
          <Link href="/fraos" className="btn-secondary px-8">
            Compare tiers
          </Link>
        </div>
      </div>

      <div className="page-shell mt-12 md:mt-16">
        <div data-hero-media className="product-frame-wrap mx-auto max-w-6xl">
          <div className="product-frame aspect-[1024/639]">
            <Image
              src={mediaSrc}
              alt={mediaAlt}
              fill
              priority
              sizes="(min-width: 1280px) 1200px, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
