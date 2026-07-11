'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardPanel } from '@/app/account/dashboard-panel'

type ProTeamMember = {
  memberId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  email: string
  displayName: string
}

type ProTeamPayload = {
  ok?: boolean
  error?: string
  team?: {
    teamId: string
    tenantId: string
    displayName: string
    teamCode?: string
    role: 'owner' | 'admin' | 'member'
  }
  members?: ProTeamMember[]
}

const actionButtonClass =
  'btn-chip'

export function ProTeamSection({ className = '' }: { className?: string }) {
  const [payload, setPayload] = useState<ProTeamPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pro/team', { credentials: 'include', cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as ProTeamPayload
      if (res.status === 404) {
        setPayload(null)
        return
      }
      if (!res.ok || !data.ok || !data.team) {
        setError(typeof data.error === 'string' ? data.error : 'Could not load team.')
        return
      }
      setPayload(data)
    } catch {
      setError('Could not load team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy team code.')
    }
  }

  async function handleRegenerateCode() {
    if (!payload?.team?.teamCode) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/pro/team/regenerate-code', {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; teamCode?: string }
      if (!res.ok || !data.ok || !data.teamCode) {
        setError(data.error ?? 'Could not regenerate team code.')
        return
      }
      await load()
    } catch {
      setError('Could not regenerate team code.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveMember(memberId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pro/team/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not remove member.')
        return
      }
      await load()
    } catch {
      setError('Could not remove member.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <DashboardPanel title="Pro team" className={className}>
        <p className="text-sm text-muted">Loading team…</p>
      </DashboardPanel>
    )
  }

  if (!payload?.team) {
    return null
  }

  const { team, members = [] } = payload
  const isOwner = team.role === 'owner'

  return (
    <DashboardPanel title="Pro team" className={className}>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted">
            {team.displayName}
            <span className="mx-2 text-muted/40">·</span>
            <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs capitalize text-fg">
              {team.role}
            </span>
          </p>
        </div>

        {isOwner && team.teamCode ? (
          <div className="glass-inset p-5">
            <p className="text-sm text-muted">Team code — share with members to join at checkout</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-2xl font-semibold tracking-widest text-fg">{team.teamCode}</span>
              <button
                type="button"
                onClick={() => void handleCopyCode(team.teamCode!)}
                className={actionButtonClass}
                disabled={busy}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => void handleRegenerateCode()}
                className={actionButtonClass}
                disabled={busy}
              >
                Regenerate
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-sm font-medium text-fg">Members ({members.length})</p>
          <ul className="mt-3 divide-y divide-white/10">
            {members.map((member) => (
              <li key={member.memberId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm text-fg">{member.displayName}</p>
                  <p className="text-xs text-muted">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && member.role !== 'owner' ? (
                    <>
                      <select
                        className="btn-chip px-2 py-0.5"
                        value={member.role === 'admin' ? 'admin' : 'member'}
                        disabled={busy}
                        onChange={async (e) => {
                          const role = e.target.value as 'admin' | 'member'
                          setBusy(true)
                          setError(null)
                          try {
                            const res = await fetch(
                              `/api/pro/team/members/${encodeURIComponent(member.memberId)}`,
                              {
                                method: 'PATCH',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ role }),
                              }
                            )
                            const data = (await res.json()) as { ok?: boolean; error?: string }
                            if (!res.ok || !data.ok) {
                              setError(data.error ?? 'Could not update role.')
                              return
                            }
                            await load()
                          } catch {
                            setError('Could not update role.')
                          } finally {
                            setBusy(false)
                          }
                        }}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleRemoveMember(member.memberId)}
                        className={actionButtonClass}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-xs capitalize text-muted">{member.role}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </DashboardPanel>
  )
}
