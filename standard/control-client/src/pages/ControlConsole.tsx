import { useCallback, useEffect, useRef, useState } from 'react'
import { ConsoleHeader } from '../components/console/ConsoleHeader'
import { RemoteGlassConsole } from '../components/console/RemoteGlassConsole'
import { fetchCurrentSessions, probeHub } from '../lib/hub-client'
import { pickActiveDashboardSession } from '../lib/imaging/queue-status'
import type { HubProbeResult, SessionRow } from '../lib/types'
import { fetchTonightWeather, type TonightWeatherSnapshot } from '../lib/weather-client'
import type { RemotePrefill } from './AtlasPage'

type ControlConsoleProps = {
  embedded?: boolean
  prefill?: RemotePrefill | null
  onPrefillConsumed?: () => void
}

export function ControlConsole({
  embedded = false,
  prefill,
  onPrefillConsumed,
}: ControlConsoleProps) {
  const [probe, setProbe] = useState<HubProbeResult | null>(null)
  const [weather, setWeather] = useState<TonightWeatherSnapshot | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [dashboardSession, setDashboardSession] = useState<SessionRow | null>(null)
  const [dashboardProgressSessionId, setDashboardProgressSessionId] = useState<string | null>(null)
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null)
  const disconnectStreakRef = useRef(0)

  const toggleDashboard = useCallback(() => {
    if (dashboardOpen) {
      setDashboardOpen(false)
      setDashboardProgressSessionId(null)
      return
    }
    setSessionOpen(false)
    setDashboardSession(pickActiveDashboardSession(sessions))
    setDashboardProgressSessionId(null)
    setDashboardOpen(true)
  }, [dashboardOpen, sessions])

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    setSessionsError(null)
    try {
      const data = await fetchCurrentSessions()
      if (data.ok && Array.isArray(data.sessions)) {
        setSessions(
          data.sessions.map((s) => ({
            id: String(s.id ?? ''),
            target: String(s.target ?? '—'),
            status: String(s.status ?? 'unknown'),
            outputMode: typeof s.outputMode === 'string' ? s.outputMode : undefined,
            plannedStartIso: s.plannedStartIso ?? null,
            createdAt: s.createdAt,
            filter: s.filter ?? null,
            exposureSeconds: s.exposureSeconds ?? null,
            count: s.count ?? null,
            raHours: typeof s.raHours === 'number' ? s.raHours : null,
            decDeg: typeof s.decDeg === 'number' ? s.decDeg : null,
            estimatedDurationSeconds:
              typeof s.estimatedDurationSeconds === 'number' ? s.estimatedDurationSeconds : null,
            filterPlans: Array.isArray(s.filterPlans) ? s.filterPlans : null,
            sessionType: typeof s.sessionType === 'string' ? s.sessionType : 'dso',
            projectMode: s.projectMode === true,
            cameraCoolingTempC:
              typeof s.cameraCoolingTempC === 'number' ? s.cameraCoolingTempC : null,
            hasDownload: s.hasDownload === true,
            projectFilterProgress: Array.isArray(s.projectFilterProgress)
              ? s.projectFilterProgress
              : undefined,
            nights: Array.isArray(s.nights)
              ? s.nights.map((n) => ({
                  id: String(n.id ?? ''),
                  nightIndex: Number(n.nightIndex ?? 0),
                  nightKey: String(n.nightKey ?? ''),
                  status: String(n.status ?? 'scheduled'),
                  hasDownload: n.hasDownload === true,
                }))
              : undefined,
          }))
        )
      } else {
        setSessions([])
        setSessionsError(typeof data.error === 'string' ? data.error : 'Unable to load queue')
      }
    } catch (ex) {
      setSessions([])
      setSessionsError(ex instanceof Error ? ex.message : 'Unable to load queue')
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    const probeResult = await probeHub()
    setProbe((prev) => {
      const disconnected =
        probeResult.hubReachable && probeResult.observatory?.status === 'disconnected'
      if (!disconnected) {
        disconnectStreakRef.current = 0
        return probeResult
      }
      disconnectStreakRef.current += 1
      if (disconnectStreakRef.current >= 2) {
        return probeResult
      }
      if (prev?.hubReachable && prev.observatory?.status !== 'disconnected') {
        return prev
      }
      return probeResult
    })
  }, [])

  const refreshAll = useCallback(async () => {
    const [probeResult, weatherResult] = await Promise.all([
      probeHub(),
      fetchTonightWeather(),
    ])
    disconnectStreakRef.current = 0
    setProbe(probeResult)
    setWeather(weatherResult)
    await loadSessions()
  }, [loadSessions])

  useEffect(() => {
    void refreshAll()
    const statusId = window.setInterval(() => void refreshStatus(), 8_000)
    const hubId = window.setInterval(() => void refreshAll(), 30_000)
    const weatherId = window.setInterval(() => {
      void fetchTonightWeather().then(setWeather)
    }, 10 * 60_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshStatus()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(statusId)
      window.clearInterval(hubId)
      window.clearInterval(weatherId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshAll, refreshStatus])

  return (
    <div className={embedded ? 'control-console embedded' : 'control-console'}>
      <ConsoleHeader
        embedded={embedded}
        probe={probe}
        sessionOpen={embedded ? sessionOpen : undefined}
        onToggleSession={embedded ? () => setSessionOpen((prev) => !prev) : undefined}
        dashboardOpen={embedded ? dashboardOpen : undefined}
        onToggleDashboard={embedded ? toggleDashboard : undefined}
      />

      <div className="console-body">
        <RemoteGlassConsole
          probe={probe}
          weather={weather}
          sessions={sessions}
          loadingSessions={loadingSessions}
          sessionsError={sessionsError}
          prefill={prefill ?? null}
          onPrefillConsumed={onPrefillConsumed}
          editingSession={editingSession}
          onEditingSessionClear={() => setEditingSession(null)}
          sessionOpen={sessionOpen}
          onSessionOpenChange={(open) => {
            setSessionOpen(open)
            if (!open) setEditingSession(null)
          }}
          dashboardOpen={dashboardOpen}
          dashboardSession={dashboardSession}
          dashboardProgressSessionId={dashboardProgressSessionId}
          onDashboardOpenChange={(open) => {
            setDashboardOpen(open)
            if (!open) setDashboardProgressSessionId(null)
          }}
          onDashboardSessionChange={setDashboardSession}
          onDashboardProgressSessionIdChange={setDashboardProgressSessionId}
          onSubmitted={() => void loadSessions()}
          onRefreshSessions={() => void loadSessions()}
          onEditSession={(session) => {
            setEditingSession(session)
            setSessionOpen(true)
          }}
        />
      </div>
    </div>
  )
}
