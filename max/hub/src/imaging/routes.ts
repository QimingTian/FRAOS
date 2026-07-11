import type { Express, Request, Response, IRouter } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  deleteSessionById,
  getObservatoryState,
  getSessionById,
  listSessions,
  touchAgentPulse,
} from '../db.js'
import { appendAuditLog, listAuditLog } from '../personal-audit-log.js'
import {
  applyObservatoryPatchWithEstopClear,
  armEmergencyStop,
  estopSequenceJson,
  getEmergencyStopPublicState,
  getEmergencyStopState,
  isEmergencyStopBlocking,
  isEmergencyStopStopping,
  isEstopQueueId,
  markEmergencyStopCompleted,
  markEmergencyStopDelivered,
} from '../personal-estop.js'
import { handleNinaSequenceGet, handleSessionProgressPost } from './delivery.js'
import { createQueueSession, sessionToPublic } from './queue-service.js'
import { enrichProjectSessionPublic } from './project-progress.js'
import { reconcilePendingScheduleStatus } from './reconcile.js'
import { emitAgentWakePollSequence, livePreviewChannel, liveProgressChannel, subscribeLiveEvents } from './live-bus.js'
import { listSessionProgressLinesFromAudit } from './session-progress-audit.js'
import { subscribeProgress, type LiveProgressEvent } from './progress-live.js'
import { publishPreview } from './preview-live.js'
import { publishProgress } from './progress-live.js'
import { getPreviewImage, upsertPreviewImage } from './preview-store.js'
import {
  getMountPointingSample,
  liveMountChannel,
  parseMountPointingPayload,
  setMountPointingSample,
  subscribeMountEvents,
} from './mount-pointing.js'
import { imagingQueueSecret } from '../config.js'
import { getProjectNightById } from './project-store.js'
import { applySessionControlAction, type SessionControlAction } from './session-control.js'

function resolveTenantId(req: Request, tenantId?: string | ((req: Request) => string | undefined)): string | undefined {
  if (typeof tenantId === 'function') return tenantId(req)
  return tenantId
}

function bearerAuthorized(req: Request): boolean {
  const secret = imagingQueueSecret()
  if (!secret) return true
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return token === secret
}

function parseQueueBody(body: Record<string, unknown>) {
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
    sessionType: body.sessionType === 'variable_star' ? ('variable_star' as const) : ('dso' as const),
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

function resolveSessionQueueStatus(sessionId: string): string | null {
  const night = getProjectNightById(sessionId)
  if (night) return night.status
  const session = getSessionById(sessionId)
  return session?.status ?? null
}

function normalizeProgressEvent(
  event: LiveProgressEvent
): { type: 'line'; at: string; text: string } | { type: 'status'; queueStatus: string } | null {
  if (event.type === 'line') return event
  if (event.type === 'status') return event
  if (event.type === 'progress' && event.text.trim()) {
    return { type: 'line', at: new Date().toISOString(), text: event.text.trim() }
  }
  return null
}

function mountSse(res: Response & { flushHeaders?: () => void }): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
}

