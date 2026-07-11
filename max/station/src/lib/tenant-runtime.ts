/// <reference path="../vite-env.d.ts" />
import { invoke } from '@tauri-apps/api/core'
import type { PersonalTenantConfig } from '@shared/tenant-config'
import tenantConfig from '@tenant-config'

let runtimeCache: PersonalTenantConfig | null = null
let loadPromise: Promise<PersonalTenantConfig> | null = null

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function loadRuntimeTenant(): Promise<PersonalTenantConfig> {
  if (runtimeCache) return runtimeCache
  if (!loadPromise) {
    loadPromise = (async () => {
      if (isTauri()) {
        try {
          const t = await invoke<{
            tenantId: string
            apiBaseUrl: string
            apiSecret: string
            displayName: string
            plan?: string | null
          }>('station_get_tenant_config')
          runtimeCache = {
            tenantId: t.tenantId,
            apiBaseUrl: t.apiBaseUrl,
            apiSecret: t.apiSecret,
            displayName: t.displayName,
          }
          return runtimeCache
        } catch {
          // fall through to baked config
        }
      }
      runtimeCache = tenantConfig as PersonalTenantConfig
      return runtimeCache
    })()
  }
  return loadPromise
}
