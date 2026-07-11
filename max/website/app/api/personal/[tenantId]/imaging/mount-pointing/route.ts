import { NextRequest } from 'next/server'
import { parseMountPointingPayload } from '@/lib/imaging/mount-pointing-parse'
import {
  getMountPointingSample,
  setMountPointingSample,
} from '@/lib/imaging/mount-pointing-store'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return personalOptions()
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return personalJson({ ok: false as const, error: 'Invalid JSON' }, 400)
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return personalJson({ ok: false as const, error: 'Expected JSON object' }, 400)
  }

  const payload = parseMountPointingPayload(raw as Record<string, unknown>)
  if (!payload) {
    return personalJson({ ok: false as const, error: 'Missing boolean "connected"' }, 400)
  }

  const stored = await setMountPointingSample(payload.stationId, payload, tenantId)
  return personalJson({ ok: true as const, receivedAtUtc: stored.receivedAtUtc }, 200)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied

  const stationId = request.nextUrl.searchParams.get('stationId') ?? undefined
  const sample = await getMountPointingSample(stationId, tenantId)
  return personalJson({ ok: true as const, sample, serverNowUtc: new Date().toISOString() }, 200)
}
