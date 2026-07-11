import Database from 'better-sqlite3'
import { isWithinDaytimeClosedWindow } from './astro/sunrise-window.js'
import { dbPath, ensureDataDir } from './config.js'

export type SessionOutputMode = 'none' | 'raw_zip'

export type SessionStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'on_hold'
  | 'rejected'

export type SessionType = 'dso' | 'variable_star'

export type FilterPlan = { filterName: string; exposureSeconds: number; count: number }

export type FilterRemaining = { filterName: string; exposureSeconds: number; countRemaining: number }

export type MosaicPanel = {
  id: number
  raHours: number
  decDeg: number
  positionAngleDeg: number
  name: string
}

export type SessionRow = {
  id: string
  target: string
  requestName: string | null
  status: SessionStatus
  sessionType: SessionType
  sequenceTemplate: SessionType
  outputMode: SessionOutputMode
  outputModeRequested: string | null
  whenClosedBehavior: string | null
  projectMode: boolean
  cameraCoolingTempC: number | null
  createdAt: string
  updatedAt: string
  plannedStartIso: string | null
  /** Admin force-run: do not unschedule until this instant (ISO). */
  adminForceRunUntilIso: string | null
  scheduleReasons: string[]
  raHours: number | null
  decDeg: number | null
  filter: string | null
  exposureSeconds: number | null
  count: number | null
  filterPlans: FilterPlan[]
  estimatedDurationSeconds: number | null
  variableStarBlockHours: number | null
  catalogQuery: string | null
  ninaSequenceJson: string | null
  remainingByFilter: FilterRemaining[] | null
  mosaicMode: boolean
  mosaicPanels: MosaicPanel[] | null
  mosaicRemainingByPanel: FilterRemaining[][] | null
}

export type ObservatoryMode = 'manual' | 'auto'
export type ObservatoryStatus =
  | 'ready'
  | 'busy_in_use'
  | 'disconnected'
  | 'closed_weather_not_permitted'
  | 'closed_daytime'
  | 'closed_observatory_maintenance'

export type AuditLogEntry = {
  id: string
  at: string
  kind: string
  message: string
  detail?: Record<string, unknown>
}

export type EmergencyStopPhase = 'stopping' | 'stopped'

