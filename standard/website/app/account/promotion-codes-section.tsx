'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardPanel } from '@/app/account/dashboard-panel'
import { normalizeProductPlan } from '@/lib/plan-utils'
import { PLANS, PRODUCT_PLANS, type ProductPlan } from '@/lib/site-config'

type PromoRow = {
  code: string
  plan: ProductPlan
  percentOff: number
  maxUses: number
  uses: number
  licenseValidDays: number
  createdAt: string
  redeemedAt: string | null
  label: string | null
  status: 'available' | 'used'
}

type PromoPayload = {
  ok?: boolean
  promos?: PromoRow[]
  total?: number
  promo?: PromoRow
  error?: string
}

const actionButtonClass =
  'btn-chip'

const VALIDITY_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
] as const

function statusLabel(status: PromoRow['status']): string {
  if (status === 'available') return 'Available'
  return 'Used'
}

function statusClass(status: PromoRow['status']): string {
  if (status === 'available') return 'text-emerald-300'
  return 'text-muted'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function licenseDurationLabel(days: number): string {
  const match = VALIDITY_OPTIONS.find((opt) => opt.days === days)
  if (match) return match.label
  return `${days} days`
}

export function PromotionCodesSection({ className = '' }: { className?: string }) {
  const [promos, setPromos] = useState<PromoRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [plan, setPlan] = useState<ProductPlan>('standard')
  const [validDays, setValidDays] = useState(30)
  const [lastCreated, setLastCreated] = useState<string | null>(null)

  const applyPayload = (data: PromoPayload) => {
    if (Array.isArray(data.promos)) {
      setPromos(data.promos)
      setTotal(typeof data.total === 'number' ? data.total : data.promos.length)
    }
    if (data.promo?.code) setLastCreated(data.promo.code)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/promo-codes', { credentials: 'include', cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as PromoPayload
      if (!res.ok || data?.ok !== true || !Array.isArray(data.promos)) {
        setError(typeof data.error === 'string' ? data.error : 'Could not load promotion codes.')
        return
      }
      applyPayload(data)
    } catch {
      setError('Could not load promotion codes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createPromo(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setLastCreated(null)
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          validDays,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as PromoPayload
      if (!res.ok || data?.ok !== true) {
        setError(typeof data.error === 'string' ? data.error : 'Could not create promotion code.')
        return
      }
      applyPayload(data)
    } catch {
      setError('Could not create promotion code.')
    } finally {
      setCreating(false)
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  const refreshButton = (
    <button type="button" onClick={() => void load()} disabled={loading} className={actionButtonClass}>
      {loading ? '…' : 'Refresh'}
    </button>
  )

  return (
    <DashboardPanel
      title={`Promotion codes${total > 0 ? ` (${total})` : ''}`}
      action={refreshButton}
      className={className}
    >
      <form onSubmit={(e) => void createPromo(e)} className="glass-inset space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Edition</span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as ProductPlan)}
              disabled={creating}
              className="glass-field mt-1 w-full"
            >
              {PRODUCT_PLANS.map((tier) => (
                <option key={tier} value={tier}>
                  {PLANS[tier].shortName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">License valid for</span>
            <select
              value={validDays}
              onChange={(e) => setValidDays(Number.parseInt(e.target.value, 10))}
              disabled={creating}
              className="glass-field mt-1 w-full"
            >
              {VALIDITY_OPTIONS.map((opt) => (
                <option key={opt.days} value={opt.days}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={creating} className={actionButtonClass}>
          {creating ? 'Generating…' : 'Generate code'}
        </button>
        {lastCreated ? (
          <p className="text-sm text-emerald-300">
            Created <span className="font-mono text-fg">{lastCreated}</span> — share it; it can only be used once.
          </p>
        ) : null}
      </form>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {promos.length === 0 && !loading ? (
        <p className="mt-4 text-sm text-muted">No promotion codes yet.</p>
      ) : (
        <ul className="mt-4 max-h-[22rem] space-y-2 overflow-y-auto">
          {promos.map((p) => (
            <li
              key={p.code}
              className="glass-inset flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-fg">{p.code}</p>
                <p className="mt-1 text-xs text-muted">
                  {p.label ? `${p.label} · ` : ''}
                  {PLANS[normalizeProductPlan(String(p.plan))].shortName}
                  <span className="mx-2">·</span>
                  License {licenseDurationLabel(p.licenseValidDays)} after redemption
                  <span className="mx-2">·</span>
                  <span className={statusClass(p.status)}>{statusLabel(p.status)}</span>
                  {p.redeemedAt ? (
                    <>
                      <span className="mx-2">·</span>
                      Redeemed {formatDate(p.redeemedAt)}
                    </>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyCode(p.code)}
                disabled={p.status !== 'available'}
                className={actionButtonClass}
              >
                {copiedCode === p.code ? 'Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  )
}
