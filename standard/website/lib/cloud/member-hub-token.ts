import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ProTeamRole } from '@/lib/cloud/pro-team'

export const BOREAN_MEMBER_ID_HEADER = 'X-Borean-Member-Id'
export const BOREAN_MEMBER_TOKEN_HEADER = 'X-Borean-Member-Token'

const HUB_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

type HubTokenPayload = {
  memberId: string
  tenantId: string
  role: ProTeamRole
  exp: number
}

function signPayload(encoded: string, apiSecret: string): string {
  return createHmac('sha256', apiSecret).update(encoded).digest('base64url')
}

export function issueMemberHubToken(input: {
  memberId: string
  tenantId: string
  role: ProTeamRole
  apiSecret: string
}): string {
  const payload: HubTokenPayload = {
    memberId: input.memberId,
    tenantId: input.tenantId,
    role: input.role,
    exp: Date.now() + HUB_TOKEN_TTL_MS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = signPayload(encoded, input.apiSecret)
  return `${encoded}.${signature}`
}

export function verifyMemberHubToken(
  token: string,
  expected: { tenantId: string; apiSecret: string }
): HubTokenPayload | null {
  const trimmed = token.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0) return null
  const encoded = trimmed.slice(0, dot)
  const signature = trimmed.slice(dot + 1)
  const expectedSig = signPayload(encoded, expected.apiSecret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as HubTokenPayload
    if (!payload.memberId || !payload.tenantId || !payload.role) return null
    if (payload.tenantId !== expected.tenantId) return null
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null
    if (payload.role !== 'owner' && payload.role !== 'admin' && payload.role !== 'member') return null
    return payload
  } catch {
    return null
  }
}
