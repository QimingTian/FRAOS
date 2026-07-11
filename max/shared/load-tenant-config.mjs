import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PersonalTenantConfig } from '../shared/tenant-config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function loadTenantConfigFile(): PersonalTenantConfig {
  const root = path.resolve(__dirname, '..')
  const prod = path.join(root, 'build-config/tenant.json')
  const dev = path.join(root, 'build-config/tenant.dev.json')
  const file = fs.existsSync(prod) ? prod : dev
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as PersonalTenantConfig
  if (!raw.tenantId?.trim() || !raw.apiBaseUrl?.trim() || !raw.apiSecret?.trim()) {
    throw new Error(`Invalid tenant config: ${file}`)
  }
  return {
    tenantId: raw.tenantId.trim(),
    apiBaseUrl: raw.apiBaseUrl.trim().replace(/\/+$/, ''),
    apiSecret: raw.apiSecret.trim(),
    displayName: raw.displayName?.trim() || raw.tenantId,
  }
}

export function tenantConfigJsonForBuild(): string {
  return JSON.stringify(loadTenantConfigFile())
}
