import {
  appendAuditLog,
  getSessionById,
  insertSession,
  listPendingSessions,
  patchSessionRow,
  sessionToPublicJson,
  setSessionNinaSequenceJson,
} from '@/lib/cloud/personal-imaging/db'
import type {
  FilterPlan,
  SessionOutputMode,
  SessionRow,
  SessionType,
} from '@/lib/cloud/personal-imaging/types'
import { setObservatorySite } from '@/lib/cloud/personal-imaging/observatory-site'
import { buildNinaSequenceJson } from '@/lib/imaging/nina-sequence-json'
import { initProjectRemaining, clearProjectNights } from '@/lib/cloud/personal-imaging/project-db'
import { reconcilePendingScheduleStatus } from '@/lib/imaging/reconcile'
import { VARIABLE_STAR_SESSION_OVERHEAD_SEC } from '@/lib/imaging/session-overhead'
import type { SchedulePendingRow } from '@/lib/imaging/schedule-insight'
import { emitAgentWakePollSequence, emitSiteSessionsChanged } from '@/lib/imaging/live-bus'
import { getTenantId } from '@/lib/cloud/personal-imaging/ctx'
import { logSessionStatusChange } from '@/lib/cloud/personal-imaging/status-audit'

function sessionProgressUrl(tenantId?: string): string {
  const base = (process.env.BOREAN_API_BASE_URL ?? 'https://YOUR_DOMAIN').replace(/\/$/, '')
  const tid = tenantId ?? getTenantId()
  return `${base}/api/personal/${encodeURIComponent(tid)}/imaging/session-progress`
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
  mosaicMode?: boolean
  mosaicPanels?: Array<{
    id: number
    raHours: number
    decDeg: number
    positionAngleDeg: number
    name: string
  }>
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
  // Legacy stacked_master coerces to raw_zip
  const outputMode: SessionOutputMode =
    outputModeRaw === 'raw_zip' || outputModeRaw === 'stacked_master' ? 'raw_zip' : 'none'
  const sessionType: SessionType =
    input.sessionType === 'variable_star' ? 'variable_star' : 'dso'
  const firstPlan = input.filterPlans?.[0]
  const mosaicMode = sessionType === 'dso' && input.mosaicMode === true
  const mosaicPanels =
    mosaicMode && Array.isArray(input.mosaicPanels) && input.mosaicPanels.length > 0
      ? input.mosaicPanels
      : null

  const remainingSeed = (input.filterPlans ?? []).map((p) => ({
    filterName: p.filterName,
    exposureSeconds: p.exposureSeconds,
    countRemaining: p.count,
  }))
  const mosaicRemainingByPanel =
    mosaicMode && mosaicPanels
      ? mosaicPanels.map(() => remainingSeed.map((r) => ({ ...r })))
      : null

  const draft = insertSession({
    id,
    target: input.target,
    requestName: input.requestName ?? input.target,
    sessionType,
    outputMode,
    outputModeRequested: input.outputModeRequested ?? outputModeRaw,
    whenClosedBehavior: input.whenClosedBehavior ?? null,
    projectMode: input.projectMode === true || mosaicMode,
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
    mosaicMode,
    mosaicPanels,
    mosaicRemainingByPanel,
  })

  if (draft.projectMode) {
    // Multi-night project: parent row tracks remaining frames; per-night JSON is built by the planner.
    initProjectRemaining(draft)
  } else {
    const ninaSequenceJson = buildSequenceForSession(draft, tenantId)
    if (ninaSequenceJson) {
      setSessionNinaSequenceJson(id, ninaSequenceJson)
    }
  }

  await reconcilePendingScheduleStatus()
  emitSiteSessionsChanged(tenantId ?? getTenantId())
  emitAgentWakePollSequence(tenantId ?? getTenantId())

  const session = getSessionById(id)!
  appendAuditLog({
    kind: 'queue.created',
    message: `Imaging session created: ${session.target} (${session.id})`,
    detail: { id: session.id, target: session.target, status: session.status },
  })

  const insight = session.scheduleReasons
  if (session.status === 'scheduled' || (insight && insight.length > 0)) {
    void logSessionStatusChange({
      subject: { id: session.id, target: session.target, projectMode: session.projectMode },
      previousStatus: 'pending',
      nextStatus: session.status === 'scheduled' ? 'scheduled' : 'pending',
      plannedStartIso: session.plannedStartIso,
      reasons: insight,
      source: 'queue.submit',
    })
  }

  appendAuditLog({
    kind: 'queue.schedule_decision',
    message: `Scheduling decision for ${session.target}: ${session.status === 'scheduled' ? 'scheduled' : 'unscheduled'}`,
    detail: {
      id: session.id,
      target: session.target,
      status: session.status,
      plannedStartIso: session.plannedStartIso,
      reasons: insight ?? [],
    },
  })
  return session
}

export async function updatePendingSession(
  id: string,
  input: QueueCreateInput,
  tenantId?: string
): Promise<SessionRow | { error: string; status?: number }> {
  const current = getSessionById(id)
  if (!current) return { error: 'Not found', status: 404 }
  if (current.status !== 'pending' && current.status !== 'scheduled' && current.status !== 'on_hold') {
    return { error: "Session already started, can't edit session", status: 409 }
  }

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

  const outputModeRaw = typeof input.outputMode === 'string' ? input.outputMode : current.outputMode
  // Legacy stacked_master coerces to raw_zip
  const outputMode: SessionOutputMode =
    outputModeRaw === 'raw_zip' || outputModeRaw === 'stacked_master' ? 'raw_zip' : 'none'
  const sessionType: SessionType =
    input.sessionType === 'variable_star' ? 'variable_star' : 'dso'
  const firstPlan = input.filterPlans?.[0]

  const patched = patchSessionRow(id, {
    target: input.target,
    requestName: input.requestName ?? input.target,
    sessionType,
    sequenceTemplate: sessionType,
    outputMode,
    outputModeRequested: input.outputModeRequested ?? outputModeRaw,
    whenClosedBehavior: input.whenClosedBehavior ?? current.whenClosedBehavior,
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
    catalogQuery: input.catalogQuery ?? current.catalogQuery,
    ninaSequenceJson: null,
    remainingByFilter: null,
    status: 'pending',
    plannedStartIso: null,
    scheduleReasons: [],
  })
  if (!patched) return { error: 'Not found', status: 404 }

  clearProjectNights(id)
  if (patched.projectMode) {
    initProjectRemaining(patched)
  } else {
    const ninaSequenceJson = buildSequenceForSession(patched, tenantId)
    if (ninaSequenceJson) {
      setSessionNinaSequenceJson(id, ninaSequenceJson)
    }
  }

  await reconcilePendingScheduleStatus()
  emitSiteSessionsChanged(tenantId ?? getTenantId())
  emitAgentWakePollSequence(tenantId ?? getTenantId())

  const session = getSessionById(id)!
  appendAuditLog({
    kind: 'queue.edited',
    message: `Pending session edited: ${session.target} (${session.id}).`,
    detail: { id: session.id, target: session.target, status: session.status },
  })

  const insight = session.scheduleReasons
  if (session.status === 'scheduled' || (insight && insight.length > 0)) {
    void logSessionStatusChange({
      subject: { id: session.id, target: session.target, projectMode: session.projectMode },
      previousStatus: 'pending',
      nextStatus: session.status === 'scheduled' ? 'scheduled' : 'pending',
      plannedStartIso: session.plannedStartIso,
      reasons: insight,
      source: 'queue.edit',
    })
  }

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
