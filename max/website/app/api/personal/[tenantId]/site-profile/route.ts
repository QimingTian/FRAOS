import { NextRequest } from 'next/server'
import { personalJson, personalOptions, requirePersonalTenantSecret } from '@/lib/cloud/route-helpers'
import { updateTenantDisplayName } from '@/lib/cloud/tenant-registry'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  let body: { displayName?: string }
  try {
    body = (await request.json()) as { displayName?: string }
  } catch {
    return personalJson({ ok: false, error: 'Invalid JSON body.' }, 400)
  }

  const displayName = body.displayName?.trim()
  if (!displayName) {
    return personalJson({ ok: false, error: 'displayName is required.' }, 400)
  }

  try {
    await updateTenantDisplayName(tenantId, displayName)
    return personalJson({ ok: true, tenantId, displayName })
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : 'Could not update site profile.'
    return personalJson({ ok: false, error: message }, 400)
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied

  const { loadTenantRegistry } = await import('@/lib/cloud/tenant-registry')
  const registry = await loadTenantRegistry(tenantId)
  if (!registry) {
    return personalJson({ ok: false, error: 'Unknown tenant.' }, 404)
  }

  return personalJson({
    ok: true,
    tenantId,
    displayName: registry.displayName,
    plan: registry.plan,
  })
}
