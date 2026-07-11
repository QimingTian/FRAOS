import { personalAppendAuditLog } from '@/lib/cloud/personal-audit-log'
import { getAgentHeartbeat, getImagingState, getTenantId, getTenantImagingCtx } from '@/lib/cloud/personal-imaging/ctx'
import { touchAgentHeartbeatInCtx } from '@/lib/cloud/personal-imaging/agent-heartbeat'
import type {
  FilterPlan,
  FilterRemaining,
  ObservatoryMode,
  ObservatoryStatus,
  SessionOutputMode,
  SessionRow,
  SessionStatus,
  SessionType,
} from '@/lib/cloud/personal-imaging/types'
import { getObservatorySite } from '@/lib/cloud/personal-imaging/observatory-site'
import { isWithinDaytimeClosedWindow } from '@/lib/content/sunrise-window'

function updateSession(id: string, patch: Partial<SessionRow>): SessionRow | null {
  const state = getImagingState()
  const idx = state.sessions.findIndex((s) => s.id === id)
  if (idx < 0) return null
  const now = new Date().toISOString()
  const next = { ...state.sessions[idx]!, ...patch, updatedAt: patch.updatedAt ?? now }
  state.sessions[idx] = next
  return next
}

export function getDb(): never {
  throw new Error('getDb() is not available in personal imaging store')
}

export function setSessionRemainingByFilter(id: string, remaining: FilterRemaining[]): void {
  updateSession(id, { remainingByFilter: remaining })
}

