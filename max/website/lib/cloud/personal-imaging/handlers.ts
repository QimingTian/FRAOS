import { randomUUID } from 'node:crypto'
import { runWithTenantImaging } from '@/lib/cloud/personal-imaging/ctx'
import {
  appendAuditLog,
  deleteSessionById,
  getObservatoryState,
  listSessions,
  sessionToPublicJson,
  touchAgentPulse,
} from '@/lib/cloud/personal-imaging/db'
import { applyObservatoryPatchWithEstopClear, getEmergencyStopPublicState, armEmergencyStop } from '@/lib/cloud/personal-imaging/estop-sync'
import { handleNinaSequenceGet, handleSessionProgressPost } from '@/lib/imaging/delivery'
import { enrichProjectSessionPublic } from '@/lib/imaging/project-progress'
import { createQueueSession, sessionToPublic, updatePendingSession, type QueueCreateInput } from '@/lib/imaging/queue-service'
import { reconcilePendingScheduleStatus } from '@/lib/imaging/reconcile'
import { emitAgentWakePollSequence } from '@/lib/imaging/live-bus'
import { getStorageQuotaStatus } from '@/lib/cloud/session-storage'
import { getProjectNightById } from '@/lib/cloud/personal-imaging/project-db'
import { getSessionById } from '@/lib/cloud/personal-imaging/db'
import { getPreviewImage, upsertPreviewImage } from '@/lib/imaging/preview-store'
import { publishPreview } from '@/lib/imaging/preview-live'
import { publishProgress } from '@/lib/imaging/progress-live'
import { listSessionProgressLinesFromAudit } from '@/lib/imaging/session-progress-audit'
import { getMemberById } from '@/lib/member/member-store'
import {
  authorizeProSessionMutation,
  proControlMemberRequired,
  proPrivilegedRequired,
  resolveProTenantContext,
  type ProTenantContext,
} from '@/lib/cloud/personal-imaging/pro-session-access'
import { applySessionControlAction, type SessionControlAction } from '@/lib/imaging/session-control'

export type { QueueCreateInput }

async function assertRawZipAllowed(
  tenantId: string,
  outputMode?: string
): Promise<{ error: string; status: number } | null> {
  if (outputMode !== 'raw_zip') return null
  const quota = await getStorageQuotaStatus(tenantId)
  if (!quota.overQuota) return null
  const limitGb = Math.round(quota.limitBytes / (1024 ** 3))
  return {
    error: `Cloud storage is full (${limitGb} GB site limit). Delete files in Settings or choose None for output.`,
    status: 409,
  }
}

export function parseQueueBody(body: Record<string, unknown>): QueueCreateInput {
  const target = typeof body.target === 'string' ? body.target.trim() : ''
  const filterPlansRaw = body.filterPlans
  const filterPlans = Array.isArray(filterPlansRaw)
    ? filterPlansRaw
        .map((p) => {
          if (!p || typeof p !== 'object') return null
          const rec = p as Record<string, unknown>
          return {
            filterName: String(rec.filterName ?? ''),
            exposureSeconds: Number(rec.exposureSeconds),
            count: Number(rec.count),
          }
        })
        .filter(
          (p): p is { filterName: string; exposureSeconds: number; count: number } =>
            p != null && Boolean(p.filterName) && Number.isFinite(p.exposureSeconds) && Number.isFinite(p.count)
        )
    : []

  return {
    target,
    requestName: typeof body.requestName === 'string' ? body.requestName : target,
    sessionType: body.sessionType === 'variable_star' ? 'variable_star' : 'dso',
    whenClosedBehavior: typeof body.whenClosedBehavior === 'string' ? body.whenClosedBehavior : undefined,
    outputMode: typeof body.outputMode === 'string' ? body.outputMode : 'none',
    outputModeRequested:
      typeof body.outputModeRequested === 'string' ? body.outputModeRequested : undefined,
    cameraCoolingTempC: typeof body.cameraCoolingTempC === 'number' ? body.cameraCoolingTempC : undefined,
    projectMode: body.projectMode === true,
    raHours: typeof body.raHours === 'number' ? body.raHours : null,
    decDeg: typeof body.decDeg === 'number' ? body.decDeg : null,
    filter: typeof body.filter === 'string' ? body.filter : null,
    exposureSeconds: typeof body.exposureSeconds === 'number' ? body.exposureSeconds : null,
    count: typeof body.count === 'number' ? body.count : null,
    filterPlans,
    estimatedDurationSeconds:
      typeof body.estimatedDurationSeconds === 'number' ? body.estimatedDurationSeconds : null,
    variableStarBlockHours:
      typeof body.variableStarBlockHours === 'number' ? body.variableStarBlockHours : null,
    catalogQuery: typeof body.catalogQuery === 'string' ? body.catalogQuery : null,
    observatoryLat: typeof body.observatoryLat === 'number' ? body.observatoryLat : null,
    observatoryLon: typeof body.observatoryLon === 'number' ? body.observatoryLon : null,
    observatoryElevationM: typeof body.observatoryElevationM === 'number' ? body.observatoryElevationM : null,
  }
}

