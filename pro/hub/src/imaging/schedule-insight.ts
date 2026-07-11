import { DSO_SESSION_OVERHEAD_SEC } from './session-overhead.js'
import { subtractOccupiedFromFree } from './free-intervals.js'
import {
  altitudeSessionCoverageOk,
  firstAltitudeAllowedTimeMs,
  isAltitudeAllowed,
} from '../astro/target-altitude.js'
import { getTonightSchedulingWindow } from '../astro/sunrise-window.js'
import { weatherPermittedCoverageMs, weatherCoverageOk, type TimeInterval } from '../astro/tonight-weather-gate.js'
import { moonBlockedFilters } from '../astro/moon-avoidance.js'

export type ProjectSubSessionOccupancy = {
  projectId: string
  target: string
  nightIndex: number
  startMs: number
  endMs: number
}

export type ScheduleInsight = {
  status: 'scheduled' | 'unscheduled'
  plannedStartIso: string | null
  reasons: string[]
}

/** Same shape as queue rows used for placement (POST + reconcile). */
export type SchedulePendingRow = {
  id: string
  createdAt: string
  target?: string
  projectMode?: boolean
  raHours?: number | null
  decDeg?: number | null
  exposureSeconds: number
  count: number
  filterPlans?: Array<{ filterName: string; exposureSeconds: number; count: number }>
  estimatedDurationSeconds?: number
  status?: string
  plannedStartIso?: string | null
  /** Variable-star sessions are exempt from moon avoidance. */
  sequenceTemplate?: 'dso' | 'variable_star'
}

type FreeInterval = { startMs: number; endMs: number }

type CommittedOccupancy = {
  target: string
  projectMode: boolean
  projectSessionIndex?: number
  startMs: number
  endMs: number
  durationSeconds: number
}

type SimulatedPlacement = {
  target: string
  startMs: number
  endMs: number
}

