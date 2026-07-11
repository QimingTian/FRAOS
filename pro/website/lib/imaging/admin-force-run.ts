import {
  altitudeSessionCoverageOk,
  isAltitudeAllowed,
  MIN_ALTITUDE_DEG,
} from '@/lib/imaging/astro/target-altitude'
import { getTonightScheduleStrip } from '@/lib/imaging/astro/schedule-strip'
import { getTonightSchedulingWindow } from '@/lib/imaging/astro/sunrise-window'
import { validateAdminRunWeatherWindow } from '@/lib/imaging/astro/tonight-weather-gate'
import {
  appendAuditLog,
  getSessionById,
  isObservatoryReady,
  listSessions,
  patchSessionAdminForceRun,
  type SessionRow,
} from '@/lib/cloud/personal-imaging/db'
import { isEmergencyStopBlocking } from '@/lib/cloud/personal-imaging/estop-sync'
import { subtractOccupiedFromFree } from '@/lib/imaging/free-intervals'
import { emitAgentWakePollSequence } from '@/lib/imaging/live-bus'
import {
  getProjectNightById,
  listAllOpenProjectNights,
  listProjectNights,
  patchProjectNightAdminForceRun,
  type ProjectNight,
} from '@/lib/cloud/personal-imaging/project-db'
import { tonightDurationSecondsFromPlans } from '@/lib/imaging/project-planner'
import { buildProjectNightSequenceJson } from '@/lib/imaging/queue-service'
import { estimateDurationSeconds, type ProjectSubSessionOccupancy } from '@/lib/imaging/schedule-insight'

export function isAdminForceRunActive(
  row: { adminForceRunUntilIso?: string | null },
  nowMs = Date.now()
): boolean {
  if (!row.adminForceRunUntilIso) return false
  const until = Date.parse(row.adminForceRunUntilIso)
  return Number.isFinite(until) && until > nowMs
}

export function validateAdminForceRunAltitude(
  raHours: number | null | undefined,
  decDeg: number | null | undefined,
  startMs: number,
  endMs: number,
  targetLabel: string
): { ok: true } | { ok: false; reason: string } {
  if (
    typeof raHours !== 'number' ||
    !Number.isFinite(raHours) ||
    typeof decDeg !== 'number' ||
    !Number.isFinite(decDeg)
  ) {
    return { ok: true }
  }
  const altNow = isAltitudeAllowed(raHours, decDeg)
  if (!altNow.ok) {
    return {
      ok: false,
      reason: `Target altitude ${altNow.altitudeDeg.toFixed(2)}° is below ${MIN_ALTITUDE_DEG}° (${targetLabel}).`,
    }
  }
  if (!altitudeSessionCoverageOk(raHours, decDeg, startMs, endMs)) {
    return {
      ok: false,
      reason: `Target is not at or above ${MIN_ALTITUDE_DEG}° for the full session duration (${targetLabel}).`,
    }
  }
  return { ok: true }
}

export type AdminForceRunTimeWindow = { startMs: number; endMs: number }

function clipTonightWindow(
  startMs: number,
  endMs: number,
  windowStartMs: number,
  deadlineMs: number
): AdminForceRunTimeWindow | null {
  const overlapStart = Math.max(startMs, windowStartMs)
  const overlapEnd = Math.min(endMs, deadlineMs)
  if (overlapEnd <= overlapStart) return null
  return { startMs: overlapStart, endMs: overlapEnd }
}

export function queueRowAdminForceRunWindow(
  row: Pick<
    SessionRow,
    | 'plannedStartIso'
    | 'adminForceRunUntilIso'
    | 'estimatedDurationSeconds'
    | 'exposureSeconds'
    | 'count'
    | 'filterPlans'
  >,
  windowStartMs: number,
  deadlineMs: number,
  nowMs = Date.now()
): AdminForceRunTimeWindow | null {
  if (!isAdminForceRunActive(row, nowMs) || !row.plannedStartIso) return null
  const startMs = Date.parse(row.plannedStartIso)
  if (!Number.isFinite(startMs)) return null
  const untilMs = row.adminForceRunUntilIso ? Date.parse(row.adminForceRunUntilIso) : NaN
  const endMs =
    Number.isFinite(untilMs) && untilMs > startMs
      ? untilMs
      : startMs + estimateDurationSeconds(row) * 1000
  return clipTonightWindow(startMs, endMs, windowStartMs, deadlineMs)
}

