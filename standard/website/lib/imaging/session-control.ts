import {
  appendAuditLog,
  deleteSessionById,
  getSessionById,
  listSessions,
  patchSessionRow,
  patchSessionStatus,
} from '@/lib/cloud/personal-imaging/db'
import { getImagingState } from '@/lib/cloud/personal-imaging/ctx'
import { QUEUE_HOLDABLE, NIGHT_HOLDABLE } from '@/lib/cloud/personal-imaging/estop-holds'
import { isEmergencyStopBlocking } from '@/lib/cloud/personal-imaging/estop-sync'
import {
  getProjectNightById,
  listAllOpenProjectNights,
  markNightCompleted,
  markNightFailed,
  markNightInProgress,
} from '@/lib/cloud/personal-imaging/project-db'
import { deleteSessionStorage } from '@/lib/cloud/session-storage'
import { publishProgress } from '@/lib/imaging/progress-live'
import { removePreviewImage } from '@/lib/imaging/preview-store'
import { reconcilePendingScheduleStatus } from '@/lib/imaging/reconcile'
import { emitAgentWakePollSequence } from '@/lib/imaging/live-bus'

export type SessionControlAction =
  | 'run'
  | 'hold'
  | 'release_hold'
  | 'complete'
  | 'fail'
  | 'in_progress'
  | 'delete'

function findOtherInProgressSession(exceptSessionId: string): string | null {
  for (const night of listAllOpenProjectNights()) {
    if (night.status === 'in_progress' && night.id !== exceptSessionId) return night.id
  }
  for (const session of listSessions()) {
    if (session.status === 'in_progress' && session.id !== exceptSessionId) return session.id
  }
  return null
}

function assertNoOtherInProgress(exceptSessionId: string): { error: string } | null {
  const blocking = findOtherInProgressSession(exceptSessionId)
  if (!blocking) return null
  return {
    error: `Another session is already in progress (${blocking}). Complete or fail it before restoring this session.`,
  }
}

