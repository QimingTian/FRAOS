import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { fetchCurrentSessions } from '../lib/hub-client'
import type { SessionRow } from '../lib/types'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso
}

export function SessionsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCurrentSessions()
      if (data.ok && Array.isArray(data.sessions)) {
        setSessions(
          data.sessions.map((s) => ({
            id: String(s.id ?? ''),
            target: String(s.target ?? '—'),
            status: String(s.status ?? 'unknown'),
            plannedStartIso: s.plannedStartIso ?? null,
            createdAt: s.createdAt,
          }))
        )
      } else {
        setSessions([])
        setError(typeof data.error === 'string' ? data.error : 'Unable to load sessions')
      }
    } catch (ex) {
      setSessions([])
      setError(ex instanceof Error ? ex.message : 'Unable to load sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshKey])

  return (
    <div className="page">
      <header className="page-header">
        <h1>Sessions</h1>
        <button type="button" className="btn secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </button>
      </header>

      {error && <p className="error-text">{error}</p>}

      {loading && sessions.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="muted">No sessions in queue. Submit a target when Personal Hub is running.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Status</th>
                <th>Planned start</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => (
                <tr key={row.id}>
                  <td>{row.target}</td>
                  <td>
                    <StatusBadge label={row.status} tone="muted" />
                  </td>
                  <td>{formatWhen(row.plannedStartIso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