export async function imagingListSessions(tenantId: string) {
  const storage = await getStorageQuotaStatus(tenantId)
  const byQueueId = new Map(storage.sessions.map((s) => [s.queueId, s]))
  return runWithTenantImaging(
    tenantId,
    async () => {
      await reconcilePendingScheduleStatus()
      return listSessions().map((s) => {
        const rec = byQueueId.get(s.id)
        const base = {
          ...sessionToPublicJson(s),
          hasDownload: Boolean(rec && rec.sizeBytes > 0),
          storageBytes: rec?.sizeBytes ?? 0,
        }
        const storageByQueueId = new Map(
          storage.sessions.map((row) => [row.queueId, { sizeBytes: row.sizeBytes }])
        )
        return enrichProjectSessionPublic(s, base, storageByQueueId)
      })
    },
    { persist: false }
  )
}

export async function imagingGetStorage(tenantId: string) {
  return getStorageQuotaStatus(tenantId)
}

export async function imagingCreateSession(
  tenantId: string,
  body: QueueCreateInput,
  proContext?: ProTenantContext
) {
  const denied = proControlMemberRequired(proContext ?? { isPro: false, member: null })
  if (denied) return denied
  const blocked = await assertRawZipAllowed(tenantId, body.outputMode)
  if (blocked) return blocked

  let createInput = body
  if (proContext?.isPro && proContext.member) {
    const user = await getMemberById(proContext.member.memberId)
    const memberName =
      user && `${user.firstName} ${user.lastName}`.trim()
        ? `${user.firstName} ${user.lastName}`.trim()
        : user?.username ?? user?.email ?? proContext.member.memberId
    createInput = {
      ...body,
      createdByMemberId: proContext.member.memberId,
      createdByMemberName: memberName,
    }
  }

  return runWithTenantImaging(tenantId, async () => {
    const session = await createQueueSession(createInput, randomUUID(), tenantId)
    return sessionToPublic(session)
  })
}

export async function imagingUpdateSession(
  tenantId: string,
  sessionId: string,
  body: QueueCreateInput,
  proContext?: ProTenantContext
) {
  const blocked = await assertRawZipAllowed(tenantId, body.outputMode)
  if (blocked) return blocked
  return runWithTenantImaging(tenantId, async () => {
    const denied = authorizeProSessionMutation({
      context: proContext ?? { isPro: false, member: null },
      session: getSessionById(sessionId),
      action: 'edit',
    })
    if (denied) return denied
    const result = await updatePendingSession(sessionId, body, tenantId)
    if ('error' in result) return result
    return sessionToPublic(result)
  })
}

export async function imagingDeleteSession(
  tenantId: string,
  sessionId: string,
  proContext?: ProTenantContext
) {
  return runWithTenantImaging(tenantId, () => {
    const denied = authorizeProSessionMutation({
      context: proContext ?? { isPro: false, member: null },
      session: getSessionById(sessionId),
      action: 'delete',
    })
    if (denied) return denied
    const ok = deleteSessionById(sessionId)
    if (ok) {
      appendAuditLog({
        kind: 'session.deleted',
        message: `Session deleted: ${sessionId}`,
        detail: { id: sessionId },
      })
      emitAgentWakePollSequence(tenantId)
    }
    return ok
  })
}

export async function imagingReconcile(tenantId: string) {
  return runWithTenantImaging(tenantId, () => reconcilePendingScheduleStatus())
}

export async function imagingNinaSequence(tenantId: string) {
  return runWithTenantImaging(tenantId, () => handleNinaSequenceGet(tenantId))
}

export async function imagingSessionProgress(tenantId: string, detail: Record<string, unknown>) {
  return runWithTenantImaging(tenantId, () => handleSessionProgressPost(detail))
}

export async function imagingAgentPulse(tenantId: string, ninaRunning: boolean) {
  return runWithTenantImaging(tenantId, () => {
    touchAgentPulse(ninaRunning)
    return getObservatoryState()
  })
}

