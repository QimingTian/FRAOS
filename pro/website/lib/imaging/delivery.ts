import endNightTemplate from '@/assets/nina/End Night Session.json'
import {
  appendAuditLog,
  consumeSession,
  getObservatoryState,
  getSessionById,
  isObservatoryReady,
  listPendingSessions,
  listSessions,
  markEndNightAfterSessionsSent,
  markEndNightDawnSent,
  patchSessionStatus,
  touchAgentPulse,
  wasEndNightAfterSessionsSent,
  wasEndNightDawnSent,
} from '@/lib/cloud/personal-imaging/db'
import { isAltitudeAllowed } from '@/lib/imaging/astro/target-altitude'
import { getTonightScheduleStrip } from '@/lib/imaging/astro/schedule-strip'
import { getTonightSchedulingWindow } from '@/lib/imaging/astro/sunrise-window'
import {
  clearStaleUndeliveredEmergencyStop,
  estopSequenceJson,
  getEmergencyStopState,
  isEmergencyStopBlocking,
  isEmergencyStopStopping,
  isEstopQueueId,
  isStaleUndeliveredEmergencyStop,
  markEmergencyStopCompleted,
  markEmergencyStopDelivered,
} from '@/lib/cloud/personal-imaging/estop-sync'
import { emitLiveEvent, liveProgressChannel } from '@/lib/imaging/live-bus'
import { publishProgress } from '@/lib/imaging/progress-live'
import { reconcilePendingScheduleStatus } from '@/lib/imaging/reconcile'
import { sequenceJsonForSession } from '@/lib/imaging/queue-service'
import {
  getProjectNightById,
  listAllOpenProjectNights,
  markNightCompleted,
  markNightFailed,
  markNightInProgress,
  type ProjectNight,
} from '@/lib/cloud/personal-imaging/project-db'
import { logSessionStatusChange } from '@/lib/cloud/personal-imaging/status-audit'

const END_NIGHT_TEMPLATE = endNightTemplate as Record<string, unknown>

function endNightSequenceJson(queueId: string): string {
  const root = structuredClone(END_NIGHT_TEMPLATE) as Record<string, unknown>
  root['BoreanAstro'] = {
    QueueId: queueId,
    SessionType: 'end_night',
    SessionProgressHint: 'POST JSON to /api/imaging/session-progress with { "queueId": "<QueueId>", ... }',
  }
  return JSON.stringify(root, null, 2)
}

function jsonResponse(body: string, status: number): { status: number; body: string; contentType: string } {
  return { status, body, contentType: 'application/json; charset=utf-8' }
}

function errorResponse(message: string, status: number): { status: number; error: string } {
  return { status, error: message }
}

export async function handleNinaSequenceGet(tenantId?: string): Promise<
  | { kind: 'json'; status: number; body: string }
  | { kind: 'error'; status: number; error: string }
  | { kind: 'empty'; status: number }
