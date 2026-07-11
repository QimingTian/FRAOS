import { NextResponse } from 'next/server'
import { contentJson, contentOptions } from '@/lib/content/cors'
import {
  GEOCOLOR_FRAME_LIMIT,
  NOAA_GOES_GEOCOLOR_INDEX_URL,
  geocolorFramePaths,
  parseGeocolorFrameFilenames,
} from '@/lib/content/noaa-goes'

export const runtime = 'nodejs'

export function OPTIONS() {
  return contentOptions()
}

export async function GET() {
  try {
    const response = await fetch(NOAA_GOES_GEOCOLOR_INDEX_URL, {
      headers: { 'User-Agent': 'Borean Astro/1.0 (Web)' },
      cache: 'no-store',
      redirect: 'error',
    })
    if (!response.ok) {
      return contentJson({ error: `Failed to list frames: ${response.status}` }, response.status)
    }
    const html = await response.text()
    const filenames = parseGeocolorFrameFilenames(html)
    const paths = geocolorFramePaths(filenames, GEOCOLOR_FRAME_LIMIT)
    if (paths.length === 0) {
      return contentJson({ error: 'No GeoColor frames found' }, 502)
    }
    return contentJson({ frames: paths.map((path) => ({ path })) })
  } catch (error) {
    return contentJson(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    )
  }
}
