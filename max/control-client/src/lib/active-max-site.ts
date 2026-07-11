import type { PersonalTenantConfig } from '@shared/tenant-config'
import { maxSitesFromTenant } from '@shared/max-sites'
import { getPersonalTenant, loadRuntimeTenant } from './tenant'
import { maxPlanActive, maxSiteAsTenant, resolveSelectedMaxSite } from './max-sites-access'

const ACTIVE_SITE_KEY = 'borean.max.activeSiteTenantId'

export const ACTIVE_MAX_SITE_CHANGED = 'borean:active-max-site-changed'

export function getActiveMaxSiteTenantId(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_SITE_KEY)?.trim()
    if (stored) {
      const sites = maxSitesFromTenant(getPersonalTenant())
      if (sites.some((site) => site.tenantId === stored)) return stored
    }
  } catch {
    // ignore
  }
  const sites = maxSitesFromTenant(getPersonalTenant())
  return sites[0]?.tenantId ?? getPersonalTenant().tenantId
}

export function setActiveMaxSiteTenantId(tenantId: string): void {
  const id = tenantId.trim()
  if (!id) return
  localStorage.setItem(ACTIVE_SITE_KEY, id)
  window.dispatchEvent(new CustomEvent(ACTIVE_MAX_SITE_CHANGED, { detail: { tenantId: id } }))
}

export async function loadActiveHubTenant(): Promise<PersonalTenantConfig> {
  const runtime = await loadRuntimeTenant()
  if (!maxPlanActive()) return runtime
  const sites = maxSitesFromTenant(runtime)
  if (sites.length <= 1) return runtime
  const activeId = getActiveMaxSiteTenantId()
  const site = resolveSelectedMaxSite(sites, activeId) ?? sites[0]
  if (!site) return runtime
  return maxSiteAsTenant(site)
}

export function activeMaxSiteLabel(): string {
  const sites = maxSitesFromTenant(getPersonalTenant())
  const activeId = getActiveMaxSiteTenantId()
  const site = resolveSelectedMaxSite(sites, activeId)
  return site?.displayName?.trim() || site?.tenantId || getPersonalTenant().displayName?.trim() || 'Site'
}
