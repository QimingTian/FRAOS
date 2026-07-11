import { NextRequest } from 'next/server'
import { contentJson, contentOptions } from '@/lib/content/cors'
import { mountTelemetryPostAuthorized } from '@/lib/imaging/mount-telemetry-auth'
import { parseMountPointingPayload } from '@/lib/imaging/mount-pointing-parse'
import {
  getMountPointingSample,
  setMountPointingSample,
} from '@/lib/imaging/mount-pointing-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
} as const

export function OPTIONS() {
  return contentOptions()
}

export async function POST(request: NextRequest) {
  if (!mountTelemetryPostAuthorized(request)) {
    return contentJson({ ok: false as const, error: 'Unauthorized' }, 401)
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return contentJson({ ok: false as const, error: 'Invalid JSON' }, 400)
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return contentJson({ ok: false as const, error: 'Expected JSON object' }, 400)
  }

  const payload = parseMountPointingPayload(raw as Record<string, unknown>)
  if (!payload) {
    return contentJson({ ok: false as const, error: 'Missing boolean "connected"' }, 400)
  }

  const stored = await setMountPointingSample(payload.stationId, payload)
  return contentJson({ ok: true as const, receivedAtUtc: stored.receivedAtUtc }, 200)
}

export async function GET(request: NextRequest) {
  const stationId = request.nextUrl.searchParams.get('stationId') ?? undefined
  const sample = await getMountPointingSample(stationId)
  const serverNowUtc = new Date().toISOString()
  if (!sample) {
    return contentJson({ ok: true as const, sample: null, serverNowUtc }, 200)
  }
  return contentJson({ ok: true as const, sample, serverNowUtc }, 200)
}
