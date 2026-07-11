import type { FilterPlan, FilterRemaining } from '@/lib/cloud/personal-imaging/types'
import { DSO_SESSION_OVERHEAD_SEC } from '@/lib/imaging/session-overhead'
import { subtractOccupiedFromFree } from '@/lib/imaging/free-intervals'
import {
  altitudeSessionCoverageOk,
  firstAltitudeAllowedTimeMs,
} from '@/lib/imaging/astro/target-altitude'
import { getTonightSchedulingWindow } from '@/lib/imaging/astro/sunrise-window'
import { getTonightScheduleStrip } from '@/lib/imaging/astro/schedule-strip'
import {
  weatherCoverageOk,
  weatherPermittedCoverageMs,
  type TimeInterval,
} from '@/lib/imaging/astro/tonight-weather-gate'
import { moonFilterSessionOk } from '@/lib/imaging/astro/moon-avoidance'

const SESSION_OVERHEAD_MS = DSO_SESSION_OVERHEAD_SEC * 1000
const PLACEMENT_STEP_MS = 5 * 60 * 1000

export type ProjectTarget = {
  raHours: number | null
  decDeg: number | null
  /** Total filter plan for the whole project (frame counts). */
  filterPlansTotal: FilterPlan[]
  createdAt: string
}

export type ProjectTonightPlan = {
  nightKey: string
  nightIndex: number
  filterPlansTonight: FilterPlan[]
  plannedStartIso: string
  plannedEndIso: string
  durationSeconds: number
}

export function tonightDurationSecondsFromPlans(plans: FilterPlan[]): number {
  if (plans.length === 0) return 0
  return plans.reduce((sum, p) => sum + p.count * p.exposureSeconds, 0) + DSO_SESSION_OVERHEAD_SEC
}

function hasRaDec(target: ProjectTarget): target is ProjectTarget & { raHours: number; decDeg: number } {
  return (
    typeof target.raHours === 'number' &&
    Number.isFinite(target.raHours) &&
    typeof target.decDeg === 'number' &&
    Number.isFinite(target.decDeg)
  )
}

/** Fill a time window in filter order (cap each filter by remaining count, skip moon-blocked filters). */
export function planTonightFilterFrames(
  target: ProjectTarget,
  remaining: FilterRemaining[],
  usableStartMs: number,
  usableEndMs: number
): { filterPlansTonight: FilterPlan[]; durationMs: number } {
  const filterPlansTonight: FilterPlan[] = []
  let cursorMs = usableStartMs

  for (const total of target.filterPlansTotal) {
    const row = remaining.find((r) => r.filterName === total.filterName)
    const countRemaining = row?.countRemaining ?? 0
    if (countRemaining <= 0) continue

    if (
      hasRaDec(target) &&
      !moonFilterSessionOk(total.filterName, target.raHours, target.decDeg, usableStartMs, usableEndMs)
    ) {
      continue
    }

    const exposureMs = total.exposureSeconds * 1000
    const windowMs = Math.max(0, usableEndMs - cursorMs)
    if (windowMs < exposureMs + SESSION_OVERHEAD_MS) break

    const maxFrames = Math.floor((windowMs - SESSION_OVERHEAD_MS) / exposureMs)
    const framesTonight = Math.min(countRemaining, maxFrames)
    if (framesTonight <= 0) continue

    filterPlansTonight.push({
      filterName: total.filterName,
      exposureSeconds: total.exposureSeconds,
      count: framesTonight,
    })
    cursorMs += framesTonight * exposureMs
  }

  const durationMs =
    filterPlansTonight.reduce((s, p) => s + p.count * p.exposureSeconds, 0) * 1000 + SESSION_OVERHEAD_MS
  return { filterPlansTonight, durationMs }
}

function minExposureMs(target: ProjectTarget): number {
  let min = Infinity
  for (const p of target.filterPlansTotal) {
    if (p.exposureSeconds > 0) min = Math.min(min, p.exposureSeconds * 1000)
  }
  return Number.isFinite(min) ? min : 60_000
}

