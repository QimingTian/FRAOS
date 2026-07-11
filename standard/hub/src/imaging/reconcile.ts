import { subtractOccupiedFromFree } from './free-intervals.js'
import {
  appendAuditLog,
  getObservatoryState,
  getSessionById,
  listPendingSessions,
  listSessions,
  patchSessionSchedule,
  patchSessionStatus,
  setSessionPlannedStart,
  type SessionRow,
} from '../db.js'
import { sessionToScheduleRow, buildProjectNightSequenceJson } from './queue-service.js'
import { isEmergencyStopBlocking } from '../personal-estop.js'
import { getTonightWeatherPermittedIntervals } from '../astro/tonight-weather-gate.js'
import { getTonightSchedulingWindow } from '../astro/sunrise-window.js'
import { getTonightScheduleStrip } from '../astro/schedule-strip.js'
import {
  computeScheduleInsight,
  estimateDurationSeconds,
  type ProjectSubSessionOccupancy,
} from './schedule-insight.js'
import {
  initProjectRemaining,
  listProjectNights,
  projectNightSubId,
  replaceScheduledNights,
  remainingFramesTotal,
} from './project-store.js'
import {
  planTonightSubSessions,
  tonightDurationSecondsFromPlans,
  type ProjectTarget,
} from './project-planner.js'
import { emitAgentWakePollSequence, emitSiteSessionsChanged } from './live-bus.js'

type FreeInterval = { startMs: number; endMs: number }

/** Project rows that may receive tonight sub-sessions (pending/scheduled/in_progress, frames remaining). */
function listSchedulableProjects(): SessionRow[] {
  return listSessions().filter(
    (s) =>
      s.projectMode &&
      (s.status === 'pending' || s.status === 'scheduled' || s.status === 'in_progress') &&
      remainingFramesTotal(initProjectRemaining(s)) > 0
  )
}

function projectTarget(project: SessionRow): ProjectTarget {
  return {
    raHours: project.raHours,
    decDeg: project.decDeg,
    filterPlansTotal: project.filterPlans,
    createdAt: project.createdAt,
  }
}

/** Plan tonight sub-sessions for one project; persist scheduled nights and return their occupancy. */
function planProjectTonight(
  project: SessionRow,
  nightKey: string,
  fifoFree: FreeInterval[],
  permitted: { startMs: number; endMs: number }[],
  now: Date,
  tenantId?: string
): { occupancy: ProjectSubSessionOccupancy[]; firstStartIso: string | null } {
  const nights = listProjectNights(project.id)

  // In-progress nights are already committed; never replan them, just reserve their window.
  let free = fifoFree
  for (const n of nights) {
    if (n.nightKey !== nightKey) continue
    if (n.status !== 'in_progress') continue
    if (!n.plannedStartIso) continue
    const startMs = Date.parse(n.plannedStartIso)
    if (!Number.isFinite(startMs)) continue
    const endMs = startMs + tonightDurationSecondsFromPlans(n.filterPlansTonight) * 1000
    if (endMs > startMs) free = subtractOccupiedFromFree(free, { startMs, endMs })
  }

  const committedIndex = Math.max(
    0,
    ...nights
      .filter((n) => n.status !== 'scheduled')
      .map((n) => n.nightIndex)
  )

  const plans = planTonightSubSessions({
    target: projectTarget(project),
    remaining: initProjectRemaining(project),
    startNightIndex: committedIndex + 1,
    freeIntervals: free,
    weatherPermittedIntervals: permitted,
    now,
  })

  const subs = plans.map((plan) => {
    const id = projectNightSubId(project.id, plan.nightIndex)
    return {
      id,
      nightIndex: plan.nightIndex,
      filterPlansTonight: plan.filterPlansTonight,
      plannedStartIso: plan.plannedStartIso,
      ninaSequenceJson: buildProjectNightSequenceJson(project, id, plan.filterPlansTonight, tenantId),
    }
  })

  replaceScheduledNights(project.id, nightKey, subs)

  const occupancy: ProjectSubSessionOccupancy[] = plans.map((plan) => {
    const startMs = Date.parse(plan.plannedStartIso)
    return {
      projectId: project.id,
      target: project.target,
      nightIndex: plan.nightIndex,
      startMs,
      endMs: startMs + plan.durationSeconds * 1000,
    }
  })

  return { occupancy, firstStartIso: plans[0]?.plannedStartIso ?? null }
}

