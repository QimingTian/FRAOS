import { AsyncLocalStorage } from 'node:async_hooks'
import { kvEnabled, kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import type { PersonalEmergencyStopState } from '@/lib/cloud/personal-emergency-stop'
import {
  defaultAgentHeartbeat,
  loadAgentHeartbeat,
  mergeHeartbeat,
  persistAgentHeartbeat,
  type AgentHeartbeat,
} from '@/lib/cloud/personal-imaging/agent-heartbeat'
import {
  defaultTenantImagingState,
  type TenantImagingState,
} from '@/lib/cloud/personal-imaging/state'
import type { ObservatoryMode, ObservatoryStatus, SessionRow } from '@/lib/cloud/personal-imaging/types'

type ImagingCtx = {
  tenantId: string
  state: TenantImagingState
  agentHeartbeat: AgentHeartbeat
  agentHeartbeatDirty: boolean
  estop: PersonalEmergencyStopState | null
  estopDirty: boolean
}

type LegacySession = {
  id: string
  target: string
  status: string
  outputMode: 'none' | 'raw_zip'
  createdAt: string
  updatedAt: string
  plannedStartIso: string | null
  raHours: number | null
  decDeg: number | null
  filter: string | null
  exposureSeconds: number | null
  count: number | null
}

type LegacyTenantState = {
  sessions: LegacySession[]
  observatory: {
    mode: ObservatoryMode
    status: ObservatoryStatus
    agentLastSeenMs: number
    ninaRunning: boolean
  }
}

const als = new AsyncLocalStorage<ImagingCtx>()
const memory = new Map<string, TenantImagingState>()

function estopKvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:estop`
}

function normalizeEstop(raw: unknown): PersonalEmergencyStopState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const queueId = typeof r.queueId === 'string' ? r.queueId.trim() : ''
  if (!queueId) return null
  if (r.phase !== 'stopping' && r.phase !== 'stopped') return null
  const heldSessionIds = Array.isArray(r.heldSessionIds)
    ? r.heldSessionIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []
  return {
    phase: r.phase,
    queueId,
    requestedAt: typeof r.requestedAt === 'string' ? r.requestedAt : new Date().toISOString(),
    requestedBy: typeof r.requestedBy === 'string' ? r.requestedBy : null,
    deliveredAt: typeof r.deliveredAt === 'string' ? r.deliveredAt : null,
    completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
    heldSessionIds,
  }
}

async function loadEstop(tenantId: string): Promise<PersonalEmergencyStopState | null> {
  const remote = await kvGetJson<unknown>(estopKvKey(tenantId))
  return normalizeEstop(remote)
}

async function saveEstop(tenantId: string, state: PersonalEmergencyStopState | null): Promise<void> {
  await kvSetJson(estopKvKey(tenantId), state ?? { phase: null, clearedAt: new Date().toISOString() })
}

function imagingKvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:imaging`
}

function legacyKvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:state`
}

function migrateLegacySession(s: LegacySession): SessionRow {
  return {
    id: s.id,
    target: s.target,
    requestName: s.target,
    status: s.status as SessionRow['status'],
    sessionType: 'dso',
    sequenceTemplate: 'dso',
    outputMode: s.outputMode,
    outputModeRequested: null,
    whenClosedBehavior: null,
    projectMode: false,
    cameraCoolingTempC: null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    plannedStartIso: s.plannedStartIso,
    scheduleReasons: [],
    raHours: s.raHours,
    decDeg: s.decDeg,
    filter: s.filter,
    exposureSeconds: s.exposureSeconds,
    count: s.count,
    filterPlans: [],
    estimatedDurationSeconds: null,
    variableStarBlockHours: null,
    catalogQuery: null,
    ninaSequenceJson: null,
    remainingByFilter: null,
  }
}

function normalizeImagingState(raw: unknown): TenantImagingState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.sessions) || !r.observatory || typeof r.observatory !== 'object') {
    return null
  }
  const base = defaultTenantImagingState()
  const observatory = r.observatory as TenantImagingState['observatory']
  return {
    sessions: r.sessions as SessionRow[],
    projectNights: Array.isArray(r.projectNights) ? (r.projectNights as TenantImagingState['projectNights']) : [],
    observatory: {
      mode: observatory.mode === 'manual' ? 'manual' : 'auto',
      status: (observatory.status as ObservatoryStatus) ?? base.observatory.status,
      agentLastSeenMs: Number(observatory.agentLastSeenMs) || 0,
      ninaRunning: Boolean(observatory.ninaRunning),
    },
    observatorySite:
      r.observatorySite && typeof r.observatorySite === 'object'
        ? {
            lat: Number((r.observatorySite as { lat?: unknown }).lat) || 0,
            lon: Number((r.observatorySite as { lon?: unknown }).lon) || 0,
            elevationM: Number((r.observatorySite as { elevationM?: unknown }).elevationM) || 0,
          }
        : base.observatorySite,
    endNight:
      r.endNight && typeof r.endNight === 'object'
        ? (r.endNight as TenantImagingState['endNight'])
        : {},
  }
}

function migrateLegacyState(raw: unknown): TenantImagingState | null {
  if (!raw || typeof raw !== 'object') return null
  const legacy = raw as LegacyTenantState
  if (!Array.isArray(legacy.sessions) || !legacy.observatory) return null
  const base = defaultTenantImagingState()
  return {
    sessions: legacy.sessions.map(migrateLegacySession),
    projectNights: [],
    observatory: {
      mode: legacy.observatory.mode === 'manual' ? 'manual' : 'auto',
      status: legacy.observatory.status ?? base.observatory.status,
      agentLastSeenMs: Number(legacy.observatory.agentLastSeenMs) || 0,
      ninaRunning: Boolean(legacy.observatory.ninaRunning),
    },
    observatorySite: base.observatorySite,
    endNight: {},
  }
}

async function loadStateFromStore(tenantId: string): Promise<TenantImagingState> {
  if (kvEnabled()) {
    const remote = await kvGetJson<unknown>(imagingKvKey(tenantId))
    const normalized = normalizeImagingState(remote)
    if (normalized) return structuredClone(normalized)

    const legacy = await kvGetJson<unknown>(legacyKvKey(tenantId))
    const migrated = migrateLegacyState(legacy)
    if (migrated) return structuredClone(migrated)

    return structuredClone(defaultTenantImagingState())
  }

  if (memory.has(tenantId)) {
    return structuredClone(memory.get(tenantId)!)
  }

  const fresh = defaultTenantImagingState()
  memory.set(tenantId, fresh)
  return structuredClone(fresh)
}

async function saveState(tenantId: string, state: TenantImagingState): Promise<void> {
  if (kvEnabled()) {
    await kvSetJson(imagingKvKey(tenantId), state)
    return
  }
  memory.set(tenantId, state)
}

export function getTenantImagingCtx(): ImagingCtx {
  const ctx = als.getStore()
  if (!ctx) throw new Error('runWithTenantImaging required')
  return ctx
}

export function getTenantId(): string {
  return getTenantImagingCtx().tenantId
}

export function getImagingState(): TenantImagingState {
  return getTenantImagingCtx().state
}

export function getAgentHeartbeat(): AgentHeartbeat {
  return getTenantImagingCtx().agentHeartbeat
}

export function getEstopState(): PersonalEmergencyStopState | null {
  return getTenantImagingCtx().estop
}

export function setEstopState(state: PersonalEmergencyStopState | null): void {
  const ctx = getTenantImagingCtx()
  ctx.estop = state
  ctx.estopDirty = true
}

export type RunWithTenantImagingOptions = {
  /** When false, skip writing imaging state (read-only / preview reconcile). Default true. */
  persist?: boolean
}

export async function runWithTenantImaging<T>(
  tenantId: string,
  fn: () => T | Promise<T>,
  options?: RunWithTenantImagingOptions
): Promise<T> {
  const state = await loadStateFromStore(tenantId)
  const estop = await loadEstop(tenantId)
  let agentHeartbeat = await loadAgentHeartbeat(tenantId)
  let agentHeartbeatDirty = false
  if (agentHeartbeat.agentLastSeenMs <= 0 && state.observatory.agentLastSeenMs > 0) {
    agentHeartbeat = mergeHeartbeat(agentHeartbeat, {
      nowMs: state.observatory.agentLastSeenMs,
      ninaRunning: state.observatory.ninaRunning,
    })
    agentHeartbeatDirty = true
  }
  const ctx: ImagingCtx = {
    tenantId,
    state,
    agentHeartbeat,
    agentHeartbeatDirty,
    estop,
    estopDirty: false,
  }
  const result = await als.run(ctx, async () => fn())
  if (options?.persist !== false) {
    await saveState(tenantId, ctx.state)
  }
  if (ctx.agentHeartbeatDirty) {
    await persistAgentHeartbeat(tenantId, ctx.agentHeartbeat)
  }
  if (ctx.estopDirty) {
    await saveEstop(tenantId, ctx.estop)
  }
  return result
}
