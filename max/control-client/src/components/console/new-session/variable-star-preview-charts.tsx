import { useMemo } from 'react'
import {
  buildAltitudeMagFillPaths,
  computeLightCurvePreview,
  computeTonightPreview,
  type VariableStarPreviewInput,
} from '../../../lib/imaging/variable-star-preview-compute'
import { MIN_ALTITUDE_DEG } from '../../../lib/site/target-altitude'

export type VariableStarChartStar = VariableStarPreviewInput & { name: string }

type Props = { star: VariableStarChartStar | null }

const VB_W = 420
const PAD_T = 28
const VB_H = 168

const AXIS_TICK = 4
const AXIS_TEXT_SIZE = 8
const AXIS_LABEL_GAP = 2
const TEXT_CHAR_W = AXIS_TEXT_SIZE * 0.6
const Y_LABEL_MAX_CHARS = 9 // e.g. "-12.34 mag"

/**
 * Centering includes coordinate text: reserve margins for labels/ticks so
 * the whole chart content (axes + coordinates + curves) is visually centered.
 */
const PAD_L = Math.ceil(Y_LABEL_MAX_CHARS * TEXT_CHAR_W + AXIS_TICK + AXIS_LABEL_GAP + 2)
const PAD_R = PAD_L
const PAD_B = Math.ceil(AXIS_TICK + AXIS_LABEL_GAP + AXIS_TEXT_SIZE + 4)

const plotW = VB_W - PAD_L - PAD_R
const plotH = VB_H - PAD_T - PAD_B

const xTickY0 = PAD_T + plotH
const xTickY1 = xTickY0 + AXIS_TICK
/** X numeric tick labels sit just below the axis. */
const xAxisTickTextY = xTickY0 + 10

function equalIntervalTicks0(xMax: number, count: number): number[] {
  if (count < 2 || xMax <= 0) return [0]
  return Array.from({ length: count }, (_, i) => (xMax * i) / (count - 1))
}

function formatTickNum(v: number): string {
  if (!Number.isFinite(v)) return ''
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(1)
  if (a >= 10) return v.toFixed(2)
  if (a >= 1) return v.toFixed(2)
  return v.toPrecision(3)
}

function axisUnitSuffix(axisLabel: string): string {
  const key = axisLabel.trim().toLowerCase()
  if (key === 'minutes') return 'm'
  if (key === 'hours') return 'h'
  if (key === 'days') return 'd'
  if (key === 'weeks') return 'w'
  if (key === 'months') return 'mo'
  if (key === 'years') return 'y'
  return ''
}

function formatTonightXAxisHour(ms: number): string {
  const d = new Date(ms)
  const h24 = d.getHours()
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  return `${h12}${ampm}`
}

