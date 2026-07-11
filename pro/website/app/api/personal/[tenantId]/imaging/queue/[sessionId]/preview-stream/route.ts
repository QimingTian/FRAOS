import { imagingGetPreview } from '@/lib/cloud/personal-imaging/handlers'
import { personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'
import { livePreviewChannel, subscribeLiveEvents } from '@/lib/imaging/live-bus'
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const enqueue = (payload: unknown) => controller.enqueue(encoder.encode(sseData(payload)))

      const latest = await imagingGetPreview(tenantId, id)
      enqueue({
        type: 'snapshot',
        updatedAt: 'error' in latest ? null : latest.updatedAt,
      })

      const onUpdated = () => {
        enqueue({ type: 'updated' })
      }

      const handleBusPayload = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return
        const p = payload as { type?: string }
        if (p.type === 'updated') onUpdated()
      }

      const unsubscribeBus = subscribeLiveEvents(livePreviewChannel(id), handleBusPayload, request.signal)

      let lastUpdatedAt = 'error' in latest ? '' : latest.updatedAt
      const poll = setInterval(() => {
        void imagingGetPreview(tenantId, id).then((next) => {
          if ('error' in next) return
          if (next.updatedAt === lastUpdatedAt) return
          lastUpdatedAt = next.updatedAt
          enqueue({ type: 'updated', updatedAt: next.updatedAt })
        })
      }, 2000)

      const keepAlive = setInterval(() => {
        enqueue({ type: 'ping' })
      }, 15000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        clearInterval(poll)
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
