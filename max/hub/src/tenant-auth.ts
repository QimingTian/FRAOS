import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseTenantSecrets(): Record<string, string> {
  const raw = process.env.PERSONAL_TENANT_SECRETS?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const out: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.trim()) out[key] = value.trim()
      }
      if (Object.keys(out).length > 0) return out
    } catch {
      /* fall through */
    }
  }
  try {
    const devPath = path.resolve(__dirname, '../../build-config/tenant.dev.json')
    const dev = JSON.parse(fs.readFileSync(devPath, 'utf8')) as {
      tenantId?: string
      apiSecret?: string
    }
    if (dev.tenantId && dev.apiSecret) {
      return { [dev.tenantId]: dev.apiSecret }
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function personalTenantSecret(tenantId: string): string | undefined {
  return parseTenantSecrets()[tenantId]
}
