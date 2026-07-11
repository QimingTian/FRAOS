/** Max multi-site entry returned from /api/member/license. */
export type MaxSiteConfig = {
  tenantId: string
  apiBaseUrl: string
  apiSecret: string
  displayName: string
  validUntil?: string | null
}

export function maxSitesFromTenant(config: { maxSites?: MaxSiteConfig[] | null }): MaxSiteConfig[] {
  return Array.isArray(config.maxSites) ? config.maxSites.filter((site) => site.tenantId?.trim()) : []
}

export function maxPlanActive(config: { plan?: string | null; maxSites?: MaxSiteConfig[] | null }): boolean {
  if (config.plan?.trim().toLowerCase() === 'max') return true
  return maxSitesFromTenant(config).length > 0
}

export function resolveMaxSite(
  config: { maxSites?: MaxSiteConfig[] | null },
  tenantId: string
): MaxSiteConfig | undefined {
  return maxSitesFromTenant(config).find((site) => site.tenantId === tenantId)
}