function holdProjectNight(nightId: string): { ok: true } | { error: string } {
  const night = getProjectNightById(nightId)
  if (!night) return { error: 'Sub-session not found' }
  if (!NIGHT_HOLDABLE.has(night.status)) {
    const label = night.status === 'planned' ? 'scheduled' : night.status
    return { error: `Cannot hold sub-session in status "${label}".` }
  }
  const state = getImagingState()
  const idx = state.projectNights.findIndex((n) => n.id === nightId)
  if (idx < 0) return { error: 'Sub-session not found' }
  state.projectNights[idx] = {
    ...state.projectNights[idx]!,
    status: 'on_hold',
    onHoldFromStatus: night.status as 'planned' | 'scheduled',
  }
  void appendAuditLog({
    kind: 'queue.on_hold',
    message: `Session placed on hold: ${nightId}.`,
    detail: { sessionId: nightId, previousStatus: night.status },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function releaseProjectNightHold(nightId: string): { ok: true } | { error: string } {
  const night = getProjectNightById(nightId)
  if (!night) return { error: 'Sub-session not found' }
  if (night.status !== 'on_hold') return { error: 'Session is not on hold.' }
  const restored = night.onHoldFromStatus ?? 'planned'
  const state = getImagingState()
  const idx = state.projectNights.findIndex((n) => n.id === nightId)
  if (idx < 0) return { error: 'Sub-session not found' }
  state.projectNights[idx] = {
    ...state.projectNights[idx]!,
    status: restored,
    onHoldFromStatus: null,
  }
  void appendAuditLog({
    kind: 'queue.on_hold',
    message: `Session hold released: ${nightId}.`,
    detail: { sessionId: nightId, restoredStatus: restored },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function holdQueueSession(sessionId: string): { ok: true } | { error: string } {
  const session = getSessionById(sessionId)
  if (!session) return { error: 'Session not found' }
  if (session.projectMode) {
    return { error: 'Use the project sub-session id (Session N), not the project queue id.' }
  }
  if (!QUEUE_HOLDABLE.has(session.status)) {
    return { error: `Cannot hold session in status "${session.status}".` }
  }
  patchSessionRow(sessionId, {
    status: 'on_hold',
    onHoldFromStatus: session.status as 'pending' | 'scheduled',
  })
  void appendAuditLog({
    kind: 'queue.on_hold',
    message: `Session placed on hold: ${session.target} (${sessionId}).`,
    detail: { sessionId, previousStatus: session.status },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function releaseQueueSessionHold(sessionId: string): { ok: true } | { error: string } {
  const session = getSessionById(sessionId)
  if (!session) return { error: 'Session not found' }
  if (session.status !== 'on_hold') return { error: 'Session is not on hold.' }
  const restored = session.onHoldFromStatus ?? 'pending'
  patchSessionRow(sessionId, { status: restored, onHoldFromStatus: null })
  void appendAuditLog({
    kind: 'queue.on_hold',
    message: `Session hold released: ${session.target} (${sessionId}).`,
    detail: { sessionId, restoredStatus: restored },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function adminRunSession(sessionId: string, tenantId: string): { ok: true } | { error: string } {
  if (isEmergencyStopBlocking()) {
    return { error: 'Emergency STOP active; Run is disabled.' }
  }

  const night = getProjectNightById(sessionId)
  if (night) {
    if (!NIGHT_HOLDABLE.has(night.status) && night.status !== 'on_hold') {
      return { error: `Cannot run sub-session in status "${night.status}".` }
    }
    if (night.status === 'on_hold') {
      const released = releaseProjectNightHold(sessionId)
      if ('error' in released) return released
    }
    const state = getImagingState()
    const idx = state.projectNights.findIndex((n) => n.id === sessionId)
    if (idx < 0) return { error: 'Sub-session not found' }
    const now = new Date().toISOString()
    state.projectNights[idx] = {
      ...state.projectNights[idx]!,
      status: 'scheduled',
      plannedStartIso: now,
    }
    void appendAuditLog({
      kind: 'queue.admin_run',
      message: `Admin force run: project sub-session ${sessionId}.`,
      detail: { sessionId },
    })
    emitAgentWakePollSequence(tenantId)
    void reconcilePendingScheduleStatus()
    return { ok: true }
  }

  const session = getSessionById(sessionId)
  if (!session) return { error: 'Session not found' }
  if (session.projectMode) {
    return { error: 'Use the project sub-session id (Session N), not the project queue id.' }
  }
  if (!['pending', 'scheduled', 'on_hold'].includes(session.status)) {
    return { error: `Cannot run session in status "${session.status}".` }
  }
  if (session.status === 'on_hold') {
    const released = releaseQueueSessionHold(sessionId)
    if ('error' in released) return released
  }
  const now = new Date().toISOString()
  patchSessionRow(sessionId, {
    status: 'scheduled',
    plannedStartIso: now,
    scheduleReasons: ['Admin force run'],
  })
  void appendAuditLog({
    kind: 'queue.admin_run',
    message: `Admin force run: ${session.target} (${sessionId}).`,
    detail: { sessionId },
  })
  emitAgentWakePollSequence(tenantId)
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function adminMarkComplete(sessionId: string): { ok: true } | { error: string } {
  const night = getProjectNightById(sessionId)
  if (night) {
    const result = markNightCompleted(sessionId)
    if (!result) return { error: 'Could not mark sub-session completed' }
    publishProgress(sessionId, { type: 'status', queueStatus: 'completed' })
    if (result.projectCompleted) {
      publishProgress(night.projectId, { type: 'status', queueStatus: 'completed' })
    }
    void appendAuditLog({
      kind: 'queue.status',
      message: `Admin marked project sub-session ${sessionId} completed.`,
      detail: { sessionId, projectId: night.projectId },
    })
    void reconcilePendingScheduleStatus()
    return { ok: true }
  }

  const session = getSessionById(sessionId)
  if (!session) return { error: 'Session not found' }
  patchSessionStatus(sessionId, 'completed')
  publishProgress(sessionId, { type: 'status', queueStatus: 'completed' })
  void appendAuditLog({
    kind: 'queue.status',
    message: `Admin marked session ${sessionId} completed.`,
    detail: { id: sessionId, target: session.target },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function adminMarkFailed(sessionId: string): { ok: true } | { error: string } {
  const night = getProjectNightById(sessionId)
  if (night) {
    markNightFailed(sessionId)
    publishProgress(sessionId, { type: 'status', queueStatus: 'failed' })
    void appendAuditLog({
      kind: 'queue.status',
      message: `Admin marked project sub-session ${sessionId} failed.`,
      detail: { sessionId, projectId: night.projectId },
    })
    void reconcilePendingScheduleStatus()
    return { ok: true }
  }

  const session = getSessionById(sessionId)
  if (!session) return { error: 'Session not found' }
  patchSessionStatus(sessionId, 'failed')
  publishProgress(sessionId, { type: 'status', queueStatus: 'failed' })
  void appendAuditLog({
    kind: 'queue.status',
    message: `Admin marked session ${sessionId} failed.`,
    detail: { id: sessionId, target: session.target },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function adminMarkInProgress(sessionId: string): { ok: true } | { error: string } {
  const night = getProjectNightById(sessionId)
  if (night) {
    if (night.status === 'in_progress') return { ok: true }
    const canRestore =
      night.status === 'failed' ||
      (night.status === 'scheduled' && Boolean(night.ninaDeliveredAt))
    if (!canRestore) {
      return {
        error: `Only failed sub-sessions (or scheduled subs already delivered to NINA) can be set in progress (current: ${night.status}).`,
      }
    }
    const blocked = assertNoOtherInProgress(sessionId)
    if (blocked) return blocked
    markNightInProgress(sessionId)
    publishProgress(sessionId, { type: 'status', queueStatus: 'in_progress' })
    void appendAuditLog({
      kind: 'queue.status',
      message: `Admin restored project sub-session ${sessionId} to in_progress.`,
      detail: { sessionId, projectId: night.projectId },
    })
    void reconcilePendingScheduleStatus()
    return { ok: true }
  }

  const session = getSessionById(sessionId)
  if (!session) return { error: 'Session not found' }
  if (session.status === 'in_progress') return { ok: true }
  if (session.status !== 'failed') {
    return { error: 'Session is not failed' }
  }
  const blocked = assertNoOtherInProgress(sessionId)
  if (blocked) return blocked
  patchSessionStatus(sessionId, 'in_progress')
  publishProgress(sessionId, { type: 'status', queueStatus: 'in_progress' })
  void appendAuditLog({
    kind: 'queue.status',
    message: `Admin restored session ${sessionId} to in_progress.`,
    detail: { id: sessionId, target: session.target },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

async function adminDeleteSession(
  tenantId: string,
  sessionId: string
): Promise<{ ok: true } | { error: string }> {
  const night = getProjectNightById(sessionId)
  if (night) {
    const state = getImagingState()
    state.projectNights = state.projectNights.filter((n) => n.id !== sessionId)
    await deleteSessionStorage(tenantId, sessionId).catch(() => undefined)
    await removePreviewImage(tenantId, sessionId)
    void appendAuditLog({
      kind: 'queue.deleted',
      message: `Admin deleted project sub-session ${sessionId}.`,
      detail: { sessionId, projectId: night.projectId },
    })
    void reconcilePendingScheduleStatus()
    return { ok: true }
  }

  const session = getSessionById(sessionId)
  if (!session) return { error: 'Session not found' }
  deleteSessionById(sessionId)
  await deleteSessionStorage(tenantId, sessionId).catch(() => undefined)
  await removePreviewImage(tenantId, sessionId)
  void appendAuditLog({
    kind: 'queue.deleted',
    message: `Admin deleted session ${sessionId}.`,
    detail: { id: sessionId, target: session.target },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

export async function applySessionControlAction(
  tenantId: string,
  sessionId: string,
  action: SessionControlAction
): Promise<{ ok: true } | { error: string }> {
  const id = sessionId.trim()
  if (!id) return { error: 'sessionId is required' }

  switch (action) {
    case 'run':
      return adminRunSession(id, tenantId)
    case 'hold':
      return getProjectNightById(id) ? holdProjectNight(id) : holdQueueSession(id)
    case 'release_hold':
      return getProjectNightById(id) ? releaseProjectNightHold(id) : releaseQueueSessionHold(id)
    case 'complete':
      return adminMarkComplete(id)
    case 'fail':
      return adminMarkFailed(id)
    case 'in_progress':
      return adminMarkInProgress(id)
    case 'delete':
      return adminDeleteSession(tenantId, id)
    default:
      return { error: 'Invalid action' }
  }
}

export function sessionControlDisplayStatus(status: string): string {
  if (status === 'on_hold') return 'on hold'
  if (status === 'planned') return 'scheduled'
  return status
}

export function sessionControlCanRun(status: string): boolean {
  return status === 'pending' || status === 'scheduled' || status === 'planned'
}

export function sessionControlCanHold(status: string): boolean {
  return sessionControlCanRun(status)
}

export function sessionControlOnHold(status: string): boolean {
  return status === 'on_hold' || status === 'on hold'
}
