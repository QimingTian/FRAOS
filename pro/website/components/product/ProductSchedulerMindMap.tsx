'use client'

import { FlowGradientDef } from './SvgFlowGradient'

type WebNode = {
  id: string
  label: string
  x: number
  y: number
}

/**
 * Scheduler gates & factors — aligned with lib/imaging/* and Pomfret README §13.
 * Positions in a 1400×900 viewBox; spread out so pills do not overlap.
 */
const NODES: WebNode[] = [
  // Per-hour weather
  { id: 'cloud', label: 'Cloud < 10%', x: 120, y: 90 },
  { id: 'precip', label: 'Precip < 10%', x: 330, y: 48 },
  { id: 'wind', label: 'Wind ≤ 10 m/s', x: 70, y: 235 },
  { id: 'clearRun', label: '2 clear hours', x: 270, y: 195 },
  { id: 'globalWx', label: 'Global weather block', x: 500, y: 68 },
  { id: 'nautical', label: 'Nautical dusk→dawn', x: 710, y: 45 },
  // Altitude
  { id: 'alt30', label: '30° altitude', x: 920, y: 88 },
  { id: 'altCov', label: '100% alt coverage', x: 1140, y: 130 },
  { id: 'rise', label: 'Target rise time', x: 1260, y: 235 },
  // Moon avoidance
  { id: 'lorentz', label: 'Moon Lorentzian', x: 1020, y: 340 },
  { id: 'filterMoon', label: 'Filter moon tiers', x: 820, y: 295 },
  { id: 'moonRelax', label: 'Moon relaxations', x: 610, y: 235 },
  { id: 'varStar', label: 'Var star exempt', x: 400, y: 345 },
  { id: 'dsoAll', label: 'All filters pass', x: 1220, y: 400 },
  // Cross-spell & queue
  { id: 'spell80', label: '80% weather spell', x: 190, y: 405 },
  { id: 'fifo', label: 'FIFO createdAt', x: 105, y: 545 },
  { id: 'earliest', label: 'Earliest free slot', x: 330, y: 505 },
  { id: 'committed', label: 'Committed slots', x: 560, y: 475 },
  { id: 'altHold', label: 'Project alt hold', x: 790, y: 505 },
  { id: 'project', label: 'Project mode', x: 1010, y: 475 },
  // Outcomes & ops
  { id: 'pending', label: 'Pending', x: 650, y: 625 },
  { id: 'scheduled', label: 'Scheduled', x: 920, y: 665 },
  { id: 'unsched', label: 'Unscheduled', x: 1150, y: 610 },
  { id: 'reconcile', label: 'Reconcile ~6 min', x: 210, y: 710 },
  { id: 'estop', label: 'Emergency STOP', x: 440, y: 755 },
  { id: 'nina', label: 'NINA 5-min early', x: 830, y: 790 },
  { id: 'admin', label: 'Admin closed', x: 1310, y: 105 },
]

/** Semantic edges only — each link reflects a real dependency in the scheduler. */
const EDGES: [string, string][] = [
  ['cloud', 'precip'],
  ['cloud', 'wind'],
  ['cloud', 'clearRun'],
  ['cloud', 'spell80'],
  ['precip', 'globalWx'],
  ['precip', 'spell80'],
  ['wind', 'globalWx'],
  ['wind', 'spell80'],
  ['clearRun', 'globalWx'],
  ['globalWx', 'nautical'],
  ['globalWx', 'unsched'],
  ['globalWx', 'pending'],
  ['nautical', 'alt30'],
  ['alt30', 'altCov'],
  ['alt30', 'rise'],
  ['altCov', 'spell80'],
  ['altCov', 'earliest'],
  ['rise', 'earliest'],
  ['rise', 'nina'],
  ['lorentz', 'filterMoon'],
  ['lorentz', 'moonRelax'],
  ['filterMoon', 'dsoAll'],
  ['filterMoon', 'project'],
  ['moonRelax', 'lorentz'],
  ['varStar', 'filterMoon'],
  ['dsoAll', 'unsched'],
  ['dsoAll', 'pending'],
  ['spell80', 'earliest'],
  ['fifo', 'earliest'],
  ['earliest', 'committed'],
  ['committed', 'scheduled'],
  ['altHold', 'project'],
  ['altHold', 'committed'],
  ['project', 'committed'],
  ['project', 'scheduled'],
  ['pending', 'scheduled'],
  ['pending', 'unsched'],
  ['scheduled', 'nina'],
  ['reconcile', 'pending'],
  ['reconcile', 'scheduled'],
  ['estop', 'reconcile'],
  ['estop', 'nina'],
  ['admin', 'committed'],
  ['admin', 'reconcile'],
]

const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<string, WebNode>

export function ProductSchedulerMindMap() {
  return (
    <div className="page-shell mt-14 md:mt-16">
      <div className="relative mx-auto aspect-[1400/900] w-full max-w-[1360px]">
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1400 900"
          preserveAspectRatio="xMidYMid meet"
        >
          {EDGES.map(([a, b], i) => {
            const na = nodeById[a]
            const nb = nodeById[b]
            if (!na || !nb) return null
            const gradId = `sched-flow-${a}-${b}-${i}`
            return (
              <g key={gradId}>
                <defs>
                  <FlowGradientDef id={gradId} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} />
                </defs>
                <line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} className="scheduler-web-edge" />
                <line
                  x1={na.x}
                  y1={na.y}
                  x2={nb.x}
                  y2={nb.y}
                  stroke={`url(#${gradId})`}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </g>
            )
          })}
        </svg>

        {NODES.map((node) => (
          <div
            key={node.id}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-2 text-center backdrop-blur-sm transition-colors hover:border-white/22 hover:bg-white/[0.07]"
            style={{
              left: `${(node.x / 1400) * 100}%`,
              top: `${(node.y / 900) * 100}%`,
            }}
          >
            <span className="font-display text-[13px] font-medium tracking-tight text-fg/90">{node.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
