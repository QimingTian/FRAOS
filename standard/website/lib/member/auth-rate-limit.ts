import type { NextRequest } from 'next/server'
import { kvIncrWithExpire } from '@/lib/cloud/kv-rest'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function memoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = buckets.get(key)
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count += 1
  return true
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000))
  const kvCount = await kvIncrWithExpire(`ratelimit:${key}`, windowSec)
  if (typeof kvCount === 'number') {
    return kvCount <= limit
  }
  return memoryRateLimit(key, limit, windowMs)
}

export function clientIpKey(request: NextRequest, route: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
  return `${route}:${ip}`
}

export async function checkAuthRateLimitAsync(
  request: NextRequest,
  route: string,
  limit: number,
  windowMs = 15 * 60 * 1000
): Promise<boolean> {
  return checkRateLimit(clientIpKey(request, route), limit, windowMs)
}