function shrinkFilterPlansByOneFrame(plans: FilterPlan[]): FilterPlan[] | null {
  for (let i = plans.length - 1; i >= 0; i--) {
    const row = plans[i]!
    if (row.count > 1) {
      return plans.map((p, j) => (j === i ? { ...p, count: p.count - 1 } : p))
    }
  }
  if (plans.length <= 1) return null
  return plans.slice(0, -1)
}

function subtractRemaining(remaining: FilterRemaining[], shot: FilterPlan[]): FilterRemaining[] {
  return remaining.map((r) => {
    const used = shot.find((p) => p.filterName === r.filterName)
    if (!used) return r
    return { ...r, countRemaining: Math.max(0, r.countRemaining - used.count) }
  })
}

function findPlacementStart(
  target: ProjectTarget,
  freeIntervals: Array<{ startMs: number; endMs: number }>,
  durationMs: number,
  weatherPermittedIntervals: TimeInterval[],
  nowMs: number,
  windowStartMs: number,
  deadlineMs: number
): number | null {
  const createdMs = Number.isFinite(Date.parse(target.createdAt)) ? Date.parse(target.createdAt) : nowMs

  for (const interval of freeIntervals) {
    const baselineStartMs = Math.max(interval.startMs, createdMs, nowMs, windowStartMs)
    const lastStartMs = Math.min(interval.endMs, deadlineMs) - durationMs
    if (lastStartMs < baselineStartMs) continue

    for (let cand = baselineStartMs; cand <= lastStartMs; cand += PLACEMENT_STEP_MS) {
      let startMs = cand
      if (hasRaDec(target)) {
        const riseAt = firstAltitudeAllowedTimeMs(
          target.raHours,
          target.decDeg,
          startMs,
          Math.min(interval.endMs, deadlineMs)
        )
        if (riseAt == null) continue
        startMs = riseAt
      }
      const endMs = startMs + durationMs
      if (endMs > interval.endMs || endMs > deadlineMs) continue
      if (!weatherCoverageOk(weatherPermittedIntervals, startMs, endMs, 0.8)) continue
      if (hasRaDec(target) && !altitudeSessionCoverageOk(target.raHours, target.decDeg, startMs, endMs)) {
        continue
      }
      return startMs
    }
  }
  return null
}

function placeSubSessionInFreeWindow(
  target: ProjectTarget,
  cursorMs: number,
  planningEndMs: number,
  freeEndMs: number,
  remaining: FilterRemaining[],
  weatherPermittedIntervals: TimeInterval[],
  nowMs: number,
  windowStartMs: number,
  deadlineMs: number
): { finalPlans: FilterPlan[]; placedStart: number; actualDurationMs: number } | null {
  let { filterPlansTonight: draftPlans } = planTonightFilterFrames(target, remaining, cursorMs, planningEndMs)
  if (draftPlans.length === 0) return null

  for (let attempt = 0; attempt < 400; attempt++) {
    const durationMs = tonightDurationSecondsFromPlans(draftPlans) * 1000
    const startMs = findPlacementStart(
      target,
      [{ startMs: cursorMs, endMs: freeEndMs }],
      durationMs,
      weatherPermittedIntervals,
      nowMs,
      windowStartMs,
      deadlineMs
    )
    if (startMs == null) {
      const shrunk = shrinkFilterPlansByOneFrame(draftPlans)
      if (!shrunk) return null
      draftPlans = shrunk
      continue
    }

    const { filterPlansTonight: finalPlans } = planTonightFilterFrames(
      target,
      remaining,
      startMs,
      Math.min(startMs + durationMs, planningEndMs, deadlineMs)
    )
    if (finalPlans.length === 0) {
      const shrunk = shrinkFilterPlansByOneFrame(draftPlans)
      if (!shrunk) return null
      draftPlans = shrunk
      continue
    }

    const actualDurationMs = tonightDurationSecondsFromPlans(finalPlans) * 1000
    const refinedStart = findPlacementStart(
      target,
      [{ startMs: cursorMs, endMs: freeEndMs }],
      actualDurationMs,
      weatherPermittedIntervals,
      nowMs,
      windowStartMs,
      deadlineMs
    )
    return {
      finalPlans,
      placedStart: refinedStart ?? startMs,
      actualDurationMs,
    }
  }
  return null
}

