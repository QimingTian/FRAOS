import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type Express, type Request, type Response } from 'express'
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

function devTenantLicense(): { plan: string; planLabel: string } {
  try {
    const devPath = join(dirname(fileURLToPath(import.meta.url)), '../../build-config/tenant.dev.json')
    const dev = JSON.parse(readFileSync(devPath, 'utf8')) as { plan?: string }
    const plan = dev.plan?.trim().toLowerCase() === 'pro' ? 'pro' : 'standard'
    return {
      plan,
      planLabel: plan === 'pro' ? 'FRAOS Pro' : 'FRAOS Standard',
    }
  } catch {
    return { plan: 'standard', planLabel: 'FRAOS Standard' }
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
    const license = devTenantLicense()
    res.json({
      ok: true,
      active: true,
      ownerName: 'Developer',
      plan: license.plan,
      planLabel: license.planLabel,
      purchaseType: 'one_time',
      purchaseTypeLabel: 'One-time purchase',
      validUntil: null,
      nextBillAt: null,
    })
  })

  app.get('/api/personal/:tenantId/team', (req, res) => {
    const { tenantId } = req.params
    if (!requireTenant(req, res, tenantId)) return
    res.json({
      ok: true,
      team: {
        teamId: 'dev-team',
        tenantId,
        displayName: 'Developer Team',
        teamCode: 'DEVTEAM1',
        role: 'owner',
      },
      members: [
        {
          memberId: 'dev-owner',
          role: 'owner',
          joinedAt: new Date().toISOString(),
          email: 'owner@local.dev',
          displayName: 'Developer',
        },
      ],
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
