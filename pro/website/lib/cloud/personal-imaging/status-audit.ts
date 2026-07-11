import { personalAppendAuditLog } from '@/lib/cloud/personal-audit-log'
import { getTenantId } from '@/lib/cloud/personal-imaging/ctx'
import type { ProjectNight } from '@/lib/cloud/personal-imaging/types'

export type SessionAuditStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'on_hold'
  | 'rejected'

export type SessionAuditSubject = {
  id: string
  target: string
  projectMode?: boolean
  projectId?: string
  nightSubId?: string
  nightIndex?: number
  nightKey?: string
}

export function projectNightStatusToAuditStatus(
  status: ProjectNight['status'] | 'planned'
): SessionAuditStatus {
  if (status === 'planned') return 'pending'
  return status
}

/** Map legacy schedule-insight / audit rows for display. */
export function normalizeLegacyAuditStatus(value: unknown): SessionAuditStatus | null {
  if (value === 'unscheduled') return 'pending'
  if (
    value === 'pending' ||
    value === 'scheduled' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'on_hold' ||
    value === 'rejected'
  ) {
    return value
  }
  return null
}

function sessionLabel(subject: SessionAuditSubject): string {
  const name =
    subject.nightIndex != null ? `${subject.target} Session ${subject.nightIndex}` : subject.target
  const id = subject.nightSubId ?? subject.id
  return `${name} (${id})`
}

function statusArrow(previousStatus: SessionAuditStatus, nextStatus: SessionAuditStatus): string {
  return `${previousStatus} → ${nextStatus}`
}

export function logSessionStatusChange(input: {
  subject: SessionAuditSubject
  previousStatus: SessionAuditStatus
  nextStatus: SessionAuditStatus
  reason?: string
  reasons?: string[]
  plannedStartIso?: string | null
  previousPlannedStartIso?: string | null
  source?: string
}): void {
  if (input.previousStatus === input.nextStatus) return

  const label = sessionLabel(input.subject)
  const transition = statusArrow(input.previousStatus, input.nextStatus)

  void personalAppendAuditLog(getTenantId(), {
    kind: 'session.status_changed',
    message: `Session status: ${label} ${transition}.`,
    detail: {
      id: input.subject.id,
      target: input.subject.target,
      ...(input.subject.projectMode != null ? { projectMode: input.subject.projectMode } : {}),
      ...(input.subject.projectId ? { projectId: input.subject.projectId } : {}),
      ...(input.subject.nightSubId ? { nightSubId: input.subject.nightSubId } : {}),
      ...(input.subject.nightIndex != null ? { nightIndex: input.subject.nightIndex } : {}),
      ...(input.subject.nightKey ? { nightKey: input.subject.nightKey } : {}),
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      ...(input.previousPlannedStartIso !== undefined
        ? { previousPlannedStartIso: input.previousPlannedStartIso }
        : {}),
      ...(input.plannedStartIso !== undefined ? { plannedStartIso: input.plannedStartIso } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.reasons?.length ? { reasons: input.reasons } : {}),
      ...(input.source ? { source: input.source } : {}),
    },
  })
}

export async function logSessionScheduleChange(input: {
  subject: SessionAuditSubject
  previousPlannedStartIso?: string | null
  plannedStartIso?: string | null
  plannedEndIso?: string | null
  filterPlansTonight?: Array<{ filterName: string; exposureSeconds: number; count: number }>
  reasons?: string[]
  source?: string
}): Promise<void> {
  const label = sessionLabel(input.subject)

  await personalAppendAuditLog(getTenantId(), {
    kind: 'session.schedule_changed',
    message: `Session schedule changed: ${label}.`,
    detail: {
      id: input.subject.id,
      target: input.subject.target,
      ...(input.subject.projectMode != null ? { projectMode: input.subject.projectMode } : {}),
      ...(input.subject.projectId ? { projectId: input.subject.projectId } : {}),
      ...(input.subject.nightSubId ? { nightSubId: input.subject.nightSubId } : {}),
      ...(input.subject.nightIndex != null ? { nightIndex: input.subject.nightIndex } : {}),
      ...(input.subject.nightKey ? { nightKey: input.subject.nightKey } : {}),
      status: 'scheduled' as const,
      ...(input.previousPlannedStartIso !== undefined
        ? { previousPlannedStartIso: input.previousPlannedStartIso }
        : {}),
      ...(input.plannedStartIso !== undefined ? { plannedStartIso: input.plannedStartIso } : {}),
      ...(input.plannedEndIso !== undefined ? { plannedEndIso: input.plannedEndIso } : {}),
      ...(input.filterPlansTonight ? { filterPlansTonight: input.filterPlansTonight } : {}),
      ...(input.reasons?.length ? { reasons: input.reasons } : {}),
      ...(input.source ? { source: input.source } : {}),
    },
  })
}
