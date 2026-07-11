'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardPanel } from '@/app/account/dashboard-panel'

type MaxSiteRow = {
  tenantId: string
  displayName: string
  orderId: string
  createdAt: string
  validUntil: string | null
  isPrimary: boolean
  tenantConfigUrl: string
}

type MaxSitesPayload = {
  ok?: boolean
  error?: string
  sites?: MaxSiteRow[]
}

const actionButtonClass =
  'btn-chip'

export function MaxSitesSection({ className = '' }: { className?: string }) {
  const [payload, setPayload] = useState<MaxSitesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSiteName, setNewSiteName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/max/sites', { credentials: 'include', cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as MaxSitesPayload
      if (res.status === 404) {
        setPayload(null)
        return
      }
      if (!res.ok || !data.ok || !data.sites) {
        setError(typeof data.error === 'string' ? data.error : 'Could not load sites.')
        return
      }
      setPayload(data)
    } catch {
      setError('Could not load sites.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAddSite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/max/sites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newSiteName.trim() || undefined }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not add site.')
        return
      }
      setNewSiteName('')
      await load()
    } catch {
      setError('Could not add site.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <DashboardPanel title="Max sites" className={className}>
        <p className="text-sm text-muted">Loading sites…</p>
      </DashboardPanel>
    )
  }

  if (!payload?.sites) {
    return null
  }

  const sites = payload.sites

  return (
    <DashboardPanel title="Max sites" className={className}>
      <div className="space-y-6">
        <p className="text-sm text-muted">
          One FRAOS Max subscription covers unlimited observatories. Each site gets its own cloud hub —
          download Borean Station again on each observatory PC, activate with that site&apos;s license, and
          name the site in Station settings.
        </p>

        <ul className="divide-y divide-white/10">
          {sites.map((site) => (
            <li key={site.tenantId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-fg">{site.displayName}</p>
                <p className="text-xs text-muted">
                  {site.isPrimary ? 'Primary site · ' : ''}
                  Added {new Date(site.createdAt).toLocaleDateString()}
                </p>
              </div>
              <a href={site.tenantConfigUrl} className={actionButtonClass}>
                Download license
              </a>
            </li>
          ))}
        </ul>

        <form className="glass-inset space-y-3 p-5" onSubmit={(e) => void handleAddSite(e)}>
          <p className="text-sm font-medium text-fg">Add another site</p>
          <p className="text-xs text-muted">No extra charge — included in your Max subscription.</p>
          <label className="block text-sm">
            <span className="text-muted">Site name (optional — you can set it in Station later)</span>
            <input
              type="text"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              className="glass-field mt-1 w-full"
              placeholder="e.g. Backyard · Dark site B"
              disabled={busy}
            />
          </label>
          <button type="submit" className={actionButtonClass} disabled={busy}>
            {busy ? 'Adding…' : 'Add site'}
          </button>
        </form>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </DashboardPanel>
  )
}
