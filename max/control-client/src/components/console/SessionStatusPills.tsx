import {
  sessionControlCanHold,
  sessionControlCanRun,
  sessionControlOnHold,
} from '../../lib/imaging/session-control-ui'
import type { SessionControlAction } from '../../lib/hub-client'

type SessionStatusPillsProps = {
  status: string
  busy: boolean
  emergencyStopBlocking?: boolean
  onAction: (action: SessionControlAction) => void
}

export function SessionStatusPills({
  status,
  busy,
  emergencyStopBlocking = false,
  onAction,
}: SessionStatusPillsProps) {
  const onHold = sessionControlOnHold(status)
  const canRun = sessionControlCanRun(status) && !emergencyStopBlocking
  const canHold = sessionControlCanHold(status)
  const showRun = canRun
  const showHold = onHold || canHold
  const showComplete = status !== 'completed'
  const showFail = status !== 'failed'
  const showInProgress = status === 'failed'

  return (
    <div className="session-status-pills" role="group" aria-label="Edit session status">
      {showRun && (
        <button
          type="button"
          disabled={busy}
          className="session-status-pill run"
          onClick={() => onAction('run')}
        >
          Run
        </button>
      )}
      {showHold && (
        <button
          type="button"
          disabled={busy}
          className="session-status-pill hold"
          onClick={() => onAction(onHold ? 'release_hold' : 'hold')}
        >
          {onHold ? 'Unhold' : 'Hold'}
        </button>
      )}
      {showComplete && (
        <button
          type="button"
          disabled={busy}
          className="session-status-pill complete"
          onClick={() => onAction('complete')}
        >
          Complete
        </button>
      )}
      {showFail && (
        <button
          type="button"
          disabled={busy}
          className="session-status-pill fail"
          onClick={() => onAction('fail')}
        >
          Fail
        </button>
      )}
      {showInProgress && (
        <button
          type="button"
          disabled={busy}
          className="session-status-pill in-progress"
          onClick={() => onAction('in_progress')}
        >
          In progress
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        className="session-status-pill delete"
        onClick={() => onAction('delete')}
      >
        Delete
      </button>
    </div>
  )
}
