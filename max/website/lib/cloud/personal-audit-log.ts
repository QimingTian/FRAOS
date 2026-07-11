import { kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'

export type PersonalAuditLogEntry = {
  id: string
  at: string
  kind: string
  message: string
  detail?: Record<string, unknown>
}

type Payload = { entries: PersonalAuditLogEntry[] }

const MAX_ENTRIES = 400
const memory = new Map<string, PersonalAuditLogEntry[]>()

function kvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:audit-log`
}

function normalizeEntries(raw: unknown): PersonalAuditLogEntry[] {
  if (!raw || typeof raw !== 'object') return []
  const entries = (raw as Payload).entries
  if (!Array.isArray(entries)) return []
  return entries.filter(
    (e): e is PersonalAuditLogEntry =>
      e != null &&
      typeof e === 'object' &&
      typeof e.id === 'string' &&
      typeof e.at === 'string' &&
      typeof e.kind === 'string' &&
      typeof e.message === 'string'
  )
}

async function readEntries(tenantId: string): Promise<PersonalAuditLogEntry[]> {
  if (memory.has(tenantId)) return [...(memory.get(tenantId) ?? [])]
  const remote = await kvGetJson<Payload>(kvKey(tenantId))
  const normalized = normalizeEntries(remote)
  memory.set(tenantId, normalized)
  return [...normalized]
}

async function writeEntries(tenantId: string, entries: PersonalAuditLogEntry[]): Promise<void> {
  const trimmed = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries
  memory.set(tenantId, trimmed)
  await kvSetJson(kvKey(tenantId), { entries: trimmed })
}

export async function personalAppendAuditLog(
  tenantId: string,
  input: {
    kind: string
    message: string
    detail?: Record<string, unknown>
    at?: string
  }
): Promise<void> {
  try {
    const prev = await readEntries(tenantId)
    const entry: PersonalAuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      at: input.at ?? new Date().toISOString(),
      kind: input.kind,
      message: input.message,
      ...(input.detail && Object.keys(input.detail).length > 0 ? { detail: input.detail } : {}),
    }
    await writeEntries(tenantId, [...prev, entry])
  } catch {
    // ignore
  }
}

export async function personalListAuditLog(
  tenantId: string,
  limit = 250
): Promise<PersonalAuditLogEntry[]> {
  const all = await readEntries(tenantId)
  const n = Math.min(Math.max(1, limit), MAX_ENTRIES)
  return [...all].slice(-n).reverse()
}
