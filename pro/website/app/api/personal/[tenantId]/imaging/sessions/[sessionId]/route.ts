import { NextRequest } from 'next/server'
import { imagingDeleteSession } from '@/lib/cloud/personal-imaging/handlers'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string; sessionId: string }> }
) {
  const { tenantId, sessionId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const id = sessionId.trim()
  if (!id) return personalJson({ ok: false, error: 'sessionId is required' }, 400)
  const deleted = await imagingDeleteSession(tenantId, id)
  if (!deleted) return personalJson({ ok: false, error: 'Session not found' }, 404)
  return personalJson({ ok: true })
}