> {
  touchAgentPulse(false)
  const now = new Date()
  const nowMs = now.getTime()

  if (isEmergencyStopStopping()) {
    const state = getEmergencyStopState()
    if (state && !state.deliveredAt) {
      if (isStaleUndeliveredEmergencyStop(state)) {
        clearStaleUndeliveredEmergencyStop(state)
      } else if (markEmergencyStopDelivered(state.queueId)) {
        return { kind: 'json', status: 200, body: estopSequenceJson(tenantId ?? 'local', state.queueId) }
      }
    }
  }

  if (isEmergencyStopBlocking()) {
    return { kind: 'error', status: 409, error: 'Emergency STOP active; no imaging sequences are available.' }
  }

  const { ninaRunning } = getObservatoryState()
  if (ninaRunning) {
    return {
      kind: 'error',
      status: 409,
      error: 'NINA is running; poll for Emergency STOP only until imaging stops.',
    }
  }

  await reconcilePendingScheduleStatus()

  const schedulingWindow = getTonightSchedulingWindow(now)
  const strip = getTonightScheduleStrip(now)
  const nauticalDawnMs = schedulingWindow.nauticalDawnUtc.getTime()
  const nightStartMs = schedulingWindow.nauticalDuskUtc.getTime()
  const nightKey = strip.nightKey

  type Deliverable =
    | { kind: 'session'; id: string; target: string; raHours: number | null; decDeg: number | null; plannedStartMs: number }
    | { kind: 'night'; night: ProjectNight; target: string; raHours: number | null; decDeg: number | null; plannedStartMs: number }

  const normalScheduled: Deliverable[] = listPendingSessions()
    .filter(
      (r) =>
        !r.projectMode &&
        r.status === 'scheduled' &&
        r.plannedStartIso != null &&
        Number.isFinite(Date.parse(r.plannedStartIso))
    )
    .map((r) => ({
      kind: 'session' as const,
      id: r.id,
      target: r.target,
      raHours: r.raHours,
      decDeg: r.decDeg,
      plannedStartMs: Date.parse(r.plannedStartIso!),
    }))

  const projectNights: Deliverable[] = listAllOpenProjectNights()
    .filter(
      (n) =>
        n.status === 'scheduled' &&
        n.nightKey === nightKey &&
        n.ninaSequenceJson != null &&
        n.plannedStartIso != null &&
        Number.isFinite(Date.parse(n.plannedStartIso))
    )
    .map((n) => {
      const parent = getSessionById(n.projectId)
      return {
        kind: 'night' as const,
        night: n,
        target: parent?.target ?? n.projectId,
        raHours: parent?.raHours ?? null,
        decDeg: parent?.decDeg ?? null,
        plannedStartMs: Date.parse(n.plannedStartIso!),
      }
    })

  const scheduledTonight = [...normalScheduled, ...projectNights].sort(
    (a, b) => a.plannedStartMs - b.plannedStartMs
  )

  let selected: Deliverable | null = null
  let blockingError: string | null = null

  for (const candidate of scheduledTonight) {
    if (candidate.plannedStartMs > nowMs + 5 * 60_000) continue

    const hasRaDec =
      typeof candidate.raHours === 'number' &&
      Number.isFinite(candidate.raHours) &&
      typeof candidate.decDeg === 'number' &&
      Number.isFinite(candidate.decDeg)
    if (hasRaDec) {
      const altitudeCheck = isAltitudeAllowed(candidate.raHours!, candidate.decDeg!)
      if (!altitudeCheck.ok) {
        blockingError = `Target altitude ${altitudeCheck.altitudeDeg.toFixed(2)}° is below ${altitudeCheck.minAltitudeDeg}° (${candidate.target}).`
        continue
      }
    }
    selected = candidate
    break
  }

  if (!selected) {
    const hasTonightActivity =
      listSessions().some((s) => s.status === 'in_progress' || s.status === 'completed') ||
      listAllOpenProjectNights().some((n) => n.status === 'in_progress')
    const remainingTonight = scheduledTonight.length > 0

    if (remainingTonight) {
      return {
        kind: 'error',
        status: 409,
        error:
          blockingError ??
          'No scheduled pending session available for download. Only sessions with status=scheduled and a valid plannedStartIso are delivered, in planned-start order.',
      }
    }

    const afterSessionsEligible = hasTonightActivity
    if (afterSessionsEligible && !wasEndNightAfterSessionsSent(nightKey)) {
      const queueId = `end-night-${nightKey}`
      markEndNightAfterSessionsSent(nightKey)
      appendAuditLog({
        kind: 'nina.delivered',
        message: `End-night sequence delivered (${queueId}).`,
        detail: { queueId, trigger: 'after_sessions' },
      })
      return { kind: 'json', status: 200, body: endNightSequenceJson(queueId) }
    }

    if (nowMs >= nauticalDawnMs && !wasEndNightDawnSent(nightKey)) {
      const queueId = `end-night-${nightKey}-dawn`
      markEndNightDawnSent(nightKey)
      return { kind: 'json', status: 200, body: endNightSequenceJson(queueId) }
    }

    return {
      kind: 'error',
      status: 409,
      error:
        blockingError ??
        'No scheduled pending session available for download. Only sessions with status=scheduled and a valid plannedStartIso are delivered, in planned-start order.',
    }
  }

  if (!isObservatoryReady()) {
    return { kind: 'error', status: 409, error: 'Observatory is closed' }
  }

  if (selected.kind === 'night') {
    const night = getProjectNightById(selected.night.id)
    if (!night || night.status !== 'scheduled' || !night.ninaSequenceJson) {
      return {
        kind: 'error',
        status: 409,
        error: 'No scheduled project sub-session available for download (queue may have changed).',
      }
    }
    markNightInProgress(night.id)
    emitLiveEvent(liveProgressChannel(night.projectId), { type: 'status', queueStatus: 'in_progress' })
    appendAuditLog({
      kind: 'nina.delivered',
      message: `NINA sequence delivered: ${selected.target} Session ${night.nightIndex} (${night.id}).`,
      detail: { id: night.id, projectId: night.projectId, target: selected.target, nightIndex: night.nightIndex },
    })
    return { kind: 'json', status: 200, body: night.ninaSequenceJson }
  }

  const consumed = consumeSession(selected.id)
  if (!consumed) {
    return {
      kind: 'error',
      status: 409,
      error: 'No scheduled pending session available for download (queue may have changed).',
    }
  }

  logSessionStatusChange({
    subject: { id: consumed.id, target: consumed.target, projectMode: consumed.projectMode },
    previousStatus: 'scheduled',
    nextStatus: 'in_progress',
    source: 'nina.delivered',
  })

  const sequenceJson = sequenceJsonForSession(consumed, tenantId)
  if (!sequenceJson) {
    return { kind: 'error', status: 404, error: 'NINA sequence not available for latest session' }
  }

  emitLiveEvent(liveProgressChannel(consumed.id), { type: 'status', queueStatus: 'in_progress' })
  appendAuditLog({
    kind: 'nina.delivered',
    message: `NINA sequence delivered: ${consumed.target} (${consumed.id}).`,
    detail: { id: consumed.id, target: consumed.target },
  })

  return { kind: 'json', status: 200, body: sequenceJson }
}

