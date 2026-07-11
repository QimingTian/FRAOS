/** Per observatory site — Standard ships with 10 GB included cloud storage. */
export const STANDARD_SITE_STORAGE_GB = 10

export type SiteStoragePlan = 'standard' | 'pro' | 'max' | 'ultra'

const GB = 1024 ** 3

export function siteStorageLimitBytes(plan: SiteStoragePlan = 'standard'): number {
  switch (plan) {
    case 'standard':
      return STANDARD_SITE_STORAGE_GB * GB
    case 'pro':
      return 10 * GB
    case 'max':
      return 50 * GB
    case 'ultra':
      return 100 * GB
    default:
      return STANDARD_SITE_STORAGE_GB * GB
  }
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${Math.round(bytes)} B`
}