export type EmergencyStopState = {
  phase: EmergencyStopPhase
  queueId: string
  requestedAt: string
  requestedBy?: string | null
  deliveredAt?: string | null
  completedAt?: string | null
  heldSessionIds: string[]
}

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  ensureDataDir()
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      status TEXT NOT NULL,
      output_mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      planned_start_iso TEXT,
      ra_hours REAL,
      dec_deg REAL,
      filter TEXT,
      exposure_seconds INTEGER,
      count INTEGER
    );

    CREATE TABLE IF NOT EXISTS observatory (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mode TEXT NOT NULL DEFAULT 'auto',
      status TEXT NOT NULL DEFAULT 'disconnected',
      agent_last_seen_ms INTEGER NOT NULL DEFAULT 0,
      nina_running INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS observatory_site (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      lat REAL NOT NULL DEFAULT 0,
      lon REAL NOT NULL DEFAULT 0,
      elevation_m REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      detail_json TEXT
    );

    CREATE TABLE IF NOT EXISTS estop_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      phase TEXT,
      queue_id TEXT,
      requested_at TEXT,
      requested_by TEXT,
      delivered_at TEXT,
      completed_at TEXT,
      held_session_ids_json TEXT
    );

    CREATE TABLE IF NOT EXISTS end_night_state (
      night_key TEXT PRIMARY KEY,
      after_sessions_sent INTEGER NOT NULL DEFAULT 0,
      dawn_sent INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS project_nights (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      night_key TEXT NOT NULL,
      night_index INTEGER NOT NULL,
      status TEXT NOT NULL,
      filter_plans_json TEXT NOT NULL DEFAULT '[]',
      planned_start_iso TEXT,
      nina_sequence_json TEXT,
      nina_delivered_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_project_nights_project ON project_nights (project_id);

    INSERT OR IGNORE INTO observatory (id, mode, status)
    VALUES (1, 'auto', 'disconnected');

    INSERT OR IGNORE INTO observatory_site (id, lat, lon, elevation_m)
    VALUES (1, 0, 0, 0);
  `)

  const cols = database.prepare(`PRAGMA table_info(sessions)`).all() as Array<{ name: string }>
  const names = new Set(cols.map((c) => c.name))
  const addCol = (sql: string) => {
    try {
      database.exec(sql)
    } catch {
      // column exists
    }
  }
  if (!names.has('request_name')) addCol(`ALTER TABLE sessions ADD COLUMN request_name TEXT`)
  if (!names.has('session_type')) addCol(`ALTER TABLE sessions ADD COLUMN session_type TEXT DEFAULT 'dso'`)
  if (!names.has('sequence_template')) addCol(`ALTER TABLE sessions ADD COLUMN sequence_template TEXT DEFAULT 'dso'`)
  if (!names.has('output_mode_requested')) addCol(`ALTER TABLE sessions ADD COLUMN output_mode_requested TEXT`)
  if (!names.has('when_closed_behavior')) addCol(`ALTER TABLE sessions ADD COLUMN when_closed_behavior TEXT`)
  if (!names.has('project_mode')) addCol(`ALTER TABLE sessions ADD COLUMN project_mode INTEGER DEFAULT 0`)
  if (!names.has('camera_cooling_temp_c')) addCol(`ALTER TABLE sessions ADD COLUMN camera_cooling_temp_c REAL`)
  if (!names.has('schedule_reasons_json')) addCol(`ALTER TABLE sessions ADD COLUMN schedule_reasons_json TEXT`)
  if (!names.has('filter_plans_json')) addCol(`ALTER TABLE sessions ADD COLUMN filter_plans_json TEXT`)
  if (!names.has('estimated_duration_seconds')) addCol(`ALTER TABLE sessions ADD COLUMN estimated_duration_seconds INTEGER`)
  if (!names.has('variable_star_block_hours')) addCol(`ALTER TABLE sessions ADD COLUMN variable_star_block_hours REAL`)
  if (!names.has('catalog_query')) addCol(`ALTER TABLE sessions ADD COLUMN catalog_query TEXT`)
  if (!names.has('nina_sequence_json')) addCol(`ALTER TABLE sessions ADD COLUMN nina_sequence_json TEXT`)
  if (!names.has('remaining_by_filter_json')) {
    addCol(`ALTER TABLE sessions ADD COLUMN remaining_by_filter_json TEXT`)
  }
  if (!names.has('mosaic_mode')) addCol(`ALTER TABLE sessions ADD COLUMN mosaic_mode INTEGER DEFAULT 0`)
  if (!names.has('mosaic_panels_json')) addCol(`ALTER TABLE sessions ADD COLUMN mosaic_panels_json TEXT`)
  if (!names.has('mosaic_remaining_by_panel_json')) {
    addCol(`ALTER TABLE sessions ADD COLUMN mosaic_remaining_by_panel_json TEXT`)
  }
  if (!names.has('admin_force_run_until_iso')) {
    addCol(`ALTER TABLE sessions ADD COLUMN admin_force_run_until_iso TEXT`)
  }

  const nightCols = database.prepare(`PRAGMA table_info(project_nights)`).all() as Array<{ name: string }>
  const nightNames = new Set(nightCols.map((c) => c.name))
  if (!nightNames.has('admin_force_run_until_iso')) {
    addCol(`ALTER TABLE project_nights ADD COLUMN admin_force_run_until_iso TEXT`)
  }
}

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseFilterPlans(raw: unknown): FilterPlan[] {
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

function rowToSession(row: Record<string, unknown>): SessionRow {
  const sessionType = (row.session_type as SessionType) ?? 'dso'
  return {
    id: String(row.id),
    target: String(row.target),
    requestName: row.request_name != null ? String(row.request_name) : null,
    status: row.status as SessionStatus,
    sessionType,
    sequenceTemplate: (row.sequence_template as SessionType) ?? sessionType,
    outputMode: row.output_mode === 'raw_zip' || row.output_mode === 'stacked_master' ? 'raw_zip' : 'none',
    outputModeRequested: row.output_mode_requested != null ? String(row.output_mode_requested) : null,
    whenClosedBehavior: row.when_closed_behavior != null ? String(row.when_closed_behavior) : null,
    projectMode: Number(row.project_mode) === 1,
    cameraCoolingTempC: row.camera_cooling_temp_c != null ? Number(row.camera_cooling_temp_c) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    plannedStartIso: row.planned_start_iso != null ? String(row.planned_start_iso) : null,
    adminForceRunUntilIso:
      row.admin_force_run_until_iso != null ? String(row.admin_force_run_until_iso) : null,
    scheduleReasons: parseJsonArray(row.schedule_reasons_json),
    raHours: row.ra_hours != null ? Number(row.ra_hours) : null,
    decDeg: row.dec_deg != null ? Number(row.dec_deg) : null,
    filter: row.filter != null ? String(row.filter) : null,
    exposureSeconds: row.exposure_seconds != null ? Number(row.exposure_seconds) : null,
    count: row.count != null ? Number(row.count) : null,
    filterPlans: parseFilterPlans(row.filter_plans_json),
    estimatedDurationSeconds:
      row.estimated_duration_seconds != null ? Number(row.estimated_duration_seconds) : null,
    variableStarBlockHours:
      row.variable_star_block_hours != null ? Number(row.variable_star_block_hours) : null,
    catalogQuery: row.catalog_query != null ? String(row.catalog_query) : null,
    ninaSequenceJson: row.nina_sequence_json != null ? String(row.nina_sequence_json) : null,
    remainingByFilter: parseFilterRemaining(row.remaining_by_filter_json),
    mosaicMode: Number(row.mosaic_mode) === 1,
    mosaicPanels: parseMosaicPanels(row.mosaic_panels_json),
    mosaicRemainingByPanel: parseMosaicRemaining(row.mosaic_remaining_by_panel_json),
  }
}

function parseMosaicPanels(raw: unknown): MosaicPanel[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const out: MosaicPanel[] = []
    for (const p of parsed) {
      if (!p || typeof p !== 'object') continue
      const rec = p as Record<string, unknown>
      const raHours = Number(rec.raHours)
      const decDeg = Number(rec.decDeg)
      const positionAngleDeg = Number(rec.positionAngleDeg)
      const id = Number(rec.id)
      if (![raHours, decDeg, positionAngleDeg, id].every((x) => Number.isFinite(x))) continue
      out.push({
        id,
        raHours,
        decDeg,
        positionAngleDeg,
        name: typeof rec.name === 'string' ? rec.name : `Panel ${id}`,
      })
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

function parseMosaicRemaining(raw: unknown): FilterRemaining[][] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.map((rows) => {
      if (!Array.isArray(rows)) return []
      return rows
        .map((p) => {
          if (!p || typeof p !== 'object') return null
          const rec = p as Record<string, unknown>
          const filterName = typeof rec.filterName === 'string' ? rec.filterName : ''
          const exposureSeconds = Number(rec.exposureSeconds)
          const countRemaining = Number(rec.countRemaining)
          if (!filterName || !Number.isFinite(exposureSeconds) || !Number.isFinite(countRemaining)) {
            return null
          }
          return { filterName, exposureSeconds, countRemaining }
        })
        .filter((x): x is FilterRemaining => x != null)
    })
  } catch {
    return null
  }
}

function parseFilterRemaining(raw: unknown): FilterRemaining[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed
      .map((p) => {
        if (!p || typeof p !== 'object') return null
        const rec = p as Record<string, unknown>
        const filterName = typeof rec.filterName === 'string' ? rec.filterName : ''
        const exposureSeconds = Number(rec.exposureSeconds)
        const countRemaining = Number(rec.countRemaining)
        if (!filterName || !Number.isFinite(exposureSeconds) || !Number.isFinite(countRemaining)) {
          return null
        }
        return { filterName, exposureSeconds, countRemaining }
      })
      .filter((x): x is FilterRemaining => x != null)
  } catch {
    return null
  }
}

export function setSessionRemainingByFilter(id: string, remaining: FilterRemaining[]): void {
  getDb()
    .prepare(`UPDATE sessions SET remaining_by_filter_json = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(remaining), new Date().toISOString(), id)
}

