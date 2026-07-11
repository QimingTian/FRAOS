import { getImagingState } from '@/lib/cloud/personal-imaging/ctx'
import { getSessionById, patchSessionRow } from '@/lib/cloud/personal-imaging/db'
import { getProjectNightById } from '@/lib/cloud/personal-imaging/project-db'
import type { ProjectNightStatus, SessionStatus } from '@/lib/cloud/personal-imaging/types'
import { reconcilePendingScheduleStatus } from '@/lib/imaging/reconcile'

const QUEUE_HOLDABLE = new Set<SessionStatus>(['pending', 'scheduled'])
const NIGHT_HOLDABLE = new Set<ProjectNightStatus>(['planned', 'scheduled'])

export function releaseEmergencyStopHolds(heldSessionIds: string[]): void {
  for (const sessionId of heldSessionIds) {
    const night = getProjectNightById(sessionId)
    if (night) {
      if (night.status !== 'on_hold') continue
      const restored = night.onHoldFromStatus ?? 'planned'
      const state = getImagingState()
      const idx = state.projectNights.findIndex((n) => n.id === sessionId)
      if (idx < 0) continue
      state.projectNights[idx] = {
        ...state.projectNights[idx]!,
        status: restored,
        onHoldFromStatus: null,
      }
      continue
    }

    const row = getSessionById(sessionId)
    if (!row || row.status !== 'on_hold') continue
    const restored = row.onHoldFromStatus ?? 'pending'
    patchSessionRow(sessionId, { status: restored, onHoldFromStatus: null })
  }
  void reconcilePendingScheduleStatus()
}

export { QUEUE_HOLDABLE, NIGHT_HOLDABLE }
