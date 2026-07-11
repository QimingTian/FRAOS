import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendAuditLog,
  getDb,
  getObservatoryState,
  getSessionById,
  listSessions,
  loadEmergencyStopState,
  patchSessionStatus,
  saveEmergencyStopState,
  setObservatoryPatch,
  type ObservatoryMode,
  type ObservatoryStatus,
  type SessionStatus,
} from './db.js'

export const STALE_UNDELIVERED_STOPPING_MS = 6 * 60 * 60 * 1000

const estopTemplate = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../website/EStop.json'), 'utf8')
) as Record<string, unknown>

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

function getState(): EmergencyStopState | null {
  return loadEmergencyStopState()
}

function setState(state: EmergencyStopState | null): void {
  saveEmergencyStopState(state)
}

function progressForState(state: EmergencyStopState | null): 0 | 33 | 66 | 100 {
  if (!state) return 0
  if (state.phase === 'stopped') return 100
  if (state.deliveredAt) return 66
  return 33
}

function labelForPhase(phase: 'idle' | EmergencyStopPhase): 'ESTOP' | 'STOPPING' | 'STOPPED' {
  if (phase === 'stopping') return 'STOPPING'
  if (phase === 'stopped') return 'STOPPED'
  return 'ESTOP'
}

function agentConnected(): boolean {
  return getObservatoryState().status !== 'disconnected'
}

function releaseEmergencyStopHolds(heldSessionIds: string[]): void {
  for (const sessionId of heldSessionIds) {
    const row = getSessionById(sessionId)
    if (!row || row.status !== 'on_hold') continue
    patchSessionStatus(sessionId, 'pending')
  }
}
function applyHoldsSync(): string[] {
  const sessions = listSessions()
  const held: string[] = []
  const now = new Date().toISOString()
  const update = getDb().prepare(`UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`)
  for (const session of sessions) {
    let next: SessionStatus | null = null
    if (session.status === 'pending' || session.status === 'scheduled') {
      next = 'on_hold'
      held.push(session.id)
    } else if (session.status === 'in_progress') {
      next = 'failed'
    }
    if (next) update.run(next, now, session.id)
  }
  return held
}

export function getEmergencyStopPublicState() {
  const estopState = getState()
  const phase = estopState?.phase ?? 'idle'
  return {
    agentConnected: agentConnected(),
    phase,
    progress: progressForState(estopState),
    label: labelForPhase(phase),
    queueId: estopState?.queueId ?? null,
    canArm: phase === 'idle' && agentConnected(),
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

function patchEstopHttpPost(root: Record<string, unknown>, tenantId: string, queueId: string): void {
  const progressUrl = `http://127.0.0.1:7841/api/personal/${encodeURIComponent(tenantId)}/imaging/session-progress`
  const body = JSON.stringify({
    text: 'Dome Closed',
    queueId,
    BoreanAstro: { QueueId: queueId, SessionType: 'estop' },
  })

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
      rec.HttpAuthUsername = ''
      rec.HttpAuthPassword = ''
    }
    for (const value of Object.values(rec)) walk(value)
  }

  walk(root)
}

export function estopSequenceJson(tenantId: string, queueId: string): string {
  const root = structuredClone(estopTemplate) as Record<string, unknown>
  root.Name = 'Emergency Stop'
  root.BoreanAstro = {
    QueueId: queueId,
    SessionType: 'estop',
    OutputMode: 'none',
  }
  patchEstopHttpPost(root, tenantId, queueId)
  return JSON.stringify(root, null, 2)
}

export function getEmergencyStopState(): EmergencyStopState | null {
  return getState()
}

export function isEstopQueueId(queueId: string): boolean {
  return queueId.startsWith('estop-')
}
