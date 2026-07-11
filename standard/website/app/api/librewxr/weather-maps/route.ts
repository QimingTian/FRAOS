import { NextResponse } from 'next/server'
import { contentJson, contentOptions } from '@/lib/content/cors'
import { librewxrApiBaseUrl, type LibrewxrWeatherMaps } from '@/lib/content/librewxr'

export const runtime = 'nodejs'

export function OPTIONS() {
  return contentOptions()
}

export async function GET() {
  const base = librewxrApiBaseUrl()
  try {
    const res = await fetch(`${base}/public/weather-maps.json`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Borean Astro/1.0 (Web)' },
    })
    if (!res.ok) {
      return contentJson({ error: `LibreWXR metadata HTTP ${res.status}` }, 502)
    }
    const data = (await res.json()) as LibrewxrWeatherMaps
    return contentJson({ ...data, host: base, proxied: true as const })
  } catch (e) {
    return contentJson(
      { error: e instanceof Error ? e.message : 'LibreWXR metadata fetch failed' },
      502
    )
  }
}
