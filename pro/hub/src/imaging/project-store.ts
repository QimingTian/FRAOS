import {
  getDb,
  getSessionById,
  patchSessionStatus,
  setSessionRemainingByFilter,
  type FilterPlan,
  type FilterRemaining,
  type SessionRow,
} from '../db.js'

export type ProjectNightStatus =
  | 'planned'
  | 'scheduled'
  | 'on_hold'
  | 'in_progress'
  | 'completed'
  | 'failed'

export type ProjectNight = {
  id: string
  projectId: string
  nightKey: string
  nightIndex: number
  status: ProjectNightStatus
  filterPlansTonight: FilterPlan[]
  plannedStartIso: string | null
  /** Admin force-run: do not unschedule until this instant (ISO). */
  adminForceRunUntilIso: string | null
  ninaSequenceJson: string | null
  ninaDeliveredAt: string | null
  completedAt: string | null
  failedAt: string | null
}

function rowToNight(row: Record<string, unknown>): ProjectNight {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    nightKey: String(row.night_key),
    nightIndex: Number(row.night_index),
    status: row.status as ProjectNightStatus,
    filterPlansTonight: parsePlans(row.filter_plans_json),
    plannedStartIso: row.planned_start_iso != null ? String(row.planned_start_iso) : null,
    adminForceRunUntilIso:
      row.admin_force_run_until_iso != null ? String(row.admin_force_run_until_iso) : null,
    ninaSequenceJson: row.nina_sequence_json != null ? String(row.nina_sequence_json) : null,
    ninaDeliveredAt: row.nina_delivered_at != null ? String(row.nina_delivered_at) : null,
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    failedAt: row.failed_at != null ? String(row.failed_at) : null,
  }
}

function parsePlans(raw: unknown): FilterPlan[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((p) => {
        if (!p || typeof p !== 'object') return null
        const rec = p as Record<string, unknown>
        const filterName = typeof rec.filterName === 'string' ? rec.filterName : ''
        const exposureSeconds = Number(rec.exposureSeconds)
        const count = Number(rec.count)
        if (!filterName || !Number.isFinite(exposureSeconds) || !Number.isFinite(count)) return null
        return { filterName, exposureSeconds, count }
      })
      .filter((x): x is FilterPlan => x != null)
  } catch {
    return []
  }
}

export function projectNightSubId(projectId: string, nightIndex: number): string {
  return `${projectId}__s${nightIndex}`
}

export function listProjectNights(projectId: string): ProjectNight[] {
  const rows = getDb()
    .prepare(`SELECT * FROM project_nights WHERE project_id = ? ORDER BY night_index ASC`)
    .all(projectId) as Record<string, unknown>[]
  return rows.map(rowToNight)
}

export function getProjectNightById(id: string): ProjectNight | null {
  const row = getDb().prepare(`SELECT * FROM project_nights WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToNight(row) : null
}

export function listAllOpenProjectNights(): ProjectNight[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM project_nights WHERE status IN ('scheduled','in_progress') ORDER BY night_index ASC`
    )
    .all() as Record<string, unknown>[]
  return rows.map(rowToNight)
}

export function remainingFramesTotal(remaining: FilterRemaining[] | null): number {
  if (!remaining) return 0
  return remaining.reduce((sum, r) => sum + Math.max(0, r.countRemaining), 0)
}

/** Project parent rows live in `sessions` with project_mode=1; remaining frames init from filterPlans. */
export function initProjectRemaining(project: SessionRow): FilterRemaining[] {
  if (project.remainingByFilter) return project.remainingByFilter
  const remaining: FilterRemaining[] = project.filterPlans.map((p) => ({
    filterName: p.filterName,
    exposureSeconds: p.exposureSeconds,
    countRemaining: p.count,
  }))
  setSessionRemainingByFilter(project.id, remaining)
  return remaining
}

export function nextNightIndex(projectId: string): number {
  const nights = listProjectNights(projectId)
  if (nights.length === 0) return 1
  return Math.max(...nights.map((n) => n.nightIndex)) + 1
}

