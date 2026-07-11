import { useCallback, useEffect, useState } from 'react'
import type { MaxSiteConfig } from '@shared/max-sites'
import {
  ACTIVE_MAX_SITE_CHANGED,
  getActiveMaxSiteTenantId,
  setActiveMaxSiteTenantId,
} from './active-max-site'
import { listControlMaxSites, maxPlanActive } from './max-sites-access'

export function useActiveMaxSite(): {
  multiSite: boolean
  sites: MaxSiteConfig[]
  activeSiteTenantId: string
  setActiveSiteTenantId: (tenantId: string) => void
  activeSiteLabel: string
  loading: boolean
} {
  const [sites, setSites] = useState<MaxSiteConfig[]>([])
  const [activeSiteTenantId, setActiveSiteTenantIdState] = useState(() => getActiveMaxSiteTenantId())
  const [loading, setLoading] = useState(true)

  const refreshSites = useCallback(async () => {
    setLoading(true)
    try {
      const next = await listControlMaxSites()
      setSites(next)
      const current = getActiveMaxSiteTenantId()
      if (!next.some((site) => site.tenantId === current) && next[0]) {
        setActiveMaxSiteTenantId(next[0].tenantId)
      }
      setActiveSiteTenantIdState(getActiveMaxSiteTenantId())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSites()
  }, [refreshSites])

  useEffect(() => {
    const onChange = () => setActiveSiteTenantIdState(getActiveMaxSiteTenantId())
    window.addEventListener(ACTIVE_MAX_SITE_CHANGED, onChange)
    return () => window.removeEventListener(ACTIVE_MAX_SITE_CHANGED, onChange)
  }, [])

  const setActiveSite = useCallback((tenantId: string) => {
    setActiveMaxSiteTenantId(tenantId)
    setActiveSiteTenantIdState(getActiveMaxSiteTenantId())
  }, [])

  const activeSite = sites.find((site) => site.tenantId === activeSiteTenantId)
  const activeSiteLabel =
    activeSite?.displayName?.trim() || activeSite?.tenantId || activeSiteTenantId || 'Site'

  return {
    multiSite: maxPlanActive() && sites.length > 1,
    sites,
    activeSiteTenantId,
    setActiveSiteTenantId: setActiveSite,
    activeSiteLabel,
    loading,
  }
}
