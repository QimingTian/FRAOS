'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardPanel } from '@/app/account/dashboard-panel'
import type { ProductPlan } from '@/lib/site-config'
import type { LicensePurchaseType } from '@/lib/cloud/tenant-registry'

type PurchaseRow = {
  orderId: string
  plan: ProductPlan
  planName: string
  purchaseType: LicensePurchaseType
  purchaseTypeLabel: string
  observatoryName: string
  tenantId: string
  buyerEmail: string | null
  buyerUsername: string | null
  buyerName: string | null
  promoCode: string | null
  createdAt: string
  validUntil: string | null
}

type PurchasesPayload = {
  ok?: boolean
  purchases?: PurchaseRow[]
  total?: number
  error?: string
}

const actionButtonClass =
  'btn-chip'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buyerLabel(row: PurchaseRow): string {
  if (row.buyerName) return row.buyerName
  if (row.buyerUsername) return row.buyerUsername
  if (row.buyerEmail) return row.buyerEmail
  return 'Unknown buyer'
}

export function AllPurchasesSection({ className = '' }: { className?: string }) {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/purchases', { credentials: 'include', cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as PurchasesPayload
      if (!res.ok || data?.ok !== true || !Array.isArray(data.purchases)) {
        setError(typeof data.error === 'string' ? data.error : 'Could not load purchases.')
        return
      }
      setPurchases(data.purchases)
      setTotal(typeof data.total === 'number' ? data.total : data.purchases.length)
    } catch {
      setError('Could not load purchases.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshButton = (
    <button type="button" onClick={() => void load()} disabled={loading} className={actionButtonClass}>
      {loading ? '…' : 'Refresh'}
    </button>
  )

  return (
    <DashboardPanel
      title={`All Purchases${total > 0 ? ` (${total})` : ''}`}
      action={refreshButton}
      className={className}
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {purchases.length === 0 && !loading ? (
        <p className="text-sm text-muted">No purchases yet.</p>
      ) : (
        <ul className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto">
          {purchases.map((row) => (
            <li key={row.orderId} className="glass-inset p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{row.planName}</p>
                  <p className="mt-1 text-muted">{row.observatoryName}</p>
                  <p className="mt-1 font-mono text-xs text-muted/80">{row.tenantId}</p>
                </div>
                <p className="shrink-0 text-xs text-muted">{formatDate(row.createdAt)}</p>
              </div>
              <p className="mt-3 text-muted">
                <span className="text-fg">{buyerLabel(row)}</span>
                {row.buyerEmail ? (
                  <>
                    <span className="mx-2 text-muted/50">·</span>
                    <span>{row.buyerEmail}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-2 text-xs text-muted">
                {row.purchaseTypeLabel}
                {row.promoCode ? (
                  <>
                    <span className="mx-2">·</span>
                    Code {row.promoCode}
                  </>
                ) : null}
                {row.validUntil ? (
                  <>
                    <span className="mx-2">·</span>
                    Valid until {formatDate(row.validUntil)}
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  )
}
