'use client'

import Image from 'next/image'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { FlowGradientDef } from './SvgFlowGradient'

type Anchor = { x: number; y: number }

type CalloutSpec = {
  id: string
  side: 'left' | 'right'
  /** Normalized anchor on the screenshot image (0–1), tuned to remote.png UI regions. */
  anchor: Anchor
  title: string
  body: string
}

const CALLOUTS: CalloutSpec[] = [
  {
    id: 'schedule',
    side: 'left',
    anchor: { x: 0.165, y: 0.62 },
    title: "Tonight's schedule",
    body: 'Sunset to sunrise on one strip. Weather-permitted hours, twilight boundaries, and every scheduled session block — at a glance.',
  },
  {
    id: 'sessions',
    side: 'left',
    anchor: { x: 0.46, y: 0.62 },
    title: 'Current sessions',
    body: 'Pending, scheduled, in progress, completed, failed. Check progress, edit, or delete any row without leaving the console.',
  },
  {
    id: 'telescope',
    side: 'right',
    anchor: { x: 0.835, y: 0.58 },
    title: 'Live telescope status',
    body: 'A 3D view of your mount and dome, with connection and tracking state updating in real time.',
  },
  {
    id: 'estop',
    side: 'right',
    anchor: { x: 0.645, y: 0.112 },
    title: 'One safety switch',
    body: 'Emergency STOP halts the sequence and parks the rig instantly — from anywhere you happen to be.',
  },
]

type LinePath = {
  id: string
  d: string
  ax: number
  ay: number
  ex: number
  ey: number
}

type ProductPlanCalloutsProps = {
  mediaSrc: string
  mediaAlt: string
}

/** Nearest point on a rectangle border toward an external target. */
function borderPointToward(
  rect: DOMRect,
  rootRect: DOMRect,
  targetX: number,
  targetY: number,
  preferSide: 'left' | 'right',
) {
  const left = rect.left - rootRect.left
  const top = rect.top - rootRect.top
  const right = left + rect.width
  const bottom = top + rect.height
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2

  const edgeX = preferSide === 'left' ? right : left
  const t = (edgeX - targetX) / (cx - targetX || 1)
  let y = targetY + t * (cy - targetY)
  y = Math.max(top + 12, Math.min(bottom - 12, y))
  return { x: edgeX, y }
}

export function ProductPlanCallouts({ mediaSrc, mediaAlt }: ProductPlanCalloutsProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [paths, setPaths] = useState<LinePath[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const measure = () => {
      const rootRect = root.getBoundingClientRect()
      const img = imgRef.current
      if (!img) return

      const imgRect = img.getBoundingClientRect()
      if (imgRect.width < 8 || imgRect.height < 8) return

      const next: LinePath[] = []

      for (const callout of CALLOUTS) {
        const card = cardRefs.current[callout.id]
        if (!card) continue

        const ax = imgRect.left - rootRect.left + callout.anchor.x * imgRect.width
        const ay = imgRect.top - rootRect.top + callout.anchor.y * imgRect.height
        const cardRect = card.getBoundingClientRect()
        const end = borderPointToward(cardRect, rootRect, ax, ay, callout.side)

        const mx = (ax + end.x) / 2
        const my = (ay + end.y) / 2 - (callout.side === 'left' ? 22 : -22)
        const d = `M ${ax} ${ay} Q ${mx} ${my} ${end.x} ${end.y}`

        next.push({ id: callout.id, d, ax, ay, ex: end.x, ey: end.y })
      }

      setPaths(next)
      setReady(next.length > 0)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    if (imgRef.current) ro.observe(imgRef.current)
    window.addEventListener('resize', measure, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const left = CALLOUTS.filter((c) => c.side === 'left')
  const right = CALLOUTS.filter((c) => c.side === 'right')

  return (
    <div ref={rootRef} className="page-shell relative mt-16 md:mt-20">
      <div className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)] lg:items-center lg:gap-x-10 xl:gap-x-14">
        <div className="hidden flex-col gap-10 lg:flex">
          {left.map((callout) => (
            <CalloutCard
              key={callout.id}
              callout={callout}
              ref={(el) => {
                cardRefs.current[callout.id] = el
              }}
            />
          ))}
        </div>

        <div className="product-frame-wrap mx-auto w-full">
          <div className="product-frame relative aspect-[1024/639] shadow-2xl">
            <Image
              ref={imgRef}
              src={mediaSrc}
              alt={mediaAlt}
              fill
              sizes="(min-width: 1280px) 960px, 100vw"
              className="object-contain object-top"
              onLoad={() => {
                requestAnimationFrame(() => {
                  window.dispatchEvent(new Event('resize'))
                })
              }}
            />
          </div>
        </div>

        <div className="hidden flex-col gap-10 lg:flex">
          {right.map((callout) => (
            <CalloutCard
              key={callout.id}
              callout={callout}
              ref={(el) => {
                cardRefs.current[callout.id] = el
              }}
            />
          ))}
        </div>
      </div>

      {/* Lines and anchor dots sit above the grid — previously z-0 put them behind the screenshot. */}
      <svg
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-30 hidden h-full w-full overflow-visible lg:block ${
          ready ? 'opacity-100' : 'opacity-0'
        } transition-opacity duration-500`}
      >
        {paths.map((path) => {
          const gradId = `plan-flow-${path.id}`
          return (
            <g key={path.id}>
              <defs>
                <FlowGradientDef id={gradId} x1={path.ax} y1={path.ay} x2={path.ex} y2={path.ey} />
              </defs>
              <path d={path.d} className="plan-callout-edge" fill="none" />
              <path
                d={path.d}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle cx={path.ax} cy={path.ay} r={4} className="fill-white/80" />
              <circle cx={path.ax} cy={path.ay} r={8} className="fill-none stroke-white/30" strokeWidth={1} />
            </g>
          )
        })}
      </svg>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:hidden">
        {CALLOUTS.map((callout) => (
          <CalloutCard key={callout.id} callout={callout} compact />
        ))}
      </div>
    </div>
  )
}

type CalloutCardProps = {
  callout: CalloutSpec
  compact?: boolean
}

const CalloutCard = forwardRef<HTMLDivElement, CalloutCardProps>(function CalloutCard(
  { callout, compact = false },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`glass-card ${compact ? 'p-5' : 'p-6'}`}
    >
      <h3 className={`font-display font-semibold tracking-tight text-fg ${compact ? 'text-lg' : 'text-xl'}`}>
        {callout.title}
      </h3>
      <p className={`mt-2 leading-relaxed text-muted ${compact ? 'text-sm' : 'text-[15px]'}`}>{callout.body}</p>
    </div>
  )
})