function formatDurationMs(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function summarizeFreeIntervals(intervals: FreeInterval[]): {
  count: number
  totalMs: number
  longestMs: number
} {
  let totalMs = 0
  let longestMs = 0
  for (const interval of intervals) {
    const len = Math.max(0, interval.endMs - interval.startMs)
    totalMs += len
    if (len > longestMs) longestMs = len
  }
  return { count: intervals.length, totalMs, longestMs }
}

function clipIntervalMs(interval: FreeInterval, windowStartMs: number, deadlineMs: number): number {
  const startMs = Math.max(interval.startMs, windowStartMs)
  const endMs = Math.min(interval.endMs, deadlineMs)
  return Math.max(0, endMs - startMs)
}

function buildUnscheduledReasons(input: {
  durationMs: number
  createdMs: number
  deadlineMs: number
  queueIndex: number
  committedEarlierBeforeTarget: number
  freeIntervals: FreeInterval[]
  committedOccupancy: CommittedOccupancy[]
  simulatedPlacements: SimulatedPlacement[]
  reservedMsTonight: number
  failedByAltitudeRise: number
  failedByIntervalLength: number
  failedByAltitudeCoverage: number
  failedByWeatherCoverage: number
  failedByMoon: number
  moonBlockedFilterNames: string[]
  hasRaDec: boolean
}): string[] {
  const reasons: string[] = []
  const requiredLabel = formatDurationMs(input.durationMs)
  const free = summarizeFreeIntervals(input.freeIntervals)

  if (input.freeIntervals.length === 0) {
    reasons.push('No free scheduling window remains after earlier commitments and reservations.')
  } else if (free.longestMs < input.durationMs) {
    reasons.push(
      `Session needs ${requiredLabel} contiguous time; longest open slot tonight is ${formatDurationMs(free.longestMs)} (${free.count} gap${free.count === 1 ? '' : 's'}, ${formatDurationMs(free.totalMs)} total free).`
    )
  } else {
    reasons.push(
      `Session needs ${requiredLabel}; ${formatDurationMs(free.totalMs)} free across ${free.count} slot${free.count === 1 ? '' : 's'} but no start time satisfies altitude and weather rules.`
    )
  }

  if (input.reservedMsTonight > 0) {
    reasons.push(
      `${formatDurationMs(input.reservedMsTonight)} tonight is reserved while an in-progress multi-night project target is above 30° altitude.`
    )
  }

  for (const block of input.committedOccupancy) {
    const blockLabel = formatDurationMs(block.endMs - block.startMs)
    const startIso = new Date(block.startMs).toISOString()
    const endIso = new Date(block.endMs).toISOString()
    if (block.projectMode && block.projectSessionIndex != null) {
      reasons.push(
        `Earlier scheduled project "${block.target}" Session ${block.projectSessionIndex} blocks ${startIso}–${endIso} (~${blockLabel}).`
      )
    } else if (block.projectMode) {
      reasons.push(
        `Earlier scheduled project "${block.target}" blocks ${startIso}–${endIso} (~${blockLabel}).`
      )
    } else {
      reasons.push(
        `Earlier scheduled session "${block.target}" blocks ${startIso}–${endIso} (~${blockLabel}).`
      )
    }
  }

  for (const placed of input.simulatedPlacements) {
    reasons.push(
      `Earlier pending "${placed.target}" placed at ${new Date(placed.startMs).toISOString()}–${new Date(placed.endMs).toISOString()} (${formatDurationMs(placed.endMs - placed.startMs)}).`
    )
  }

  if (input.createdMs >= input.deadlineMs) {
    reasons.push('Submitted after nautical-dawn scheduling cutoff.')
  }
  if (input.failedByAltitudeRise > 0) {
    reasons.push('Target does not rise above 30° in any remaining free interval.')
  }
  if (input.failedByAltitudeCoverage > 0) {
    reasons.push('Target altitude coverage is below 100% for required duration in remaining free intervals.')
  }
  if (input.failedByIntervalLength > 0 && input.freeIntervals.length > 0) {
    reasons.push('Every remaining free interval is shorter than session duration before nautical dawn.')
  }
  if (input.failedByWeatherCoverage > 0) {
    reasons.push('No remaining slot has weather-permitted coverage >= 80% of session duration.')
  }
  if (input.failedByMoon > 0) {
    const filters = input.moonBlockedFilterNames.length > 0 ? input.moonBlockedFilterNames.join(', ') : 'requested filters'
    reasons.push(
      `Moon is too close for filter(s) ${filters} during every otherwise-valid slot tonight (Lorentzian moon avoidance).`
    )
  }
  if (!input.hasRaDec && input.failedByAltitudeRise === 0 && input.failedByAltitudeCoverage === 0) {
    reasons.push('No RA/Dec on request; altitude rules not applied.')
  }

  if (input.queueIndex > 0) {
    if (input.committedEarlierBeforeTarget > 0) {
      reasons.push(
        `Evaluated in queue order after ${input.committedEarlierBeforeTarget} earlier session(s) with a committed start time tonight.`
      )
    } else {
      reasons.push(
        `${input.queueIndex} earlier submission(s) were tried first; unscheduled earlier rows do not consume time.`
      )
    }
  }

  if (reasons.length === 0) reasons.push('No schedulable interval satisfies all constraints.')
  return reasons
}

export function estimateDurationSeconds(
  req: Pick<
    SchedulePendingRow,
    'exposureSeconds' | 'count' | 'filterPlans' | 'estimatedDurationSeconds'
  >
): number {
  if (typeof req.estimatedDurationSeconds === 'number' && Number.isFinite(req.estimatedDurationSeconds)) {
    return Math.max(60, req.estimatedDurationSeconds)
  }
  const fromPlans =
    Array.isArray(req.filterPlans) && req.filterPlans.length > 0
      ? req.filterPlans.reduce((sum, p) => sum + Number(p.count) * Number(p.exposureSeconds), 0) +
          DSO_SESSION_OVERHEAD_SEC
      : Number(req.exposureSeconds) * Number(req.count) + DSO_SESSION_OVERHEAD_SEC
  return Math.max(60, Math.round(fromPlans))
}

/**
 * Single source of truth for “can this session be placed tonight?” used by POST and reconcile.
 * `targetId` — which row to return insight for. Other pending rows are simulated in submission order.
 */
export type ComputeScheduleInsightOptions = {
  /** Time reserved for an in-progress project target while it is ≥30° (other sessions may not use). */
  reservedIntervals?: Array<{ startMs: number; endMs: number }>
  /** Tonight's project sub-sessions (actual start + duration), not full multi-night queue estimate. */
  projectSubSessions?: ProjectSubSessionOccupancy[]
}

export function computeScheduleInsight(
  pending: SchedulePendingRow[],
  targetId: string,
  weatherPermittedIntervals: TimeInterval[],
  options?: ComputeScheduleInsightOptions
): ScheduleInsight {
  const now = new Date()
  const nowMs = now.getTime()
  const window = getTonightSchedulingWindow(now)
  const windowStartMs = window.nauticalDuskUtc.getTime()
  const deadlineMs = window.nauticalDawnUtc.getTime()
  let freeIntervals: FreeInterval[] = [{ startMs: Math.max(nowMs, windowStartMs), endMs: deadlineMs }]
  const reservedIntervals = options?.reservedIntervals ?? []
  let reservedMsTonight = 0
  for (const occupied of reservedIntervals) {
    reservedMsTonight += clipIntervalMs(occupied, windowStartMs, deadlineMs)
    freeIntervals = subtractOccupiedFromFree(freeIntervals, occupied)
  }
  const ordered = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const queueIndex = ordered.findIndex((r) => r.id === targetId)
  const projectSubSessions = options?.projectSubSessions ?? []
  const committedEarlierBeforeTarget = ordered.reduce((acc, r, i) => {
    if (i >= queueIndex || queueIndex < 0) return acc
    if (r.projectMode === true) {
      return projectSubSessions.some((b) => b.projectId === r.id) ? acc + 1 : acc
    }
    if (r.status !== 'scheduled' || r.plannedStartIso == null) return acc
    const t = Date.parse(r.plannedStartIso)
    if (!Number.isFinite(t)) return acc
    return acc + 1
  }, 0)

  const committedOccupancy: CommittedOccupancy[] = []
  for (const block of projectSubSessions) {
    const projectQueueIndex = ordered.findIndex((r) => r.id === block.projectId)
    if (queueIndex >= 0 && projectQueueIndex >= 0 && projectQueueIndex < queueIndex) {
      const durationSeconds = Math.max(60, Math.round((block.endMs - block.startMs) / 1000))
      committedOccupancy.push({
        target: block.target,
        projectMode: true,
        projectSessionIndex: block.nightIndex,
        startMs: block.startMs,
        endMs: block.endMs,
        durationSeconds,
      })
    }
    freeIntervals = subtractOccupiedFromFree(freeIntervals, {
      startMs: block.startMs,
      endMs: block.endMs,
    })
  }

  for (let i = 0; i < ordered.length; i += 1) {
    const r = ordered[i]!
    if (r.projectMode === true) continue
    if (r.status !== 'scheduled' || r.plannedStartIso == null) continue
    const pStart = Date.parse(r.plannedStartIso)
    if (!Number.isFinite(pStart)) continue
    const durationSeconds = estimateDurationSeconds(r)
    const pEnd = pStart + durationSeconds * 1000
    const overlapStart = Math.max(pStart, windowStartMs)
    const overlapEnd = Math.min(pEnd, deadlineMs)
    if (overlapEnd <= overlapStart) continue
    if (queueIndex < 0 || i < queueIndex) {
      committedOccupancy.push({
        target: r.target?.trim() || r.id,
        projectMode: false,
        startMs: overlapStart,
        endMs: overlapEnd,
        durationSeconds,
      })
    }
    freeIntervals = subtractOccupiedFromFree(freeIntervals, { startMs: overlapStart, endMs: overlapEnd })
  }

  const simulatedPlacements: SimulatedPlacement[] = []

  for (let reqIndex = 0; reqIndex < ordered.length; reqIndex += 1) {
    const req = ordered[reqIndex]!
    if (req.projectMode === true) continue
    if (
      req.status === 'scheduled' &&
      req.plannedStartIso != null &&
      Number.isFinite(Date.parse(req.plannedStartIso))
    ) {
      continue
    }
    const durationMs = estimateDurationSeconds(req) * 1000
    const createdMs = Number.isFinite(Date.parse(req.createdAt)) ? Date.parse(req.createdAt) : nowMs
    let placement: { startMs: number; endMs: number } | null = null
    let placementContext:
      | {
          intervalStartMs: number
          baselineStartMs: number
          riseAtMs: number | null
          weatherCoveragePct: number
        }
      | null = null
    let failedByAltitudeRise = 0
    let failedByIntervalLength = 0
    let failedByAltitudeCoverage = 0
    let failedByWeatherCoverage = 0
    let failedByMoon = 0
    const moonBlockedFilterNames = new Set<string>()
    const hasRaDec =
      typeof req.raHours === 'number' &&
      Number.isFinite(req.raHours) &&
      typeof req.decDeg === 'number' &&
      Number.isFinite(req.decDeg)
    const moonExempt = req.sequenceTemplate === 'variable_star'

    const moonBlockedForWindow = (startMs: number, endMs: number): string[] => {
      if (moonExempt || !hasRaDec || !req.filterPlans?.length) return []
      return moonBlockedFilters(req.filterPlans, req.raHours!, req.decDeg!, startMs, endMs)
    }

    const tryStartCandidateMs = (
      interval: { startMs: number; endMs: number },
      candidateStartMs: number
    ): {
      startMs: number
      endMs: number
      riseAtMs: number | null
      weatherCoveragePct: number
      baselineStartMs: number
    } | null => {
      const baselineStartMs = Math.max(interval.startMs, createdMs, nowMs, windowStartMs)
      if (candidateStartMs < baselineStartMs) return null
      let startMs = candidateStartMs
      let riseAtMs: number | null = null
      if (hasRaDec) {
        const riseAt = firstAltitudeAllowedTimeMs(req.raHours!, req.decDeg!, startMs, interval.endMs)
        if (riseAt == null) return null
        riseAtMs = riseAt > candidateStartMs ? riseAt : null
        startMs = riseAt
      }
      const endMs = startMs + durationMs
      if (endMs > interval.endMs || endMs > deadlineMs) return null
      const weatherCoveredMs = weatherPermittedCoverageMs(weatherPermittedIntervals, startMs, endMs)
      const weatherCoveragePct = durationMs > 0 ? (weatherCoveredMs / durationMs) * 100 : 0
      if (!weatherCoverageOk(weatherPermittedIntervals, startMs, endMs, 0.8)) return null
      if (hasRaDec && !altitudeSessionCoverageOk(req.raHours!, req.decDeg!, startMs, endMs)) return null
      if (moonBlockedForWindow(startMs, endMs).length > 0) return null
      return { startMs, endMs, riseAtMs, weatherCoveragePct, baselineStartMs }
    }

    for (const interval of freeIntervals) {
      const baselineStartMs = Math.max(interval.startMs, createdMs, nowMs, windowStartMs)
      const intervalDeadline = Math.min(interval.endMs, deadlineMs)
      const lastStartMs = intervalDeadline - durationMs
      if (lastStartMs < baselineStartMs) {
        failedByIntervalLength += 1
        continue
      }

      const searchStepMs = 5 * 60 * 1000
      let chosen: ReturnType<typeof tryStartCandidateMs> = null
      for (let cand = baselineStartMs; cand <= lastStartMs; cand += searchStepMs) {
        const trial = tryStartCandidateMs(interval, cand)
        if (trial) {
          chosen = trial
          break
        }
      }

      if (chosen) {
        placement = { startMs: chosen.startMs, endMs: chosen.endMs }
        placementContext = {
          intervalStartMs: interval.startMs,
          baselineStartMs: chosen.baselineStartMs,
          riseAtMs: chosen.riseAtMs,
          weatherCoveragePct: chosen.weatherCoveragePct,
        }
        break
      }

      if (!chosen) {
        let startMs = baselineStartMs
        if (hasRaDec) {
          const riseAt = firstAltitudeAllowedTimeMs(req.raHours!, req.decDeg!, startMs, interval.endMs)
          if (riseAt == null) {
            failedByAltitudeRise += 1
            continue
          }
          startMs = riseAt
        }
        const endMs = startMs + durationMs
        if (endMs > interval.endMs || endMs > deadlineMs) {
          failedByIntervalLength += 1
          continue
        }
        if (!weatherCoverageOk(weatherPermittedIntervals, startMs, endMs, 0.8)) {
          failedByWeatherCoverage += 1
          continue
        }
        if (hasRaDec && !altitudeSessionCoverageOk(req.raHours!, req.decDeg!, startMs, endMs)) {
          failedByAltitudeCoverage += 1
          continue
        }
        const blocked = moonBlockedForWindow(startMs, endMs)
        if (blocked.length > 0) {
          failedByMoon += 1
          blocked.forEach((f) => moonBlockedFilterNames.add(f))
        }
      }
    }

    if (req.id === targetId) {
      if (!placement) {
        return {
          status: 'unscheduled',
          plannedStartIso: null,
          reasons: buildUnscheduledReasons({
            durationMs,
            createdMs,
            deadlineMs,
            queueIndex,
            committedEarlierBeforeTarget,
            freeIntervals,
            committedOccupancy,
            simulatedPlacements,
            reservedMsTonight,
            failedByAltitudeRise,
            failedByIntervalLength,
            failedByAltitudeCoverage,
            failedByWeatherCoverage,
            failedByMoon,
            moonBlockedFilterNames: Array.from(moonBlockedFilterNames),
            hasRaDec,
          }),
        }
      }

      const reasons: string[] = []
      if (queueIndex > 0 && committedEarlierBeforeTarget > 0) {
        reasons.push(
          `Placed after ${committedEarlierBeforeTarget} earlier session(s) with a committed scheduled time tonight.`
        )
      }
      if (placementContext) {
        if (placementContext.intervalStartMs > nowMs) {
          reasons.push(`Earliest free queue slot opens at ${new Date(placementContext.intervalStartMs).toISOString()}.`)
        }
        if (placementContext.riseAtMs != null && placementContext.riseAtMs > placementContext.baselineStartMs) {
          reasons.push(`Target reaches 30° at ${new Date(placementContext.riseAtMs).toISOString()}.`)
        }
        reasons.push(
          `Weather-permitted coverage over session window is ${placementContext.weatherCoveragePct.toFixed(0)}% (required >= 80%).`
        )
      }
      if (typeof req.raHours === 'number' && Number.isFinite(req.raHours) && typeof req.decDeg === 'number' && Number.isFinite(req.decDeg)) {
        const altNow = isAltitudeAllowed(req.raHours, req.decDeg)
        if (!altNow.ok) reasons.push(`Target currently below 30° (${altNow.altitudeDeg.toFixed(1)}°).`)
      }
      if (reasons.length === 0) reasons.push('Scheduled at earliest available slot under current rules.')
      return { status: 'scheduled', plannedStartIso: new Date(placement.startMs).toISOString(), reasons }
    }

    if (!placement) continue
    if (queueIndex >= 0 && reqIndex < queueIndex) {
      simulatedPlacements.push({
        target: req.target?.trim() || req.id,
        startMs: placement.startMs,
        endMs: placement.endMs,
      })
    }
    freeIntervals = subtractOccupiedFromFree(freeIntervals, placement)
  }

  return {
    status: 'unscheduled',
    plannedStartIso: null,
    reasons: ['Could not compute schedule placement for this session.'],
  }
}
