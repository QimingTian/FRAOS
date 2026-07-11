import { getPersonalTenant, loadRuntimeTenant } from './tenant'
import { maxSitesFromTenant, type MaxSiteConfig } from '@shared/max-sites'
import type { PersonalTenantConfig } from '@shared/tenant-config'

export async function listControlMaxSites(): Promise<MaxSiteConfig[]> {
  const tenant = await loadRuntimeTenant()
  const sites = maxSitesFromTenant(tenant)
  if (sites.length > 0) return sites
  return [
    {
      tenantId: tenant.tenantId,
      apiBaseUrl: tenant.apiBaseUrl,
      apiSecret: tenant.apiSecret,
      displayName: tenant.displayName?.trim() || tenant.tenantId,
    },
  ]
}

export function maxPlanActive(): boolean {
  const tenant = getPersonalTenant()
  return tenant.plan?.trim().toLowerCase() === 'max' || maxSitesFromTenant(tenant).length > 0
}

export function maxSiteAsTenant(site: MaxSiteConfig): PersonalTenantConfig {
  return {
    tenantId: site.tenantId,
    apiBaseUrl: site.apiBaseUrl,
    apiSecret: site.apiSecret,
    displayName: site.displayName,
    plan: 'max',
    memberId: getPersonalTenant().memberId,
    maxSites: maxSitesFromTenant(getPersonalTenant()),
  }
}

export function resolveSelectedMaxSite(sites: MaxSiteConfig[], tenantId: string): MaxSiteConfig | undefined {
  return sites.find((site) => site.tenantId === tenantId)
}
