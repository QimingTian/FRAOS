'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardPanel } from '@/app/account/dashboard-panel'
import type { LicensePurchaseType } from '@/lib/cloud/tenant-registry'
import { planDisplayName } from '@/lib/plan-utils'
import type { ProductPlan } from '@/lib/site-config'

type OrderRow = {
  orderId: string
  plan: ProductPlan
  planName: string
  displayName: string
  tenantId: string
  promoCode: string | null
  purchaseType: LicensePurchaseType
  purchaseTypeLabel: string
  validUntil: string | null
  nextBillAt: string | null
  cancelAtPeriodEnd: boolean
  licenseActive: boolean
  isSubscription: boolean
    canCancelSubscription: boolean
    canResumeSubscription: boolean
    teamCode?: string
    createdAt: string
  downloads: {
    controlWindows: string | null
    controlMac: string | null
    stationWindows: string | null
  }
}

type OrdersPayload = {
  ok?: boolean
  orders?: OrderRow[]
  total?: number
  error?: string
}

type LicensePayload = {
  ok?: boolean
  tenantConfig?: {
    tenantId: string
    displayName: string
    plan: ProductPlan
  }
  teamRole?: 'owner' | 'member'
  teamCode?: string
  teamDisplayName?: string
  error?: string
}

const actionButtonClass =
  'btn-chip'

const downloadLinkClass =
  'btn-chip inline-flex items-center'

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

export function PurchaseHistorySection({ className = '' }: { className?: string }) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [teamLicense, setTeamLicense] = useState<LicensePayload | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ordersRes, licenseRes] = await Promise.all([
        fetch('/api/member/orders', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/member/license', { credentials: 'include', cache: 'no-store' }),
      ])
      const data = (await ordersRes.json().catch(() => ({}))) as OrdersPayload
      const license = (await licenseRes.json().catch(() => ({}))) as LicensePayload
      if (!ordersRes.ok || data?.ok !== true || !Array.isArray(data.orders)) {
        setError(typeof data.error === 'string' ? data.error : 'Could not load purchase history.')
        return
      }
      setOrders(data.orders)
      setTotal(typeof data.total === 'number' ? data.total : data.orders.length)
      if (licenseRes.ok && license.ok && license.tenantConfig) {
        setTeamLicense(license)
      } else {
        setTeamLicense(null)
      }
    } catch {
      setError('Could not load purchase history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function cancelSubscription(orderId: string) {
    if (!window.confirm('Cancel this subscription at the end of the current billing period?')) return
    setBusyOrderId(orderId)
    setError(null)
    try {
      const res = await fetch('/api/member/subscription/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not cancel subscription.')
        return
      }
      await load()
    } catch {
      setError('Could not cancel subscription.')
    } finally {
      setBusyOrderId(null)
    }
  }

  async function resumeSubscription(orderId: string) {
    setBusyOrderId(orderId)
    setError(null)
    try {
      const res = await fetch('/api/member/subscription/resume', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not resume subscription.')
        return
      }
      await load()
    } catch {
      setError('Could not resume subscription.')
    } finally {
      setBusyOrderId(null)
    }
  }

  const refreshButton = (
    <button type="button" onClick={() => void load()} disabled={loading} className={actionButtonClass}>
      {loading ? '…' : 'Refresh'}
    </button>
  )

  return (
    <DashboardPanel
      title={`Purchase history${total > 0 ? ` (${total})` : ''}`}
      action={refreshButton}
      className={className}
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {teamLicense?.teamRole === 'member' && teamLicense.tenantConfig ? (
        <div className="glass-inset mb-4 p-4">
          <p className="font-medium text-fg">
            {planDisplayName(teamLicense.tenantConfig.plan)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {teamLicense.teamDisplayName ?? teamLicense.tenantConfig.displayName}
            <span className="mx-2 text-muted/40">·</span>
            Team member
          </p>
          <p className="mt-1 font-mono text-xs text-muted/80">{teamLicense.tenantConfig.tenantId}</p>
        </div>
      ) : null}

      {orders.length === 0 && !loading ? (
        <p className="text-sm text-muted">
          {teamLicense?.teamRole === 'member'
            ? 'No personal purchases — your access comes from the team above.'
            : 'No purchases yet.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {orders.map((order) => {
            const busy = busyOrderId === order.orderId
            return (
              <li key={order.orderId} className="glass-inset p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-fg">{order.planName}</p>
                    <p className="mt-1 text-sm text-muted">{order.displayName}</p>
                    <p className="mt-2 text-xs text-muted">
                      Purchased {formatDate(order.createdAt)}
                      <span className="mx-2">·</span>
                      {order.purchaseTypeLabel}
                      {order.promoCode ? (
                        <>
                          <span className="mx-2">·</span>
                          Code {order.promoCode}
                        </>
                      ) : null}
                      {order.cancelAtPeriodEnd && order.validUntil ? (
                        <>
                          <span className="mx-2">·</span>
                          Cancels {formatDate(order.validUntil)}
                        </>
                      ) : order.validUntil ? (
                        <>
                          <span className="mx-2">·</span>
                          {order.licenseActive ? 'Active until' : 'Ended'} {formatDate(order.validUntil)}
                        </>
                      ) : order.isSubscription ? null : (
                        <>
                          <span className="mx-2">·</span>
                          Lifetime
                        </>
                      )}
                    </p>
                    {order.plan === 'pro' && order.teamCode ? (
                      <p className="mt-2 text-sm text-fg">
                        Team code:{' '}
                        <span className="font-mono text-base tracking-widest">{order.teamCode}</span>
                        <span className="ml-2 text-xs text-muted">— share at checkout for members to join</span>
                      </p>
                    ) : null}
                    <p className="mt-1 font-mono text-xs text-muted/80">{order.tenantId}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {order.downloads.controlMac ? (
                    <a href={order.downloads.controlMac} className={downloadLinkClass}>
                      Control (macOS)
                    </a>
                  ) : null}
                  {order.downloads.controlWindows ? (
                    <a href={order.downloads.controlWindows} className={downloadLinkClass}>
                      Control (Windows)
                    </a>
                  ) : null}
                  {order.downloads.stationWindows ? (
                    <a href={order.downloads.stationWindows} className={downloadLinkClass}>
                      Station (Windows)
                    </a>
                  ) : null}
                  {order.canCancelSubscription ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void cancelSubscription(order.orderId)}
                      className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {busy ? '…' : 'Cancel subscription'}
                    </button>
                  ) : null}
                  {order.canResumeSubscription ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void resumeSubscription(order.orderId)}
                      className={actionButtonClass}
                    >
                      {busy ? '…' : "Don't cancel"}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardPanel>
  )
}
