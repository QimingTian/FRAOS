import { NextResponse } from 'next/server'
import { loadVariableStarCatalog } from '@/lib/variable-star-catalog'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const stars = await loadVariableStarCatalog()
    return NextResponse.json({ ok: true as const, total: stars.length, stars })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load catalog'
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 })
  }
}
