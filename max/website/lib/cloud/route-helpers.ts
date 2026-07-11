import { NextRequest, NextResponse } from 'next/server'
import { personalIsTenantLicenseActive } from '@/lib/cloud/personal-license'
import { personalTenantKnown, personalTenantSecretMatches } from '@/lib/cloud/tenant-auth'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': `Content-Type, Authorization, X-Borean-Member-Id, X-Borean-Member-Token`,
}

export function personalOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export function personalUnauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
}

export function personalNotFoundTenant() {
  return NextResponse.json({ ok: false, error: 'Unknown tenant' }, { status: 404, headers: CORS_HEADERS })
}

export function personalLicenseExpired() {
  return NextResponse.json(
    { ok: false, error: 'License expired. Renew or purchase a new license on www.boreanastro.com.' },
    { status: 403, headers: CORS_HEADERS }
  )
}

/** Bearer secret only — allows reading license status after expiry. */
export async function requirePersonalTenantSecret(
  tenantId: string,
  request: NextRequest
): Promise<NextResponse | null> {
  if (!(await personalTenantKnown(tenantId))) return personalNotFoundTenant()
  if (!(await personalTenantSecretMatches(tenantId, request))) return personalUnauthorized()
  return null
}

export async function requirePersonalTenant(
  tenantId: string,
  request: NextRequest
): Promise<NextResponse | null> {
  const denied = await requirePersonalTenantSecret(tenantId, request)
  if (denied) return denied
  if (!(await personalIsTenantLicenseActive(tenantId))) return personalLicenseExpired()
  return null
}

export function personalJson<T extends object>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}