/** Recompute schedule for all pending queue rows + multi-night projects in submission order. */
export async function reconcilePendingScheduleStatus(): Promise<void> {
  if (isEmergencyStopBlocking()) return
  const pendingNormal = listPendingSessions().filter(
    (s) => !s.projectMode && (s.status === 'pending' || s.status === 'scheduled')
  )
  const projects = listSchedulableProjects()
  if (pendingNormal.length === 0 && projects.length === 0) return

  const weatherIntervals = await getTonightWeatherPermittedIntervals()
  const now = new Date()
  const window = getTonightSchedulingWindow(now)
  const strip = getTonightScheduleStrip(now)
  const nightKey = strip.nightKey
  const nowMs = now.getTime()
  const windowStartMs = window.nauticalDuskUtc.getTime()
  const deadlineMs = window.nauticalDawnUtc.getTime()
  let fifoFree: FreeInterval[] = [{ startMs: Math.max(nowMs, windowStartMs), endMs: deadlineMs }]

  const nextById = new Map<
    string,
    { status: 'scheduled' | 'unscheduled'; plannedStartIso: string | null; reasons: string[] }
  >()

  if (weatherIntervals.status !== 'ok' || weatherIntervals.globalHardBlocked === true) {
    const reason =
      weatherIntervals.status !== 'ok'
        ? weatherIntervals.reason ?? 'Unable to evaluate tonight weather.'
        : weatherIntervals.globalHardBlockReason ?? 'Tonight blocked by global weather trigger.'
    for (const r of pendingNormal) {
      nextById.set(r.id, { status: 'unscheduled', plannedStartIso: null, reasons: [reason] })
    }
    for (const p of projects) {
      replaceScheduledNights(p.id, nightKey, [])
      if (p.status !== 'in_progress') {
        nextById.set(p.id, { status: 'unscheduled', plannedStartIso: null, reasons: [reason] })
      }
    }
  } else {
    const permitted = weatherIntervals.permittedIntervals
    const projectIds = new Set(projects.map((p) => p.id))
    const combined: SessionRow[] = [...pendingNormal, ...projects]
    const orderedBySubmission = [...combined].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const working = pendingNormal.map((p) => sessionToScheduleRow(p))
    const projectOccupancy: ProjectSubSessionOccupancy[] = []

    for (const r of orderedBySubmission) {
      if (projectIds.has(r.id)) {
        const project = getSessionById(r.id)
        if (!project) continue
        const { occupancy, firstStartIso } = planProjectTonight(
          project,
          nightKey,
          fifoFree,
          permitted,
          now
        )
        projectOccupancy.push(...occupancy)
        for (const occ of occupancy) {
          fifoFree = subtractOccupiedFromFree(fifoFree, { startMs: occ.startMs, endMs: occ.endMs })
        }
        if (project.status !== 'in_progress') {
          nextById.set(project.id, {
            status: firstStartIso ? 'scheduled' : 'unscheduled',
            plannedStartIso: firstStartIso,
            reasons: firstStartIso
              ? [`Multi-night project: ${occupancy.length} session(s) tonight.`]
              : ['No schedulable sub-session tonight (weather, altitude, or free window).'],
          })
        } else {
          // In-progress project: keep status, surface tonight's next sub-session start.
          setSessionPlannedStart(project.id, firstStartIso)
        }
        continue
      }

      // Normal session: only earlier-submitted project windows block it (FIFO fairness).
      const earlierProjectOccupancy = projectOccupancy.filter((occ) => {
        const proj = orderedBySubmission.find((p) => p.id === occ.projectId)
        return proj != null && proj.createdAt.localeCompare(r.createdAt) <= 0
      })
      const slice = working.map((p) =>
        p.id === r.id ? { ...p, status: 'pending' as const, plannedStartIso: null } : p
      )
      const insight = computeScheduleInsight(slice, r.id, permitted, {
        projectSubSessions: earlierProjectOccupancy,
      })
      nextById.set(r.id, insight)

      const idx = working.findIndex((w) => w.id === r.id)
      if (idx < 0) continue
      if (insight.status === 'scheduled' && insight.plannedStartIso) {
        working[idx] = { ...working[idx]!, status: 'scheduled', plannedStartIso: insight.plannedStartIso }
        const startMs = Date.parse(insight.plannedStartIso)
        if (Number.isFinite(startMs)) {
          const durationSeconds = estimateDurationSeconds(working[idx]!)
          fifoFree = subtractOccupiedFromFree(fifoFree, {
            startMs,
            endMs: startMs + durationSeconds * 1000,
          })
        }
      } else {
        working[idx] = { ...working[idx]!, status: 'pending', plannedStartIso: null }
      }
    }
  }

  for (const r of [...pendingNormal, ...projects]) {
    const next = nextById.get(r.id)
    if (!next) continue
    const prevStatus = r.status
    const prevPlanned = r.plannedStartIso ?? null
    const nextStatus = next.status === 'scheduled' ? 'scheduled' : 'pending'
    if (prevStatus === nextStatus && prevPlanned === next.plannedStartIso) continue
    patchSessionSchedule(r.id, next)
    appendAuditLog({
      kind: 'queue.schedule',
      message: `Schedule ${next.status}: ${r.target} (${r.id})`,
      detail: {
        id: r.id,
        previousStatus: prevStatus,
        nextStatus,
        plannedStartIso: next.plannedStartIso,
        reasons: next.reasons,
      },
    })
  }

  // Keep in-progress projects whose remaining frames hit zero marked completed.
  for (const p of listSessions()) {
    if (!p.projectMode || p.status !== 'in_progress') continue
    if (remainingFramesTotal(initProjectRemaining(p)) <= 0) patchSessionStatus(p.id, 'completed')
  }

  emitSiteSessionsChanged()
  emitAgentWakePollSequence()
}

