import { useCallback, useEffect, useState } from 'react'
import {
  auditLogDetailFields,
  auditLogHeadline,
  auditLogLineFailed,
  auditLogRowVisible,
  type AuditLogRow,
} from '../../lib/audit-log-display'
import { fetchAuditLog } from '../../lib/hub-client'
import { formatObservatoryLocalDateTime, formatObservatoryLocalTime } from '../../lib/observatory-local-time'
import { MotionOverlay } from '../motion'

type SettingsActivityLogPanelProps = {
  refreshToken?: number
}

export function SettingsActivityLogPanel({ refreshToken = 0 }: SettingsActivityLogPanelProps) {
  const [entries, setEntries] = useState<AuditLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AuditLogRow | null>(null)

  const loadLog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAuditLog(200)
      if (!data.ok || !Array.isArray(data.entries)) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load log')
      }
      setEntries(data.entries.filter((e) => e.kind !== 'session.progress'))
    } catch {
      setError('Unable to load activity log.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLog()
  }, [loadLog, refreshToken])

  useEffect(() => {
    if (!selected) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  function exportCsv() {
    if (entries.length === 0) return
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = 'Time,Kind,Message,Detail'
    const rows = entries.map((r) =>
      [
        escape(
          Number.isFinite(Date.parse(r.at))
            ? formatObservatoryLocalDateTime(new Date(r.at))
            : r.at
        ),
        escape(r.kind),
        escape(r.message),
        escape(r.detail ? JSON.stringify(r.detail) : ''),
      ].join(','),
    )
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="settings-log-root">
      <div
        className={selected ? 'settings-log-base settings-log-base-hidden' : 'settings-log-base'}
        aria-hidden={Boolean(selected)}
      >
        <div className="remote-pane-head settings-log-head">
          <h2>Log</h2>
          <div className="settings-log-toolbar" aria-label="Log actions">
            <button type="button" className="btn btn-muted settings-log-btn" onClick={exportCsv} disabled={entries.length === 0}>
              Export
            </button>
            <button type="button" className="btn btn-muted settings-log-btn" onClick={() => void loadLog()} disabled={loading}>
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}

        <div className="settings-log-scroll">
          {entries.length === 0 && !loading ? (
            <p className="text-sm text-white/45">No log entries yet.</p>
          ) : (
            entries.filter(auditLogRowVisible).map((row) => {
              const failed = auditLogLineFailed(row)
              const headline = auditLogHeadline(row)
              const timeLabel = Number.isFinite(Date.parse(row.at))
                ? formatObservatoryLocalTime(new Date(row.at))
                : row.at
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelected(row)}
                  className={`settings-log-line ${failed ? 'settings-log-line-failed' : 'settings-log-line-ok'}`}
                >
                  <span className="settings-log-time">[{timeLabel}]</span>{' '}
                  <span className={failed ? 'settings-log-failed-text' : 'settings-log-ok-text'}>{headline}</span>
                </button>
              )
            })
          )}
        </div>
      </div>

      <MotionOverlay open={Boolean(selected)} className="settings-log-detail-layer">
        {selected ? (
          <div className="remote-overlay-pane settings-log-detail-pane" role="dialog" aria-labelledby="audit-log-detail-title">
            <button type="button" className="settings-log-detail-close" onClick={() => setSelected(null)}>
              Close
            </button>
            <h2 id="audit-log-detail-title" className="settings-log-detail-title">
              {auditLogHeadline(selected)}
            </h2>
            <p className="settings-log-detail-kind">{selected.kind}</p>
            <div className="settings-log-detail-body">
              {auditLogDetailFields(selected).map((field) => (
                <div key={field.label}>
                  <p className="settings-log-detail-label">{field.label}</p>
                  <p className="settings-log-detail-value">{field.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </MotionOverlay>
    </div>
  )
}
