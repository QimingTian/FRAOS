import { useCallback, useEffect, useState } from 'react'
import { armEmergencyStop, fetchEmergencyStopStatus } from '../../lib/hub-client'
import { MotionExpand } from '../motion'

type EmergencyStopPhase = 'idle' | 'stopping' | 'stopped'

type EmergencyStopStatus = {
  phase: EmergencyStopPhase
  progress: number
  label: string
  agentConnected: boolean
  canArm: boolean
}

function emergencyStopButtonLabel(status: EmergencyStopStatus): string {
  if (status.phase === 'stopping') return 'STOPPING'
  if (status.phase === 'stopped') return 'STOPPED'
  return 'Emergency STOP'
}

export function EmergencyStopPanel({ hubReachable }: { hubReachable: boolean }) {
  const [pending, setPending] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [status, setStatus] = useState<EmergencyStopStatus>({
    phase: 'idle',
    progress: 0,
    label: 'ESTOP',
    agentConnected: false,
    canArm: false,
  })

  const refreshStatus = useCallback(async () => {
    if (!hubReachable) {
      setStatusLoaded(true)
      setStatus((prev) => ({ ...prev, agentConnected: false, canArm: false }))
      return
    }
    try {
      const data = await fetchEmergencyStopStatus()
      if (!data.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Unable to load ESTOP status.')
        return
      }
      setError(null)
      setStatus({
        phase:
          data.phase === 'stopping' || data.phase === 'stopped' || data.phase === 'idle'
            ? data.phase
            : 'idle',
        progress: typeof data.progress === 'number' ? data.progress : 0,
        label: typeof data.label === 'string' ? data.label : 'ESTOP',
        agentConnected: Boolean(data.agentConnected),
        canArm: Boolean(data.canArm),
      })
    } catch {
      setError('Unable to load ESTOP status.')
    } finally {
      setStatusLoaded(true)
    }
  }, [hubReachable])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!hubReachable) return undefined
    const intervalMs = status.phase === 'stopping' ? 3000 : 8000
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [hubReachable, refreshStatus, status.phase])

  useEffect(() => {
    if (status.phase !== 'idle') setShowConfirm(false)
  }, [status.phase])

  async function confirmEmergencyStop() {
    setShowConfirm(false)
    setPending(true)
    setError(null)
    try {
      const data = await armEmergencyStop()
      if (!data.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Emergency STOP failed.')
        return
      }
      setStatus({
        phase:
          data.phase === 'stopping' || data.phase === 'stopped' || data.phase === 'idle'
            ? data.phase
            : 'stopping',
        progress: typeof data.progress === 'number' ? data.progress : 33,
        label: typeof data.label === 'string' ? data.label : 'STOPPING',
        agentConnected: Boolean(data.agentConnected),
        canArm: Boolean(data.canArm),
      })
    } catch {
      setError('Emergency STOP failed.')
    } finally {
      setPending(false)
    }
  }

  const canArmEstop =
    hubReachable &&
    statusLoaded &&
    !pending &&
    status.phase === 'idle' &&
    status.agentConnected &&
    status.canArm

  const idleLabel = !statusLoaded ? 'Loading…' : pending ? 'Sending…' : emergencyStopButtonLabel(status)

  return (
    <div className="console-header-estop-inner">
      <div className="estop-pill-wrap">
        {!showConfirm ? (
          <button
            type="button"
            className="estop-pill"
            disabled={!canArmEstop}
            onClick={() => setShowConfirm(true)}
          >
            <div
              className="estop-pill-progress"
              style={{ width: `${status.progress}%` }}
              aria-hidden
            />
            <span className="estop-pill-label">{idleLabel}</span>
          </button>
        ) : (
          <MotionExpand open={showConfirm}>
            <div className="estop-confirm-pills" role="group" aria-label="Confirm emergency stop">
              <button
                type="button"
                className="estop-pill"
                disabled={pending}
                onClick={() => void confirmEmergencyStop()}
              >
                <span className="estop-pill-label">Confirm ESTOP</span>
              </button>
              <button
                type="button"
                className="estop-pill"
                disabled={pending}
                onClick={() => setShowConfirm(false)}
              >
                <span className="estop-pill-label">Cancel</span>
              </button>
            </div>
          </MotionExpand>
        )}
      </div>
      {error ? <p className="estop-error">{error}</p> : null}
    </div>
  )
}
