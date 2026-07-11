type StatusBadgeProps = {
  label: string
  tone: 'ok' | 'warn' | 'error' | 'muted'
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`badge badge-${tone}`}>{label}</span>
}
