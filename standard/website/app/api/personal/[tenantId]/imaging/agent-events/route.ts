import { liveAgentWakeChannel, subscribeLiveEvents } from '@/lib/imaging/live-bus'
import { touchAgentHeartbeatRemote } from '@/lib/cloud/personal-imaging/agent-heartbeat'
import { personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const

const POLL_NUDGE_MS = 45_000

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied

  const channel = liveAgentWakeChannel(tenantId)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const enqueue = (payload: unknown) => controller.enqueue(encoder.encode(sseData(payload)))

      await touchAgentHeartbeatRemote(tenantId)
      enqueue({ type: 'connected', ok: true, at: new Date().toISOString() })

      const onWake = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return
        const eventType = (payload as { type?: string }).type
        if (eventType === 'poll_sequence' || eventType === 'reconcile' || eventType === 'estop') {
          enqueue(payload)
        }
      }

      const unsubscribe = subscribeLiveEvents(channel, onWake, request.signal)

      const keepAlive = setInterval(() => {
        void touchAgentHeartbeatRemote(tenantId)
        enqueue({ type: 'ping', at: new Date().toISOString() })
      }, 15_000)

      const pollNudge = setInterval(() => {
        enqueue({ type: 'poll_sequence', at: new Date().toISOString(), source: 'interval' })
      }, POLL_NUDGE_MS)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        clearInterval(pollNudge)
        unsubscribe()
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