let backgroundTimer: ReturnType<typeof setInterval> | null = null

/**
 * Time-driven safety net so the schedule refreshes even when the control client is closed and the
 * agent is between polls. Skipped while NINA is imaging or an Emergency STOP is active. Delivery still
 * reconciles right before handing out a sequence, so this loop only keeps state/weather fresh.
 */
export function startBackgroundReconcileLoop(intervalMs = 90_000): () => void {
  if (backgroundTimer) return () => stopBackgroundReconcileLoop()
  backgroundTimer = setInterval(() => {
    void (async () => {
      try {
        if (isEmergencyStopBlocking()) return
        if (getObservatoryState().ninaRunning) return
        await reconcilePendingScheduleStatus()
      } catch (ex) {
        console.error('[hub] background reconcile failed:', ex)
      }
    })()
  }, Math.max(15_000, intervalMs))
  if (typeof backgroundTimer.unref === 'function') backgroundTimer.unref()
  return () => stopBackgroundReconcileLoop()
}

export function stopBackgroundReconcileLoop(): void {
  if (backgroundTimer) {
    clearInterval(backgroundTimer)
    backgroundTimer = null
  }
}


import type Database from 'better-sqlite3'

/**
 * SQLite-backed queue reconciler. For each PENDING session this re-runs the
 * scheduling engine: it evaluates tonight's weather gate, walks pending rows
 * in submission order, finds a free window via the schedule-insight engine,
 * and persists the resulting SCHEDULED status + planned-start (or unscheduled
 * reasons) back to the `sessions` table.
 *
 * This is a thin convenience wrapper around the engine in
 * {@link reconcilePendingScheduleStatus} (which uses the shared `getDb()`
 * handle and the richer project-planner flow). The `db` argument is accepted
 * for API symmetry with the ported module contract; the engine itself reads
 * from the same singleton database.
 *
 * @param db open database handle (hub.db)
 */
export async function reconcileQueue(db: Database.Database): Promise<void> {
  void db
  await reconcilePendingScheduleStatus()
}
