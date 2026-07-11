export type VariableStarRow = {
  name: string
  raHours: number
  decDeg: number
  varType: string | null
  periodDays: number | null
  minMag: number | null
  maxMag: number | null
  highPriority: boolean
}

export type ResolvedCatalogObject = {
  query: string
  canonicalName: string
  aliases: string[]
  raHours: number
  decDeg: number
  ra: { hour: number; minute: number; second: number }
  dec: { sign: '+' | '-'; degree: number; minute: number; second: number }
}

export type ImagingSessionTypeUi = 'dso' | 'variable_star'

export type VariableStarFilterUi =
  | 'tonight_observable'
  | 'high_priority'
  | 'short_period'
  | 'mid_period'
  | 'long_period'
  | 'type_na'
  | 'type_lc'
  | 'type_m'
  | 'type_src'
  | 'type_ea'

export type SessionPrefill = {
  target: string
  raHours?: number
  decDeg?: number
}
