import {
  getSessionById,
  listSessions,
  type SessionRow,
} from '../db.js'
import { getTonightScheduleStrip } from '../astro/schedule-strip.js'
import { getTonightSchedulingWindow } from '../astro/sunrise-window.js'
import { intervalsWhereAltitudeAtOrAbove } from '../astro/target-altitude.js'
import {
  initProjectRemaining,
  listProjectNights,
  remainingFramesTotal,
} from './project-store.js'

function projectHasOpenSessionsForNightKey(projectId: string, nightKey: string): boolean {
  return listProjectNights(projectId).some(
    (n) =>
      n.nightKey === nightKey &&
      (n.status === 'scheduled' || n.status === 'in_progress' || n.status === 'planned')
  )
}

/** In-progress multi-night project whose target-altitude window others must not use. */
export function getActiveProjectForAltitudeHold(now = new Date()): SessionRow | undefined {
  const stripNightKey = getTonightScheduleStrip(now).nightKey
  const active = listSessions().find(
    (s) =>
      s.projectMode &&
      s.status === 'in_progress' &&
      remainingFramesTotal(initProjectRemaining(s)) > 0 &&
      projectHasOpenSessionsForNightKey(s.id, stripNightKey)
  )
  return active
}

/** Tonight intervals (nautical dusk→dawn) where this project target is ≥30° — reserved from other queue rows. */
export function projectAltitudeHoldIntervals(
  project: Pick<SessionRow, 'raHours' | 'decDeg'>,
  now = new Date()
): Array<{ startMs: number; endMs: number }> {
  if (
    typeof project.raHours !== 'number' ||
    !Number.isFinite(project.raHours) ||
    typeof project.decDeg !== 'number' ||
    !Number.isFinite(project.decDeg)
  ) {
    return []
  }
  const window = getTonightSchedulingWindow(now)
  const startMs = Math.max(now.getTime(), window.nauticalDuskUtc.getTime())
  const endMs = window.nauticalDawnUtc.getTime()
  if (endMs <= startMs) return []
  return intervalsWhereAltitudeAtOrAbove(project.raHours, project.decDeg, startMs, endMs)
}

export function getScheduleReservedIntervalsForActiveProject(
  now = new Date()
): Array<{ startMs: number; endMs: number }> {
  const project = getActiveProjectForAltitudeHold(now)
  if (!project) return []
  return projectAltitudeHoldIntervals(project, now)
}

export { getSessionById }
