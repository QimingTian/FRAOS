import { NextRequest, NextResponse } from 'next/server'
import { isAllowedLibrewxrTilePath, librewxrApiBaseUrl } from '@/lib/content/librewxr'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
}

export const runtime = 'nodejs'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const segments = (await context.params).path
  if (!segments?.length) {
    return NextResponse.json({ error: 'Missing tile path' }, { status: 400, headers: CORS_HEADERS })
  }
  const tilePath = `/${segments.join('/')}`
  if (!isAllowedLibrewxrTilePath(tilePath)) {
    return NextResponse.json({ error: 'Disallowed tile path' }, { status: 400, headers: CORS_HEADERS })
  }
  const upstream = `${librewxrApiBaseUrl()}${tilePath}`
  try {
    const res = await fetch(upstream, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Borean Astro/1.0 (Web)' },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Tile HTTP ${res.status}` }, { status: res.status, headers: CORS_HEADERS })
    }
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: 'Empty tile' }, { status: 502, headers: CORS_HEADERS })
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': res.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=120',
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Tile fetch failed' },
      { status: 502, headers: CORS_HEADERS }
    )
  }
}
