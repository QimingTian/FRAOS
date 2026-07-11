'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const NODES = [
  { id: 'control', title: 'Control Client', sub: 'macOS · Windows', note: 'Plan & monitor' },
  { id: 'hub', title: 'Cloud Hub', sub: 'www.boreanastro.com', note: 'Your private tenant' },
  { id: 'station', title: 'Station + NINA', sub: 'Observatory PC', note: 'Run the rig' },
]

export function ProductHubDiagram() {
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      gsap.from(root.querySelectorAll('[data-node]'), {
        y: 24,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.15,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 80%', toggleActions: 'play none none none' },
      })
    },
    { scope: rootRef }
  )

  return (
    <div ref={rootRef} className="page-shell">
      <div className="mx-auto flex max-w-4xl flex-col items-stretch md:flex-row md:items-center">
        {NODES.map((node, index) => (
          <div key={node.id} className="contents">
            <div
              data-node
              className="glass-card relative z-10 flex flex-1 flex-col items-center px-6 py-8 text-center"
            >
              <span className="label-caps text-xs">{node.note}</span>
              <h3 className="mt-3 font-display text-xl font-semibold text-fg">{node.title}</h3>
              <p className="mt-1 text-sm text-muted">{node.sub}</p>
            </div>
            {index < NODES.length - 1 ? (
              <div
                data-node
                className="flex shrink-0 items-center justify-center"
                aria-hidden
              >
                <div className="hub-connector hub-connector-h hidden md:block" />
                <div className="hub-connector hub-connector-v md:hidden" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-xl text-center text-sm text-muted/80">
        No VPN. No screen sharing. Each app authenticates only to your hub.
      </p>
    </div>
  )
}
