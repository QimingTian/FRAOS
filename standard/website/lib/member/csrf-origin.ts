import type { NextRequest } from 'next/server'

const ALLOWED_HOSTS = new Set([
  'YOUR_DOMAIN',
  'YOUR_DOMAIN',
  'localhost',
  '127.0.0.1',
])

function hostFromUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isSameSiteMutation(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (origin) {
    const host = hostFromUrl(origin)
    if (host && ALLOWED_HOSTS.has(host)) return true
    if (host?.endsWith('.vercel.app')) return true
    return false
  }
  const referer = request.headers.get('referer')
  if (referer) {
    const host = hostFromUrl(referer)
    if (host && ALLOWED_HOSTS.has(host)) return true
    if (host?.endsWith('.vercel.app')) return true
    return false
  }
  return true
}
