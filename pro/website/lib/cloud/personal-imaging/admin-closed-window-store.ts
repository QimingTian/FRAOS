import { kvEnabled, kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import { getTenantId } from '@/lib/cloud/personal-imaging/ctx'

export type AdminClosedWindow = {
  id: string
  startIso: string
  endIso: string
  createdAtIso: string
  description?: string
}

type Payload = { windows?: AdminClosedWindow[] }
type GlobalState = typeof globalThis & {
  __fraos_admin_closed_windows__?: Map<string, AdminClosedWindow[]>
}

function memoryMap(): Map<string, AdminClosedWindow[]> {
  const g = globalThis as GlobalState
  if (!g.__fraos_admin_closed_windows__) g.__fraos_admin_closed_windows__ = new Map()
  return g.__fraos_admin_closed_windows__
}

function kvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:admin-closed-windows`
}

function normalize(w: AdminClosedWindow): AdminClosedWindow | null {
  const startMs = Date.parse(w.startIso)
  const endMs = Date.parse(w.endIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  if (!w.id || typeof w.id !== 'string') return null
  const description =
    typeof w.description === 'string' && w.description.trim()
      ? w.description.trim().slice(0, 200)
      : undefined
  return {
    id: w.id,
    startIso: w.startIso,
    endIso: w.endIso,
    createdAtIso:
      typeof w.createdAtIso === 'string' && Number.isFinite(Date.parse(w.createdAtIso))
        ? w.createdAtIso
        : w.startIso,
    ...(description ? { description } : {}),
  }
}

async function readAll(tenantId?: string): Promise<AdminClosedWindow[]> {
  const tid = tenantId ?? getTenantId()
  if (kvEnabled()) {
    const remote = await kvGetJson<Payload>(kvKey(tid))
    const windows = Array.isArray(remote?.windows) ? remote.windows : []
    return windows.map(normalize).filter((x): x is AdminClosedWindow => x != null)
  }
  return [...(memoryMap().get(tid) ?? [])]
}

async function writeAll(windows: AdminClosedWindow[], tenantId?: string): Promise<void> {
  const tid = tenantId ?? getTenantId()
  const sorted = [...windows].sort((a, b) => a.startIso.localeCompare(b.startIso))
  if (kvEnabled()) {
    const ok = await kvSetJson(kvKey(tid), { windows: sorted })
    if (ok) return
  }
  memoryMap().set(tid, sorted)
}

export async function listAdminClosedWindows(tenantId?: string): Promise<AdminClosedWindow[]> {
  return readAll(tenantId)
}

export async function addAdminClosedWindow(
  startIso: string,
  endIso: string,
  description: string,
  tenantId?: string
): Promise<AdminClosedWindow | { error: string }> {
  const startMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { error: 'Invalid time range' }
  }
  const desc = description.trim().slice(0, 200)
  if (!desc) return { error: 'description is required' }
  const next: AdminClosedWindow = {
    id: crypto.randomUUID(),
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    createdAtIso: new Date().toISOString(),
    description: desc,
  }
  const all = await readAll(tenantId)
  all.push(next)
  await writeAll(all, tenantId)
  return next
}

export async function removeAdminClosedWindow(id: string, tenantId?: string): Promise<boolean> {
  const all = await readAll(tenantId)
  const next = all.filter((x) => x.id !== id)
  if (next.length === all.length) return false
  await writeAll(next, tenantId)
  return true
}

export async function getAdminClosedWindowsInRange(
  startMs: number,
  endMs: number,
  tenantId?: string
): Promise<Array<{ startMs: number; endMs: number }>> {
  const all = await readAll(tenantId)
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

export async function isWithinAdminClosedWindow(atMs: number, tenantId?: string): Promise<boolean> {
  const w = await getAdminClosedWindowAt(atMs, tenantId)
  return w != null
}

export async function getAdminClosedWindowAt(
  atMs: number,
  tenantId?: string
): Promise<AdminClosedWindow | null> {
  const all = await readAll(tenantId)
  for (const w of all) {
    const s = Date.parse(w.startIso)
    const e = Date.parse(w.endIso)
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue
    if (atMs >= s && atMs < e) return w
  }
  return null
}