export function handleSessionProgressPost(body: Record<string, unknown>): { ok: true; queueId: string | null } {
  const borean = body.BoreanAstro
  let queueId: string | null = null
  if (borean && typeof borean === 'object' && !Array.isArray(borean)) {
    const raw = (borean as Record<string, unknown>).QueueId
    if (typeof raw === 'string' && raw.trim()) queueId = raw.trim()
  }
  if (!queueId && typeof body.queueId === 'string') queueId = body.queueId.trim()

  const text =
    typeof body.text === 'string'
      ? body.text
      : typeof body.message === 'string'
        ? body.message
        : ''

  if (queueId?.startsWith('end-night-')) {
    appendAuditLog({
      kind: 'session.progress',
      message: `End-night progress: ${text || queueId}`,
      detail: { queueId, text },
    })
    return { ok: true, queueId }
  }

  if (queueId && isEstopQueueId(queueId) && text.toLowerCase().includes('dome closed')) {
    markEmergencyStopCompleted(queueId)
    return { ok: true, queueId }
  }

  if (queueId) {
    const lower = text.toLowerCase()
    const projectNight = getProjectNightById(queueId)
    if (projectNight) {
      if (lower.includes('completed') || lower.includes('sequence finished')) {
        markNightCompleted(projectNight.id)
        publishProgress(projectNight.id, { type: 'status', queueStatus: 'completed' })
        publishProgress(projectNight.projectId, { type: 'status', queueStatus: 'completed' })
        void reconcilePendingScheduleStatus()
      } else if (lower.includes('failed') || lower.includes('error')) {
        markNightFailed(projectNight.id)
        publishProgress(projectNight.id, { type: 'status', queueStatus: 'failed' })
        publishProgress(projectNight.projectId, { type: 'status', queueStatus: 'failed' })
      } else if (text.trim()) {
        const at = new Date().toISOString()
        appendAuditLog({
          kind: 'session.progress',
          message: text.trim(),
          detail: { queueId, text, projectId: projectNight.projectId, nightIndex: projectNight.nightIndex },
        })
        publishProgress(projectNight.id, { type: 'line', at, text: text.trim() })
        publishProgress(projectNight.projectId, { type: 'line', at, text: text.trim() })
      }
      return { ok: true, queueId }
    }
    const session = getSessionById(queueId)
    if (lower.includes('completed') || lower.includes('sequence finished')) {
      const prev = session?.status ?? 'in_progress'
      patchSessionStatus(queueId, 'completed')
      logSessionStatusChange({
        subject: { id: queueId, target: session?.target ?? queueId, projectMode: session?.projectMode },
        previousStatus: prev === 'scheduled' ? 'in_progress' : (prev as 'in_progress'),
        nextStatus: 'completed',
        source: 'session.progress',
      })
      publishProgress(queueId, { type: 'status', queueStatus: 'completed' })
      void reconcilePendingScheduleStatus()
    } else if (lower.includes('failed') || lower.includes('error')) {
      const prev = session?.status ?? 'in_progress'
      patchSessionStatus(queueId, 'failed')
      logSessionStatusChange({
        subject: { id: queueId, target: session?.target ?? queueId, projectMode: session?.projectMode },
        previousStatus: prev === 'scheduled' ? 'in_progress' : (prev as 'in_progress'),
        nextStatus: 'failed',
        source: 'session.progress',
      })
      publishProgress(queueId, { type: 'status', queueStatus: 'failed' })
    } else if (text.trim()) {
      const at = new Date().toISOString()
      appendAuditLog({
        kind: 'session.progress',
        message: text.trim(),
        detail: { queueId, text, target: session?.target },
      })
      publishProgress(queueId, { type: 'line', at, text: text.trim() })
    }
  }

  return { ok: true, queueId }
}