export function listSessions(): SessionRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM sessions ORDER BY datetime(created_at) ASC`)
    .all() as Record<string, unknown>[]
  return rows.map(rowToSession)
}

export function listPendingSessions(): SessionRow[] {
  return listSessions().filter((s) =>
    ['pending', 'scheduled', 'on_hold'].includes(s.status)
  )
}

export function getSessionById(id: string): SessionRow | null {
  const row = getDb().prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToSession(row) : null
}

export function deleteSessionById(sessionId: string): boolean {
  const db = getDb()
  db.prepare(`DELETE FROM project_nights WHERE project_id = ?`).run(sessionId)
  const result = db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId)
  return result.changes > 0
}

export function insertSession(input: {
  id: string
  target: string
  requestName?: string | null
  sessionType?: SessionType
  outputMode: SessionOutputMode
  outputModeRequested?: string | null
  whenClosedBehavior?: string | null
  projectMode?: boolean
  cameraCoolingTempC?: number | null
  raHours?: number | null
  decDeg?: number | null
  filter?: string | null
  exposureSeconds?: number | null
  count?: number | null
  filterPlans?: FilterPlan[]
  estimatedDurationSeconds?: number | null
  variableStarBlockHours?: number | null
  catalogQuery?: string | null
  ninaSequenceJson?: string | null
  mosaicMode?: boolean
  mosaicPanels?: MosaicPanel[] | null
  mosaicRemainingByPanel?: FilterRemaining[][] | null
}): SessionRow {
  const now = new Date().toISOString()
  const sessionType = input.sessionType ?? 'dso'
  getDb()
    .prepare(
      `INSERT INTO sessions (
        id, target, request_name, status, session_type, sequence_template,
        output_mode, output_mode_requested, when_closed_behavior, project_mode,
        camera_cooling_temp_c, created_at, updated_at, planned_start_iso,
        schedule_reasons_json, ra_hours, dec_deg, filter, exposure_seconds, count,
        filter_plans_json, estimated_duration_seconds, variable_star_block_hours,
        catalog_query, nina_sequence_json, mosaic_mode, mosaic_panels_json,
        mosaic_remaining_by_panel_json
      ) VALUES (
        ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`
    )
    .run(
      input.id,
      input.target,
      input.requestName ?? input.target,
      sessionType,
      sessionType,
      input.outputMode,
      input.outputModeRequested ?? null,
      input.whenClosedBehavior ?? null,
      input.projectMode ? 1 : 0,
      input.cameraCoolingTempC ?? null,
      now,
      now,
      input.raHours ?? null,
      input.decDeg ?? null,
      input.filter ?? null,
      input.exposureSeconds ?? null,
      input.count ?? null,
      JSON.stringify(input.filterPlans ?? []),
      input.estimatedDurationSeconds ?? null,
      input.variableStarBlockHours ?? null,
      input.catalogQuery ?? null,
      input.ninaSequenceJson ?? null,
      input.mosaicMode ? 1 : 0,
      input.mosaicPanels ? JSON.stringify(input.mosaicPanels) : null,
      input.mosaicRemainingByPanel ? JSON.stringify(input.mosaicRemainingByPanel) : null
    )
  return getSessionById(input.id)!
}

export function patchSessionSchedule(
  id: string,
  insight: { status: 'scheduled' | 'unscheduled'; plannedStartIso: string | null; reasons: string[] }
): void {
  const now = new Date().toISOString()
  const status = insight.status === 'scheduled' ? 'scheduled' : 'pending'
  getDb()
    .prepare(
      `UPDATE sessions SET status = ?, planned_start_iso = ?, schedule_reasons_json = ?, updated_at = ? WHERE id = ?`
    )
    .run(status, insight.plannedStartIso, JSON.stringify(insight.reasons), now, id)
}

export function patchSessionStatus(id: string, status: SessionStatus): void {
  const now = new Date().toISOString()
  getDb().prepare(`UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, id)
}

