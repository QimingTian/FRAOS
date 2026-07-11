export function queueStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'scheduled':
      return 'Scheduled'
    case 'on_hold':
      return 'On hold'
    case 'in_progress':
      return 'In progress'
    case 'completed':
      return 'Completed'
    case 'claimed':
      return 'In progress'
    case 'failed':
      return 'Failed'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

export function queueStatusBadgeClass(status: string): string {
  if (status === 'pending') return 'queue-status-pending'
  if (status === 'scheduled') return 'queue-status-scheduled'
  if (status === 'on_hold') return 'queue-status-hold'
  if (status === 'in_progress' || status === 'claimed') return 'queue-status-active'
  if (status === 'completed') return 'queue-status-done'
  if (status === 'failed' || status === 'rejected') return 'queue-status-failed'
  return 'queue-status-default'
}

export function sessionActionButtonClass(
  enabled: boolean,
  variant: 'default' | 'danger' = 'default'
): string {
  const base = 'session-action-btn'
  if (!enabled) return `${base} disabled`
  if (variant === 'danger') return `${base} danger`
  return base
}

/** In-progress imaging run (claimed queue item actively running). */
export function isActiveImagingSession(session: { status: string }): boolean {
  return session.status === 'in_progress' || session.status === 'claimed'
}

/** Active session only — no fallback to pending/scheduled/completed. */
export function pickActiveDashboardSession<T extends { status: string }>(sessions: T[]): T | null {
  return sessions.find((session) => isActiveImagingSession(session)) ?? null
}