export function upsertProjectNight(input: {
  id: string
  projectId: string
  nightKey: string
  nightIndex: number
  status: ProjectNightStatus
  filterPlansTonight: FilterPlan[]
  plannedStartIso: string | null
  ninaSequenceJson: string | null
  adminForceRunUntilIso?: string | null
}): void {
  const now = new Date().toISOString()
  const existing = getProjectNightById(input.id)
  const forceUntil =
    input.adminForceRunUntilIso !== undefined
      ? input.adminForceRunUntilIso
      : (existing?.adminForceRunUntilIso ?? null)
  if (existing) {
    getDb()
      .prepare(
        `UPDATE project_nights SET night_key = ?, night_index = ?, status = ?, filter_plans_json = ?,
          planned_start_iso = ?, nina_sequence_json = ?, admin_force_run_until_iso = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        input.nightKey,
        input.nightIndex,
        input.status,
        JSON.stringify(input.filterPlansTonight),
        input.plannedStartIso,
        input.ninaSequenceJson,
        forceUntil,
        now,
        input.id
      )
    return
  }
  getDb()
    .prepare(
      `INSERT INTO project_nights (
        id, project_id, night_key, night_index, status, filter_plans_json,
        planned_start_iso, nina_sequence_json, admin_force_run_until_iso,
        nina_delivered_at, completed_at, failed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`
    )
    .run(
      input.id,
      input.projectId,
      input.nightKey,
      input.nightIndex,
      input.status,
      JSON.stringify(input.filterPlansTonight),
      input.plannedStartIso,
      input.ninaSequenceJson,
      forceUntil,
      now,
      now
    )
}

/** Patch a project night for admin force-run. */
export function patchProjectNightAdminForceRun(
  nightId: string,
  input: {
    nightKey: string
    plannedStartIso: string
    adminForceRunUntilIso: string
    ninaSequenceJson: string | null
  }
): ProjectNight | null {
  const night = getProjectNightById(nightId)
  if (!night) return null
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE project_nights SET status = 'scheduled', night_key = ?, planned_start_iso = ?,
        admin_force_run_until_iso = ?, nina_sequence_json = COALESCE(?, nina_sequence_json), updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.nightKey,
      input.plannedStartIso,
      input.adminForceRunUntilIso,
      input.ninaSequenceJson,
      now,
      nightId
    )
  return getProjectNightById(nightId)
}

/** Replace tonight's `scheduled` sub-sessions for a project's night (keeps in_progress/completed/failed + active force-runs). */
export function replaceScheduledNights(
  projectId: string,
  nightKey: string,
  subs: Array<{
    id: string
    nightIndex: number
    filterPlansTonight: FilterPlan[]
    plannedStartIso: string | null
    ninaSequenceJson: string | null
  }>
): void {
  const db = getDb()
  const nowMs = Date.now()
  const existing = listProjectNights(projectId).filter(
    (n) => n.nightKey === nightKey && n.status === 'scheduled'
  )
  const forceRunIds = new Set(
    existing
      .filter(
        (n) =>
          n.adminForceRunUntilIso != null &&
          Number.isFinite(Date.parse(n.adminForceRunUntilIso)) &&
          Date.parse(n.adminForceRunUntilIso) > nowMs
      )
      .map((n) => n.id)
  )
  for (const n of existing) {
    if (forceRunIds.has(n.id)) continue
    db.prepare(`DELETE FROM project_nights WHERE id = ?`).run(n.id)
  }
  for (const sub of subs) {
    if (forceRunIds.has(sub.id)) continue
    upsertProjectNight({
      id: sub.id,
      projectId,
      nightKey,
      nightIndex: sub.nightIndex,
      status: 'scheduled',
      filterPlansTonight: sub.filterPlansTonight,
      plannedStartIso: sub.plannedStartIso,
      ninaSequenceJson: sub.ninaSequenceJson,
    })
  }
}

export function markNightInProgress(nightId: string): void {
  const now = new Date().toISOString()
  const night = getProjectNightById(nightId)
  if (!night) return
  getDb()
    .prepare(
      `UPDATE project_nights SET status = 'in_progress', nina_delivered_at = COALESCE(nina_delivered_at, ?), updated_at = ? WHERE id = ?`
    )
    .run(now, now, nightId)
  patchSessionStatus(night.projectId, 'in_progress')
}

/** Decrement remaining frames; returns whether the whole project is now complete. */
export function markNightCompleted(nightId: string): { projectCompleted: boolean } | null {
  const night = getProjectNightById(nightId)
  if (!night) return null
  const project = getSessionById(night.projectId)
  if (!project) return null
  const now = new Date().toISOString()

  const remaining = initProjectRemaining(project).map((r) => {
    const shot = night.filterPlansTonight.find((p) => p.filterName === r.filterName)
    if (!shot) return r
    return { ...r, countRemaining: Math.max(0, r.countRemaining - shot.count) }
  })
  setSessionRemainingByFilter(project.id, remaining)

  getDb()
    .prepare(`UPDATE project_nights SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, nightId)

  const projectCompleted = remainingFramesTotal(remaining) === 0
  patchSessionStatus(project.id, projectCompleted ? 'completed' : 'in_progress')
  return { projectCompleted }
}

export function markNightFailed(nightId: string): void {
  const now = new Date().toISOString()
  getDb()
    .prepare(`UPDATE project_nights SET status = 'failed', failed_at = ?, updated_at = ? WHERE id = ?`)
    .run(now, now, nightId)
}

/** Earliest scheduled, NINA-ready sub-session for a night key (delivery order). */
export function getDeliverableNight(projectId: string, nightKey: string): ProjectNight | null {
  const nights = listProjectNights(projectId).filter(
    (n) => n.nightKey === nightKey && n.status === 'scheduled' && n.ninaSequenceJson
  )
  nights.sort((a, b) => {
    const ta = Date.parse(a.plannedStartIso ?? '')
    const tb = Date.parse(b.plannedStartIso ?? '')
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb
    return a.nightIndex - b.nightIndex
  })
  return nights[0] ?? null
}
