import type { ObservatoryMode, ObservatoryStatus } from './types'

export const OBSERVATORY_STATUS_OPTIONS: { value: ObservatoryStatus; label: string }[] = [
  { value: 'ready', label: 'Ready' },
  { value: 'busy_in_use', label: 'Busy — In Use' },
  { value: 'disconnected', label: 'Disconnected' },
  { value: 'closed_weather_not_permitted', label: 'Closed — Weather Not Permitted' },
  { value: 'closed_daytime', label: 'Closed — Daytime' },
  { value: 'closed_observatory_maintenance', label: 'Closed — Observatory Maintenance' },
]

export function observatoryStatusOptionLabel(status: ObservatoryStatus): string {
  return OBSERVATORY_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

export type { ObservatoryMode, ObservatoryStatus }
