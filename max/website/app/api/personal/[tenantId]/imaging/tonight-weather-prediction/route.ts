import { NextRequest } from 'next/server'
import { runWithTenantImaging } from '@/lib/cloud/personal-imaging/ctx'
import { getObservatorySite } from '@/lib/cloud/personal-imaging/observatory-site'
import { personalJson, personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'
import { evaluateTonightWeatherPrediction } from '@/lib/content/tonight-weather-prediction'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied

  const requestUrl = new URL(request.url)
  const startSecParam = requestUrl.searchParams.get('startSec')
  const endSecParam = requestUrl.searchParams.get('endSec')
  const latParam = requestUrl.searchParams.get('lat')
  const lonParam = requestUrl.searchParams.get('lon')
  const parsedStartSec = startSecParam ? Number(startSecParam) : NaN
  const parsedEndSec = endSecParam ? Number(endSecParam) : NaN
  const queryLat = latParam ? Number(latParam) : NaN
  const queryLon = lonParam ? Number(lonParam) : NaN

  return runWithTenantImaging(tenantId, async () => {
    const site = getObservatorySite()
    const lat =
      site.lat !== 0 || site.lon !== 0
        ? site.lat
        : Number.isFinite(queryLat)
          ? queryLat
          : site.lat
    const lon =
      site.lat !== 0 || site.lon !== 0
        ? site.lon
        : Number.isFinite(queryLon)
          ? queryLon
          : site.lon

    try {
      const result = await evaluateTonightWeatherPrediction({
        lat,
        lon,
        startSec: Number.isFinite(parsedStartSec) ? parsedStartSec : undefined,
        endSec: Number.isFinite(parsedEndSec) ? parsedEndSec : undefined,
      })
      if (!result.ok) return personalJson(result, result.error.includes('configured') ? 400 : 502)
      return personalJson(result)
    } catch (error) {
      console.error('[personal tonight-weather-prediction] failed', error)
      return personalJson({ ok: false as const, error: 'Unable to evaluate weather prediction' }, 500)
    }
  })
}