export function projectNightAdminForceRunWindow(
  night: ProjectNight,
  windowStartMs: number,
  deadlineMs: number,
  nowMs = Date.now()
): AdminForceRunTimeWindow | null {
  if (!isAdminForceRunActive(night, nowMs) || !night.plannedStartIso) return null
  if (night.status !== 'scheduled' && night.status !== 'in_progress') return null
  const startMs = Date.parse(night.plannedStartIso)
  if (!Number.isFinite(startMs)) return null
  const untilMs = night.adminForceRunUntilIso ? Date.parse(night.adminForceRunUntilIso) : NaN
  const endMs =
    Number.isFinite(untilMs) && untilMs > startMs
      ? untilMs
      : startMs + tonightDurationSecondsFromPlans(night.filterPlansTonight) * 1000
  return clipTonightWindow(startMs, endMs, windowStartMs, deadlineMs)
}

export function collectActiveAdminForceRunOccupancies(
  nightKey: string,
  windowStartMs: number,
  deadlineMs: number,
  nowMs = Date.now()
): AdminForceRunTimeWindow[] {
  const out: AdminForceRunTimeWindow[] = []
  for (const row of listSessions()) {
    if (row.projectMode || row.status !== 'scheduled') continue
    const window = queueRowAdminForceRunWindow(row, windowStartMs, deadlineMs, nowMs)
    if (window) out.push(window)
  }
  const seenNightIds = new Set<string>()
  for (const night of listAllOpenProjectNights()) {
    if (night.nightKey !== nightKey) continue
    seenNightIds.add(night.id)
    const window = projectNightAdminForceRunWindow(night, windowStartMs, deadlineMs, nowMs)
    if (window) out.push(window)
  }
  for (const session of listSessions()) {
    if (!session.projectMode) continue
    for (const night of listProjectNights(session.id)) {
      if (night.nightKey !== nightKey || seenNightIds.has(night.id)) continue
      const window = projectNightAdminForceRunWindow(night, windowStartMs, deadlineMs, nowMs)
      if (window) out.push(window)
    }
  }
  return out
}

export function subtractAdminForceRunsFromFree(
  freeIntervals: AdminForceRunTimeWindow[],
  forceRunOccupancy: AdminForceRunTimeWindow[]
): AdminForceRunTimeWindow[] {
  let free = freeIntervals
  for (const occupied of forceRunOccupancy) {
    free = subtractOccupiedFromFree(free, occupied)
  }
  return free
}

export function collectActiveAdminForceRunSubSessionOccupancy(
  windowStartMs: number,
  deadlineMs: number,
  nowMs = Date.now()
): ProjectSubSessionOccupancy[] {
  const out: ProjectSubSessionOccupancy[] = []
  for (const row of listSessions()) {
    if (row.projectMode || row.status !== 'scheduled') continue
    if (!isAdminForceRunActive(row, nowMs) || !row.plannedStartIso) continue
    const startMs = Date.parse(row.plannedStartIso)
    if (!Number.isFinite(startMs)) continue
    const endMs = startMs + estimateDurationSeconds(row) * 1000
    const clip = clipTonightWindow(startMs, endMs, windowStartMs, deadlineMs)
    if (!clip) continue
    out.push({
      projectId: row.id,
      target: row.target,
      nightIndex: 0,
      startMs: clip.startMs,
      endMs: clip.endMs,
    })
  }
  return out
}

const RUNNABLE_STATUSES = new Set(['pending', 'scheduled', 'planned', 'on_hold'])

