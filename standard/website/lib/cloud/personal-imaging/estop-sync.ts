import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendAuditLog,
  getObservatoryState,
  listSessions,
  patchSessionRow,
  patchSessionStatus,
  setObservatoryPatch,
} from '@/lib/cloud/personal-imaging/db'
import { getEstopState, getImagingState, setEstopState } from '@/lib/cloud/personal-imaging/ctx'
import { NIGHT_HOLDABLE, QUEUE_HOLDABLE, releaseEmergencyStopHolds } from '@/lib/cloud/personal-imaging/estop-holds'
import type { ObservatoryMode, ObservatoryStatus } from '@/lib/cloud/personal-imaging/types'
import type { PersonalEmergencyStopState } from '@/lib/cloud/personal-emergency-stop'
import type {
  PersonalEmergencyStopPublicPhase,
  PersonalEmergencyStopPublicState,
} from '@/lib/cloud/personal-emergency-stop'

const estopTemplate = JSON.parse(
  readFileSync(join(process.cwd(), 'EStop.json'), 'utf8')
) as Record<string, unknown>

export const STALE_UNDELIVERED_STOPPING_MS = 6 * 60 * 60 * 1000

export type EmergencyStopState = PersonalEmergencyStopState

function getState(): EmergencyStopState | null {
  return getEstopState()
}

function setState(state: EmergencyStopState | null): void {
  setEstopState(state)
}

function applyHoldsSync(): string[] {
  const held: string[] = []
  for (const session of listSessions()) {
    if (session.projectMode) continue
    if (QUEUE_HOLDABLE.has(session.status)) {
      patchSessionRow(session.id, {
        status: 'on_hold',
        onHoldFromStatus: session.status as 'pending' | 'scheduled',
      })
      held.push(session.id)
    } else if (session.status === 'in_progress') {
      patchSessionStatus(session.id, 'failed')
    }
  }

  const state = getImagingState()
  for (const night of state.projectNights) {
    if (!NIGHT_HOLDABLE.has(night.status)) continue
    const idx = state.projectNights.findIndex((n) => n.id === night.id)
    if (idx < 0) continue
    state.projectNights[idx] = {
      ...state.projectNights[idx]!,
      status: 'on_hold',
      onHoldFromStatus: night.status as 'planned' | 'scheduled',
    }
    held.push(night.id)
  }

  return held
}

export function getEmergencyStopPublicState(): PersonalEmergencyStopPublicState & { agentConnected: boolean } {
  const estopState = getState()
  const phase: PersonalEmergencyStopPublicPhase = estopState?.phase ?? 'idle'
  const agentConnected = getObservatoryState().status !== 'disconnected'
  const progress: PersonalEmergencyStopPublicState['progress'] = !estopState
    ? 0
    : estopState.phase === 'stopped'
      ? 100
      : estopState.deliveredAt
        ? 66
        : 33
  const label: PersonalEmergencyStopPublicState['label'] =
    phase === 'stopping' ? 'STOPPING' : phase === 'stopped' ? 'STOPPED' : 'ESTOP'
  return {
    agentConnected,
    phase,
    progress,
    label,
    queueId: estopState?.queueId ?? null,
    canArm: phase === 'idle' && agentConnected,
    blocking: phase === 'stopping' || phase === 'stopped',
    stopped: phase === 'stopped',
  }
}

export function armEmergencyStop(requestedBy?: string | null): EmergencyStopState {
  const estopState = getState()
  if (estopState?.phase === 'stopping' || estopState?.phase === 'stopped') {
    throw new Error('Emergency STOP is already active.')
  }
  const heldSessionIds = applyHoldsSync()
  const queueId = `estop-${Date.now()}`
  const next: EmergencyStopState = {
    phase: 'stopping',
    queueId,
    requestedAt: new Date().toISOString(),
    requestedBy: requestedBy?.trim() || null,
    heldSessionIds,
  }
  setState(next)
  appendAuditLog({
    kind: 'emergency_stop',
    message: `Emergency STOP armed (${queueId})`,
    detail: { queueId, requestedBy: requestedBy?.trim() || null, heldSessionIds },
  })
  return next
}

export function isEmergencyStopStopping(): boolean {
  return getState()?.phase === 'stopping'
}

export function isEmergencyStopStopped(): boolean {
  return getState()?.phase === 'stopped'
}

export function isEmergencyStopBlocking(): boolean {
  const phase = getState()?.phase
  return phase === 'stopping' || phase === 'stopped'
}

export function clearEmergencyStopAfterManualUnlock(): EmergencyStopState | null {
  const before = getState()
  if (!before) return null
  const heldSessionIds = [...before.heldSessionIds]
  setState(null)
  return { ...before, heldSessionIds }
}

/** Whether observatory PATCH should clear the STOPPED lock (Pomfret-aligned). */
export function shouldClearEmergencyStopOnObservatoryPatch(input: {
  mode?: ObservatoryMode
  status?: ObservatoryStatus
  currentMode: ObservatoryMode
  currentStatus: ObservatoryStatus
}): boolean {
  const nextMode = input.mode ?? input.currentMode
  const nextStatus = input.status ?? input.currentStatus
  return nextMode !== 'manual' || nextStatus !== 'closed_observatory_maintenance'
}

