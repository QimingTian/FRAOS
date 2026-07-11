import { getDb } from './db.js'
import { randomUUID } from 'node:crypto'

export type AdminClosedWindow = {
  id: string
  startIso: string
  endIso: string
  createdAtIso: string
  description?: string
}

function ensureTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS admin_closed_windows (
      id TEXT PRIMARY KEY,
      start_iso TEXT NOT NULL,
      end_iso TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      description TEXT
    );
  `)
}

function rowToWindow(row: Record<string, unknown>): AdminClosedWindow {
  const description =
    typeof row.description === 'string' && row.description.trim()
      ? row.description.trim().slice(0, 200)
      : undefined
  return {
    id: String(row.id),
    startIso: String(row.start_iso),
    endIso: String(row.end_iso),
    createdAtIso: String(row.created_at_iso),
    ...(description ? { description } : {}),
  }
}

export function listAdminClosedWindows(): AdminClosedWindow[] {
  ensureTable()
  const rows = getDb()
    .prepare(`SELECT * FROM admin_closed_windows ORDER BY start_iso ASC`)
    .all() as Record<string, unknown>[]
  return rows.map(rowToWindow)
}

export function addAdminClosedWindow(
  startIso: string,
  endIso: string,
  description: string
): AdminClosedWindow | { error: string } {
  ensureTable()
  const startMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { error: 'Invalid time range' }
  }
  const desc = description.trim().slice(0, 200)
  if (!desc) return { error: 'description is required' }
  const next: AdminClosedWindow = {
    id: randomUUID(),
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    createdAtIso: new Date().toISOString(),
    description: desc,
  }
  getDb()
    .prepare(
      `INSERT INTO admin_closed_windows (id, start_iso, end_iso, created_at_iso, description)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(next.id, next.startIso, next.endIso, next.createdAtIso, next.description)
  return next
}

export function removeAdminClosedWindow(id: string): boolean {
  ensureTable()
  const result = getDb().prepare(`DELETE FROM admin_closed_windows WHERE id = ?`).run(id)
  return result.changes > 0
}

export function getAdminClosedWindowsInRange(
  startMs: number,
  endMs: number
): Array<{ startMs: number; endMs: number }> {
  const all = listAdminClosedWindows()
  const out: Array<{ startMs: number; endMs: number }> = []
  for (const w of all) {
    const s = Date.parse(w.startIso)
    const e = Date.parse(w.endIso)
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue
    const overlapStart = Math.max(startMs, s)
    const overlapEnd = Math.min(endMs, e)
    if (overlapEnd > overlapStart) out.push({ startMs: overlapStart, endMs: overlapEnd })
  }
  return out.sort((a, b) => a.startMs - b.startMs)
}

export function isWithinAdminClosedWindow(atMs: number): boolean {
  return getAdminClosedWindowAt(atMs) != null
}

export function getAdminClosedWindowAt(atMs: number): AdminClosedWindow | null {
  for (const w of listAdminClosedWindows()) {
    const s = Date.parse(w.startIso)
    const e = Date.parse(w.endIso)
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue
    if (atMs >= s && atMs < e) return w
  }
  return null
}
