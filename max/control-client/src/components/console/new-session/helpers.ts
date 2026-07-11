import type { WeatherPrediction } from '../../../lib/weather-client'
import {
  MIN_ALTITUDE_DEG,
  altitudeAllowedCoverageMs,
} from '../../../lib/site/target-altitude'
import type { VariableStarChartStar } from './variable-star-preview-charts'
import type { VariableStarRow } from './types'
import { DSO_SESSION_OVERHEAD_SEC } from '../../../lib/imaging/session-overhead'

export function rowToVariableChartStar(row: VariableStarRow): VariableStarChartStar {
  return {
    name: row.name,
    raHours: row.raHours,
    decDeg: row.decDeg,
    periodDays: row.periodDays,
    minMag: row.minMag,
    maxMag: row.maxMag,
  }
}

export function pickVariableStarRow(
  catalog: VariableStarRow[],
  query: string
): { ok: true; row: VariableStarRow } | { ok: false; error: string } {
  const q = query.trim().toLowerCase()
  if (!q) return { ok: false, error: 'Enter a variable star name.' }
  const exact = catalog.filter((s) => s.name.toLowerCase() === q)
  if (exact.length === 1) return { ok: true, row: exact[0]! }
  if (exact.length > 1) {
    return {
      ok: false,
      error: `Multiple catalog entries match "${query}" exactly. Use a more specific designation.`,
    }
  }
  const partial = catalog.filter((s) => s.name.toLowerCase().includes(q))
  if (partial.length === 1) return { ok: true, row: partial[0]! }
  if (partial.length === 0) {
    return { ok: false, error: `No variable star in the catalog matches "${query}".` }
  }
  if (partial.length > 20) {
    return {
      ok: false,
      error: `Too many matches (${partial.length}). Type a longer or more specific name.`,
    }
  }
  return {
    ok: false,
    error: `Multiple matches (${partial.length}). Examples: ${partial
      .slice(0, 8)
      .map((s) => s.name)
      .join(', ')}`,
  }
}

export function estimateDurationSecondsFromPlans(
  plans: Array<{ filterName: string; exposureSeconds: number; count: number }> | undefined
): number {
  if (!Array.isArray(plans) || plans.length === 0) return DSO_SESSION_OVERHEAD_SEC
  const imagingSeconds = plans.reduce((sum, p) => sum + p.count * p.exposureSeconds, 0)
  return Math.max(imagingSeconds + DSO_SESSION_OVERHEAD_SEC, DSO_SESSION_OVERHEAD_SEC)
}

export function variableStarNightHalfHourLadder(
  nauticalDuskUtc: Date,
  nauticalDawnUtc: Date
): {
  allOptions: number[]
  nightHours: number
  nightHalfSteps: number
} {
  const startMs = nauticalDuskUtc.getTime()
  const endMs = nauticalDawnUtc.getTime()
  const nightHours = (endMs - startMs) / 3600000
  const nightHalfSteps = Math.max(1, Math.floor(nightHours * 2 + 1e-6))
  const allOptions: number[] = []
  for (let k = 1; k <= nightHalfSteps; k++) allOptions.push(k * 0.5)
  return { allOptions, nightHours, nightHalfSteps }
}

export function variableStarDurationButtonModel(
  raHours: number,
  decDeg: number,
  nauticalDuskUtc: Date,
  nauticalDawnUtc: Date
) {
  const startMs = nauticalDuskUtc.getTime()
  const endMs = nauticalDawnUtc.getTime()
  const { allOptions, nightHours, nightHalfSteps } = variableStarNightHalfHourLadder(
    nauticalDuskUtc,
    nauticalDawnUtc
  )
  const above30Ms = altitudeAllowedCoverageMs(raHours, decDeg, startMs, endMs)
  const above30Hours = above30Ms / 3600000
  const maxEnabledBlockHours = Math.min(nightHours, above30Hours)
  const starHalfSteps = Math.max(0, Math.floor(maxEnabledBlockHours * 2 + 1e-6))
  return { above30Ms, nightHours, above30Hours, nightHalfSteps, starHalfSteps, allOptions }
}

export function observatoryStatusLabel(status: string | undefined | null): string {
  if (!status) return '...'
  if (status === 'ready') return 'Ready'
  if (status === 'busy_in_use') return 'Busy -- In Use'
  if (status === 'disconnected') return 'Disconnected'
  if (status === 'closed_weather_not_permitted') return 'Closed -- Weather Not Permitted'
  if (status === 'closed_daytime') return 'Closed -- Daytime'
  return 'Closed -- Observatory Maintenance'
}

export function weatherPredictionLabel(prediction: WeatherPrediction | 'loading'): string {
  if (prediction === 'permitted') return 'Permitted'
  if (prediction === 'unavailable') return 'nighttime now, prediction not available'
  if (prediction === 'loading') return 'Loading...'
  return 'Not permitted'
}

export { MIN_ALTITUDE_DEG }
