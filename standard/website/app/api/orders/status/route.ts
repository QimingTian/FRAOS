import { NextRequest } from 'next/server'
import { getOrderBuildStatus } from '@/lib/cloud/order-build-status'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId')?.trim()
  if (!sessionId) {
    return Response.json(
      { ok: false, error: 'Missing sessionId parameter.' },
      { status: 400 }
    )
  }

  const record = await getOrderBuildStatus(sessionId)
  if (!record) {
    return Response.json(
      { ok: false, error: 'No build found for this session.' },
      { status: 404 }
    )
  }

  return Response.json({
    ok: true,
    status: record.status,
    tenantId: record.tenantId,
    downloads: record.downloads,
    readyAt: record.readyAt,
  })
}
