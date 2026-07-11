import type { CheckStatus } from '../lib/types'

type ChecklistRowProps = {
  label: string
  status: CheckStatus
}

function lampClass(status: CheckStatus): string {
  if (status === 'ok') return 'lamp lamp-ok'
  return 'lamp lamp-error'
}

export function ChecklistRow({ label, status }: ChecklistRowProps) {
  return (
    <li className="check-row">
      <span className={lampClass(status)} aria-hidden />
      <span className="check-label">{label}</span>
    </li>
  )
}