export async function adminRunSession(
  sessionId: string,
  tenantId: string
): Promise<{ ok: true } | { error: string }> {
  if (isEmergencyStopBlocking()) {
    return { error: 'Emergency STOP is active; force-run is disabled.' }
  }
  if (!isObservatoryReady()) {
    return { error: 'Observatory is not ready' }
  }

  const now = new Date()
  const nowMs = now.getTime()
  const nowIso = now.toISOString()
  const strip = getTonightScheduleStrip(now)
  const nightKey = strip.nightKey
  const deadlineMs = getTonightSchedulingWindow(now).nauticalDawnUtc.getTime()

  const night = getProjectNightById(sessionId)
  if (night) {
    const statusLabel = night.status === 'planned' ? 'scheduled' : night.status
    if (!RUNNABLE_STATUSES.has(night.status)) {
      return { error: `Cannot force-run sub-session in status "${statusLabel}".` }
    }
    if (night.filterPlansTonight.length === 0) {
      return { error: 'Sub-session has no imaging plan for tonight.' }
    }
    const project = getSessionById(night.projectId)
    if (!project) return { error: 'Project not found' }

    const durationSeconds = tonightDurationSecondsFromPlans(night.filterPlansTonight)
    if (durationSeconds <= 0) return { error: 'Could not estimate sub-session duration.' }
    const endMs = nowMs + durationSeconds * 1000
    if (endMs > deadlineMs) {
      return { error: 'Session would extend past nautical dawn.' }
    }

    const altitude = validateAdminForceRunAltitude(
      project.raHours,
      project.decDeg,
      nowMs,
      endMs,
      project.target
    )
    if (!altitude.ok) return { error: altitude.reason }

    const weather = await validateAdminRunWeatherWindow(nowMs, endMs)
    if (!weather.ok) return { error: weather.reason }

    const ninaSequenceJson =
      night.ninaSequenceJson ??
      buildProjectNightSequenceJson(project, night.id, night.filterPlansTonight, tenantId)
    const adminForceRunUntilIso = new Date(endMs).toISOString()

    const patched = patchProjectNightAdminForceRun(sessionId, {
      nightKey,
      plannedStartIso: nowIso,
      adminForceRunUntilIso,
      ninaSequenceJson,
    })
    if (!patched) return { error: 'Could not update sub-session.' }

    void appendAuditLog({
      kind: 'queue.admin_run',
      message: `Admin force-run started: ${project.target} Session ${night.nightIndex} (${sessionId}).`,
      detail: {
        sessionId,
        projectId: project.id,
        plannedStartIso: nowIso,
        adminForceRunUntilIso,
      },
    })

    emitAgentWakePollSequence(tenantId)
    const { reconcilePendingScheduleStatus } = await import('@/lib/imaging/reconcile')
    await reconcilePendingScheduleStatus()
    return { ok: true }
  }

  const row = getSessionById(sessionId)
  if (!row) return { error: 'Session not found' }
  if (row.projectMode) {
    return { error: 'Use the project sub-session id (Session N), not the project queue id.' }
  }
  if (!RUNNABLE_STATUSES.has(row.status)) {
    return { error: `Cannot force-run session in status "${row.status}".` }
  }

  const durationSeconds = estimateDurationSeconds(row)
  const endMs = nowMs + durationSeconds * 1000
  if (endMs > deadlineMs) {
    return { error: 'Session would extend past nautical dawn.' }
  }

  const altitude = validateAdminForceRunAltitude(row.raHours, row.decDeg, nowMs, endMs, row.target)
  if (!altitude.ok) return { error: altitude.reason }

  const weather = await validateAdminRunWeatherWindow(nowMs, endMs)
  if (!weather.ok) return { error: weather.reason }

  const adminForceRunUntilIso = new Date(endMs).toISOString()
  const patched = patchSessionAdminForceRun(sessionId, {
    plannedStartIso: nowIso,
    adminForceRunUntilIso,
  })
  if (!patched) return { error: 'Could not update session.' }

  void appendAuditLog({
    kind: 'queue.admin_run',
    message: `Admin force-run started: ${row.target} (${sessionId}).`,
    detail: {
      sessionId,
      plannedStartIso: nowIso,
      adminForceRunUntilIso,
    },
  })

  emitAgentWakePollSequence(tenantId)
  const { reconcilePendingScheduleStatus } = await import('@/lib/imaging/reconcile')
  await reconcilePendingScheduleStatus()
  return { ok: true }
}
