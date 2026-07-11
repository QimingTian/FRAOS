'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

type ProductNightToggleProps = {
  daySrc: string
  nightSrc: string
  dayAlt: string
  nightAlt: string
}

export function ProductNightToggle({ daySrc, nightSrc, dayAlt, nightAlt }: ProductNightToggleProps) {
  const [night, setNight] = useState(false)
  const [demoed, setDemoed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Auto-demonstrate the switch once when the section first enters view.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || demoed) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setDemoed(true)
          const toNight = window.setTimeout(() => setNight(true), 900)
          const back = window.setTimeout(() => setNight(false), 2600)
          observer.disconnect()
          return () => {
            window.clearTimeout(toNight)
            window.clearTimeout(back)
          }
        }
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [demoed])

  return (
    <div ref={wrapRef} className="page-shell">
      <div className="product-frame-wrap mx-auto max-w-5xl">
        <div className="product-frame aspect-[1024/639]">
          <Image
            src={daySrc}
            alt={dayAlt}
            fill
            sizes="(min-width: 1280px) 1000px, 100vw"
            className="object-cover"
          />
          <Image
            src={nightSrc}
            alt={nightAlt}
            fill
            sizes="(min-width: 1280px) 1000px, 100vw"
            className={`object-cover transition-opacity duration-700 ease-out ${
              night ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center">
        <div
          role="group"
          aria-label="Toggle night mode preview"
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-surface/70 p-1 backdrop-blur"
        >
          <button
            type="button"
            onClick={() => setNight(false)}
            aria-pressed={!night}
            className={`rounded-full px-5 py-2 text-sm transition ${
              !night ? 'bg-fg text-bg' : 'text-muted hover:text-fg'
            }`}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => setNight(true)}
            aria-pressed={night}
            className={`rounded-full px-5 py-2 text-sm transition ${
              night ? 'bg-red-500 text-white' : 'text-muted hover:text-fg'
            }`}
          >
            Night vision
          </button>
        </div>
      </div>
    </div>
  )
}
