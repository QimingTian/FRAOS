'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { StoryNavItem } from '@/lib/fraos-product-story'

const HEADER_OFFSET = 64 // matches SiteHeader h-16 / top-16

type ProductStickyNavProps = {
  items: StoryNavItem[]
  productName: string
  shortName: string
  buyHref: string
  purchasable: boolean
}

export function ProductStickyNav({
  items,
  productName,
  shortName,
  buyHref,
  purchasable,
}: ProductStickyNavProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? 'overview')
  const [stuck, setStuck] = useState(false)
  const [navHeight, setNavHeight] = useState(0)
  const anchorRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)

  // Avoid CSS position:sticky — Safari keeps a ghost bar at top-16 after
  // scrolling to the bottom and back. Use fixed only once the anchor passes
  // the header, driven by getBoundingClientRect (not IntersectionObserver,
  // which falsely reads "stuck" when the anchor is below the viewport).
  useEffect(() => {
    const anchor = anchorRef.current
    const nav = navRef.current
    if (!anchor || !nav) return

    const measure = () => setNavHeight(nav.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)

    const update = () => {
      setStuck(anchor.getBoundingClientRect().top < HEADER_OFFSET)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el != null)
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target.id) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.5] },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [items])

  return (
    <div ref={anchorRef}>
      {stuck && navHeight > 0 ? <div style={{ height: navHeight }} aria-hidden /> : null}
      <nav
        ref={navRef}
        className={
          stuck
            ? 'fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-bg'
            : 'relative z-40 bg-transparent'
        }
        aria-label={`${productName} sections`}
      >
        <div className="page-shell flex items-center gap-4">
          <span className="hidden shrink-0 font-display text-sm font-semibold text-fg lg:block">
            {productName}
          </span>
          <div className="-mx-1 flex-1 overflow-x-auto">
            <ul className="flex min-w-max items-center gap-1 py-3">
              {items.map((item) => {
                const active = activeId === item.id
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
                        active ? 'bg-surface text-fg' : 'text-muted hover:bg-surface/60 hover:text-fg'
                      }`}
                      onClick={() => setActiveId(item.id)}
                    >
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
          {purchasable ? (
            <Link
              href={buyHref}
              className="hidden shrink-0 rounded-full bg-fg px-5 py-1.5 text-sm font-semibold text-bg transition hover:opacity-90 sm:inline-flex"
            >
              Buy
            </Link>
          ) : (
            <span className="hidden shrink-0 rounded-full border border-white/20 px-5 py-1.5 text-sm text-muted sm:inline-flex">
              Soon
            </span>
          )}
        </div>
      </nav>
    </div>
  )
}