/** Schedule a normal queue row for admin force-run (planned start = now, occupancy until end). */
export function patchSessionAdminForceRun(
  id: string,
  input: { plannedStartIso: string; adminForceRunUntilIso: string }
): SessionRow | null {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE sessions SET status = 'scheduled', planned_start_iso = ?, admin_force_run_until_iso = ?,
        schedule_reasons_json = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      input.plannedStartIso,
      input.adminForceRunUntilIso,
      JSON.stringify(['Admin force-run scheduled.']),
      now,
      id
    )
  return getSessionById(id)
}

/** Update planned start without changing status (used for in-progress project parents). */
export function setSessionPlannedStart(id: string, plannedStartIso: string | null): void {
  getDb()
    .prepare(`UPDATE sessions SET planned_start_iso = ?, updated_at = ? WHERE id = ?`)
    .run(plannedStartIso, new Date().toISOString(), id)
}

export function consumeSession(id: string): SessionRow | null {
  const session = getSessionById(id)
  if (!session || session.status !== 'scheduled') return null
  const now = new Date().toISOString()
  getDb().prepare(`UPDATE sessions SET status = 'in_progress', updated_at = ? WHERE id = ?`).run(now, id)
  return getSessionById(id)
}

export function getObservatoryState(): {
  mode: ObservatoryMode
  status: ObservatoryStatus
  agentLastSeenMs: number
  ninaRunning: boolean
} {
  const row = getDb()
    .prepare(`SELECT mode, status, agent_last_seen_ms, nina_running FROM observatory WHERE id = 1`)
    .get() as Record<string, unknown>
  const agentLastSeenMs = Number(row.agent_last_seen_ms) || 0
  const ninaRunning = Number(row.nina_running) === 1
  const mode = row.mode as ObservatoryMode
  const storedStatus = row.status as ObservatoryStatus
  const staleMs = 90_000
  const now = Date.now()

  if (now - agentLastSeenMs > staleMs) {
    return { mode, status: 'disconnected', agentLastSeenMs, ninaRunning }
  }
  if (ninaRunning) {
    return { mode, status: 'busy_in_use', agentLastSeenMs, ninaRunning }
  }

  if (mode === 'auto') {
    const status: ObservatoryStatus = isWithinDaytimeClosedWindow(new Date(now))
      ? 'closed_daytime'
      : 'ready'
    return { mode, status, agentLastSeenMs, ninaRunning }
  }

  const manualStatus: ObservatoryStatus =
    storedStatus === 'ready' ||
    storedStatus === 'closed_weather_not_permitted' ||
    storedStatus === 'closed_daytime' ||
    storedStatus === 'closed_observatory_maintenance'
      ? storedStatus
      : 'ready'
  return { mode, status: manualStatus, agentLastSeenMs, ninaRunning }
}

