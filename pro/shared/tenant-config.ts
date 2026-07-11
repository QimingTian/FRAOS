/** Baked into each FRAOS build at purchase time — defines the customer's cloud hub. */
import {
  BOREAN_MEMBER_ID_HEADER,
  BOREAN_MEMBER_TOKEN_HEADER,
  type ProTeamRole,
} from './pro-team'

export type PersonalTenantConfig = {
  tenantId: string
  apiBaseUrl: string
  apiSecret: string
  displayName?: string
  plan?: string
  memberId?: string
  teamRole?: ProTeamRole
  memberHubToken?: string
}

/** API path under www.boreanastro.com (or dev server). */
export function personalTenantApiPath(tenantId: string, suffix: string): string {
  const path = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `/api/personal/${encodeURIComponent(tenantId)}${path}`
}

export function personalTenantApiUrl(config: PersonalTenantConfig, suffix: string): string {
  const base = config.apiBaseUrl.trim().replace(/\/+$/, '')
  return `${base}${personalTenantApiPath(config.tenantId, suffix)}`
}

export function personalAuthHeaders(
  config: PersonalTenantConfig,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${config.apiSecret}`,
    ...extra,
  }
  if (config.memberId?.trim() && config.memberHubToken?.trim()) {
    headers[BOREAN_MEMBER_ID_HEADER] = config.memberId.trim()
    headers[BOREAN_MEMBER_TOKEN_HEADER] = config.memberHubToken.trim()
  }
  return headers
}

export type { ProTeamRole } from './pro-team'
