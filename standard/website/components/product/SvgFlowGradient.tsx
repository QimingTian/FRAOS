/** Matches `.hub-connector` — 2.4s linear sweep, soft transparent→bright→transparent band. */
export const FLOW_SWEEP_DURATION = '2.4s'

type FlowGradientDefProps = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * Sliding gradient band for SVG strokes. Stop offsets animate in lockstep so the
 * pulse is fully off-path at both loop endpoints — no dash-offset snap on repeat.
 */
export function FlowGradientDef({ id, x1, y1, x2, y2 }: FlowGradientDefProps) {
  const animate = {
    attributeName: 'offset' as const,
    dur: FLOW_SWEEP_DURATION,
    repeatCount: 'indefinite' as const,
    calcMode: 'linear' as const,
    keyTimes: '0;1',
  }

  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop stopColor="rgba(150, 180, 240, 0)">
        <animate {...animate} values="-0.35;0.95" />
      </stop>
      <stop stopColor="rgba(150, 180, 240, 0.9)">
        <animate {...animate} values="-0.175;1.075" />
      </stop>
      <stop stopColor="rgba(150, 180, 240, 0)">
        <animate {...animate} values="0;1.15" />
      </stop>
    </linearGradient>
  )
}
