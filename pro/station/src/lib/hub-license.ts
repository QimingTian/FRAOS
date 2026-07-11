import { personalAuthHeaders, personalTenantApiUrl } from '@shared/tenant-config'
import { loadRuntimeTenant } from './tenant-runtime'
import type { LicensePurchaseType } from './license-display'

export type LicenseSummaryResponse = {
  ok: boolean
  active?: boolean
  ownerName?: string
  plan?: string
  planLabel?: string
  purchaseType?: LicensePurchaseType
  purchaseTypeLabel?: string
  validUntil?: string | null
  nextBillAt?: string | null
}

export async function fetchLicenseSummary(): Promise<LicenseSummaryResponse> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, '/license')
  const res = await fetch(url, {
    headers: personalAuthHeaders(tenant),
  })
  const data = (await res.json().catch(() => ({}))) as LicenseSummaryResponse & { error?: string }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
  }
  return data
}
