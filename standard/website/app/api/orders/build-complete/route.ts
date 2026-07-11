import { NextRequest } from 'next/server'
import { sendBuildReadyEmail, emailConfigured } from '@/lib/cloud/email'
import { markOrderBuildComplete } from '@/lib/cloud/order-build-status'
import { validateBearerSecret } from '@/lib/cloud/timing-safe-secret'

export const runtime = 'nodejs'

type BuildCompleteBody = {
  tenantId?: unknown
  stripeSessionId?: unknown
  controlWinUrl?: unknown
  stationWinUrl?: unknown
  controlMacUrl?: unknown
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.BUILD_WEBHOOK_SECRET?.trim()
  if (!expectedSecret) {
    return Response.json(
      { ok: false, error: 'Build webhook secret is not configured.' },
      { status: 503 }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (!validateBearerSecret(authHeader, expectedSecret)) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }

  let body: BuildCompleteBody
  try {
    body = (await request.json()) as BuildCompleteBody
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const tenantId = parseString(body.tenantId)
  const stripeSessionId = parseString(body.stripeSessionId)
  const controlWinUrl = parseString(body.controlWinUrl)
  const stationWinUrl = parseString(body.stationWinUrl)
  const controlMacUrl = parseString(body.controlMacUrl)

  if (!tenantId || !stripeSessionId) {
    return Response.json(
      { ok: false, error: 'Missing tenantId or stripeSessionId.' },
      { status: 400 }
    )
  }

  if (!controlWinUrl && !stationWinUrl && !controlMacUrl) {
    return Response.json(
      { ok: false, error: 'At least one download URL is required.' },
      { status: 400 }
    )
  }

  const record = await markOrderBuildComplete(stripeSessionId, tenantId, {
    controlWinUrl,
    stationWinUrl,
    controlMacUrl,
  })

  // Send the "your download is ready" email if we have an address and Resend is configured.
  if (record.customerEmail && emailConfigured()) {
    try {
      await sendBuildReadyEmail({
        to: record.customerEmail,
        displayName: record.plan,
        downloads: record.downloads,
        accountUrl: 'https://YOUR_DOMAIN/account',
      })
    } catch {
      // Email delivery is best-effort; the build is still marked complete.
    }
  }

  return Response.json({ ok: true, status: 'ready', tenantId })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
