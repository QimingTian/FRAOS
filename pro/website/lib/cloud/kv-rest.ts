const KV_URL = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

function enabled(): boolean {
  return Boolean(KV_URL && KV_TOKEN)
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV REST env not configured')
  return fetch(`${KV_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
}

async function redisCommand(command: string, ...args: (string | number)[]): Promise<unknown> {
  const res = await request('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([command, ...args]),
  })
  if (!res.ok) return undefined
  const body = (await res.json()) as { result?: unknown }
  return body.result
}

export async function kvGetString(key: string): Promise<string | undefined> {
  if (!enabled()) return undefined
  try {
    const raw = await redisCommand('GET', key)
    return typeof raw === 'string' ? raw : undefined
  } catch {
    return undefined
  }
}

export async function kvGetJson<T>(key: string): Promise<T | undefined> {
  const raw = await kvGetString(key)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export async function kvSetJson(key: string, value: unknown): Promise<boolean> {
  if (!enabled()) return false
  try {
    const json = JSON.stringify(value)
    const result = await redisCommand('SET', key, json)
    return result === 'OK'
  } catch {
    return false
  }
}

export async function kvDel(key: string): Promise<boolean> {
  if (!enabled()) return false
  try {
    const result = await redisCommand('DEL', key)
    return result === 1 || result === '1'
  } catch {
    return false
  }
}

function parseIncrResult(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

export async function kvIncrWithExpire(key: string, windowSec: number): Promise<number | undefined> {
  if (!enabled()) return undefined
  try {
    const count = await redisCommand('INCR', key)
    if (count === 1) {
      await redisCommand('EXPIRE', key, windowSec)
    }
    return parseIncrResult(count)
  } catch {
    return undefined
  }
}

export function kvEnabled(): boolean {
  return enabled()
}
