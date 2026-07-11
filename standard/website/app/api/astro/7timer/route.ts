import { NextRequest } from 'next/server'
import { contentJson, contentOptions } from '@/lib/content/cors'

export const runtime = 'nodejs'

type SevenTimerPoint = {
  time: string
  cloudCover: number | null
  transparency: number | null
  seeing: number | null
  humidity: number | null
}

function cloudCoverFromCode(code: unknown): number | null {
  const n = Number(code)
  if (!Number.isFinite(n) || n < 1 || n > 9) return null
  const midpoints = [5, 17, 32, 47, 62, 77, 87, 93, 97]
  return midpoints[n - 1] ?? null
}

function transparencyFromCode(code: unknown): number | null {
  const n = Number(code)
  if (!Number.isFinite(n) || n < 1 || n > 9) return null
  const mags = [0.5, 1, 2, 3, 4, 5, 6, 7, 8.5]
  return mags[n - 1] ?? null
}

function seeingFromCode(code: unknown): number | null {
  const n = Number(code)
  if (!Number.isFinite(n) || n < 1 || n > 7) return null
  const arcsec = [0.35, 0.75, 1.25, 1.75, 2.5, 3.5, 5]
  return arcsec[n - 1] ?? null
}

function humidityFromCode(code: unknown): number | null {
  const n = Number(code)
  if (!Number.isFinite(n) || n < 1 || n > 9) return null
  const pct = [10, 25, 37, 50, 62, 75, 87, 93, 97]
  return pct[n - 1] ?? null
}

export function OPTIONS() {
  return contentOptions()
}

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get('lat'))
  const lon = Number(request.nextUrl.searchParams.get('lon'))
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return contentJson({ error: 'Invalid lat' }, 400)
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return contentJson({ error: 'Invalid lon' }, 400)
  }

  const upstream =
    `http://www.7timer.info/bin/api.pl?product=astro&output=json&lon=${lon}&lat=${lat}`

  try {
    const res = await fetch(upstream, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Borean Astro/1.0 (Web)' },
    })
    if (!res.ok) {
      return contentJson({ error: `7Timer HTTP ${res.status}` }, 502)
    }
    const data = (await res.json()) as {
      init?: string
      dataseries?: Array<Record<string, unknown>>
    }

    const init = data.init ?? ''
    const initYear = Number(init.slice(0, 4))
    const initMonth = Number(init.slice(4, 6)) - 1
    const initDay = Number(init.slice(6, 8))
    const initHour = Number(init.slice(8, 10))
    const initMs = Date.UTC(initYear, initMonth, initDay, initHour)

    const points: SevenTimerPoint[] = (data.dataseries ?? []).map((row) => {
      // 7Timer astro `timepoint` is already an hour offset from init (3, 6, 9, …).
      const tp = Number(row.timepoint)
      const timeMs = Number.isFinite(tp) ? initMs + tp * 3600_000 : initMs
      return {
        time: new Date(timeMs).toISOString(),
        cloudCover: cloudCoverFromCode(row.cloudcover),
        transparency: transparencyFromCode(row.transparency),
        seeing: seeingFromCode(row.seeing),
        humidity: humidityFromCode(row.rh2m ?? row.humidity),
      }
    })

    return contentJson({ init, points, proxied: true as const })
  } catch (e) {
    return contentJson(
      { error: e instanceof Error ? e.message : '7Timer fetch failed' },
      502
    )
  }
}
