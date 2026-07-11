import { NextRequest, NextResponse } from 'next/server'
import { isSameSiteMutation } from '@/lib/member/csrf-origin'
import {
  listMaxSitesForMember,
  memberHasActiveMaxLicense,
  provisionMaxSite,
  renameMaxSite,
} from '@/lib/cloud/max-sites'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const hasMax = await memberHasActiveMaxLicense(auth.user.id)
  if (!hasMax) {
    return NextResponse.json({ ok: false, error: 'No active FRAOS Max subscription on this account.' }, { status: 404 })
  }

  const sites = await listMaxSitesForMember(auth.user.id)
  return NextResponse.json({
    ok: true,
    sites: sites.map((site) => ({
      tenantId: site.tenantId,
      displayName: site.displayName,
      orderId: site.orderId,
      createdAt: site.createdAt,
      validUntil: site.validUntil,
      isPrimary: site.isPrimary,
      tenantConfigUrl: `/api/member/orders/${site.orderId}/tenant`,
    })),
  })
}

export async function POST(request: NextRequest) {
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  let body: { displayName?: string } = {}
  try {
    body = (await request.json()) as { displayName?: string }
  } catch {
    body = {}
  }

  try {
    const { order, tenantConfig } = await provisionMaxSite({
      memberId: auth.user.id,
      email: auth.user.email,
      displayName: body.displayName,
    })

    return NextResponse.json({
      ok: true,
      site: {
        tenantId: tenantConfig.tenantId,
        displayName: tenantConfig.displayName,
        orderId: order.orderId,
        createdAt: order.createdAt,
        tenantConfigUrl: `/api/member/orders/${order.orderId}/tenant`,
      },
    })
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : 'Could not add site.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameSiteMutation(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 })
  }

  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  let body: { tenantId?: string; displayName?: string }
  try {
    body = (await request.json()) as { tenantId?: string; displayName?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const tenantId = body.tenantId?.trim()
  const displayName = body.displayName?.trim()
  if (!tenantId || !displayName) {
    return NextResponse.json({ ok: false, error: 'tenantId and displayName are required.' }, { status: 400 })
  }

  try {
    await renameMaxSite({
      memberId: auth.user.id,
      tenantId,
      displayName,
    })
    return NextResponse.json({ ok: true, tenantId, displayName })
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : 'Could not rename site.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
