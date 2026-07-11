export type CheckStatus = 'ok' | 'warning' | 'error'

export type CheckItem = {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export type PersonalTenantInfo = {
  tenantId: string
  apiBaseUrl: string
  displayName: string
  plan?: string | null
}

export type StationConfig = {
  ninaInstallDir: string
  jobsDir: string
  ninaOutputDir: string
  r2Enabled: boolean
  autostartEnabled: boolean
  pythonPath: string
  pduEnabled: boolean
  pduBaseUrl: string
  pduUser: string
  pduPassword: string
  siteDisplayName: string
}

export type LocalLicenseStatus = {
  installed: boolean
  valid: boolean
  expired: boolean
  validUntil: string | null
  plan: string | null
}