export function isObservatoryReady(): boolean {
  const { mode, status } = getObservatoryState()
  if (mode === 'manual') return status === 'ready'
  return status === 'ready'
}

export function touchAgentPulse(ninaRunning: boolean): void {
  getDb()
    .prepare(`UPDATE observatory SET agent_last_seen_ms = ?, nina_running = ? WHERE id = 1`)
    .run(Date.now(), ninaRunning ? 1 : 0)
}

export function setObservatoryPatch(input: {
  mode?: ObservatoryMode
  status?: ObservatoryStatus
}): void {
  const current = getObservatoryState()
  getDb()
    .prepare(`UPDATE observatory SET mode = ?, status = ? WHERE id = 1`)
    .run(input.mode ?? current.mode, input.status ?? current.status)
}

export function appendAuditLog(input: {
  kind: string
  message: string
  detail?: Record<string, unknown>
  at?: string
}): void {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  getDb()
    .prepare(`INSERT INTO audit_log (id, at, kind, message, detail_json) VALUES (?, ?, ?, ?, ?)`)
    .run(
      id,
      input.at ?? new Date().toISOString(),
      input.kind,
      input.message,
      input.detail ? JSON.stringify(input.detail) : null
    )
  getDb().prepare(`DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY at DESC LIMIT 400)`).run()
}

export function listAuditLog(limit = 250): AuditLogEntry[] {
  const n = Math.min(Math.max(1, limit), 400)
  const rows = getDb()
    .prepare(`SELECT id, at, kind, message, detail_json FROM audit_log ORDER BY at DESC LIMIT ?`)
    .all(n) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id),
    at: String(row.at),
    kind: String(row.kind),
    message: String(row.message),
    ...(typeof row.detail_json === 'string' && row.detail_json
      ? { detail: JSON.parse(row.detail_json) as Record<string, unknown> }
      : {}),
  }))
}

