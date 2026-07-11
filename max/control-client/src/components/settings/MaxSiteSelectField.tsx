import { useEffect, useState } from 'react'
import type { MaxSiteConfig } from '@shared/max-sites'
import { listControlMaxSites, maxPlanActive } from '../../lib/max-sites-access'

type MaxSiteSelectFieldProps = {
  value: string
  onChange: (tenantId: string) => void
  label?: string
  className?: string
}

export function MaxSiteSelectField({
  value,
  onChange,
  label = 'Site',
  className = '',
}: MaxSiteSelectFieldProps) {
  const [sites, setSites] = useState<MaxSiteConfig[]>([])

  useEffect(() => {
    if (!maxPlanActive()) return
    void listControlMaxSites().then(setSites)
  }, [])

  if (!maxPlanActive() || sites.length <= 1) return null

  return (
    <label className={`block text-sm text-white/70 ${className}`.trim()}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
      >
        {sites.map((site) => (
          <option key={site.tenantId} value={site.tenantId}>
            {site.displayName?.trim() || site.tenantId}
          </option>
        ))}
      </select>
    </label>
  )
}
