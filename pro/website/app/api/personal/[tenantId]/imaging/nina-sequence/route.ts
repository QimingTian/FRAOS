import { NextRequest } from 'next/server'
import { imagingNinaSequence } from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

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
  const result = await imagingNinaSequence(tenantId)
  if (result.kind === 'json') {
    return new Response(result.body, {
      status: result.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
  if (result.kind === 'empty') {
    return new Response(null, { status: result.status })
  }
  return personalJson({ ok: false, error: result.error }, result.status)
}