export function loadEmergencyStopState(): EmergencyStopState | null {
  const row = getDb()
    .prepare(
      `SELECT phase, queue_id, requested_at, requested_by, delivered_at, completed_at, held_session_ids_json FROM estop_state WHERE id = 1`
    )
    .get() as Record<string, unknown> | undefined
  if (!row?.phase) return null
  return {
    phase: row.phase as EmergencyStopPhase,
    queueId: String(row.queue_id),
    requestedAt: String(row.requested_at),
    requestedBy: row.requested_by != null ? String(row.requested_by) : null,
    deliveredAt: row.delivered_at != null ? String(row.delivered_at) : null,
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    heldSessionIds: parseJsonArray(row.held_session_ids_json),
  }
}

export function saveEmergencyStopState(state: EmergencyStopState | null): void {
  if (!state) {
    getDb().prepare(`DELETE FROM estop_state WHERE id = 1`).run()
    return
  }
  getDb()
    .prepare(
      `INSERT INTO estop_state (id, phase, queue_id, requested_at, requested_by, delivered_at, completed_at, held_session_ids_json)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         phase = excluded.phase,
         queue_id = excluded.queue_id,
         requested_at = excluded.requested_at,
         requested_by = excluded.requested_by,
         delivered_at = excluded.delivered_at,
         completed_at = excluded.completed_at,
         held_session_ids_json = excluded.held_session_ids_json`
    )
    .run(
      state.phase,
      state.queueId,
      state.requestedAt,
      state.requestedBy ?? null,
      state.deliveredAt ?? null,
      state.completedAt ?? null,
      JSON.stringify(state.heldSessionIds)
    )
}

export function wasEndNightAfterSessionsSent(nightKey: string): boolean {
  const row = getDb()
    .prepare(`SELECT after_sessions_sent FROM end_night_state WHERE night_key = ?`)
    .get(nightKey) as { after_sessions_sent?: number } | undefined
  return Number(row?.after_sessions_sent) === 1
}

export function markEndNightAfterSessionsSent(nightKey: string): void {
  getDb()
    .prepare(
      `INSERT INTO end_night_state (night_key, after_sessions_sent, dawn_sent) VALUES (?, 1, 0)
       ON CONFLICT(night_key) DO UPDATE SET after_sessions_sent = 1`
    )
    .run(nightKey)
}

export function wasEndNightDawnSent(nightKey: string): boolean {
  const row = getDb()
    .prepare(`SELECT dawn_sent FROM end_night_state WHERE night_key = ?`)
    .get(nightKey) as { dawn_sent?: number } | undefined
  return Number(row?.dawn_sent) === 1
}

export function markEndNightDawnSent(nightKey: string): void {
  getDb()
    .prepare(
      `INSERT INTO end_night_state (night_key, after_sessions_sent, dawn_sent) VALUES (?, 0, 1)
       ON CONFLICT(night_key) DO UPDATE SET dawn_sent = 1`
    )
    .run(nightKey)
}

export function sessionToPublicJson(s: SessionRow): Record<string, unknown> {
  return {
    id: s.id,
    target: s.target,
    requestName: s.requestName ?? s.target,
    status: s.status,
    outputMode: s.outputMode,
    outputModeRequested: s.outputModeRequested,
    whenClosedBehavior: s.whenClosedBehavior,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    plannedStartIso: s.plannedStartIso,
    scheduleReasons: s.scheduleReasons,
    raHours: s.raHours,
    decDeg: s.decDeg,
    filter: s.filter,
    exposureSeconds: s.exposureSeconds,
    count: s.count,
    filterPlans: s.filterPlans,
    estimatedDurationSeconds: s.estimatedDurationSeconds,
    sessionType: s.sessionType,
    sequenceTemplate: s.sequenceTemplate,
    projectMode: s.projectMode,
    cameraCoolingTempC: s.cameraCoolingTempC,
    variableStarBlockHours: s.variableStarBlockHours,
    catalogQuery: s.catalogQuery,
    mosaicMode: s.mosaicMode,
    mosaicPanels: s.mosaicPanels,
  }
}