export function isStaleUndeliveredEmergencyStop(state: EmergencyStopState): boolean {
  if (state.deliveredAt || state.phase !== 'stopping') return false
  const requestedMs = Date.parse(state.requestedAt)
  if (!Number.isFinite(requestedMs)) return false
  return Date.now() - requestedMs > STALE_UNDELIVERED_STOPPING_MS
}

export function clearStaleUndeliveredEmergencyStop(state: EmergencyStopState): boolean {
  if (!isStaleUndeliveredEmergencyStop(state)) return false
  const current = getState()
  if (!current || current.queueId !== state.queueId) return false
  if (!isStaleUndeliveredEmergencyStop(current)) return false
  setState(null)
  appendAuditLog({
    kind: 'emergency_stop',
    message: `Cleared stale undelivered ESTOP state (${state.queueId}); skipped agent delivery.`,
    detail: { queueId: state.queueId, event: 'stale_cleared' },
  })
  return true
}

export function applyObservatoryPatchWithEstopClear(patch: {
  mode?: ObservatoryMode
  status?: ObservatoryStatus
}): ReturnType<typeof getObservatoryState> {
  setObservatoryPatch(patch)
  const next = getObservatoryState()
  const patchTouches = patch.mode !== undefined || patch.status !== undefined
  const shouldClearStopped =
    isEmergencyStopStopped() &&
    shouldClearEmergencyStopOnObservatoryPatch({
      mode: patch.mode,
      status: patch.status,
      currentMode: next.mode,
      currentStatus: next.status,
    })
  const shouldClearStopping = isEmergencyStopStopping() && patchTouches

  if ((shouldClearStopped || shouldClearStopping) && isEmergencyStopBlocking()) {
    const cleared = clearEmergencyStopAfterManualUnlock()
    if (cleared?.heldSessionIds.length) {
      releaseEmergencyStopHolds(cleared.heldSessionIds)
    }
    appendAuditLog({
      kind: 'emergency_stop',
      message: shouldClearStopping
        ? `Emergency STOP aborted (was STOPPING) after observatory update.`
        : `Emergency STOP cleared after manual observatory mode/status change.`,
      detail: {
        queueId: cleared?.queueId ?? null,
        previousPhase: cleared?.phase ?? null,
        releasedHolds: cleared?.heldSessionIds ?? [],
        mode: next.mode,
        status: next.status,
      },
    })
  }

  return next
}

export function markEmergencyStopDelivered(queueId: string): boolean {
  const estopState = getState()
  if (!estopState || estopState.queueId !== queueId || estopState.phase !== 'stopping') return false
  if (estopState.deliveredAt) return false
  setState({ ...estopState, deliveredAt: new Date().toISOString() })
  return true
}

export function markEmergencyStopCompleted(queueId: string): boolean {
  const estopState = getState()
  if (!estopState || estopState.queueId !== queueId || estopState.phase !== 'stopping') return false
  setState({
    ...estopState,
    phase: 'stopped',
    completedAt: new Date().toISOString(),
  })
  setObservatoryPatch({ mode: 'manual', status: 'closed_observatory_maintenance' })
  appendAuditLog({
    kind: 'emergency_stop',
    message: `Emergency STOP completed (${queueId}); observatory locked to manual Closed — Maintenance.`,
    detail: { queueId, event: 'completed' },
  })
  return true
}

function patchEstopHttpPost(
  root: Record<string, unknown>,
  tenantId: string,
  queueId: string,
  sessionProgressAuthPassword?: string
): void {
  const base = (process.env.BOREAN_API_BASE_URL ?? 'https://YOUR_DOMAIN').replace(/\/$/, '')
  const progressUrl = `${base}/api/personal/${encodeURIComponent(tenantId)}/imaging/session-progress`
  const body = JSON.stringify({
    text: 'Dome Closed',
    queueId,
    BoreanAstro: { QueueId: queueId, SessionType: 'estop' },
  })
  const pass =
    (sessionProgressAuthPassword ?? '').trim() ||
    process.env.NINA_SESSION_PROGRESS_BASIC_PASSWORD?.trim() ||
    ''
  const user = process.env.NINA_SESSION_PROGRESS_BASIC_USER?.trim() || 'borean'

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    const type = rec.$type
    if (typeof type === 'string' && type.includes('HTTP.HttpClient')) {
      rec.HttpUri = progressUrl
      rec.HttpPostBody = body
      rec.HttpPostContentType = 'application/json'
      if (pass) {
        rec.HttpAuthUsername = user
        rec.HttpAuthPassword = pass
      } else {
        rec.HttpAuthUsername = ''
        rec.HttpAuthPassword = ''
      }
    }
    for (const value of Object.values(rec)) walk(value)
  }

  walk(root)
}

export function estopSequenceJson(
  tenantId: string,
  queueId: string,
  sessionProgressAuthPassword?: string
): string {
  const root = structuredClone(estopTemplate) as Record<string, unknown>
  root.Name = 'Emergency Stop'
  root.BoreanAstro = {
    QueueId: queueId,
    SessionType: 'estop',
    OutputMode: 'none',
  }
  patchEstopHttpPost(root, tenantId, queueId, sessionProgressAuthPassword)
  return JSON.stringify(root, null, 2)
}

export function getEmergencyStopState(): EmergencyStopState | null {
  return getState()
}

export function isEstopQueueId(queueId: string): boolean {
  return queueId.startsWith('estop-')
}
