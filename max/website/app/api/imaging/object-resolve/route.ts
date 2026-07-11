import { NextRequest } from 'next/server'
import { contentJson, contentOptions } from '@/lib/content/cors'

export const runtime = 'nodejs'

type ParsedResolvedObject = {
  canonicalName: string
  aliases: string[]
  raHours: number
  decDeg: number
}

function degreesToRaParts(raDeg: number) {
  const totalSeconds = (raDeg / 15) * 3600
  let hour = Math.floor(totalSeconds / 3600)
  let minute = Math.floor((totalSeconds - hour * 3600) / 60)
  let second = Number((totalSeconds - hour * 3600 - minute * 60).toFixed(2))
  if (second >= 60) { second -= 60; minute += 1 }
  if (minute >= 60) { minute -= 60; hour += 1 }
  if (hour >= 24) hour -= 1
  return { hour, minute, second }
}

function degreesToDecParts(decDeg: number) {
  const sign: '+' | '-' = decDeg >= 0 ? '+' : '-'
  const abs = Math.abs(decDeg)
  const totalSeconds = abs * 3600
  let degree = Math.floor(totalSeconds / 3600)
  let minute = Math.floor((totalSeconds - degree * 3600) / 60)
  let second = Number((totalSeconds - degree * 3600 - minute * 60).toFixed(2))
  if (second >= 60) { second -= 60; minute += 1 }
  if (minute >= 60) { minute -= 60; degree += 1 }
  return { sign, degree, minute, second }
}

function parseSesameXml(xml: string): ParsedResolvedObject | null {
  const raMatch = xml.match(/<jradeg>([^<]+)<\/jradeg>/i)
  const decMatch = xml.match(/<jdedeg>([^<]+)<\/jdedeg>/i)
  if (!raMatch || !decMatch) return null
  const raDeg = Number(raMatch[1])
  const decDeg = Number(decMatch[1])
  if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg)) return null
  const canonicalName =
    xml.match(/<oname>([^<]+)<\/oname>/i)?.[1]?.trim() ??
    xml.match(/<name>([^<]+)<\/name>/i)?.[1]?.trim() ??
    'Unknown target'
  const aliases = Array.from(xml.matchAll(/<alias>([^<]+)<\/alias>/gi))
    .map((m) => m[1]?.trim())
    .filter((v): v is string => Boolean(v))
    .slice(0, 12)
  return {
    canonicalName,
    aliases,
    raHours: Number((raDeg / 15).toFixed(8)),
    decDeg: Number(decDeg.toFixed(8)),
  }
}

export function OPTIONS() {
  return contentOptions()
}

const SESAME_MIRRORS = [
  {
    label: 'Strasbourg (CDS)',
    url: (q: string) =>
      `https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-oxp/~SNV?${encodeURIComponent(q)}`,
  },
  {
    label: 'Harvard CfA (VizieR mirror)',
    url: (q: string) =>
      `https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oxp/~SNV?${encodeURIComponent(q)}`,
  },
]

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')?.trim() ?? ''
  if (!query) return contentJson({ ok: false as const, error: 'query is required' }, 400)
  if (query.length > 120) return contentJson({ ok: false as const, error: 'query is too long' }, 400)

  let lastError = 'Catalog lookup unavailable right now.'
  let sawHttpOk = false

  for (let i = 0; i < SESAME_MIRRORS.length; i++) {
    const mirror = SESAME_MIRRORS[i]!
    try {
      const res = await fetch(mirror.url(query), {
        method: 'GET',
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
        cache: 'no-store',
      })
      if (!res.ok) {
        lastError = `Name resolver (${mirror.label}) failed (${res.status}).`
        continue
      }
      sawHttpOk = true
      const parsed = parseSesameXml(await res.text())
      if (parsed) {
        return contentJson({
          ok: true as const,
          object: {
            query,
            canonicalName: parsed.canonicalName,
            aliases: parsed.aliases,
            raHours: parsed.raHours,
            decDeg: parsed.decDeg,
            ra: degreesToRaParts(parsed.raHours * 15),
            dec: degreesToDecParts(parsed.decDeg),
          },
        })
      }
      lastError = 'Target not found. Try a name like M31, NGC 7000, or IC 434.'
    } catch {
      lastError = 'Catalog lookup unavailable right now.'
    }
  }

  return contentJson({ ok: false as const, error: lastError }, sawHttpOk ? 404 : 502)
}
