import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_PORT = 7841

export function hubPort(): number {
  const raw = process.env.PERSONAL_HUB_PORT ?? process.env.PORT
  const n = raw ? Number(raw) : DEFAULT_PORT
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT
}

export function dataDir(): string {
  const override = process.env.PERSONAL_HUB_DATA_DIR?.trim()
  if (override) return override
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
    return path.join(base, 'BoreanAstro', 'PersonalHub')
  }
  return path.join(os.homedir(), '.boreanastro', 'personal-hub')
}

export function dbPath(): string {
  return path.join(dataDir(), 'hub.db')
}

export function ensureDataDir(): void {
  fs.mkdirSync(dataDir(), { recursive: true })
}

/** Shared with Station Agent when configured (optional in Personal). */
export function imagingQueueSecret(): string {
  return process.env.IMAGING_QUEUE_SECRET?.trim() ?? ''
}
