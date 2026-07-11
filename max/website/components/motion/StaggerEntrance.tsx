'use client'

import { useRef, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

gsap.registerPlugin(useGSAP)

type StaggerEntranceProps = {
  children: ReactNode
  className?: string
  selector?: string
  stagger?: number
}

export function StaggerEntrance({
  children,
  className = '',
  selector = '[data-stagger]',
  stagger = 0.1,
}: StaggerEntranceProps) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const root = ref.current
      if (!root) return
      const items = root.querySelectorAll(selector)
      if (!items.length) return
      gsap.from(items, {
        y: 24,
        autoAlpha: 0,
        duration: 0.7,
        stagger,
        ease: 'power2.out',
        delay: 0.05,
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
