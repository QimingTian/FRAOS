import { NextRequest, NextResponse } from 'next/server'
import { resolveNoaaGoesUrl } from '@/lib/content/noaa-goes'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const url = resolveNoaaGoesUrl(request.nextUrl.searchParams.get('url'))
  if (!url) {
    return NextResponse.json({ error: 'Invalid or disallowed NOAA GOES URL' }, { status: 400 })
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Borean Astro/1.0 (Web)' },
      cache: 'no-store',
      redirect: 'error',
    })
    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${response.status}` }, { status: response.status })
    }
    const imageBuffer = await response.arrayBuffer()
    if (imageBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty image data' }, { status: 500 })
    }
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