function hasSchedulableFreeTonight(
  freeIntervals: Array<{ startMs: number; endMs: number }>,
  weatherPermittedIntervals: TimeInterval[],
  windowStartMs: number,
  deadlineMs: number,
  minWindowMs: number
): boolean {
  for (const free of freeIntervals) {
    const startMs = Math.max(free.startMs, windowStartMs)
    const endMs = Math.min(free.endMs, deadlineMs)
    if (endMs - startMs < minWindowMs) continue
    if (weatherPermittedCoverageMs(weatherPermittedIntervals, startMs, endMs) >= minWindowMs) return true
  }
  return false
}

/**
 * One sub-session plan per schedulable free interval tonight. Remaining frames carry to later nights;
 * `startNightIndex` is the next global session number for this project.
 */
export function planTonightSubSessions(input: {
  target: ProjectTarget
  remaining: FilterRemaining[]
  startNightIndex: number
  freeIntervals: Array<{ startMs: number; endMs: number }>
  weatherPermittedIntervals: TimeInterval[]
  now?: Date
}): ProjectTonightPlan[] {
  const { target, remaining, startNightIndex, freeIntervals, weatherPermittedIntervals } = input
  const now = input.now ?? new Date()
  if (remaining.reduce((s, r) => s + Math.max(0, r.countRemaining), 0) <= 0) return []

  const nowMs = now.getTime()
  const window = getTonightSchedulingWindow(now)
  const windowStartMs = window.nauticalDuskUtc.getTime()
  const deadlineMs = window.nauticalDawnUtc.getTime()
  const strip = getTonightScheduleStrip(now)
  const minWindowMs = minExposureMs(target) + SESSION_OVERHEAD_MS

  if (!hasSchedulableFreeTonight(freeIntervals, weatherPermittedIntervals, windowStartMs, deadlineMs, minWindowMs)) {
    return []
  }

  let workingRemaining = remaining.map((r) => ({ ...r }))
  let sessionIndex = startNightIndex
  const plans: ProjectTonightPlan[] = []
  let workingFree = [...freeIntervals].sort((a, b) => a.startMs - b.startMs)
  let globalCursorMs = Math.max(nowMs, windowStartMs)

  while (true) {
    const framesLeft = workingRemaining.reduce((s, r) => s + r.countRemaining, 0)
    if (framesLeft <= 0) break

    let best: { finalPlans: FilterPlan[]; placedStart: number; actualDurationMs: number } | null = null

    for (const free of workingFree) {
      const cursorMs = Math.max(free.startMs, globalCursorMs)
      const planningEndMs = Math.min(free.endMs, deadlineMs)
      if (planningEndMs - cursorMs < minWindowMs) continue

      const placed = placeSubSessionInFreeWindow(
        target,
        cursorMs,
        planningEndMs,
        free.endMs,
        workingRemaining,
        weatherPermittedIntervals,
        nowMs,
        windowStartMs,
        deadlineMs
      )
      if (!placed) continue
      if (!best || placed.placedStart < best.placedStart) best = placed
    }

    if (!best) break

    const { finalPlans, placedStart, actualDurationMs } = best
    const placedEnd = placedStart + actualDurationMs

    plans.push({
      nightKey: strip.nightKey,
      nightIndex: sessionIndex++,
      filterPlansTonight: finalPlans,
      plannedStartIso: new Date(placedStart).toISOString(),
      plannedEndIso: new Date(placedEnd).toISOString(),
      durationSeconds: tonightDurationSecondsFromPlans(finalPlans),
    })

    workingRemaining = subtractRemaining(workingRemaining, finalPlans)
    workingFree = subtractOccupiedFromFree(workingFree, { startMs: placedStart, endMs: placedEnd })
    globalCursorMs = Math.max(globalCursorMs, placedEnd)
  }

  return plans
}
