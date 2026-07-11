import type { NextRequest } from 'next/server'
import { verifyMemberHubToken, BOREAN_MEMBER_ID_HEADER, BOREAN_MEMBER_TOKEN_HEADER } from '@/lib/cloud/member-hub-token'
import { isProTeamMember, isProTeamPrivileged, type ProTeamRole } from '@/lib/cloud/pro-team'
import type { SessionRow } from '@/lib/cloud/personal-imaging/types'
import { loadTenantRegistry, loadTenantSecret } from '@/lib/cloud/tenant-registry'

export type ProMemberAccess = {
  memberId: string
  role: ProTeamRole
}

export type ProTenantContext = {
  isPro: boolean
  member: ProMemberAccess | null
}

export async function tenantIsProPlan(tenantId: string): Promise<boolean> {
  const registry = await loadTenantRegistry(tenantId)
  return registry?.plan === 'pro'
}

export async function resolveProMemberFromRequest(
  tenantId: string,
  request: NextRequest
): Promise<ProMemberAccess | null> {
  const memberId = request.headers.get(BOREAN_MEMBER_ID_HEADER)?.trim() ?? ''
  const token = request.headers.get(BOREAN_MEMBER_TOKEN_HEADER)?.trim() ?? ''
  if (!memberId || !token) return null

  const apiSecret = await loadTenantSecret(tenantId)
  if (!apiSecret) return null

  const payload = verifyMemberHubToken(token, { tenantId, apiSecret })
  if (!payload || payload.memberId !== memberId) return null

  const role = await isProTeamMember(tenantId, memberId)
  if (!role || role !== payload.role) return null

  return { memberId, role }
}

export async function resolveProTenantContext(
  tenantId: string,
  request: NextRequest
): Promise<ProTenantContext> {
  const isPro = await tenantIsProPlan(tenantId)
  if (!isPro) return { isPro: false, member: null }
  const member = await resolveProMemberFromRequest(tenantId, request)
  return { isPro: true, member }
}

export function proControlMemberRequired(
  context: ProTenantContext
): { error: string; status: number } | null {
  if (!context.isPro) return null
  if (!context.member) {
    return { error: 'Pro team member authentication required.', status: 403 }
  }
  return null
}

export function proPrivilegedRequired(context: ProTenantContext): { error: string; status: number } | null {
  const base = proControlMemberRequired(context)
  if (base) return base
  if (context.isPro && context.member && !isProTeamPrivileged(context.member.role)) {
    return { error: 'Only team owners and admins can perform this action.', status: 403 }
  }
  return null
}

export function proOwnerRequired(context: ProTenantContext): { error: string; status: number } | null {
  const base = proControlMemberRequired(context)
  if (base) return base
  if (context.isPro && context.member?.role !== 'owner') {
    return { error: 'Only the team owner can perform this action.', status: 403 }
  }
  return null
}

export function authorizeProSessionMutation(input: {
  context: ProTenantContext
  session: SessionRow | null
  action: 'edit' | 'delete' | 'control'
}): { error: string; status: number } | null {
  const base = proControlMemberRequired(input.context)
  if (base) return base
  if (!input.context.isPro || !input.context.member) return null

  if (input.context.member.role === 'owner' || input.context.member.role === 'admin') return null

  if (!input.session) return { error: 'Session not found', status: 404 }
  if (input.session.createdByMemberId && input.session.createdByMemberId !== input.context.member.memberId) {
    return { error: 'You can only modify your own sessions.', status: 403 }
  }
  if (!input.session.createdByMemberId) {
    return { error: 'You can only modify your own sessions.', status: 403 }
  }
  return null
}

export function sessionCreatedBy(input: {
  memberId: string
  memberName: string
}): Pick<SessionRow, 'createdByMemberId' | 'createdByMemberName'> {
  return {
    createdByMemberId: input.memberId,
    createdByMemberName: input.memberName,
  }
}
