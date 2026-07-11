import { emergencyStopActorLabel } from './imaging/emergency-stop-display'
import { normalizeLegacyAuditStatus } from './imaging/status-audit'

export type AuditLogRow = {
  id: string
  at: string
  kind: string
  message: string
  detail?: Record<string, unknown>
}

const FAILED_KINDS = new Set(['queue.rejected', 'queue.create_failed'])
const FAILED_MESSAGE_RE = /fail|rejected|unauthorized|error/i

function sessionDetailParts(d: Record<string, unknown> | undefined): {
  target: string
  nightIndex: number | null
  id: string
} {
  const target = typeof d?.target === 'string' ? d.target.trim() : ''
  const nightIndex = typeof d?.nightIndex === 'number' ? d.nightIndex : null
  const id =
    typeof d?.nightSubId === 'string'
      ? d.nightSubId
      : typeof d?.id === 'string'
        ? d.id
        : ''
  return { target, nightIndex, id }
}

function formatStatusTransition(previousStatus: unknown, nextStatus: unknown): string {
  const previous = normalizeLegacyAuditStatus(previousStatus) ?? String(previousStatus ?? '?')
  const next = normalizeLegacyAuditStatus(nextStatus) ?? String(nextStatus ?? '?')
  return `${previous} → ${next}`
}

