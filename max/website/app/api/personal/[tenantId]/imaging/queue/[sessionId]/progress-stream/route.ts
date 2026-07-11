import { imagingGetSessionProgress } from '@/lib/cloud/personal-imaging/handlers'
import { personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'
import { liveProgressChannel, subscribeLiveEvents } from '@/lib/imaging/live-bus'
import { subscribeProgress, type LiveProgressEvent } from '@/lib/imaging/progress-live'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function normalizeLiveEvent(event: LiveProgressEvent): { type: 'line'; at: string; text: string } | { type: 'status'; queueStatus: string } | null {
  if (event.type === 'line') return event
  if (event.type === 'status') return event
  if (event.type === 'progress' && event.text.trim()) {
    return { type: 'line', at: new Date().toISOString(), text: event.text.trim() }
  }
  return null
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; sessionId: string }> }
) {
  const { tenantId, sessionId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  const id = sessionId.trim()
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing id' }), { status: 400 })
  }

  const snapshot = await imagingGetSessionProgress(tenantId, id)
  if ('error' in snapshot) {
    return new Response(JSON.stringify({ ok: false, error: snapshot.error }), {
      status: snapshot.status,
    })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const enqueue = (payload: unknown) => controller.enqueue(encoder.encode(sseData(payload)))

      let queueStatus = snapshot.queueStatus
      enqueue({ type: 'snapshot', queueStatus, lines: snapshot.lines })

      const onLiveEvent = (event: LiveProgressEvent) => {
        const normalized = normalizeLiveEvent(event)
        if (!normalized) return
        if (normalized.type === 'status') {
          queueStatus = normalized.queueStatus
          enqueue(normalized)
          return
        }
        enqueue(normalized)
      }

      const handleBusPayload = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return
        onLiveEvent(payload as LiveProgressEvent)
      }

      const unsubscribeLocal = subscribeProgress(id, onLiveEvent)
      const unsubscribeBus = subscribeLiveEvents(liveProgressChannel(id), handleBusPayload, request.signal)

      const keepAlive = setInterval(() => {
        enqueue({ type: 'ping' })
      }, 15000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        unsubscribeLocal()
        unsubscribeBus()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
