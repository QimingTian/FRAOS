import crypto from 'crypto'

import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { kvDel, kvEnabled, kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import {
  getMemberById,
  isAdminUser,
  syncBootstrapAdminRole,
  toPublicMemberUser,
  type MemberUser,
  type PublicMemberUser,
} from '@/lib/member/member-store'

export const MEMBER_SESSION_COOKIE = 'borean_session'

const SESSION_KEY_PREFIX = 'borean-member-session:'
const PERSISTENT_SESSION_MS = 90 * 24 * 60 * 60 * 1000

type SessionPayload = {
  userId: string
  expiresAt: string
  createdAt: string
}

type GlobalAuthSessions = typeof globalThis & {
  __borean_member_auth_sessions__?: Record<string, SessionPayload>
}

function memorySessions(): Record<string, SessionPayload> {
  const g = globalThis as GlobalAuthSessions
  if (!g.__borean_member_auth_sessions__) g.__borean_member_auth_sessions__ = {}
  return g.__borean_member_auth_sessions__
}

function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

async function readSession(token: string): Promise<SessionPayload | undefined> {
  if (!token) return undefined
  if (kvEnabled()) {
    return kvGetJson<SessionPayload>(sessionKey(token))
  }
  return memorySessions()[token]
}

async function writeSession(token: string, payload: SessionPayload): Promise<void> {
  if (kvEnabled()) {
    await kvSetJson(sessionKey(token), payload)
    return
  }
  memorySessions()[token] = payload
}

async function deleteSession(token: string): Promise<void> {
  if (kvEnabled()) {
    await kvDel(sessionKey(token))
    return
  }
  delete memorySessions()[token]
}

function cookieOptions(maxAgeSec: number) {
  const secure = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  }
}

export async function createMemberSession(userId: string): Promise<{ token: string; maxAgeSec: number }> {
  const maxAgeMs = PERSISTENT_SESSION_MS
  const token = generateToken()
  const now = new Date()
  const payload: SessionPayload = {
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + maxAgeMs).toISOString(),
  }
  await writeSession(token, payload)
  return { token, maxAgeSec: Math.floor(maxAgeMs / 1000) }
}

export function buildSessionCookie(token: string, maxAgeSec: number) {
  return {
    name: MEMBER_SESSION_COOKIE,
    value: token,
    ...cookieOptions(maxAgeSec),
  }
}

export function buildClearSessionCookie() {
  return {
    name: MEMBER_SESSION_COOKIE,
    value: '',
    ...cookieOptions(0),
  }
}

function readTokenFromRequest(request: NextRequest): string | undefined {
  const authorization = request.headers.get('authorization')?.trim()
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const bearer = authorization.slice(7).trim()
    if (bearer) return bearer
  }
  const raw = request.cookies.get(MEMBER_SESSION_COOKIE)?.value
  return raw && raw.length > 0 ? raw : undefined
}

async function resolveUserFromToken(token: string | undefined): Promise<MemberUser | null> {
  if (!token) return null
  const session = await readSession(token)
  if (!session?.userId || !session.expiresAt) return null
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await deleteSession(token)
    return null
  }
  const user = await getMemberById(session.userId)
  if (!user) return null
  return syncBootstrapAdminRole(user)
}

export async function getCurrentUser(request: NextRequest): Promise<MemberUser | null> {
  return resolveUserFromToken(readTokenFromRequest(request))
}

export async function getCurrentUserFromCookies(): Promise<MemberUser | null> {
  const jar = await cookies()
  const token = jar.get(MEMBER_SESSION_COOKIE)?.value
  return resolveUserFromToken(token)
}

export async function destroyMemberSession(request: NextRequest): Promise<void> {
  const token = readTokenFromRequest(request)
  if (token) await deleteSession(token)
}

export type AuthErrorBody = { ok: false; error: string }

export async function requireUser(request: NextRequest): Promise<
  | { ok: true; user: MemberUser; publicUser: PublicMemberUser }
  | { ok: false; status: number; body: AuthErrorBody }
> {
  const user = await getCurrentUser(request)
  if (!user) {
    return { ok: false, status: 401, body: { ok: false, error: 'Authentication required.' } }
  }
  return { ok: true, user, publicUser: toPublicMemberUser(user) }
}

export async function requireAdmin(request: NextRequest): Promise<
  | { ok: true; user: MemberUser; publicUser: PublicMemberUser }
  | { ok: false; status: number; body: AuthErrorBody }
> {
  const result = await requireUser(request)
  if (!result.ok) return result
  if (!isAdminUser(result.user)) {
    return { ok: false, status: 403, body: { ok: false, error: 'Admin access required.' } }
  }
  return result
}
