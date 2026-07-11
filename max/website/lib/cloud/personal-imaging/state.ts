import type {
  ObservatoryMode,
  ObservatoryStatus,
  ProjectNight,
  SessionRow,
} from '@/lib/cloud/personal-imaging/types'

export type EndNightFlags = { afterSessionsSent: boolean; dawnSent: boolean }

export type TenantImagingState = {
  sessions: SessionRow[]
  projectNights: ProjectNight[]
  observatory: {
    mode: ObservatoryMode
    status: ObservatoryStatus
    agentLastSeenMs: number
    ninaRunning: boolean
  }
  observatorySite: { lat: number; lon: number; elevationM: number }
  endNight: Record<string, EndNightFlags>
}

export function defaultTenantImagingState(): TenantImagingState {
  return {
    sessions: [],
    projectNights: [],
    observatory: {
      mode: 'auto',
      status: 'disconnected',
      agentLastSeenMs: 0,
      ninaRunning: false,
    },
    observatorySite: { lat: 0, lon: 0, elevationM: 0 },
    endNight: {},
  }
}
