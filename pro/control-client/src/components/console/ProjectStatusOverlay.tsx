import { useEffect, useState } from 'react'
import { queueStatusBadgeClass, queueStatusLabel } from '../../lib/imaging/queue-status'
import type { SessionControlAction } from '../../lib/hub-client'
import type { SessionRow } from '../../lib/types'
import { SessionStatusPills } from './SessionStatusPills'

type ProjectStatusOverlayProps = {
  project: SessionRow
  busySessionId: string | null
  emergencyStopBlocking: boolean
  onAction: (subSessionId: string, action: SessionControlAction) => void
  onClose: () => void
}

function statusNights(project: SessionRow) {
  return [...(project.nights ?? [])].sort((a, b) => a.nightIndex - b.nightIndex)
}

function displayNightStatus(status: string): string {
  return status === 'planned' ? 'scheduled' : status
}

export function ProjectStatusOverlay({
  project,
  busySessionId,
  emergencyStopBlocking,
  onAction,
  onClose,
}: ProjectStatusOverlayProps) {
  const [visible, setVisible] = useState(false)
  const nights = statusNights(project)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={`project-progress-overlay${visible ? ' is-visible' : ''}`}
      role="dialog"
      aria-labelledby="project-status-title"
    >
      <div className="project-progress-overlay-card">
        <section className="project-progress-overlay-section">
          <h3 id="project-status-title" className="project-progress-overlay-section-title">
            Edit status
          </h3>
          <div className="project-status-overlay-sessions">
            {nights.length === 0 ? (
              <p className="project-progress-overlay-empty">No sub-sessions scheduled.</p>
            ) : (
              <ul className="project-status-night-list">
                {nights.map((night) => {
                  const displayStatus = displayNightStatus(night.status)
                  return (
                    <li key={night.id} className="project-status-night-item">
                      <div className="project-status-night-head">
                        <span>
                          Session {night.nightIndex}
                          <span className="imaging-dashboard-night-key"> · {night.nightKey}</span>
                        </span>
                        <span className={`queue-status-badge ${queueStatusBadgeClass(displayStatus)}`}>
                          {queueStatusLabel(displayStatus)}
                        </span>
                      </div>
                      <SessionStatusPills
                        status={displayStatus}
                        busy={busySessionId === night.id}
                        emergencyStopBlocking={emergencyStopBlocking}
                        onAction={(action) => onAction(night.id, action)}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <button type="button" className="project-progress-overlay-cancel" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
