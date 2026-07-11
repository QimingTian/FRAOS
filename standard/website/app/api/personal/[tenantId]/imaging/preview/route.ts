import { NextRequest } from 'next/server'
import { imagingGetPreview, imagingPostPreview } from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  const queueId = request.nextUrl.searchParams.get('queueId')?.trim() ?? ''
  if (!queueId) return personalJson({ ok: false, error: 'Missing queueId' }, 400)

  const result = await imagingGetPreview(tenantId, queueId)
  if ('error' in result) {
    return personalJson({ ok: false, error: result.error }, result.status)
  }
  if (request.nextUrl.searchParams.get('mode')?.trim() === 'json') {
    return personalJson(result)
  }
  const body = Buffer.from(result.dataBase64, 'base64')
  return new Response(body, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
      'Content-Type': result.contentType || 'image/jpeg',
    },
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const result = await imagingPostPreview(tenantId, body)
  if ('error' in result) {
    return personalJson({ ok: false, error: result.error }, result.status)
  }
  return personalJson(result)
}
