export type ObservatoryStatus =
  | 'ready'
  | 'busy_in_use'
  | 'disconnected'
  | 'closed_weather_not_permitted'
  | 'closed_daytime'
  | 'closed_observatory_maintenance'

export type ObservatoryMode = 'manual' | 'auto'

export type ObservatoryStatusResponse = {
  ok: boolean
  mode?: ObservatoryMode
  status?: ObservatoryStatus
  error?: string
}

export type SessionRow = {
  id: string
  target: string
  status: string
  outputMode?: string
  plannedStartIso?: string | null
  createdAt?: string
  filter?: string | null
  exposureSeconds?: number | null
  count?: number | null
  raHours?: number | null
  decDeg?: number | null
  estimatedDurationSeconds?: number | null
  filterPlans?: Array<{ filterName: string; exposureSeconds: number; count: number }> | null
  nightKey?: string | null
  failedAt?: string | null
  scheduleStripNightKey?: string | null
  scheduleBarStartMs?: number | null
  scheduleBarEndMs?: number | null
  sessionType?: 'dso' | 'variable_star' | string
  projectMode?: boolean
  cameraCoolingTempC?: number | null
  hasDownload?: boolean
  storageBytes?: number
  projectFilterProgress?: Array<{ filterName: string; total: number; captured: number }>
  nights?: Array<{
    id: string
    nightIndex: number
    nightKey: string
    status: string
    hasDownload?: boolean
  }>
}

export type CurrentSessionsResponse = {
  ok: boolean
  sessions?: SessionRow[]
  error?: string
}

export type HubProbeResult = {
  hubReachable: boolean
  observatory?: ObservatoryStatusResponse
  error?: string
}
