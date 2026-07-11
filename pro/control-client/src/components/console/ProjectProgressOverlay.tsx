import { useEffect, useState } from 'react'
import { queueStatusBadgeClass, queueStatusLabel } from '../../lib/imaging/queue-status'
import type { SessionRow } from '../../lib/types'

type ProjectProgressOverlayProps = {
  project: SessionRow
  onSelectSubSession: (subSessionId: string) => void
  onClose: () => void
}

function progressNights(project: SessionRow) {
  return (project.nights ?? []).filter(
    (n) =>
      n.status === 'scheduled' ||
      n.status === 'in_progress' ||
      n.status === 'completed' ||
      n.status === 'failed' ||
      n.status === 'on_hold'
  )
}

export function ProjectProgressOverlay({
  project,
  onSelectSubSession,
  onClose,
}: ProjectProgressOverlayProps) {
  const [visible, setVisible] = useState(false)
  const projectFilterProgress = project.projectFilterProgress ?? []
  const nights = progressNights(project)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={`project-progress-overlay${visible ? ' is-visible' : ''}`}
      role="dialog"
      aria-labelledby="project-progress-select-title"
    >
      <div className="project-progress-overlay-card">
        <section className="project-progress-overlay-section">
          <h3 id="project-progress-select-title" className="project-progress-overlay-section-title">
            Select session
          </h3>
          <div className="project-progress-overlay-sessions">
            {nights.length === 0 ? (
              <p className="project-progress-overlay-empty">No session scheduled.</p>
            ) : (
              <ul className="imaging-dashboard-night-list">
                {nights.map((night) => (
                  <li key={night.id}>
                    <button
                      type="button"
                      className="imaging-dashboard-night-btn"
                      onClick={() => onSelectSubSession(night.id)}
                    >
                      <span>
                        Session {night.nightIndex}
                        <span className="imaging-dashboard-night-key"> · {night.nightKey}</span>
                      </span>
                      <span className={`queue-status-badge ${queueStatusBadgeClass(night.status)}`}>
                        {queueStatusLabel(night.status)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {projectFilterProgress.length > 0 ? (
          <section className="project-progress-overlay-section">
            <h3 className="project-progress-overlay-section-title">Project progress</h3>
            <div className="imaging-dashboard-filter-bars">
              {projectFilterProgress.map((filter) => {
                const pct =
                  filter.total > 0
                    ? Math.min(100, Math.round((filter.captured / filter.total) * 100))
                    : 0
                const complete = filter.captured >= filter.total
                return (
                  <div key={filter.filterName} className="imaging-dashboard-filter-row">
                    <div className="imaging-dashboard-filter-head">
                      <span>{filter.filterName}</span>
                      <span>
                        {filter.captured} / {filter.total}
                        {complete ? ' · complete' : ''}
                      </span>
                    </div>
                    <div
                      className="imaging-dashboard-filter-track"
                      role="progressbar"
                      aria-valuenow={filter.captured}
                      aria-valuemin={0}
                      aria-valuemax={filter.total}
                      aria-label={`${filter.filterName} frames captured`}
                    >
                      <div className="imaging-dashboard-filter-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        <button type="button" className="project-progress-overlay-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
