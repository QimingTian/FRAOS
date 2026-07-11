import { NextRequest } from 'next/server'
import {
  addAdminClosedWindow,
  listAdminClosedWindows,
  removeAdminClosedWindow,
} from '@/lib/cloud/personal-imaging/admin-closed-window-store'
import { appendAuditLog } from '@/lib/cloud/personal-imaging/db'
import { runWithTenantImaging } from '@/lib/cloud/personal-imaging/ctx'
import { reconcilePendingScheduleStatus } from '@/lib/imaging/reconcile'
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
  const windows = await runWithTenantImaging(
    tenantId,
    () => listAdminClosedWindows(tenantId),
    { persist: false }
  )
  return personalJson({ ok: true as const, windows })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const startIso = typeof body.startIso === 'string' ? body.startIso : ''
  const endIso = typeof body.endIso === 'string' ? body.endIso : ''
  const description = typeof body.description === 'string' ? body.description : ''

  const result = await runWithTenantImaging(tenantId, async () => {
    const created = await addAdminClosedWindow(startIso, endIso, description, tenantId)
    if ('error' in created) return { error: created.error as string, status: 400 as const }
    await reconcilePendingScheduleStatus()
    appendAuditLog({
      kind: 'schedule_control.add',
      message: `Admin scheduled closed window ${created.startIso} -> ${created.endIso}`,
      detail: {
        id: created.id,
        startIso: created.startIso,
        endIso: created.endIso,
        description: created.description ?? null,
      },
    })
    return { window: created }
  })

  if ('error' in result) {
    return personalJson({ ok: false as const, error: result.error }, result.status)
  }
  return personalJson({ ok: true as const, window: result.window })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!id) return personalJson({ ok: false as const, error: 'id is required' }, 400)

  const result = await runWithTenantImaging(tenantId, async () => {
    const ok = await removeAdminClosedWindow(id, tenantId)
    if (!ok) return { error: 'Not found', status: 404 as const }
    await reconcilePendingScheduleStatus()
    appendAuditLog({
      kind: 'schedule_control.remove',
      message: `Admin removed closed window ${id}`,
      detail: { id },
    })
    return { ok: true as const }
  })

  if ('error' in result) {
    return personalJson({ ok: false as const, error: result.error }, result.status)
  }
  return personalJson({ ok: true as const })
}
