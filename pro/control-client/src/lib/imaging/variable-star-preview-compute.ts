import { currentAltitudeDeg, MIN_ALTITUDE_DEG } from '../site/target-altitude'
import { getTonightAstronomicalNightWindow } from '../site/sunrise-window'

const DAY_MS = 86_400_000
const DEFAULT_FAINT = 15
const DEFAULT_BRIGHT = 12

export type VariableStarPreviewInput = {
  raHours: number
  decDeg: number
  periodDays: number | null
  minMag: number | null
  maxMag: number | null
}

function magLimits(m: VariableStarPreviewInput): { faint: number; bright: number } {
  const a = m.minMag != null && Number.isFinite(m.minMag) ? m.minMag : DEFAULT_FAINT
  const b = m.maxMag != null && Number.isFinite(m.maxMag) ? m.maxMag : DEFAULT_BRIGHT
  return { faint: Math.max(a, b), bright: Math.min(a, b) }
}

export function syntheticMagnitude(
  tMs: number,
  t0Ms: number,
  periodDays: number,
  faint: number,
  bright: number
): number {
  const days = (tMs - t0Ms) / DAY_MS
  const p = ((days % periodDays) + periodDays) % periodDays
  const phase = p / periodDays
  const mid = 0.5 * (bright + faint)
  const amp = 0.5 * (faint - bright)
  return mid + amp * Math.sin(2 * Math.PI * phase)
}

function sampleCountForSpanDays(spanDays: number): number {
  const durMin = spanDays * 24 * 60
  const maxPoints = 2500
  if (durMin <= maxPoints) return Math.min(maxPoints, Math.max(200, Math.floor(durMin)))
  return Math.min(maxPoints, Math.max(200, Math.floor(spanDays * 48)))
}

/** Map a **duration** in days to axis value and pick a human label. */
function axisForSpanDays(spanDays: number): { label: string; daysToAxis: (d: number) => number } {
  if (spanDays < 2 / 24) {
    return { label: 'minutes', daysToAxis: (d) => d * 24 * 60 }
  }
  if (spanDays < 3) {
    return { label: 'hours', daysToAxis: (d) => d * 24 }
  }
  if (spanDays < 21) {
    return { label: 'days', daysToAxis: (d) => d }
  }
  if (spanDays < 120) {
    return { label: 'weeks', daysToAxis: (d) => d / 7 }
  }
  if (spanDays < 800) {
    return { label: 'months', daysToAxis: (d) => d / (365.25 / 12) }
  }
  return { label: 'years', daysToAxis: (d) => d / 365.25 }
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(1)
  if (a >= 10) return v.toFixed(2)
  if (a >= 1) return v.toFixed(3)
  return v.toPrecision(4)
}

export type LightCurvePreview = {
  mag: number[]
  /** 0 … xMax in the same unit as `axisLabel` (not wall time). */
  x: number[]
  xMax: number
  axisLabel: string
  periodTitle: string
  periodDays: number
}

export function computeLightCurvePreview(
  star: VariableStarPreviewInput,
  t0: Date = new Date()
): LightCurvePreview | null {
  const periodDays = star.periodDays
  if (periodDays == null || periodDays <= 0) return null
  const spanDays = 2 * periodDays
  const { label, daysToAxis } = axisForSpanDays(spanDays)
  const xMax = daysToAxis(spanDays)
  const periodTitle = `Period -- ${fmt(periodDays)} Day`

  const { faint, bright } = magLimits(star)
  const n = sampleCountForSpanDays(spanDays)
  const t0Ms = t0.getTime()
  const x: number[] = new Array(n)
  const mag: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1)
    const offsetDays = u * spanDays
    const tMs = t0Ms + offsetDays * DAY_MS
    x[i] = u * xMax
    mag[i] = syntheticMagnitude(tMs, t0Ms, periodDays, faint, bright)
  }
  return {
    mag,
    x,
    xMax,
    axisLabel: label,
    periodTitle,
    periodDays,
  }
}

export type TonightPreview =
  | {
      ok: true
      tMs: number[]
      altDeg: number[]
      mag: number[] | null
      duskMs: number
      dawnMs: number
      faint: number
      bright: number
      hasPeriod: boolean
      t0Ms: number
    }
  | { ok: false; reason: string }

export function computeTonightPreview(
  star: VariableStarPreviewInput,
  now: Date = new Date(),
  t0ForPhase: Date = now
): TonightPreview {
  const { astronomicalDuskUtc, astronomicalDawnUtc } = getTonightAstronomicalNightWindow(now)
  const duskMs = astronomicalDuskUtc.getTime()
  const dawnMs = astronomicalDawnUtc.getTime()
  if (!(dawnMs > duskMs)) {
    return { ok: false, reason: 'No usable astronomical night window for this date.' }
  }
  const { faint, bright } = magLimits(star)
  const periodDays = star.periodDays
  const hasPeriod = periodDays != null && periodDays > 0
  const t0Ms = t0ForPhase.getTime()

  const spanMs = dawnMs - duskMs
  const n = Math.min(2500, Math.max(200, Math.floor(spanMs / 60000)))
  const tMs: number[] = new Array(n)
  const altDeg: number[] = new Array(n)
  const mag: number[] | null = hasPeriod ? new Array(n) : null
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1)
    const ms = duskMs + u * spanMs
    tMs[i] = ms
    altDeg[i] = currentAltitudeDeg(star.raHours, star.decDeg, new Date(ms))
    if (mag && periodDays != null) {
      mag[i] = syntheticMagnitude(ms, t0Ms, periodDays, faint, bright)
    }
  }
  const maxAlt = altDeg.length > 0 ? Math.max(...altDeg) : 0
  if (maxAlt < MIN_ALTITUDE_DEG) {
    return { ok: false, reason: 'Target Not Observable Tonight' }
  }
  return {
    ok: true,
    tMs,
    altDeg,
    mag,
    duskMs,
    dawnMs,
    faint,
    bright,
    hasPeriod,
    t0Ms,
  }
}

export function buildAltitudeMagFillPaths(
  tMs: number[],
  altDeg: number[],
  mag: number[],
  x: (ms: number) => number,
  yMag: (magv: number) => number,
  faint: number,
  thresholdDeg: number = MIN_ALTITUDE_DEG
): string[] {
  const runs: Array<[number, number]> = []
  let s = -1
  for (let i = 0; i < tMs.length; i++) {
    const ok = altDeg[i] >= thresholdDeg
    if (ok) {
      if (s < 0) s = i
    } else if (s >= 0) {
      runs.push([s, i - 1])
      s = -1
    }
  }
  if (s >= 0) runs.push([s, tMs.length - 1])
  const paths: string[] = []
  for (const [a, b] of runs) {
    if (b <= a) continue
    let d = ''
    for (let i = a; i <= b; i++) {
      const xi = x(tMs[i]!)
      const yi = yMag(mag[i]!)
      d += (i === a ? 'M' : 'L') + `${xi.toFixed(2)},${yi.toFixed(2)} `
    }
    for (let i = b; i >= a; i--) {
      const xi = x(tMs[i]!)
      const yf = yMag(faint)
      d += `L${xi.toFixed(2)},${yf.toFixed(2)} `
    }
    d += 'Z'
    paths.push(d.trim())
  }
  return paths
}
