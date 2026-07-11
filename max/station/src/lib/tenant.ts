import type { PersonalTenantConfig } from '@shared/tenant-config'
import tenantConfig from '@tenant-config'

export function getPersonalTenant(): PersonalTenantConfig {
  return tenantConfig as PersonalTenantConfig
}