/** Altitude polyline only for alt ≥ 0°; breaks at horizon with linear crossing points. */
function buildAltitudePolylineSegmentsAboveHorizon(
  tMs: number[],
  altDeg: number[],
  x: (ms: number) => number,
  yAlt: (alt: number) => number
): string[] {
  const segments: string[] = []
  let buf: Array<[number, number]> = []

  const pushCrossing = (i0: number, i1: number) => {
    const alt0 = altDeg[i0]!
    const alt1 = altDeg[i1]!
    const d = alt0 - alt1
    const t = Math.abs(d) < 1e-9 ? 0.5 : alt0 / d
    const u = Math.max(0, Math.min(1, t))
    const ms0 = tMs[i0]!
    const ms1 = tMs[i1]!
    const ms = ms0 + u * (ms1 - ms0)
    buf.push([x(ms), yAlt(0)])
  }

  const flush = () => {
    if (buf.length >= 2) {
      segments.push(buf.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '))
    }
    buf = []
  }

  for (let i = 0; i < tMs.length; i++) {
    const alt = altDeg[i]!
    const prevAlt = i > 0 ? altDeg[i - 1]! : null

    if (alt >= 0) {
      if (prevAlt !== null && prevAlt < 0) {
        pushCrossing(i - 1, i)
      }
      buf.push([x(tMs[i]!), yAlt(alt)])
    } else if (prevAlt !== null && prevAlt >= 0) {
      pushCrossing(i - 1, i)
      flush()
    } else {
      flush()
    }
  }
  flush()
  return segments
}

function formatMagAxisTick(m: number): string {
  if (!Number.isFinite(m)) return ''
  const a = Math.abs(m)
  if (a >= 10) return m.toFixed(1)
  if (a >= 1) return m.toFixed(2)
  return m.toFixed(2)
}

export function VariableStarPreviewCharts({ star }: Props) {
  const { lc, night } = useMemo(() => {
    if (!star) return { lc: null, night: null as ReturnType<typeof computeTonightPreview> | null }
    const t0 = new Date()
    return {
      lc: computeLightCurvePreview(star, t0),
      night: computeTonightPreview(star, t0, t0),
    }
  }, [star])

  const lcDraw = useMemo(() => {
    if (!lc) return null
    const magPad = 0.35
    let magTop = lc.mag.length ? Math.min(...lc.mag) - magPad : 0
    let magBot = lc.mag.length ? Math.max(...lc.mag) + magPad : 1
    if (magBot - magTop < 1e-6) {
      magBot = magTop + 0.05
    }
    const xPx = (xv: number) => PAD_L + (xv / lc.xMax) * plotW
    const yMag = (m: number) => PAD_T + ((m - magTop) / (magBot - magTop)) * plotH
    const pts = lc.x.map((xv, i) => `${xPx(xv).toFixed(1)},${yMag(lc.mag[i]!).toFixed(1)}`).join(' ')
    const xTicks = equalIntervalTicks0(lc.xMax, 6)
    const yMagTicks = [0, 0.25, 0.5, 0.75, 1].map((u) => magTop + u * (magBot - magTop))
    return {
      magTop,
      magBot,
      yMag,
      pts,
      xPx,
      xTicks,
      yMagTicks,
      periodTitle: lc.periodTitle,
      axisLabel: lc.axisLabel,
    }
  }, [lc])

  const nightPaths = useMemo(() => {
    if (!night || !night.ok) return null
    const { tMs, altDeg, mag, duskMs, dawnMs, faint, bright } = night
    const span = Math.max(1, dawnMs - duskMs)
    const x = (ms: number) => PAD_L + ((ms - duskMs) / span) * plotW
    const yAlt = (alt: number) => PAD_T + ((90 - alt) / 90) * plotH
    const magPad = 0.4
    const magTop = bright - magPad
    const magBot = faint + magPad
    const yMag = (m: number) => PAD_T + ((m - magTop) / (magBot - magTop)) * plotH
    const yMagTicks = [0, 0.25, 0.5, 0.75, 1].map((u) => magTop + u * (magBot - magTop))
    const altSegs = buildAltitudePolylineSegmentsAboveHorizon(tMs, altDeg, x, yAlt)
    const magPts =
      mag && mag.length === tMs.length
        ? tMs.map((ms, i) => `${x(ms).toFixed(1)},${yMag(mag[i]!).toFixed(1)}`).join(' ')
        : null
    const fills =
      mag && mag.length === tMs.length
        ? buildAltitudeMagFillPaths(tMs, altDeg, mag, x, yMag, faint, MIN_ALTITUDE_DEG)
        : []
    const xTickMs = Array.from({ length: 7 }, (_, i) => duskMs + ((dawnMs - duskMs) * i) / 6)
    return { altSegs, magPts, yMag, yMagTicks, fills, duskMs, dawnMs, hasMag: Boolean(magPts), x, xTickMs }
  }, [night])

  if (!star) return null

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <div className="w-full min-w-0 space-y-2">
        {lc && lcDraw ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">{lcDraw.periodTitle}</p>
            <div className="rounded-lg border border-black/10 p-2 dark:border-white/10">
              <svg
                className="block w-full min-w-0 -translate-y-2 translate-x-2 text-gray-600"
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
              >
              <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="none" stroke="currentColor" strokeOpacity={0.2} />
              <line x1={PAD_L} y1={xTickY0} x2={PAD_L + plotW} y2={xTickY0} stroke="currentColor" strokeOpacity={0.35} />
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={xTickY0} stroke="currentColor" strokeOpacity={0.35} />
              {[0.25, 0.5, 0.75].map((u) => {
                const m = lcDraw.magTop + u * (lcDraw.magBot - lcDraw.magTop)
                const y = lcDraw.yMag(m)
                return (
                  <line
                    key={u}
                    x1={PAD_L}
                    y1={y}
                    x2={PAD_L + plotW}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.12}
                  />
                )
              })}
              {lcDraw.yMagTicks.map((m) => {
                const y = lcDraw.yMag(m)
                return (
                  <g key={m}>
                    <line x1={PAD_L - 5} y1={y} x2={PAD_L} y2={y} stroke="currentColor" strokeOpacity={0.45} />
                    <text
                      x={PAD_L - AXIS_TICK - AXIS_LABEL_GAP}
                      y={y}
                      fill="rgb(156 163 175)"
                      fontSize={AXIS_TEXT_SIZE}
                      textAnchor="end"
                      dominantBaseline="middle"
                    >
                      {`${formatMagAxisTick(m)} mag`}
                    </text>
                  </g>
                )
              })}
              <polyline fill="none" stroke="rgb(34 211 238)" strokeWidth="1.4" points={lcDraw.pts} />
                {lcDraw.xTicks.map((xv) => {
                  const xi = lcDraw.xPx(xv)
                  return (
                    <g key={xv}>
                      <line x1={xi} y1={xTickY0} x2={xi} y2={xTickY1} stroke="currentColor" strokeOpacity={0.4} />
                      <text
                        x={xi}
                        y={xAxisTickTextY}
                        fill="rgb(156 163 175)"
                        fontSize={AXIS_TEXT_SIZE}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                      >
                    {`${formatTickNum(xv)}${axisUnitSuffix(lcDraw.axisLabel)}`}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-white">Period</p>
            <p className="py-3 text-center text-sm text-gray-400">Period Not Available</p>
          </>
        )}
      </div>

      <div className="w-full min-w-0 space-y-2">
        {night && night.ok && nightPaths ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">Tonight</p>
            <div className="rounded-lg border border-black/10 p-2 dark:border-white/10">
              <svg
                className="block w-full min-w-0 -translate-y-2 translate-x-2 text-gray-600"
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
              >
              <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="none" stroke="currentColor" strokeOpacity={0.2} />
              <line x1={PAD_L} y1={xTickY0} x2={PAD_L + plotW} y2={xTickY0} stroke="currentColor" strokeOpacity={0.35} />
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={xTickY0} stroke="currentColor" strokeOpacity={0.35} />
              <line
                x1={PAD_L + plotW}
                y1={PAD_T}
                x2={PAD_L + plotW}
                y2={xTickY0}
                stroke="currentColor"
                strokeOpacity={0.25}
              />
              {[0, 30, 60, 90].map((deg) => {
                const y = PAD_T + ((90 - deg) / 90) * plotH
                return (
                  <g key={deg}>
                    <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="currentColor" strokeOpacity={0.08} />
                    <text
                      x={PAD_L + plotW + AXIS_TICK + AXIS_LABEL_GAP}
                      y={y + 3}
                      fill="rgb(156 163 175)"
                      fontSize={AXIS_TEXT_SIZE}
                      textAnchor="start"
                    >
                      {`${deg}°`}
                    </text>
                  </g>
                )
              })}
              {nightPaths.fills.map((d, i) => (
                <path key={i} d={d} fill="rgb(0 230 0)" fillOpacity={0.12} stroke="none" />
              ))}
              {nightPaths.altSegs.map((pts, i) => (
                <polyline
                  key={i}
                  fill="none"
                  stroke="rgb(251 191 36)"
                  strokeWidth="1.35"
                  points={pts}
                />
              ))}
              {nightPaths.magPts ? (
                <polyline fill="none" stroke="rgb(34 211 238)" strokeWidth="1.2" points={nightPaths.magPts} />
              ) : null}
              {nightPaths.hasMag
                ? nightPaths.yMagTicks.map((m) => {
                    const y = nightPaths.yMag(m)
                    return (
                      <g key={m}>
                        <line
                          x1={PAD_L - AXIS_TICK}
                          y1={y}
                          x2={PAD_L}
                          y2={y}
                          stroke="currentColor"
                          strokeOpacity={0.45}
                        />
                        <text
                          x={PAD_L - AXIS_TICK - AXIS_LABEL_GAP}
                          y={y}
                          fill="rgb(156 163 175)"
                          fontSize={AXIS_TEXT_SIZE}
                          textAnchor="end"
                          dominantBaseline="middle"
                        >
                          {`${formatMagAxisTick(m)} mag`}
                        </text>
                      </g>
                    )
                  })
                : null}
                {nightPaths.xTickMs.map((ms) => {
                  const xi = nightPaths.x(ms)
                  return (
                    <g key={ms}>
                      <line x1={xi} y1={xTickY0} x2={xi} y2={xTickY1} stroke="currentColor" strokeOpacity={0.4} />
                      <text
                        x={xi}
                        y={xAxisTickTextY}
                        fill="rgb(156 163 175)"
                        fontSize={AXIS_TEXT_SIZE}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                      >
                        {formatTonightXAxisHour(ms)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        ) : night && !night.ok ? (
          <>
            <p className="text-sm font-medium text-white">Tonight</p>
            <p className="py-3 text-center text-sm text-gray-400">{night.reason}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-white">Tonight</p>
            <p className="py-3 text-center text-sm text-gray-400">Preview unavailable.</p>
          </>
        )}
      </div>
    </div>
  )
}