export function mountImagingRoutes(
  app: IRouter,
  options?: {
    tenantId?: string | ((req: Request) => string | undefined)
    requireAuth?: boolean
  }
): void {
  const requireAuth = options?.requireAuth !== false

  const auth = (req: Request, res: Response): boolean => {
    if (!requireAuth) return true
    if (!bearerAuthorized(req)) {
      res.status(401).json({ ok: false, error: 'Unauthorized' })
      return false
    }
    return true
  }

  app.get('/imaging/observatory-status', (_req, res) => {
    const { mode, status } = getObservatoryState()
    res.json({ ok: true, mode, status })
  })

  app.patch('/imaging/observatory-status', (req, res) => {
    const body = req.body as { mode?: string; status?: string }
    if (body.mode !== 'manual' && body.mode !== 'auto' && body.mode != null) {
      res.status(400).json({ ok: false, error: 'Invalid mode' })
      return
    }
    const next = applyObservatoryPatchWithEstopClear({
      mode: body.mode as 'manual' | 'auto' | undefined,
      status: body.status as Parameters<typeof applyObservatoryPatchWithEstopClear>[0]['status'],
    })
    res.json({ ok: true, mode: next.mode, status: next.status })
  })

  app.get('/imaging/current-sessions', async (_req, res) => {
    await reconcilePendingScheduleStatus()
    const sessions = listSessions().map((s) => enrichProjectSessionPublic(s, sessionToPublic(s)))
    res.json({ ok: true, sessions })
  })

  app.post('/imaging/queue', async (req, res) => {
    const body = parseQueueBody(req.body as Record<string, unknown>)
    if (!body.target) {
      res.status(400).json({ ok: false, error: 'target is required' })
      return
    }
    const session = await createQueueSession(body, uuidv4(), resolveTenantId(req, options?.tenantId))
    res.status(201).json({ ok: true, request: sessionToPublic(session) })
  })

  app.delete('/imaging/sessions/:sessionId', (req, res) => {
    const id = String(req.params.sessionId ?? '').trim()
    if (!id) {
      res.status(400).json({ ok: false, error: 'sessionId is required' })
      return
    }
    if (!deleteSessionById(id)) {
      res.status(404).json({ ok: false, error: 'Session not found' })
      return
    }
    appendAuditLog({ kind: 'session.deleted', message: `Session deleted: ${id}`, detail: { id } })
    emitAgentWakePollSequence()
    res.json({ ok: true })
  })

  app.post('/imaging/agent-pulse', (req, res) => {
    if (!auth(req, res)) return
    const ninaRunning = Boolean((req.body as { ninaRunning?: unknown })?.ninaRunning)
    touchAgentPulse(ninaRunning)
    res.json({ ok: true })
  })

  app.get('/imaging/reconcile-queue-schedule', async (req, res) => {
    if (!auth(req, res)) return
    await reconcilePendingScheduleStatus()
    res.json({ ok: true })
  })

  app.get('/imaging/nina-sequence', async (req, res) => {
    if (!auth(req, res)) return
    const result = await handleNinaSequenceGet(resolveTenantId(req, options?.tenantId))
    if (result.kind === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.status(result.status).send(result.body)
      return
    }
    if (result.kind === 'empty') {
      res.status(result.status).end()
      return
    }
    res.status(result.status).json({ error: result.error })
  })

  app.get('/imaging/agent-events', (req, res) => {
    if (!auth(req, res)) return
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === 'function') {
      ;(res as Response & { flushHeaders: () => void }).flushHeaders()
    }

    const controller = new AbortController()
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    send('connected', { ok: true, at: new Date().toISOString() })
    const unsubWake = subscribeLiveEvents('agent:wake', (payload) => send('agent:wake', payload), controller.signal)
    const unsubSessions = subscribeLiveEvents(
      'site:sessions',
      (payload) => send('site:sessions', payload),
      controller.signal
    )

    req.on('close', () => {
      controller.abort()
      unsubWake()
      unsubSessions()
    })
  })

  app.get('/imaging/emergency-stop', (_req, res) => {
    res.json({ ok: true, ...getEmergencyStopPublicState() })
  })

  app.post('/imaging/emergency-stop', (_req, res) => {
    const publicState = getEmergencyStopPublicState()
    if (!publicState.agentConnected) {
      res.status(409).json({ ok: false, error: 'NINA agent is disconnected. ESTOP is unavailable.' })
      return
    }
    try {
      armEmergencyStop('control-client')
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : 'Emergency STOP failed.'
      res.status(409).json({ ok: false, error: message })
      return
    }
    emitAgentWakePollSequence()
    res.json({ ok: true, ...getEmergencyStopPublicState() })
  })

  app.get('/imaging/emergency-stop/delivery', (req, res) => {
    if (!auth(req, res)) return
    const tenant = resolveTenantId(req, options?.tenantId) ?? 'local'
    if (isEmergencyStopStopping()) {
      const state = getEmergencyStopState()
      const queueId = state?.queueId
      if (queueId && !state?.deliveredAt && markEmergencyStopDelivered(queueId)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.send(estopSequenceJson(tenant, queueId))
        return
      }
    }
    if (isEmergencyStopBlocking()) {
      res.status(409).json({ error: 'Emergency STOP active; no imaging sequences are available.' })
      return
    }
    res.status(204).end()
  })

  app.post('/imaging/session-progress', (req, res) => {
    const body = req.body as Record<string, unknown>
    const detail =
      body && typeof body === 'object' && !Array.isArray(body)
        ? body
        : { text: typeof body === 'string' ? body : '' }
    const borean = detail.BoreanAstro
    let queueId: string | null = null
    if (borean && typeof borean === 'object' && !Array.isArray(borean)) {
      const raw = (borean as Record<string, unknown>).QueueId
      if (typeof raw === 'string' && raw.trim()) queueId = raw.trim()
    }
    if (!queueId && typeof detail.queueId === 'string') queueId = detail.queueId.trim()
    const text =
      typeof detail.text === 'string'
        ? detail.text
        : typeof detail.message === 'string'
          ? detail.message
          : ''
    if (queueId && isEstopQueueId(queueId) && text.toLowerCase().includes('dome closed')) {
      markEmergencyStopCompleted(queueId)
    }
    const result = handleSessionProgressPost(detail)
    res.json(result)
  })

  app.get('/imaging/audit-log', (req, res) => {
    const raw = req.query.limit
    const limit = typeof raw === 'string' ? Number(raw) : 200
    const safe = Number.isFinite(limit) ? Math.min(400, Math.max(1, Math.floor(limit))) : 200
    res.json({ ok: true, entries: listAuditLog(safe) })
  })

  app.get('/imaging/queue/:sessionId/progress', (req, res) => {
    const id = String(req.params.sessionId ?? '').trim()
    if (!id) {
      res.status(400).json({ ok: false, error: 'Missing id' })
      return
    }
    const queueStatus = resolveSessionQueueStatus(id)
    if (queueStatus == null) {
      res.status(404).json({ ok: false, error: 'Not found' })
      return
    }
    res.json({ ok: true, queueStatus, lines: listSessionProgressLinesFromAudit(id) })
  })

  app.get('/imaging/queue/:sessionId/progress-stream', (req, res) => {
    const id = String(req.params.sessionId ?? '').trim()
    if (!id) {
      res.status(400).json({ ok: false, error: 'Missing id' })
      return
    }
    const queueStatus = resolveSessionQueueStatus(id)
    if (queueStatus == null) {
      res.status(404).json({ ok: false, error: 'Not found' })
      return
    }

    mountSse(res)
    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    let status = queueStatus
    send({ type: 'snapshot', queueStatus: status, lines: listSessionProgressLinesFromAudit(id) })

    const onLiveEvent = (event: LiveProgressEvent) => {
      const normalized = normalizeProgressEvent(event)
      if (!normalized) return
      if (normalized.type === 'status') status = normalized.queueStatus
      send(normalized)
    }

    const controller = new AbortController()
    const unsubLocal = subscribeProgress(id, onLiveEvent)
    const unsubBus = subscribeLiveEvents(liveProgressChannel(id), (payload) => {
      if (!payload || typeof payload !== 'object') return
      onLiveEvent(payload as LiveProgressEvent)
    }, controller.signal)

    const keepAlive = setInterval(() => send({ type: 'ping' }), 15000)
    req.on('close', () => {
      clearInterval(keepAlive)
      controller.abort()
      unsubLocal()
      unsubBus()
      res.end()
    })
  })

  app.get('/imaging/queue/:sessionId/preview-stream', (req, res) => {
    const id = String(req.params.sessionId ?? '').trim()
    if (!id) {
      res.status(400).json({ ok: false, error: 'Missing id' })
      return
    }

    mountSse(res)
    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    const latest = getPreviewImage(id)
    send({ type: 'snapshot', updatedAt: latest?.updatedAt ?? null })

    const controller = new AbortController()
    const unsubBus = subscribeLiveEvents(livePreviewChannel(id), (payload) => {
      if (!payload || typeof payload !== 'object') return
      const p = payload as { type?: string }
      if (p.type === 'updated') send({ type: 'updated' })
    }, controller.signal)

    const keepAlive = setInterval(() => send({ type: 'ping' }), 15000)
    req.on('close', () => {
      clearInterval(keepAlive)
      controller.abort()
      unsubBus()
      res.end()
    })
  })

  app.get('/imaging/preview', (req, res) => {
    const queueId = typeof req.query.queueId === 'string' ? req.query.queueId.trim() : ''
    if (!queueId) {
      res.status(400).json({ ok: false, error: 'Missing queueId' })
      return
    }
    const latest = getPreviewImage(queueId)
    if (!latest) {
      res.status(404).json({ ok: false, error: 'Preview not found' })
      return
    }
    if (req.query.mode === 'json') {
      res.json({
        ok: true,
        updatedAt: latest.updatedAt,
        contentType: latest.contentType,
        dataBase64: latest.dataBase64,
      })
      return
    }
    const body = Buffer.from(latest.dataBase64, 'base64')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', latest.contentType || 'image/jpeg')
    res.send(body)
  })

  app.post('/imaging/preview', (req, res) => {
    const body = req.body as Record<string, unknown>
    const queueId = typeof body.queueId === 'string' ? body.queueId.trim() : ''
    const imageId = typeof body.imageId === 'string' ? body.imageId.trim() : ''
    const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64.trim() : ''
    const contentType =
      typeof body.contentType === 'string' && body.contentType.trim()
        ? body.contentType.trim()
        : 'image/jpeg'

    if (!queueId || !imageId || !dataBase64) {
      res.status(400).json({ ok: false, error: 'queueId, imageId and dataBase64 are required' })
      return
    }
    if (imageId !== queueId) {
      res.status(400).json({ ok: false, error: 'imageId must equal queueId' })
      return
    }
    if (dataBase64.length > 15_000_000) {
      res.status(413).json({ ok: false, error: 'Preview payload too large' })
      return
    }

    const frameNumber = upsertPreviewImage(queueId, imageId, contentType, dataBase64)
    const at = new Date().toISOString()
    const lineText = `Image ${frameNumber}`
    appendAuditLog({
      kind: 'session.progress',
      message: `Preview frame ${frameNumber} for ${queueId}.`,
      detail: { queueId, message: lineText },
    })
    publishProgress(queueId, { type: 'line', at, text: lineText })
    publishPreview(queueId, at)
    res.json({ ok: true, queueId })
  })

  app.post('/imaging/session-control', (req, res) => {
    const body = req.body as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action.trim() : ''
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!sessionId) {
      res.status(400).json({ ok: false, error: 'sessionId is required' })
      return
    }
    const allowed = new Set<SessionControlAction>([
      'run',
      'hold',
      'release_hold',
      'complete',
      'fail',
      'in_progress',
      'delete',
    ])
    if (!allowed.has(action as SessionControlAction)) {
      res.status(400).json({
        ok: false,
        error: 'action must be run, hold, release_hold, complete, fail, in_progress, or delete',
      })
      return
    }
    const result = applySessionControlAction(sessionId, action as SessionControlAction)
    if ('error' in result) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    res.json({ ok: true })
  })

  app.post('/imaging/mount-pointing', (req, res) => {
    if (!auth(req, res)) return
    const tenant = resolveTenantId(req, options?.tenantId) ?? 'local'
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ ok: false, error: 'Expected JSON object' })
      return
    }
    const payload = parseMountPointingPayload(body)
    if (!payload) {
      res.status(400).json({ ok: false, error: 'Missing boolean "connected"' })
      return
    }
    const stored = setMountPointingSample(tenant, payload.stationId, payload)
    res.json({ ok: true, receivedAtUtc: stored.receivedAtUtc })
  })

  app.get('/imaging/mount-pointing', (req, res) => {
    if (!auth(req, res)) return
    const tenant = resolveTenantId(req, options?.tenantId) ?? 'local'
    const stationId =
      typeof req.query.stationId === 'string' ? req.query.stationId : undefined
    const sample = getMountPointingSample(tenant, stationId)
    res.json({ ok: true, sample, serverNowUtc: new Date().toISOString() })
  })

  app.get('/imaging/mount-pointing/stream', (req, res) => {
    if (!auth(req, res)) return
    const tenant = resolveTenantId(req, options?.tenantId) ?? 'local'
    const stationId =
      typeof req.query.stationId === 'string' ? req.query.stationId : undefined
    const channel = liveMountChannel(tenant, stationId)

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === 'function') {
      ;(res as Response & { flushHeaders: () => void }).flushHeaders()
    }

    const controller = new AbortController()
    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    const sample = getMountPointingSample(tenant, stationId)
    send({
      type: 'snapshot',
      sample,
      serverNowUtc: new Date().toISOString(),
    })

    const unsub = subscribeMountEvents(
      channel,
      (payload) => {
        if (!payload || typeof payload !== 'object') return
        const p = payload as { type?: string; sample?: unknown }
        if (p.type === 'sample' && p.sample) {
          send({
            type: 'sample',
            sample: p.sample,
            serverNowUtc: new Date().toISOString(),
          })
        }
      },
      controller.signal
    )

    const keepAlive = setInterval(() => {
      send({ type: 'ping' })
    }, 15000)

    req.on('close', () => {
      clearInterval(keepAlive)
      controller.abort()
      unsub()
    })
  })
}
