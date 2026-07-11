import { getLocalLicenseStatus, type LocalLicenseStatus } from './control-app-api'
import { formatLicenseDate } from './license-display'

export type LicenseEntitlement =
  | { status: 'active' }
  | { status: 'missing' }
  | { status: 'expired'; validUntil: string | null; message: string }

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** License gate uses the on-disk tenant.json only — no server round-trip. */
export async function resolveLicenseEntitlement(): Promise<LicenseEntitlement> {
  if (!isTauri()) {
    return import.meta.env.DEV ? { status: 'active' } : { status: 'missing' }
  }

  const local = await getLocalLicenseStatus()
  if (!local.installed) return { status: 'missing' }
  if (local.expired) {
    const untilLabel = formatLicenseDate(local.validUntil)
    return {
      status: 'expired',
      validUntil: local.validUntil,
      message: untilLabel
        ? `Your license expired on ${untilLabel}. Import an updated tenant.json or sign in again.`
        : 'Your license file has expired. Import an updated tenant.json or sign in again.',
    }
  }
  return { status: 'active' }
}

export function entitlementAllowsAppUse(entitlement: LicenseEntitlement): boolean {
  return entitlement.status === 'active'
}

export function localLicenseView(local: LocalLicenseStatus) {
  const untilLabel = formatLicenseDate(local.validUntil)
  return {
    active: local.valid,
    inactiveNote:
      local.expired && untilLabel
        ? `Expired on ${untilLabel} (read from tenant.json on this device).`
        : local.expired
          ? 'Expired according to tenant.json on this device.'
          : null,
    validUntil: local.validUntil,
  }
}