export function listSessions(): SessionRow[] {
  return [...getImagingState().sessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function listPendingSessions(): SessionRow[] {
  return listSessions().filter((s) => ['pending', 'scheduled', 'on_hold'].includes(s.status))
}

export function getSessionById(id: string): SessionRow | null {
  return getImagingState().sessions.find((s) => s.id === id) ?? null
}

export function deleteSessionById(sessionId: string): boolean {
  const state = getImagingState()
  const before = state.sessions.length
  state.sessions = state.sessions.filter((s) => s.id !== sessionId)
  state.projectNights = state.projectNights.filter((n) => n.projectId !== sessionId)
  return state.sessions.length < before
}

export function patchSessionRow(id: string, patch: Partial<SessionRow>): SessionRow | null {
  return updateSession(id, patch)
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
  createdByMemberId?: string | null
  createdByMemberName?: string | null
}): SessionRow {
  const now = new Date().toISOString()
  const sessionType = input.sessionType ?? 'dso'
  const session: SessionRow = {
    id: input.id,
    target: input.target,
    requestName: input.requestName ?? input.target,
    status: 'pending',
    sessionType,
    sequenceTemplate: sessionType,
    outputMode: input.outputMode,
    outputModeRequested: input.outputModeRequested ?? null,
    whenClosedBehavior: input.whenClosedBehavior ?? null,
    projectMode: Boolean(input.projectMode),
    cameraCoolingTempC: input.cameraCoolingTempC ?? null,
    createdAt: now,
    updatedAt: now,
    plannedStartIso: null,
    scheduleReasons: [],
    raHours: input.raHours ?? null,
    decDeg: input.decDeg ?? null,
    filter: input.filter ?? null,
    exposureSeconds: input.exposureSeconds ?? null,
    count: input.count ?? null,
    filterPlans: input.filterPlans ?? [],
    estimatedDurationSeconds: input.estimatedDurationSeconds ?? null,
    variableStarBlockHours: input.variableStarBlockHours ?? null,
    catalogQuery: input.catalogQuery ?? null,
    ninaSequenceJson: input.ninaSequenceJson ?? null,
    remainingByFilter: null,
    createdByMemberId: input.createdByMemberId ?? null,
    createdByMemberName: input.createdByMemberName ?? null,
  }
  getImagingState().sessions.push(session)
  return session
}

export function patchSessionSchedule(
  id: string,
  insight: { status: 'scheduled' | 'unscheduled'; plannedStartIso: string | null; reasons: string[] }
): void {
  const status: SessionStatus = insight.status === 'scheduled' ? 'scheduled' : 'pending'
  updateSession(id, {
    status,
    plannedStartIso: insight.plannedStartIso,
    scheduleReasons: insight.reasons,
  })
}

export function patchSessionStatus(id: string, status: SessionStatus): void {
  updateSession(id, { status })
}

export function setSessionPlannedStart(id: string, plannedStartIso: string | null): void {
  updateSession(id, { plannedStartIso })
}

export function consumeSession(id: string): SessionRow | null {
  const session = getSessionById(id)
  if (!session || session.status !== 'scheduled') return null
  return updateSession(id, { status: 'in_progress' })
}

export function getObservatoryState(): {
  mode: ObservatoryMode
  status: ObservatoryStatus
  agentLastSeenMs: number
  ninaRunning: boolean
} {
  const { observatory } = getImagingState()
  const heartbeat = getAgentHeartbeat()
  const agentLastSeenMs = Math.max(heartbeat.agentLastSeenMs, observatory.agentLastSeenMs)
  const ninaRunning = heartbeat.ninaRunning
  const mode = observatory.mode
  const storedStatus = observatory.status
  const staleMs = 90_000
  const now = Date.now()

  if (now - agentLastSeenMs > staleMs) {
    return { mode, status: 'disconnected', agentLastSeenMs, ninaRunning }
  }
  if (ninaRunning) {
    return { mode, status: 'busy_in_use', agentLastSeenMs, ninaRunning }
  }

  if (mode === 'auto') {
    const { lat, lon } = getObservatorySite()
    const status: ObservatoryStatus = isWithinDaytimeClosedWindow(new Date(now), lat, lon)
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
  const ctx = getTenantImagingCtx()
  ctx.agentHeartbeat = touchAgentHeartbeatInCtx(ctx.agentHeartbeat, {
    ninaRunning,
    nowMs: Date.now(),
  })
  ctx.agentHeartbeatDirty = true
}

export function setObservatoryPatch(input: {
  mode?: ObservatoryMode
  status?: ObservatoryStatus
}): void {
  const current = getObservatoryState()
  const state = getImagingState()
  state.observatory.mode = input.mode ?? current.mode
  state.observatory.status = input.status ?? current.status
}

export function appendAuditLog(input: {
  kind: string
  message: string
  detail?: Record<string, unknown>
  at?: string
}): void {
  void personalAppendAuditLog(getTenantId(), input)
}

export function wasEndNightAfterSessionsSent(nightKey: string): boolean {
  return getImagingState().endNight[nightKey]?.afterSessionsSent === true
}

export function markEndNightAfterSessionsSent(nightKey: string): void {
  const state = getImagingState()
  const prev = state.endNight[nightKey] ?? { afterSessionsSent: false, dawnSent: false }
  state.endNight[nightKey] = { ...prev, afterSessionsSent: true }
}

export function wasEndNightDawnSent(nightKey: string): boolean {
  return getImagingState().endNight[nightKey]?.dawnSent === true
}

export function markEndNightDawnSent(nightKey: string): void {
  const state = getImagingState()
  const prev = state.endNight[nightKey] ?? { afterSessionsSent: false, dawnSent: false }
  state.endNight[nightKey] = { ...prev, dawnSent: true }
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
    createdByMemberId: s.createdByMemberId ?? null,
    createdByMemberName: s.createdByMemberName ?? null,
  }
}

export function setSessionNinaSequenceJson(id: string, json: string): void {
  updateSession(id, { ninaSequenceJson: json })
}

export type {
  FilterPlan,
  FilterRemaining,
  ObservatoryMode,
  ObservatoryStatus,
  SessionOutputMode,
  SessionRow,
  SessionStatus,
  SessionType,
} from '@/lib/cloud/personal-imaging/types'
