'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { PublicMemberUser } from '@/lib/member/member-store'

export type MemberProfile = PublicMemberUser

type MemberState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'authenticated'; user: MemberProfile }

type MemberContextValue = MemberState & {
  refresh: () => Promise<void>
  completeSignIn: (user: MemberProfile) => void
  signOut: () => Promise<void>
  isAdmin: boolean
}

const MemberContext = createContext<MemberContextValue | null>(null)

async function fetchCurrentMember(): Promise<MemberProfile | null> {
  const res = await fetch(`/api/auth/me?_=${Date.now()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok && data?.ok === true && data.user) {
    return data.user as MemberProfile
  }
  return null
}

export function MemberProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MemberState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const user = await fetchCurrentMember()
      setState(user ? { status: 'authenticated', user } : { status: 'guest' })
    } catch {
      setState({ status: 'guest' })
    }
  }, [])

  const completeSignIn = useCallback((user: MemberProfile) => {
    setState({ status: 'authenticated', user })
  }, [])

  const signOut = useCallback(async () => {
    setState({ status: 'guest' })
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' })
    } catch {
      /* still clear client state */
    }
    try {
      const user = await fetchCurrentMember()
      setState(user ? { status: 'authenticated', user } : { status: 'guest' })
    } catch {
      setState({ status: 'guest' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<MemberContextValue>(
    () => ({
      ...state,
      refresh,
      completeSignIn,
      signOut,
      isAdmin: state.status === 'authenticated' && state.user.role === 'admin',
    }),
    [state, refresh, completeSignIn, signOut]
  )

  return <MemberContext.Provider value={value}>{children}</MemberContext.Provider>
}

export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext)
  if (!ctx) {
    throw new Error('useMember must be used within MemberProvider')
  }
  return ctx
}
