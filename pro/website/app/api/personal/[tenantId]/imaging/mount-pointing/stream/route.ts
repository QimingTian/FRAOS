import { liveMountChannel, subscribeLiveEvents } from '@/lib/imaging/live-bus'
import { getMountPointingSample, type StoredMountSample } from '@/lib/imaging/mount-pointing-store'
import { personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const POLL_MS = 2_000

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
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  const stationId = request.nextUrl.searchParams.get('stationId') ?? undefined
  const channel = liveMountChannel(tenantId, stationId)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const enqueue = (payload: unknown) => controller.enqueue(encoder.encode(sseData(payload)))

      const sample = await getMountPointingSample(stationId, tenantId)
      enqueue({
        type: 'snapshot',
        sample,
        serverNowUtc: new Date().toISOString(),
      })

      const onPayload = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return
        const p = payload as { type?: string; sample?: StoredMountSample }
        if (p.type === 'sample' && p.sample) {
          enqueue({
            type: 'sample',
            sample: p.sample,
            serverNowUtc: new Date().toISOString(),
          })
        }
      }

      const unsubscribe = subscribeLiveEvents(channel, onPayload, request.signal)

      let lastFingerprint = sample ? JSON.stringify(sample) : ''
      const pollKv = setInterval(() => {
        void getMountPointingSample(stationId, tenantId).then((latest) => {
          const fp = latest ? JSON.stringify(latest) : ''
          if (fp === lastFingerprint) return
          lastFingerprint = fp
          enqueue({
            type: 'sample',
            sample: latest,
            serverNowUtc: new Date().toISOString(),
          })
        })
      }, POLL_MS)

      const keepAlive = setInterval(() => {
        enqueue({ type: 'ping' })
      }, 15000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        clearInterval(pollKv)
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
