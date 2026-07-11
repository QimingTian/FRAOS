import { NextRequest, NextResponse } from 'next/server'
import { issueMemberHubToken } from '@/lib/cloud/member-hub-token'
import { listMaxSitesForMember } from '@/lib/cloud/max-sites'
import {
  controlReleaseManifest,
  stationReleaseManifest,
} from '@/lib/cloud/release-manifest'
import { getProTeamContextForMember } from '@/lib/cloud/pro-team'
import { loadTenantSecret, primaryTenantConfigForMember } from '@/lib/cloud/tenant-registry'
import { requireUser } from '@/lib/member/member-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const access = await primaryTenantConfigForMember(auth.user.id)
  if (!access) {
    return NextResponse.json(
      { ok: false, error: 'No FRAOS license found on this account. Redeem a promotion code on the website first.' },
      { status: 404 }
    )
  }

  const control = controlReleaseManifest(access.tenantConfig.plan)
  const station = stationReleaseManifest()
  const teamContext = await getProTeamContextForMember(auth.user.id)
  const apiSecret = await loadTenantSecret(access.tenantConfig.tenantId)
  const memberHubToken =
    access.teamRole && apiSecret
      ? issueMemberHubToken({
          memberId: auth.user.id,
          tenantId: access.tenantConfig.tenantId,
          role: access.teamRole,
          apiSecret,
        })
      : undefined

  const maxSites =
    access.tenantConfig.plan === 'max'
      ? (await listMaxSitesForMember(auth.user.id)).map((site) => ({
          tenantId: site.tenantId,
          displayName: site.displayName,
          apiBaseUrl: site.apiBaseUrl,
          apiSecret: site.apiSecret,
          validUntil: site.validUntil,
        }))
      : undefined

  return NextResponse.json({
    ok: true,
    tenantConfig: access.tenantConfig,
    memberId: auth.user.id,
    ...(access.teamRole ? { teamRole: access.teamRole } : {}),
    ...(access.teamCode ? { teamCode: access.teamCode } : {}),
    ...(memberHubToken ? { memberHubToken } : {}),
    ...(maxSites ? { maxSites } : {}),
    ...(teamContext
      ? {
          teamDisplayName: teamContext.team.displayName,
        }
      : {}),
    downloads: {
      controlWindows: control.downloadUrlWindows,
      controlMac: control.downloadUrlMac,
      stationWindows: station.downloadUrlWindows,
    },
  })
}
