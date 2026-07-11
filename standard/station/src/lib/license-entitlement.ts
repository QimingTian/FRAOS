import type { LocalLicenseStatus } from './station-api'
import { formatLicenseDate } from './license-display'

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
