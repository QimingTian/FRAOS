import { hubPort } from '../config.js'
import {
  appendAuditLog,
  getDb,
  getSessionById,
  insertSession,
  listPendingSessions,
  sessionToPublicJson,
  type FilterPlan,
  type SessionOutputMode,
  type SessionRow,
  type SessionType,
} from '../db.js'
import { setObservatorySite } from '../observatory-site.js'
import { buildNinaSequenceJson } from './nina-sequence-json.js'
import { initProjectRemaining } from './project-store.js'
import { reconcilePendingScheduleStatus } from './reconcile.js'
import { VARIABLE_STAR_SESSION_OVERHEAD_SEC } from './session-overhead.js'
import type { SchedulePendingRow } from './schedule-insight.js'
import { emitAgentWakePollSequence, emitSiteSessionsChanged } from './live-bus.js'

function sessionProgressUrl(tenantId?: string): string {
  const base = `http://127.0.0.1:${hubPort()}`
  if (tenantId) {
    return `${base}/api/personal/${encodeURIComponent(tenantId)}/imaging/session-progress`
  }
  return `${base}/api/imaging/session-progress`
}

export function sessionToScheduleRow(s: SessionRow): SchedulePendingRow {
  return {
    id: s.id,
    createdAt: s.createdAt,
    target: s.target,
    projectMode: s.projectMode,
    raHours: s.raHours,
    decDeg: s.decDeg,
    exposureSeconds: s.exposureSeconds ?? 0,
    count: s.count ?? 0,
    filterPlans: s.filterPlans,
    estimatedDurationSeconds: s.estimatedDurationSeconds ?? undefined,
    status: s.status,
    plannedStartIso: s.plannedStartIso,
    sequenceTemplate: s.sequenceTemplate,
  }
}

function buildSequenceForSession(session: SessionRow, tenantId?: string): string | null {
  if (session.ninaSequenceJson) return session.ninaSequenceJson
  const firstPlan = session.filterPlans[0]
  const filterName = firstPlan?.filterName ?? session.filter ?? ''
  if (
    session.raHours == null ||
    session.decDeg == null ||
    !filterName ||
    session.exposureSeconds == null ||
    session.count == null
  ) {
    return null
  }
  const filterPlans = session.filterPlans.map((p) => ({
    filterName: p.filterName,
    exposureSeconds: p.exposureSeconds,
    exposureCount: p.count,
  }))
  return buildNinaSequenceJson({
    raHoursDecimal: session.raHours,
    decDegDecimal: session.decDeg,
    filterName,
    exposureSeconds: session.exposureSeconds,
    exposureCount: session.count,
    boreanQueueId: session.id,
    sessionProgressUrl: sessionProgressUrl(tenantId),
    templateKind: session.sequenceTemplate === 'variable_star' ? 'variable_star' : 'dso',
    outputMode: session.outputMode,
    filterPlans: filterPlans.length > 1 ? filterPlans : undefined,
    cameraCoolingTempC: session.cameraCoolingTempC ?? undefined,
    targetName: session.target,
    variableStarObservingSeconds:
      session.sequenceTemplate === 'variable_star' &&
      typeof session.estimatedDurationSeconds === 'number'
        ? Math.max(0, session.estimatedDurationSeconds - VARIABLE_STAR_SESSION_OVERHEAD_SEC)
        : undefined,
  })
}

export type QueueCreateInput = {
  target: string
  requestName?: string
  sessionType?: SessionType
  whenClosedBehavior?: string
  outputMode?: string
  outputModeRequested?: string
  cameraCoolingTempC?: number
  projectMode?: boolean
  raHours?: number | null
  decDeg?: number | null
  filter?: string | null
  exposureSeconds?: number | null
  count?: number | null
  filterPlans?: FilterPlan[]
  estimatedDurationSeconds?: number | null
  variableStarBlockHours?: number | null
  catalogQuery?: string | null
  observatoryLat?: number | null
  observatoryLon?: number | null
  observatoryElevationM?: number | null
}

