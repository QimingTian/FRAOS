'use client'

import { useRef, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type ScrollRevealProps = {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}

export function ScrollReveal({ children, className = '', delay = 0, y = 28 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      gsap.from(el, {
        y,
        autoAlpha: 0,
        duration: 0.75,
        delay,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none',
        },
      })
    },
    { scope: ref }
  )

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
