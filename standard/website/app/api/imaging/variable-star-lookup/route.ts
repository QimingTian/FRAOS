import { contentJson, contentOptions } from '@/lib/content/cors'

export const runtime = 'nodejs'

type VariableStarRow = {
  name: string
  raHours: number
  decDeg: number
  varType: string | null
  periodDays: number | null
  minMag: number | null
  maxMag: number | null
  highPriority: boolean
}

type SimbadTapRow = {
  main_id: string
  ra: number
  dec: number
  period: number | null
  vmin: number | null
  vmax: number | null
  bibcode: string | null
}

function toNumberOrNull(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (c === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

function parseSimbadCsv(csv: string): SimbadTapRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const header = parseCsvLine(lines[0])
  const idxMain = header.findIndex((h) => h === 'main_id')
  const idxRa = header.findIndex((h) => h === 'ra')
  const idxDec = header.findIndex((h) => h === 'dec')
  const idxPeriod = header.findIndex((h) => h === 'period')
  const idxVmin = header.findIndex((h) => h === 'vmin')
  const idxVmax = header.findIndex((h) => h === 'vmax')
  const idxBib = header.findIndex((h) => h === 'bibcode')
  if (idxMain < 0 || idxRa < 0 || idxDec < 0) return []

  const out: SimbadTapRow[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i])
    const main = cols[idxMain]?.replace(/^"(.*)"$/, '$1') ?? ''
    const ra = toNumberOrNull(cols[idxRa])
    const dec = toNumberOrNull(cols[idxDec])
    if (!main || ra == null || dec == null) continue
    out.push({
      main_id: main,
      ra,
      dec,
      period: idxPeriod >= 0 ? toNumberOrNull(cols[idxPeriod]) : null,
      vmin: idxVmin >= 0 ? toNumberOrNull(cols[idxVmin]) : null,
      vmax: idxVmax >= 0 ? toNumberOrNull(cols[idxVmax]) : null,
      bibcode: idxBib >= 0 ? (cols[idxBib]?.replace(/^"(.*)"$/, '$1') ?? null) : null,
    })
  }
  return out
}

function pickBestRow(rows: SimbadTapRow[]): SimbadTapRow | null {
  if (rows.length === 0) return null
  const scored = [...rows].sort((a, b) => {
    const scoreA = (a.period != null ? 4 : 0) + (a.vmin != null ? 2 : 0) + (a.vmax != null ? 1 : 0)
    const scoreB = (b.period != null ? 4 : 0) + (b.vmin != null ? 2 : 0) + (b.vmax != null ? 1 : 0)
    if (scoreA !== scoreB) return scoreB - scoreA
    return String(b.bibcode ?? '').localeCompare(String(a.bibcode ?? ''))
  })
  return scored[0] ?? null
}

async function lookupSimbadVariableStar(query: string): Promise<VariableStarRow | null> {
  const q = query.trim()
  if (!q) return null
  const escaped = q.replace(/'/g, "''")
  const adql =
    "SELECT TOP 20 basic.main_id, basic.ra, basic.dec, mesVar.period, mesVar.vmin, mesVar.vmax, mesVar.bibcode " +
    'FROM ident JOIN basic ON ident.oidref = basic.oid ' +
    'JOIN alltypes ON basic.oid = alltypes.oidref ' +
    'LEFT JOIN mesVar ON basic.oid = mesVar.oidref ' +
    `WHERE (ident.id = '${escaped}' OR basic.main_id = '${escaped}' OR basic.main_id = 'V* ${escaped}') ` +
    "AND alltypes.otypes LIKE '%V*%'"
  const url = new URL('https://simbad.cds.unistra.fr/simbad/sim-tap/sync')
  url.searchParams.set('request', 'doQuery')
  url.searchParams.set('lang', 'adql')
  url.searchParams.set('format', 'csv')
  url.searchParams.set('query', adql)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) return null
  const text = await res.text()
  if (!text || text.includes('<VOTABLE') || text.startsWith('<?xml')) return null
  const rows = parseSimbadCsv(text)
  const best = pickBestRow(rows)
  if (!best) return null
  return {
    name: best.main_id.replace(/^V\*\s+/i, ''),
    raHours: best.ra / 15,
    decDeg: best.dec,
    varType: null,
    periodDays: best.period != null && best.period > 0 ? best.period : null,
    minMag: best.vmin,
    maxMag: best.vmax,
    highPriority: false,
  }
}

export function OPTIONS() {
  return contentOptions()
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const query = (requestUrl.searchParams.get('query') ?? '').trim()
  if (!query) return contentJson({ ok: false, error: 'query is required' }, 400)
  try {
    const star = await lookupSimbadVariableStar(query)
    if (!star) {
      return contentJson({ ok: false, error: `No SIMBAD variable-star match for "${query}".` }, 404)
    }
    return contentJson({ ok: true, source: 'simbad', star })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'SIMBAD lookup failed'
    return contentJson({ ok: false, error: msg }, 502)
  }
}
