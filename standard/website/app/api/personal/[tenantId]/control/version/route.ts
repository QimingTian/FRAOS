import {
  controlReleaseManifest,
  detectPlatform,
  pickDownloadUrl,
} from '@/lib/cloud/release-manifest'
import { personalJson, personalOptions } from '@/lib/cloud/route-helpers'
import { loadTenantRegistry } from '@/lib/cloud/tenant-registry'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const registry = await loadTenantRegistry(tenantId)
  const manifest = controlReleaseManifest(registry?.plan)
  const platformParam = new URL(request.url).searchParams.get('platform')
  const platform =
    platformParam === 'windows' || platformParam === 'mac'
      ? platformParam
      : detectPlatform(request.headers.get('user-agent'))
  const downloadUrl = pickDownloadUrl(manifest, platform)

  return personalJson({
    ok: true,
    tenantId,
    latestVersion: manifest.latestVersion,
    channel: manifest.channel,
    releaseNotes: manifest.releaseNotes,
    downloadUrl,
    downloadUrlWindows: manifest.downloadUrlWindows,
    downloadUrlMac: manifest.downloadUrlMac,
  })
}
