import { NextRequest, NextResponse } from 'next/server'
import { buildSignedDownloadUrl } from '@/lib/cloud/session-storage'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied

  const queueId = request.nextUrl.searchParams.get('queueId')?.trim() ?? ''
  const responseMode = request.nextUrl.searchParams.get('mode')?.trim() ?? ''

  if (!queueId) return personalJson({ ok: false, error: 'Missing queueId' }, 400)

  const signed = await buildSignedDownloadUrl(tenantId, queueId)
  if (!signed) return personalJson({ ok: false, error: 'File not found' }, 404)

  if (responseMode === 'json') {
    return personalJson({ ok: true, signedUrl: signed })
  }

  return NextResponse.redirect(signed, {
    status: 302,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}
