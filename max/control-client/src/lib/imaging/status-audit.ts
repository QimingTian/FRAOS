export type SessionAuditStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'on_hold'
  | 'rejected'

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
