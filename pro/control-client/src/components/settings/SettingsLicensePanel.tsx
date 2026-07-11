import { useCallback, useEffect, useState } from 'react'
import type { PersonalTenantInfo } from '../../lib/control-app-api'
import { getLocalLicenseStatus } from '../../lib/control-app-api'
import {
  fetchLicenseSummary,
  type LicenseSummaryResponse,
} from '../../lib/hub-client'
import {
  formatLicenseDate,
  inferLocalPurchaseType,
  purchaseTypeLabel,
  type LicensePurchaseType,
} from '../../lib/license-display'
import { localLicenseView } from '../../lib/license-entitlement'
import { planDisplayLabel } from '../../lib/plan-label'

type SettingsLicensePanelProps = {
  tenant: PersonalTenantInfo | null
}

type LicenseView = {
  active: boolean
  inactiveNote: string | null
  ownerName: string
  planLabel: string
  purchaseType: LicensePurchaseType
  purchaseTypeLabel: string
  validUntil: string | null
  nextBillAt: string | null
}

function viewFromSummary(data: LicenseSummaryResponse, base: LicenseView): LicenseView {
  return {
    ...base,
    ownerName: data.ownerName?.trim() || base.ownerName,
    planLabel: data.planLabel?.trim() || base.planLabel,
    purchaseType: (data.purchaseType as LicensePurchaseType) ?? base.purchaseType,
    purchaseTypeLabel:
      data.purchaseTypeLabel?.trim() || purchaseTypeLabel(data.purchaseType) || base.purchaseTypeLabel,
    nextBillAt: data.nextBillAt ?? base.nextBillAt,
  }
}

function LicenseRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-license-row">
      <span className="settings-license-label">{label}</span>
      <span className="settings-license-value">{value}</span>
    </div>
  )
}

export function SettingsLicensePanel({ tenant }: SettingsLicensePanelProps) {
  const [view, setView] = useState<LicenseView | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const local = await getLocalLicenseStatus()
      const localView = localLicenseView(local)
      const purchaseType = inferLocalPurchaseType(local.plan ?? tenant?.plan)
      let next: LicenseView = {
        active: localView.active,
        inactiveNote: localView.inactiveNote,
        ownerName: tenant?.displayName?.trim() || '—',
        planLabel: planDisplayLabel(local.plan ?? tenant?.plan),
        purchaseType,
        purchaseTypeLabel: purchaseTypeLabel(purchaseType),
        validUntil: localView.validUntil,
        nextBillAt: null,
      }
      try {
        const data = await fetchLicenseSummary()
        if (data.ok) {
          next = viewFromSummary(data, next)
          if (localView.validUntil == null && data.validUntil) {
            next.validUntil = data.validUntil
          }
        }
      } catch {
        /* offline — local tenant.json is the source of truth */
      }
      setView(next)
    } finally {
      setLoading(false)
    }
  }, [tenant])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!view) {
    return (
      <div className="settings-license-panel">
        {loading ? <p className="text-sm text-white/45">Loading license…</p> : null}
      </div>
    )
  }

  const validUntilLabel = formatLicenseDate(view.validUntil)
  const nextBillLabel = formatLicenseDate(view.nextBillAt)

  return (
    <div className="settings-license-panel settings-license-panel--footroom">
      {loading ? <p className="text-sm text-white/45">Loading license…</p> : null}

      <LicenseRow label="Status" value={view.active ? 'Active' : 'Inactive'} />
      {!view.active && view.inactiveNote ? (
        <p className="settings-license-status is-inactive">{view.inactiveNote}</p>
      ) : null}
      <LicenseRow label="Name" value={view.ownerName} />
      <LicenseRow label="Plan" value={view.planLabel} />
      <LicenseRow label="Purchase" value={view.purchaseTypeLabel} />

      {view.purchaseType === 'promo_code' && validUntilLabel ? (
        <LicenseRow label="Valid until" value={validUntilLabel} />
      ) : null}

      {(view.purchaseType === 'monthly_subscription' ||
        view.purchaseType === 'annual_subscription') &&
      nextBillLabel ? (
        <LicenseRow label="Next bill" value={nextBillLabel} />
      ) : null}
    </div>
  )
}
