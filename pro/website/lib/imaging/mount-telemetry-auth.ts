import type { NextRequest } from 'next/server'

function bearerSecret(): string | undefined {
  const p = process.env.NINA_MOUNT_TELEMETRY_SECRET
  return p && p.length > 0 ? p : undefined
}

function basicPassword(): string | undefined {
  const p = process.env.NINA_MOUNT_TELEMETRY_BASIC_PASSWORD
  return p && p.length > 0 ? p : undefined
}

function expectedBasicUser(): string {
  return process.env.NINA_MOUNT_TELEMETRY_BASIC_USER ?? ''
}

function parseBasicCredentials(authorization: string | null): { user: string; pass: string } | null {
  if (!authorization?.startsWith('Basic ')) return null
  try {
    const raw = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8')
    const colon = raw.indexOf(':')
    if (colon === -1) return { user: '', pass: raw }
    return { user: raw.slice(0, colon), pass: raw.slice(colon + 1) }
  } catch {
    return null
  }
}

export function mountTelemetryPostAuthorized(request: NextRequest): boolean {
  const secret = bearerSecret()
  const basicPass = basicPassword()

  if (!secret && !basicPass) {
    return process.env.NODE_ENV !== 'production'
  }

  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth === `Bearer ${secret}`) return true
    if (request.headers.get('x-nina-mount-telemetry-secret') === secret) return true
  }

  if (basicPass) {
    const basic = parseBasicCredentials(request.headers.get('authorization'))
    if (basic && basic.user === expectedBasicUser() && basic.pass === basicPass) return true
  }

  return false
}
