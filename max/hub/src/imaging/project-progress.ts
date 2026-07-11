import type { SessionRow } from '../db.js'
import { listProjectNights } from './project-store.js'

export type FilterFrameProgress = {
  filterName: string
  total: number
  captured: number
}

export type ProjectNightPublic = {
  id: string
  nightIndex: number
  nightKey: string
  status: string
}

export function projectFilterFrameProgress(session: SessionRow): FilterFrameProgress[] {
  const plans = session.filterPlans ?? []
  const remaining = session.remainingByFilter ?? []
  const remainingByName = new Map(
    remaining.map((row) => [row.filterName, Math.max(0, Math.round(Number(row.countRemaining) || 0))])
  )
  return plans
    .map((plan) => {
      const total = Math.max(0, Math.round(Number(plan.count) || 0))
      if (total <= 0) return null
      const rem = remainingByName.get(plan.filterName) ?? total
      const captured = Math.max(0, Math.min(total, total - rem))
      return { filterName: plan.filterName, total, captured }
    })
    .filter((row): row is FilterFrameProgress => row != null)
}

export function projectNightsForPublic(sessionId: string): ProjectNightPublic[] {
  return listProjectNights(sessionId).map((n) => ({
    id: n.id,
    nightIndex: n.nightIndex,
    nightKey: n.nightKey,
    status: n.status === 'planned' ? 'scheduled' : n.status === 'on_hold' ? 'on_hold' : n.status,
  }))
}

export function enrichProjectSessionPublic(
  session: SessionRow,
  base: Record<string, unknown>
): Record<string, unknown> {
  if (!session.projectMode) return base
  return {
    ...base,
    projectFilterProgress: projectFilterFrameProgress(session),
    nights: projectNightsForPublic(session.id),
  }
}
