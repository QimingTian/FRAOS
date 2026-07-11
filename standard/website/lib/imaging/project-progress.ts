import type { SessionRow } from '@/lib/cloud/personal-imaging/types'
import { listProjectNights } from '@/lib/imaging/project-store'

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
  hasDownload?: boolean
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

export function projectNightsForPublic(
  sessionId: string,
  hasDownloadById: Map<string, boolean>
): ProjectNightPublic[] {
  return listProjectNights(sessionId)
    .filter(
      (n) =>
        n.status === 'scheduled' ||
        n.status === 'in_progress' ||
        n.status === 'completed' ||
        n.status === 'failed' ||
        n.status === 'on_hold' ||
        n.status === 'planned'
    )
    .map((n) => ({
      id: n.id,
      nightIndex: n.nightIndex,
      nightKey: n.nightKey,
      status: n.status === 'planned' ? 'scheduled' : n.status === 'on_hold' ? 'on_hold' : n.status,
      hasDownload: hasDownloadById.get(n.id) || undefined,
    }))
}

export function enrichProjectSessionPublic(
  session: SessionRow,
  base: Record<string, unknown>,
  storageByQueueId: Map<string, { sizeBytes: number }>
): Record<string, unknown> {
  if (!session.projectMode) return base
  const hasDownloadById = new Map<string, boolean>()
  for (const night of listProjectNights(session.id)) {
    const rec = storageByQueueId.get(night.id)
    hasDownloadById.set(night.id, Boolean(rec && rec.sizeBytes > 0))
  }
  return {
    ...base,
    projectFilterProgress: projectFilterFrameProgress(session),
    nights: projectNightsForPublic(session.id, hasDownloadById),
  }
}
