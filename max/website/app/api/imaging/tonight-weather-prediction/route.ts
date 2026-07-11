import { contentJson, contentOptions } from '@/lib/content/cors'
import { evaluateTonightWeatherPrediction } from '@/lib/content/tonight-weather-prediction'

export const runtime = 'nodejs'

export function OPTIONS() {
  return contentOptions()
}

/** Legacy public route — prefer /api/personal/{tenantId}/imaging/tonight-weather-prediction. */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const lat = Number(requestUrl.searchParams.get('lat') ?? '0')
  const lon = Number(requestUrl.searchParams.get('lon') ?? '0')
  const startSecParam = requestUrl.searchParams.get('startSec')
  const endSecParam = requestUrl.searchParams.get('endSec')
  const parsedStartSec = startSecParam ? Number(startSecParam) : NaN
  const parsedEndSec = endSecParam ? Number(endSecParam) : NaN

  try {
    const result = await evaluateTonightWeatherPrediction({
      lat,
      lon,
      startSec: Number.isFinite(parsedStartSec) ? parsedStartSec : undefined,
      endSec: Number.isFinite(parsedEndSec) ? parsedEndSec : undefined,
    })
    if (!result.ok) {
      const status = result.error.includes('configured') ? 400 : 502
      return contentJson(result, status)
    }
    return contentJson(result)
  } catch (error) {
    console.error('[tonight-weather-prediction] failed', error)
    return contentJson({ ok: false as const, error: 'Unable to evaluate weather prediction' }, 500)
  }
}
