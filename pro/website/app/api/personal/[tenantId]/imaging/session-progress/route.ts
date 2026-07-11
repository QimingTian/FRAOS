import { NextRequest } from 'next/server'
import { imagingSessionProgress } from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => null)
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
    return { text: typeof body === 'string' ? body : '' }
  }
  const raw = await request.text().catch(() => '')
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    return { text: raw }
  }
  return { text: raw }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const detail = await readBody(request)
  const result = await imagingSessionProgress(tenantId, detail)
  return personalJson(result)
}
