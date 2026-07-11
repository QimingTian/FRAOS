export type SessionOutputMode = 'none' | 'raw_zip'

export type SessionStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'on_hold'
  | 'rejected'

export type SessionType = 'dso' | 'variable_star'

export type FilterPlan = { filterName: string; exposureSeconds: number; count: number }

export type FilterRemaining = {
  filterName: string
  exposureSeconds: number
  countRemaining: number
}

export type SessionRow = {
  id: string
  target: string
  requestName: string | null
  status: SessionStatus
  /** Previous queue status when held for Emergency STOP. */
  onHoldFromStatus?: 'pending' | 'scheduled' | null
  sessionType: SessionType
  sequenceTemplate: SessionType
  outputMode: SessionOutputMode
  outputModeRequested: string | null
  whenClosedBehavior: string | null
  projectMode: boolean
  cameraCoolingTempC: number | null
  createdAt: string
  updatedAt: string
  plannedStartIso: string | null
  scheduleReasons: string[]
  raHours: number | null
  decDeg: number | null
  filter: string | null
  exposureSeconds: number | null
  count: number | null
  filterPlans: FilterPlan[]
  estimatedDurationSeconds: number | null
  variableStarBlockHours: number | null
  catalogQuery: string | null
  ninaSequenceJson: string | null
  remainingByFilter: FilterRemaining[] | null
  createdByMemberId?: string | null
  createdByMemberName?: string | null
}

export type ObservatoryMode = 'manual' | 'auto'

export type ObservatoryStatus =
  | 'ready'
  | 'busy_in_use'
  | 'disconnected'
  | 'closed_weather_not_permitted'
  | 'closed_daytime'
  | 'closed_observatory_maintenance'

export type ProjectNightStatus =
  | 'planned'
  | 'scheduled'
  | 'on_hold'
  | 'in_progress'
  | 'completed'
  | 'failed'

export type ProjectNight = {
  id: string
  projectId: string
  nightKey: string
  nightIndex: number
  status: ProjectNightStatus
  /** Previous night status when held for Emergency STOP. */
  onHoldFromStatus?: 'planned' | 'scheduled' | null
  filterPlansTonight: FilterPlan[]
  plannedStartIso: string | null
  ninaSequenceJson: string | null
  ninaDeliveredAt: string | null
  completedAt: string | null
  failedAt: string | null
}
