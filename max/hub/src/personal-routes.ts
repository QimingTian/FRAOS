import express, { type Express, type Request, type Response } from 'express'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mountImagingRoutes } from './imaging/routes.js'
import { personalTenantSecret } from './tenant-auth.js'

const fraosRelease = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../shared/fraos-release.json'),
    'utf8'
  )
) as {
  channel?: string
  station?: { latestVersion?: string; downloadUrlWindows?: string | null }
  control?: {
    latestVersion?: string
    downloadUrlWindows?: string | null
    downloadUrlMac?: string | null
  }
}

function bearerAuthorized(req: Request, tenantId: string): boolean {
  const expected = personalTenantSecret(tenantId)
  if (!expected) return false
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (token === expected) return true
  const q = req.query.access_token ?? req.query.token
  return typeof q === 'string' && q === expected
}

function requireTenant(req: Request, res: Response, tenantId: string): boolean {
  if (!personalTenantSecret(tenantId)) {
    res.status(404).json({ ok: false, error: 'Unknown tenant' })
    return false
  }
  if (!bearerAuthorized(req, tenantId)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return false
  }
  return true
}

export function mountPersonalRoutes(app: Express): void {
  app.get('/api/personal/:tenantId/health', (req, res) => {
    res.json({ ok: true, edition: 'personal', tenantId: req.params.tenantId, hub: 'local' })
  })

  app.get('/api/personal/:tenantId/station/version', (req, res) => {
    res.json({
      ok: true,
      tenantId: req.params.tenantId,
      latestVersion: fraosRelease.station?.latestVersion ?? '0.1.0',
      channel: fraosRelease.channel ?? 'stable',
      downloadUrl: fraosRelease.station?.downloadUrlWindows ?? null,
      downloadUrlWindows: fraosRelease.station?.downloadUrlWindows ?? null,
    })
  })

  app.get('/api/personal/:tenantId/control/version', (req, res) => {
    res.json({
      ok: true,
      tenantId: req.params.tenantId,
      latestVersion: fraosRelease.control?.latestVersion ?? '0.1.0',
      channel: fraosRelease.channel ?? 'stable',
      downloadUrlWindows: fraosRelease.control?.downloadUrlWindows ?? null,
      downloadUrlMac: fraosRelease.control?.downloadUrlMac ?? null,
      downloadUrl:
        fraosRelease.control?.downloadUrlMac ??
        fraosRelease.control?.downloadUrlWindows ??
        null,
    })
  })

  app.get('/api/personal/:tenantId/license', (req, res) => {
    const { tenantId } = req.params
    if (!requireTenant(req, res, tenantId)) return
    res.json({
      ok: true,
      active: true,
      ownerName: 'Developer',
      plan: 'standard',
      planLabel: 'FRAOS Standard',
      purchaseType: 'one_time',
      purchaseTypeLabel: 'One-time purchase',
      validUntil: null,
      nextBillAt: null,
    })
  })

  const personalRouter = express.Router({ mergeParams: true })
  personalRouter.use((req, res, next) => {
    const tenantId = String(req.params.tenantId ?? '')
    if (!requireTenant(req, res, tenantId)) return
    next()
  })
  mountImagingRoutes(personalRouter, {
    tenantId: (req) => String(req.params.tenantId ?? ''),
    requireAuth: true,
  })
  app.use('/api/personal/:tenantId', personalRouter)
}