export async function imagingGetObservatory(tenantId: string) {
  return runWithTenantImaging(tenantId, () => getObservatoryState(), { persist: false })
}

export async function imagingPatchObservatory(
  tenantId: string,
  patch: { mode?: 'manual' | 'auto'; status?: string },
  proContext?: ProTenantContext
) {
  const denied = proPrivilegedRequired(proContext ?? { isPro: false, member: null })
  if (denied) return denied
  return runWithTenantImaging(tenantId, () =>
    applyObservatoryPatchWithEstopClear({
      mode: patch.mode,
      status: patch.status as Parameters<typeof applyObservatoryPatchWithEstopClear>[0]['status'],
    })
  )
}

export async function imagingEmergencyStopPublic(tenantId: string) {
  return runWithTenantImaging(tenantId, () => getEmergencyStopPublicState(), { persist: false })
}

export async function imagingArmEmergencyStop(
  tenantId: string,
  requestedBy?: string,
  proContext?: ProTenantContext
) {
  const denied = proPrivilegedRequired(proContext ?? { isPro: false, member: null })
  if (denied) return denied
  return runWithTenantImaging(tenantId, () => {
    armEmergencyStop(requestedBy)
    emitAgentWakePollSequence(tenantId)
    return getEmergencyStopPublicState()
  })
}

export async function imagingSessionControl(
  tenantId: string,
  sessionId: string,
  action: SessionControlAction,
  proContext?: ProTenantContext
) {
  return runWithTenantImaging(tenantId, async () => {
    const denied = authorizeProSessionMutation({
      context: proContext ?? { isPro: false, member: null },
      session: getSessionById(sessionId),
      action: 'control',
    })
    if (denied) return denied
    return applySessionControlAction(tenantId, sessionId, action)
  })
}

function resolveSessionQueueStatus(sessionId: string): string | null {
  const night = getProjectNightById(sessionId)
  if (night) return night.status
  const session = getSessionById(sessionId)
  return session?.status ?? null
}

export async function imagingGetSessionProgress(tenantId: string, sessionId: string) {
  const id = sessionId.trim()
  if (!id) return { error: 'Missing session id', status: 400 as const }
  return runWithTenantImaging(
    tenantId,
    async () => {
      const queueStatus = resolveSessionQueueStatus(id)
      if (queueStatus == null) return { error: 'Not found', status: 404 as const }
      const lines = await listSessionProgressLinesFromAudit(tenantId, id)
      return { ok: true as const, queueStatus, lines }
    },
    { persist: false }
  )
}

export async function imagingGetPreview(tenantId: string, queueId: string) {
  const id = queueId.trim()
  if (!id) return { error: 'Missing queueId', status: 400 as const }
  const latest = await getPreviewImage(tenantId, id)
  if (!latest) return { error: 'Preview not found', status: 404 as const }
  return {
    ok: true as const,
    updatedAt: latest.updatedAt,
    contentType: latest.contentType,
    dataBase64: latest.dataBase64,
  }
}

export async function imagingPostPreview(
  tenantId: string,
  body: Record<string, unknown>
): Promise<{ ok: true; queueId: string } | { error: string; status: number }> {
  const queueId = typeof body.queueId === 'string' ? body.queueId.trim() : ''
  const imageId = typeof body.imageId === 'string' ? body.imageId.trim() : ''
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64.trim() : ''
  const contentType =
    typeof body.contentType === 'string' && body.contentType.trim()
      ? body.contentType.trim()
      : 'image/jpeg'

  if (!queueId || !imageId || !dataBase64) {
    return { error: 'queueId, imageId and dataBase64 are required', status: 400 }
  }
  if (imageId !== queueId) {
    return { error: 'imageId must equal queueId', status: 400 }
  }
  if (dataBase64.length > 15_000_000) {
    return { error: 'Preview payload too large', status: 413 }
  }

  return runWithTenantImaging(tenantId, async () => {
    const frameNumber = await upsertPreviewImage(tenantId, queueId, imageId, contentType, dataBase64)
    const at = new Date().toISOString()
    const lineText = `Image ${frameNumber}`
    appendAuditLog({
      kind: 'session.progress',
      message: `Preview frame ${frameNumber} for ${queueId}.`,
      detail: { queueId, message: lineText },
    })
    publishProgress(queueId, { type: 'line', at, text: lineText })
    publishPreview(queueId, at)
    return { ok: true as const, queueId }
  })
}