export async function createQueueSession(
  input: QueueCreateInput,
  id: string,
  tenantId?: string
): Promise<SessionRow> {
  if (
    typeof input.observatoryLat === 'number' &&
    Number.isFinite(input.observatoryLat) &&
    typeof input.observatoryLon === 'number' &&
    Number.isFinite(input.observatoryLon)
  ) {
    setObservatorySite({
      lat: input.observatoryLat,
      lon: input.observatoryLon,
      elevationM:
        typeof input.observatoryElevationM === 'number' && Number.isFinite(input.observatoryElevationM)
          ? input.observatoryElevationM
          : undefined,
    })
  }

  const outputModeRaw = typeof input.outputMode === 'string' ? input.outputMode : 'none'
  const outputMode: SessionOutputMode = outputModeRaw === 'raw_zip' ? 'raw_zip' : 'none'
  const sessionType: SessionType =
    input.sessionType === 'variable_star' ? 'variable_star' : 'dso'
  const firstPlan = input.filterPlans?.[0]

  const draft = insertSession({
    id,
    target: input.target,
    requestName: input.requestName ?? input.target,
    sessionType,
    outputMode,
    outputModeRequested: input.outputModeRequested ?? outputModeRaw,
    whenClosedBehavior: input.whenClosedBehavior ?? null,
    projectMode: input.projectMode === true,
    cameraCoolingTempC: input.cameraCoolingTempC ?? null,
    raHours: input.raHours ?? null,
    decDeg: input.decDeg ?? null,
    filter: input.filter ?? firstPlan?.filterName ?? null,
    exposureSeconds: input.exposureSeconds ?? firstPlan?.exposureSeconds ?? null,
    count: input.count ?? firstPlan?.count ?? null,
    filterPlans: input.filterPlans ?? [],
    estimatedDurationSeconds: input.estimatedDurationSeconds ?? null,
    variableStarBlockHours: input.variableStarBlockHours ?? null,
    catalogQuery: input.catalogQuery ?? null,
  })

  if (draft.projectMode) {
    // Multi-night project: parent row tracks remaining frames; per-night JSON is built by the planner.
    initProjectRemaining(draft)
  } else {
    const ninaSequenceJson = buildSequenceForSession(draft, tenantId)
    if (ninaSequenceJson) {
      getDb().prepare(`UPDATE sessions SET nina_sequence_json = ? WHERE id = ?`).run(ninaSequenceJson, id)
    }
  }

  await reconcilePendingScheduleStatus()
  emitSiteSessionsChanged()
  emitAgentWakePollSequence()

  const session = getSessionById(id)!
  appendAuditLog({
    kind: 'queue.created',
    message: `Imaging session created: ${session.target} (${session.id})`,
    detail: { id: session.id, target: session.target, status: session.status },
  })
  return session
}

export function listSchedulePendingRows(): SchedulePendingRow[] {
  return listPendingSessions().map(sessionToScheduleRow)
}

export function sequenceJsonForSession(session: SessionRow, tenantId?: string): string | null {
  return buildSequenceForSession(session, tenantId)
}

/** Build the NINA sequence JSON for one project sub-session (one night's frame plan). */
export function buildProjectNightSequenceJson(
  project: SessionRow,
  nightSubId: string,
  filterPlansTonight: FilterPlan[],
  tenantId?: string
): string | null {
  const first = filterPlansTonight[0]
  if (!first || project.raHours == null || project.decDeg == null) return null
  return buildNinaSequenceJson({
    raHoursDecimal: project.raHours,
    decDegDecimal: project.decDeg,
    filterName: first.filterName,
    exposureSeconds: first.exposureSeconds,
    exposureCount: first.count,
    boreanQueueId: nightSubId,
    sessionProgressUrl: sessionProgressUrl(tenantId),
    templateKind: 'dso',
    outputMode: project.outputMode,
    filterPlans:
      filterPlansTonight.length > 0
        ? filterPlansTonight.map((p) => ({
            filterName: p.filterName,
            exposureSeconds: p.exposureSeconds,
            exposureCount: p.count,
          }))
        : undefined,
    cameraCoolingTempC: project.cameraCoolingTempC ?? undefined,
    targetName: project.target,
  })
}

export function sessionToPublic(session: SessionRow): Record<string, unknown> {
  return sessionToPublicJson(session)
}
