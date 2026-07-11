/** Baked into each FRAOS Standard build at purchase time — defines the customer's cloud hub. */
import type { MaxSiteConfig } from './max-sites'

export type PersonalTenantConfig = {
  tenantId: string
  apiBaseUrl: string
  apiSecret: string
  displayName?: string
  plan?: string
  memberId?: string
  maxSites?: MaxSiteConfig[]
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
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${config.apiSecret}`,
    ...extra,
  }
}
