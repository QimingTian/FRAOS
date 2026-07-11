import { kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import { isWithinDaytimeClosedWindow } from '@/lib/content/sunrise-window'

export type PersonalSessionOutputMode = 'none' | 'raw_zip'

export type PersonalSessionStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'on_hold'

export type PersonalSession = {
  id: string
  target: string
  status: PersonalSessionStatus
  outputMode: PersonalSessionOutputMode
  createdAt: string
  updatedAt: string
  plannedStartIso: string | null
  raHours: number | null
  decDeg: number | null
  filter: string | null
  exposureSeconds: number | null
  count: number | null
}

export type PersonalObservatoryMode = 'manual' | 'auto'
export type PersonalObservatoryStatus =
  | 'ready'
  | 'busy_in_use'
  | 'disconnected'
  | 'closed_weather_not_permitted'
  | 'closed_daytime'
  | 'closed_observatory_maintenance'

type TenantState = {
  sessions: PersonalSession[]
  observatory: {
    mode: PersonalObservatoryMode
    status: PersonalObservatoryStatus
    agentLastSeenMs: number
    ninaRunning: boolean
  }
}

const memory = new Map<string, TenantState>()

function kvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:state`
}

function defaultState(): TenantState {
  return {
    sessions: [],
    observatory: {
      mode: 'auto',
      status: 'disconnected',
      agentLastSeenMs: 0,
      ninaRunning: false,
    },
  }
}

async function loadState(tenantId: string): Promise<TenantState> {
  const remote = await kvGetJson<TenantState>(kvKey(tenantId))
  if (remote && Array.isArray(remote.sessions) && remote.observatory) {
    memory.set(tenantId, remote)
    return remote
  }
  if (!memory.has(tenantId)) memory.set(tenantId, defaultState())
  return memory.get(tenantId)!
}

async function saveState(tenantId: string, state: TenantState): Promise<void> {
  memory.set(tenantId, state)
  await kvSetJson(kvKey(tenantId), state)
}

function resolveObservatoryStatus(state: TenantState): PersonalObservatoryStatus {
  const staleMs = 90_000
  const now = Date.now()
  const { agentLastSeenMs, ninaRunning, status: storedStatus, mode } = state.observatory

  if (now - agentLastSeenMs > staleMs) return 'disconnected'
  if (ninaRunning) return 'busy_in_use'

  if (mode === 'auto') {
    if (isWithinDaytimeClosedWindow(new Date(now))) return 'closed_daytime'
    return 'ready'
  }

  if (
    storedStatus === 'ready' ||
    storedStatus === 'closed_weather_not_permitted' ||
    storedStatus === 'closed_daytime' ||
    storedStatus === 'closed_observatory_maintenance'
  ) {
    return storedStatus
  }
  return 'ready'
}

export async function personalGetObservatory(tenantId: string): Promise<{
  mode: PersonalObservatoryMode
  status: PersonalObservatoryStatus
}> {
  const state = await loadState(tenantId)
  return {
    mode: state.observatory.mode,
    status: resolveObservatoryStatus(state),
  }
}

export async function personalPatchObservatory(
  tenantId: string,
  patch: { mode?: PersonalObservatoryMode; status?: PersonalObservatoryStatus }
): Promise<{ mode: PersonalObservatoryMode; status: PersonalObservatoryStatus }> {
  const state = await loadState(tenantId)
  if (patch.mode) state.observatory.mode = patch.mode
  if (patch.status) state.observatory.status = patch.status
  await saveState(tenantId, state)
  return personalGetObservatory(tenantId)
}

export async function personalListSessions(tenantId: string): Promise<PersonalSession[]> {
  const state = await loadState(tenantId)
  return [...state.sessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function personalInsertSession(
  tenantId: string,
  input: {
    id: string
    target: string
    outputMode: PersonalSessionOutputMode
    raHours?: number | null
    decDeg?: number | null
    filter?: string | null
    exposureSeconds?: number | null
    count?: number | null
  }
): Promise<PersonalSession> {
  const state = await loadState(tenantId)
  const now = new Date().toISOString()
  const session: PersonalSession = {
    id: input.id,
    target: input.target,
    status: 'pending',
    outputMode: input.outputMode,
    createdAt: now,
    updatedAt: now,
    plannedStartIso: null,
    raHours: input.raHours ?? null,
    decDeg: input.decDeg ?? null,
    filter: input.filter ?? null,
    exposureSeconds: input.exposureSeconds ?? null,
    count: input.count ?? null,
  }
  state.sessions.push(session)
  await saveState(tenantId, state)
  return session
}

export async function personalTouchAgentPulse(tenantId: string, ninaRunning: boolean): Promise<void> {
  const state = await loadState(tenantId)
  state.observatory.agentLastSeenMs = Date.now()
  state.observatory.ninaRunning = ninaRunning
  await saveState(tenantId, state)
}

export async function personalApplyEmergencyStopHolds(tenantId: string): Promise<string[]> {
  const state = await loadState(tenantId)
  const now = new Date().toISOString()
  const held: string[] = []
  for (const session of state.sessions) {
    if (session.status === 'pending' || session.status === 'scheduled') {
      session.status = 'on_hold'
      session.updatedAt = now
      held.push(session.id)
    } else if (session.status === 'in_progress') {
      session.status = 'failed'
      session.updatedAt = now
    }
  }
  await saveState(tenantId, state)
  return held
}

export async function personalDeleteSession(tenantId: string, sessionId: string): Promise<boolean> {
  const state = await loadState(tenantId)
  const before = state.sessions.length
  state.sessions = state.sessions.filter((s) => s.id !== sessionId)
  if (state.sessions.length === before) return false
  await saveState(tenantId, state)
  return true
}

export function personalSessionToPublicJson(s: PersonalSession): Record<string, unknown> {
  return {
    id: s.id,
    target: s.target,
    status: s.status,
    outputMode: s.outputMode,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    plannedStartIso: s.plannedStartIso,
    raHours: s.raHours,
    decDeg: s.decDeg,
    filter: s.filter,
    exposureSeconds: s.exposureSeconds,
    count: s.count,
    sessionType: 'dso',
    projectMode: false,
  }
}
