export type RemoteSessionTypeV1 = 'dso' | 'variable_star'

export type RemoteSavedSessionFormV1 = {
  sessionType: RemoteSessionTypeV1
  requestName: string
  raHourPart: string
  raMinutePart: string
  raSecondPart: string
  decSign: string
  decDegreePart: string
  decMinutePart: string
  decSecondPart: string
  sessionPassword: string
  /** Legacy sessions may still carry `stacked_master` in stored JSON. */
  outputMode: 'raw_zip' | 'stacked_master' | 'none'
  cameraCoolingTempC?: -10 | 0
  filterPlans: Array<{ filterName: string; count: string; exposureSeconds: string }>
  variableStarBlockHours: number
  variableStarListSelection: string
  variableStarFilterSelection: string[]
  catalogQuery: string
  projectMode?: boolean
}

export type SavedSessionEntry = {
  id: string
  name: string
  savedAt: string
  updatedAt: string
  form: RemoteSavedSessionFormV1
}

const STORAGE_KEY = 'borean-remote-saved-sessions'

function readAll(): SavedSessionEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as SavedSessionEntry[]
  } catch {
    return []
  }
}

function writeAll(entries: SavedSessionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export function fetchLocalSavedSessions(): SavedSessionEntry[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function saveLocalSavedSession(input: {
  name: string
  form: RemoteSavedSessionFormV1
}): { ok: true; session: SavedSessionEntry } | { ok: false; error: string } {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Session name is required.' }
  const now = new Date().toISOString()
  const all = readAll()
  const existing = all.find((s) => s.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    existing.form = input.form
    existing.updatedAt = now
    writeAll(all)
    return { ok: true, session: existing }
  }
  const session: SavedSessionEntry = {
    id: crypto.randomUUID(),
    name,
    savedAt: now,
    updatedAt: now,
    form: input.form,
  }
  all.push(session)
  writeAll(all)
  return { ok: true, session }
}

export function loadLocalSavedSessionByName(name: string): SavedSessionEntry | null {
  const key = name.trim().toLowerCase()
  if (!key) return null
  return readAll().find((s) => s.name.toLowerCase() === key) ?? null
}
