import { useEffect, useState } from 'react'
import type { HubProbeResult, ObservatoryStatus } from '../../lib/types'
import { loadAppTenant } from '../../lib/control-app-api'
import { missionControlSubtitle } from '../../lib/plan-label'
import { observatoryStatusOptionLabel } from '../../lib/observatory-status-options'
import { stationConnected } from '../../lib/hub-client'
import { formatObservatoryLocalTime } from '../../lib/observatory-local-time'
import { getObservatoryLocation, isObservatoryConfigured } from '../../lib/settings'
import { canUseOwnerControls } from '../../lib/pro-team-access'
import { EmergencyStopPanel } from './EmergencyStopPanel'

type ConsoleHeaderProps = {
  probe: HubProbeResult | null
  embedded?: boolean
  sessionOpen?: boolean
  onToggleSession?: () => void
  dashboardOpen?: boolean
  onToggleDashboard?: () => void
}

type LampTone = 'ok' | 'warning' | 'error' | 'off'

function hubLampTone(probe: HubProbeResult | null): LampTone {
  if (probe?.hubReachable) return 'ok'
  if (probe === null) return 'off'
  return 'error'
}

function stationLampTone(probe: HubProbeResult | null): LampTone {
  const up = stationConnected(probe)
  if (up === null) return 'off'
  return up ? 'ok' : 'error'
}

function hubTooltip(probe: HubProbeResult | null): string {
  if (probe?.hubReachable) return 'Hub online'
  return probe?.error ?? 'Hub offline'
}

function stationTooltip(probe: HubProbeResult | null): string {
  const up = stationConnected(probe)
  if (up === null) return 'Station unknown'
  return up ? 'Station connected' : 'Station disconnected'
}

function ObservatoryStatusText({ probe }: { probe: HubProbeResult | null }) {
  return (
    <div className="status-obs-text">
      <span className="status-obs-label">Observatory Status:</span>{' '}
      <span className="status-obs-value">{obsStatusText(probe)}</span>
    </div>
  )
}

function obsStatusText(probe: HubProbeResult | null): string {
  const status = probe?.observatory?.status
  if (!probe?.hubReachable || !status) return '—'
  return observatoryStatusOptionLabel(status as ObservatoryStatus)
}

function StatusLamp({ label, tone, title }: { label: string; tone: LampTone; title: string }) {
  return (
    <div className="status-lamp-row" title={title}>
      <span className={`status-lamp status-lamp-${tone}`} aria-hidden />
      <span className="status-lamp-label">{label}</span>
    </div>
  )
}

function ObsTimeDisplay() {
  const [timeLabel, setTimeLabel] = useState('—')

  useEffect(() => {
    const tick = () => {
      if (!isObservatoryConfigured()) {
        setTimeLabel('—')
        return
      }
      const { lon } = getObservatoryLocation()
      setTimeLabel(formatObservatoryLocalTime(new Date(), lon))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <time className="console-clock" dateTime={timeLabel === '—' ? undefined : timeLabel}>
      Obs Time: {timeLabel}
    </time>
  )
}

export function ConsoleHeader({
  probe,
  embedded = false,
  sessionOpen = false,
  onToggleSession,
  dashboardOpen = false,
  onToggleDashboard,
}: ConsoleHeaderProps) {
  const [editionSubtitle, setEditionSubtitle] = useState('Mission Control')

  useEffect(() => {
    void loadAppTenant().then((tenant) => {
      setEditionSubtitle(missionControlSubtitle(tenant?.plan))
    })
  }, [])

  if (embedded) {
    return (
      <div className="console-header-row">
        <header className="console-header-glass console-header-status">
          <div className="status-rail">
            <StatusLamp label="Hub" tone={hubLampTone(probe)} title={hubTooltip(probe)} />
            <StatusLamp label="Station" tone={stationLampTone(probe)} title={stationTooltip(probe)} />
            <ObservatoryStatusText probe={probe} />
          </div>
          <div className="console-header-utils">
            <ObsTimeDisplay />
          </div>
        </header>

        <aside className="console-header-glass console-header-estop-panel">
          {canUseOwnerControls() ? (
            <EmergencyStopPanel hubReachable={Boolean(probe?.hubReachable)} />
          ) : null}
        </aside>

        <aside className="console-header-glass console-header-actions-panel">
          <button type="button" className="btn" onClick={onToggleSession}>
            {sessionOpen ? 'Close' : 'Create Session'}
          </button>
          <button type="button" className="btn" onClick={onToggleDashboard}>
            {dashboardOpen ? 'Close' : 'Imaging Dashboard'}
          </button>
        </aside>
      </div>
    )
  }

  return (
    <header className="console-header">
      <div className="console-brand">
        <span className="console-brand-mark">◆</span>
        <div>
          <div className="console-brand-title">Borean Astro</div>
          <div className="console-brand-sub">{editionSubtitle}</div>
        </div>
      </div>

      <div className="status-rail">
        <StatusLamp label="Hub" tone={hubLampTone(probe)} title={hubTooltip(probe)} />
        <StatusLamp label="Station" tone={stationLampTone(probe)} title={stationTooltip(probe)} />
        <ObservatoryStatusText probe={probe} />
      </div>

      <div className="console-header-utils">
        <ObsTimeDisplay />
      </div>
    </header>
  )
}