function targetFromScheduleMessage(message: string): string {
  const match = message.match(/^Schedule (?:scheduled|unscheduled):\s*(.+?)\s+\(/i)
  return match ? match[1]!.trim() : ''
}

/** Hide reconcile spam; full history remains in CSV export. */
export function auditLogRowVisible(row: AuditLogRow): boolean {
  if (
    row.kind !== 'session.schedule_changed' &&
    row.kind !== 'session.status_changed' &&
    row.kind !== 'session.imaging_plan_changed'
  ) {
    return true
  }
  const d = row.detail
  if (d?.projectMode === true && typeof d?.nightSubId !== 'string') return false
  return true
}

export function auditLogLineFailed(row: AuditLogRow): boolean {
  if (FAILED_KINDS.has(row.kind)) return true
  if (row.kind === 'queue.status' && FAILED_MESSAGE_RE.test(row.message)) return true
  if (
    row.kind === 'project.sub_session_unscheduled' ||
    row.kind === 'session.schedule_changed' ||
    row.kind === 'session.status_changed' ||
    row.kind === 'session.imaging_plan_changed' ||
    row.kind === 'queue.schedule'
  ) {
    return false
  }
  return FAILED_MESSAGE_RE.test(row.message) && !/completed|scheduled/i.test(row.message)
}

/** One-line headline for the Settings activity log list. */
export function auditLogHeadline(row: AuditLogRow): string {
  if (row.kind === 'session.imaging_plan_changed') {
    const { target, id } = sessionDetailParts(row.detail)
    const targetPart = target ? ` — ${target}` : ''
    const idPart = id ? ` (${id})` : ''
    return `Imaging plan changed${targetPart}${idPart}`
  }

  if (
    row.kind === 'session.status_changed' ||
    row.kind === 'session.schedule_changed' ||
    row.kind === 'queue.schedule'
  ) {
    const d = row.detail
    const { target, nightIndex, id } = sessionDetailParts(d)
    const resolvedTarget = target || targetFromScheduleMessage(row.message)
    const transition = formatStatusTransition(d?.previousStatus, d?.nextStatus)
    const label = nightIndex != null ? `Session ${nightIndex}` : 'Session'
    const targetPart = resolvedTarget ? ` — ${resolvedTarget}` : ''
    const idPart = id ? ` (${id})` : ''
    return `${label}${targetPart}${idPart}: ${transition}`
  }

  if (row.kind === 'observatory.mode_changed' || row.kind === 'observatory.status_changed') {
    return row.message
  }

  if (row.kind === 'session.deleted') {
    const id = typeof row.detail?.id === 'string' ? row.detail.id : ''
    return id ? `Session deleted — ${id}` : row.message
  }

  const scheduled = row.message.match(/sub-session scheduled:\s*(.+?)\s+Session\s+(\d+)/i)
  if (scheduled) return `Session ${scheduled[2]} scheduled — ${scheduled[1]!.trim()}`

  const unscheduled = row.message.match(/sub-session unscheduled:\s*(.+?)\s+Session\s+(\d+)/i)
  if (unscheduled) return `Session ${unscheduled[2]} unscheduled — ${unscheduled[1]!.trim()}`

  const delivered = row.message.match(/sub-session delivered:\s*(.+?)\s+Session\s+(\d+)/i)
  if (delivered) return `NINA delivered Session ${delivered[2]} — ${delivered[1]!.trim()}`

  const nightCompleted = row.message.match(/sub-session\s+(.+?::night-\d+)\s+completed/i)
  if (nightCompleted) return `Session completed — ${nightCompleted[1]}`

  const movedPending = row.message.match(/Session\s+(\S+)\s+moved from scheduled/i)
  if (movedPending) return `Queue unscheduled — ${movedPending[1]}`

  const scheduling = row.message.match(/Scheduling decision for\s+(\S+):\s*(.+)$/i)
  if (scheduling) return `Schedule: ${scheduling[2]} — ${scheduling[1]}`

  const edited = row.message.match(/Pending session edited:\s*(.+?)\s+\(/i)
  if (edited) return `Session edited — ${edited[1]!.trim()}`

  const created = row.message.match(/Imaging (?:queue )?session (?:created|submitted):\s*(.+?)\s+\(/i)
  if (created) return `Session created — ${created[1]!.trim()}`

  if (row.kind === 'nina.delivered') {
    const projectNight = row.message.match(
      /^NINA sequence delivered:\s*(.+?)\s+Session\s+(\d+)\s+\(([^)]+)\)/i,
    )
    if (projectNight) {
      return `NINA delivered Session ${projectNight[2]} — ${projectNight[1]!.trim()} (${projectNight[3]})`
    }
    const short = row.message
      .replace(/^NINA project sub-session delivered:\s*/i, 'NINA delivered — ')
      .replace(/^NINA sequence delivered:\s*/i, 'NINA delivered — ')
      .replace(/^End-night sequence delivered\s*/i, 'End-night delivered — ')
    return short.length > 100 ? `${short.slice(0, 97)}…` : short
  }

  if (row.kind === 'emergency_stop') {
    const plain = row.message.replace(/\s+/g, ' ').trim()
    const d = row.detail
    const who = emergencyStopActorLabel({
      requestedBy: typeof d?.requestedBy === 'string' ? d.requestedBy : null,
      requestedByEmail: typeof d?.requestedByEmail === 'string' ? d.requestedByEmail : null,
      requestedByUsername: typeof d?.requestedByUsername === 'string' ? d.requestedByUsername : null,
    })
    if (!plain.includes('triggered by')) {
      const withWho = `${plain} (triggered by ${who})`
      return withWho.length > 110 ? `${withWho.slice(0, 107)}…` : withWho
    }
    if (who === 'unknown operator' && plain.includes('triggered by admin')) {
      return plain.replace('triggered by admin', 'triggered by unknown operator')
    }
    return plain.length > 110 ? `${plain.slice(0, 107)}…` : plain
  }

  const plain = row.message.replace(/\s+/g, ' ').trim()
  return plain.length > 110 ? `${plain.slice(0, 107)}…` : plain
}

export type AuditDetailField = { label: string; value: string }

function stringish(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v, null, 2)
}

/** Flatten detail for the detail modal (reasons expanded, nested JSON pretty). */
export function auditLogDetailFields(row: AuditLogRow): AuditDetailField[] {
  const fields: AuditDetailField[] = [
    { label: 'Time (UTC)', value: row.at.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') },
    {
      label: 'Time (local)',
      value: Number.isFinite(Date.parse(row.at)) ? new Date(row.at).toLocaleString() : row.at,
    },
    { label: 'Kind', value: row.kind },
    { label: 'Message', value: row.message },
  ]

  const d = row.detail
  if (!d || typeof d !== 'object' || Array.isArray(d)) return fields

  const reasons = d.reasons
  if (Array.isArray(reasons)) {
    reasons.forEach((r, i) => {
      fields.push({ label: `Reason ${i + 1}`, value: stringish(r) })
    })
  }

  const skip = new Set(['reasons'])
  for (const [key, value] of Object.entries(d)) {
    if (skip.has(key)) continue
    if (value == null) continue
    if (typeof value === 'object') {
      fields.push({ label: key, value: JSON.stringify(value, null, 2) })
    } else {
      fields.push({ label: key, value: stringish(value) })
    }
  }

  return fields
}
