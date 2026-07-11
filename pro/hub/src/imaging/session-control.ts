import { adminRunSession } from './admin-force-run.js'
import {
  appendAuditLog,
  deleteSessionById,
  getDb,
  getSessionById,
  listSessions,
  patchSessionStatus,
  type SessionStatus,
} from '../db.js'
import { isEmergencyStopBlocking } from '../personal-estop.js'
import {
  getProjectNightById,
  listAllOpenProjectNights,
  markNightCompleted,
  markNightFailed,
  markNightInProgress,
  type ProjectNightStatus,
} from './project-store.js'
import { publishProgress } from './progress-live.js'
import { removePreviewImage } from './preview-store.js'
import { reconcilePendingScheduleStatus } from './reconcile.js'

export type SessionControlAction =
  | 'run'
  | 'hold'
  | 'release_hold'
  | 'complete'
  | 'fail'
  | 'in_progress'
  | 'delete'

const QUEUE_HOLDABLE = new Set<SessionStatus>(['pending', 'scheduled'])
const NIGHT_HOLDABLE = new Set<ProjectNightStatus>(['planned', 'scheduled'])
const holdRestoreBySessionId = new Map<string, SessionStatus>()
const holdRestoreByNightId = new Map<string, ProjectNightStatus>()

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
  holdRestoreByNightId.set(nightId, night.status)
  getDb()
    .prepare(`UPDATE project_nights SET status = 'on_hold', updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), nightId)
  appendAuditLog({
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
  const restored = holdRestoreByNightId.get(nightId) ?? 'planned'
  holdRestoreByNightId.delete(nightId)
  getDb()
    .prepare(`UPDATE project_nights SET status = ?, updated_at = ? WHERE id = ?`)
    .run(restored, new Date().toISOString(), nightId)
  appendAuditLog({
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
  holdRestoreBySessionId.set(sessionId, session.status)
  patchSessionStatus(sessionId, 'on_hold')
  appendAuditLog({
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
  const restored = holdRestoreBySessionId.get(sessionId) ?? 'pending'
  holdRestoreBySessionId.delete(sessionId)
  patchSessionStatus(sessionId, restored)
  appendAuditLog({
    kind: 'queue.on_hold',
    message: `Session hold released: ${session.target} (${sessionId}).`,
    detail: { sessionId, restoredStatus: restored },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

async function runAdminForceRun(sessionId: string): Promise<{ ok: true } | { error: string }> {
  if (isEmergencyStopBlocking()) {
    return { error: 'Emergency STOP active; Run is disabled.' }
  }
  const night = getProjectNightById(sessionId)
  if (night?.status === 'on_hold') {
    const released = releaseProjectNightHold(sessionId)
    if ('error' in released) return released
  } else {
    const session = getSessionById(sessionId)
    if (session?.status === 'on_hold') {
      const released = releaseQueueSessionHold(sessionId)
      if ('error' in released) return released
    }
  }
  return adminRunSession(sessionId)
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
    appendAuditLog({
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
  appendAuditLog({
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
    appendAuditLog({
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
  appendAuditLog({
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
    appendAuditLog({
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
  if (session.status !== 'failed') return { error: 'Session is not failed' }
  const blocked = assertNoOtherInProgress(sessionId)
  if (blocked) return blocked
  patchSessionStatus(sessionId, 'in_progress')
  publishProgress(sessionId, { type: 'status', queueStatus: 'in_progress' })
  appendAuditLog({
    kind: 'queue.status',
    message: `Admin restored session ${sessionId} to in_progress.`,
    detail: { id: sessionId, target: session.target },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

function adminDeleteSession(sessionId: string): { ok: true } | { error: string } {
  const night = getProjectNightById(sessionId)
  if (night) {
    getDb().prepare(`DELETE FROM project_nights WHERE id = ?`).run(sessionId)
    removePreviewImage(sessionId)
    appendAuditLog({
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
  removePreviewImage(sessionId)
  appendAuditLog({
    kind: 'queue.deleted',
    message: `Admin deleted session ${sessionId}.`,
    detail: { id: sessionId, target: session.target },
  })
  void reconcilePendingScheduleStatus()
  return { ok: true }
}

export function applySessionControlAction(
  sessionId: string,
  action: SessionControlAction
): { ok: true } | { error: string } | Promise<{ ok: true } | { error: string }> {
  const id = sessionId.trim()
  if (!id) return { error: 'sessionId is required' }

  switch (action) {
    case 'run':
      return runAdminForceRun(id)
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
      return adminDeleteSession(id)
    default:
      return { error: 'Invalid action' }
  }
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
