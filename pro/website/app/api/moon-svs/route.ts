import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

const SVS_YEAR_IDS: Record<number, number> = {
  2024: 5187,
  2025: 5415,
  2026: 5587,
}

function svsImageUrl(year: number, frame: number): string {
  const visId = SVS_YEAR_IDS[year]
  if (!visId) return ''
  const hundred = Math.floor(visId / 100) * 100
  const dir = `a${String(hundred).padStart(6, '0')}/a${String(visId).padStart(6, '0')}`
  const frameStr = String(frame).padStart(4, '0')
  return `https://svs.gsfc.nasa.gov/vis/a000000/${dir}/frames/730x730_1x1_30p/moon.${frameStr}.jpg`
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const yearRaw = Number(searchParams.get('year'))
  const frameRaw = Number(searchParams.get('frame'))
  if (!Number.isFinite(yearRaw) || !Number.isFinite(frameRaw)) {
    return new Response('Bad request: year and frame are required integers.', { status: 400 })
  }
  const year = Math.trunc(yearRaw)
  const frame = Math.max(1, Math.min(8760, Math.trunc(frameRaw)))
  const upstream = svsImageUrl(year, frame)
  if (!upstream) {
    return new Response(`Unsupported year ${year}.`, { status: 400 })
  }
  try {
    const res = await fetch(upstream, {
      headers: { Accept: 'image/jpeg,image/*;q=0.9,*/*;q=0.8' },
      next: { revalidate: 86400 * 30 },
    })
    if (!res.ok) {
      return new Response(`Upstream NASA SVS returned ${res.status}.`, { status: 502 })
    }
    const buf = await res.arrayBuffer()
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=2592000, immutable',
      },
    })
  } catch {
    return new Response('Failed to fetch moon image from NASA SVS.', { status: 502 })
  }
}
