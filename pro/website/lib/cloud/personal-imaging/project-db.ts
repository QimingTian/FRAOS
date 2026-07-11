import {
  getSessionById,
  patchSessionStatus,
  setSessionRemainingByFilter,
} from '@/lib/cloud/personal-imaging/db'
import { getImagingState } from '@/lib/cloud/personal-imaging/ctx'
import type {
  FilterPlan,
  FilterRemaining,
  ProjectNight,
  ProjectNightStatus,
  SessionRow,
} from '@/lib/cloud/personal-imaging/types'

export type { ProjectNight, ProjectNightStatus } from '@/lib/cloud/personal-imaging/types'

export function projectNightSubId(projectId: string, nightIndex: number): string {
  return `${projectId}__s${nightIndex}`
}

export function listProjectNights(projectId: string): ProjectNight[] {
  return getImagingState()
    .projectNights.filter((n) => n.projectId === projectId)
    .sort((a, b) => a.nightIndex - b.nightIndex)
}

export function getProjectNightById(id: string): ProjectNight | null {
  return getImagingState().projectNights.find((n) => n.id === id) ?? null
}

export function listAllOpenProjectNights(): ProjectNight[] {
  return getImagingState()
    .projectNights.filter((n) => n.status === 'scheduled' || n.status === 'in_progress')
    .sort((a, b) => a.nightIndex - b.nightIndex)
}

export function remainingFramesTotal(remaining: FilterRemaining[] | null): number {
  if (!remaining) return 0
  return remaining.reduce((sum, r) => sum + Math.max(0, r.countRemaining), 0)
}

export function clearProjectNights(projectId: string): void {
  const state = getImagingState()
  state.projectNights = state.projectNights.filter((n) => n.projectId !== projectId)
}

export function initProjectRemaining(project: SessionRow): FilterRemaining[] {
  if (project.remainingByFilter) return project.remainingByFilter
  const remaining: FilterRemaining[] = project.filterPlans.map((p) => ({
    filterName: p.filterName,
    exposureSeconds: p.exposureSeconds,
    countRemaining: p.count,
  }))
  setSessionRemainingByFilter(project.id, remaining)
  return remaining
}

export function upsertProjectNight(input: {
  id: string
  projectId: string
  nightKey: string
  nightIndex: number
  status: ProjectNightStatus
  filterPlansTonight: FilterPlan[]
  plannedStartIso: string | null
  ninaSequenceJson: string | null
  adminForceRunUntilIso?: string | null
}): void {
  const state = getImagingState()
  const existingIdx = state.projectNights.findIndex((n) => n.id === input.id)
  const existing = existingIdx >= 0 ? state.projectNights[existingIdx]! : null
  const night: ProjectNight = {
    id: input.id,
    projectId: input.projectId,
    nightKey: input.nightKey,
    nightIndex: input.nightIndex,
    status: input.status,
    filterPlansTonight: input.filterPlansTonight,
    plannedStartIso: input.plannedStartIso,
    adminForceRunUntilIso:
      input.adminForceRunUntilIso !== undefined
        ? input.adminForceRunUntilIso
        : (existing?.adminForceRunUntilIso ?? null),
    ninaSequenceJson: input.ninaSequenceJson,
    ninaDeliveredAt: existing?.ninaDeliveredAt ?? null,
    completedAt: existing?.completedAt ?? null,
    failedAt: existing?.failedAt ?? null,
  }
  if (existingIdx >= 0) {
    state.projectNights[existingIdx] = night
  } else {
    state.projectNights.push(night)
  }
}

export function patchProjectNightAdminForceRun(
  nightId: string,
  input: {
    nightKey: string
    plannedStartIso: string
    adminForceRunUntilIso: string
    ninaSequenceJson: string | null
  }
): ProjectNight | null {
  const night = getProjectNightById(nightId)
  if (!night) return null
  upsertProjectNight({
    id: night.id,
    projectId: night.projectId,
    nightKey: input.nightKey,
    nightIndex: night.nightIndex,
    status: 'scheduled',
    filterPlansTonight: night.filterPlansTonight,
    plannedStartIso: input.plannedStartIso,
    ninaSequenceJson: input.ninaSequenceJson ?? night.ninaSequenceJson,
    adminForceRunUntilIso: input.adminForceRunUntilIso,
  })
  return getProjectNightById(nightId)
}

export function replaceScheduledNights(
  projectId: string,
  nightKey: string,
  subs: Array<{
    id: string
    nightIndex: number
    filterPlansTonight: FilterPlan[]
    plannedStartIso: string | null
    ninaSequenceJson: string | null
  }>
): void {
  const state = getImagingState()
  const nowMs = Date.now()
  const forceRunIds = new Set(
    state.projectNights
      .filter(
        (n) =>
          n.projectId === projectId &&
          n.nightKey === nightKey &&
          n.status === 'scheduled' &&
          n.adminForceRunUntilIso != null &&
          Number.isFinite(Date.parse(n.adminForceRunUntilIso)) &&
          Date.parse(n.adminForceRunUntilIso) > nowMs
      )
      .map((n) => n.id)
  )
  state.projectNights = state.projectNights.filter(
    (n) =>
      !(
        n.projectId === projectId &&
        n.nightKey === nightKey &&
        n.status === 'scheduled' &&
        !forceRunIds.has(n.id)
      )
  )
  for (const sub of subs) {
    if (forceRunIds.has(sub.id)) continue
    upsertProjectNight({
      id: sub.id,
      projectId,
      nightKey,
      nightIndex: sub.nightIndex,
      status: 'scheduled',
      filterPlansTonight: sub.filterPlansTonight,
      plannedStartIso: sub.plannedStartIso,
      ninaSequenceJson: sub.ninaSequenceJson,
    })
  }
}

export function markNightInProgress(nightId: string): void {
  const now = new Date().toISOString()
  const night = getProjectNightById(nightId)
  if (!night) return
  const state = getImagingState()
  const idx = state.projectNights.findIndex((n) => n.id === nightId)
  if (idx < 0) return
  state.projectNights[idx] = {
    ...night,
    status: 'in_progress',
    ninaDeliveredAt: night.ninaDeliveredAt ?? now,
  }
  patchSessionStatus(night.projectId, 'in_progress')
}

export function markNightCompleted(nightId: string): { projectCompleted: boolean } | null {
  const night = getProjectNightById(nightId)
  if (!night) return null
  const project = getSessionById(night.projectId)
  if (!project) return null
  const now = new Date().toISOString()

  const remaining = initProjectRemaining(project).map((r) => {
    const shot = night.filterPlansTonight.find((p) => p.filterName === r.filterName)
    if (!shot) return r
    return { ...r, countRemaining: Math.max(0, r.countRemaining - shot.count) }
  })
  setSessionRemainingByFilter(project.id, remaining)

  const state = getImagingState()
  const idx = state.projectNights.findIndex((n) => n.id === nightId)
  if (idx >= 0) {
    state.projectNights[idx] = {
      ...state.projectNights[idx]!,
      status: 'completed',
      completedAt: now,
    }
  }

  const projectCompleted = remainingFramesTotal(remaining) === 0
  patchSessionStatus(project.id, projectCompleted ? 'completed' : 'in_progress')
  return { projectCompleted }
}

export function markNightFailed(nightId: string): void {
  const now = new Date().toISOString()
  const state = getImagingState()
  const idx = state.projectNights.findIndex((n) => n.id === nightId)
  if (idx < 0) return
  state.projectNights[idx] = {
    ...state.projectNights[idx]!,
    status: 'failed',
    failedAt: now,
  }
}
