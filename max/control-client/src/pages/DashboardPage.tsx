import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { getCloudHubLabel, observatoryStatusLabel, probeHub } from '../lib/hub-client'
import { getTenantLabel } from '../lib/tenant'
import type { HubProbeResult } from '../lib/types'

export function DashboardPage() {
  const [probe, setProbe] = useState<HubProbeResult | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await probeHub()
    setProbe(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 15_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const status = probe?.observatory?.status
  const agentLikelyConnected = status !== 'disconnected' && probe?.hubReachable

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <button type="button" className="btn secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </button>
      </header>

      <p className="muted">
        License: {getTenantLabel()} · Cloud hub: {getCloudHubLabel()}
      </p>

      <div className="card-grid">
        <section className="card">
          <h2>Cloud hub</h2>
          {loading && !probe ? (
            <p className="muted">Checking…</p>
          ) : probe?.hubReachable ? (
            <StatusBadge label="Reachable" tone="ok" />
          ) : (
            <>
              <StatusBadge label="Offline" tone="error" />
              <p className="error-text">{probe?.error ?? 'Cannot reach your cloud hub'}</p>
              <p className="hint">Ensure Personal Hub dev server is running, or check www.boreanastro.com connectivity.</p>
            </>
          )}
        </section>

        <section className="card">
          <h2>Observatory</h2>
          {probe?.hubReachable && status ? (
            <>
              <StatusBadge
                label={observatoryStatusLabel(status)}
                tone={status === 'ready' ? 'ok' : status === 'busy_in_use' ? 'warn' : 'muted'}
              />
              <p className="muted">Mode: {probe.observatory?.mode ?? '—'}</p>
            </>
          ) : (
            <StatusBadge label="Unknown" tone="muted" />
          )}
        </section>

        <section className="card">
          <h2>Station agent</h2>
          {agentLikelyConnected ? (
            <StatusBadge label="Connected (inferred)" tone="ok" />
          ) : (
            <>
              <StatusBadge label="Not connected" tone="warn" />
              <p className="hint">Run the Station Agent on the observatory PC.</p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}