'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardPanel } from '@/app/account/dashboard-panel'
import { memberLevelLabel, type MemberRole } from '@/lib/member/member-store'

type Row = {
  id: string
  firstName: string
  lastName: string
  email: string
  username: string
  role: MemberRole
  bootstrapAdmin?: boolean
}

type MembersPayload = {
  ok?: boolean
  members?: Row[]
  total?: number
  canManageAdmins?: boolean
  currentUserId?: string
  error?: string
}

const actionButtonClass =
  'rounded-full border border-white/25 bg-surface px-3 py-1 text-xs font-medium text-fg hover:bg-[#1b1c1c] disabled:opacity-50'

function displayName(row: Row): string {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.username || row.email
}

export function AllMembersSection({ className = '' }: { className?: string }) {
  const [members, setMembers] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [canManageAdmins, setCanManageAdmins] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [demotingId, setDemotingId] = useState<string | null>(null)

  const applyPayload = (data: MembersPayload) => {
    if (Array.isArray(data.members)) {
      setMembers(data.members)
      setTotal(typeof data.total === 'number' ? data.total : data.members.length)
    }
    if (typeof data.canManageAdmins === 'boolean') setCanManageAdmins(data.canManageAdmins)
    if (typeof data.currentUserId === 'string') setCurrentUserId(data.currentUserId)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/members', { credentials: 'include', cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as MembersPayload
      if (!res.ok || data?.ok !== true || !Array.isArray(data.members)) {
        setError(typeof data.error === 'string' ? data.error : 'Could not load members.')
        return
      }
      applyPayload(data)
    } catch {
      setError('Could not load members.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setAsAdmin(row: Row) {
    const name = displayName(row)
    if (!window.confirm(`Set “${name}” (${row.email}) as Admin?`)) return
    setPromotingId(row.id)
    setError(null)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      const data = (await res.json().catch(() => ({}))) as MembersPayload
      if (!res.ok || data?.ok !== true) {
        setError(typeof data.error === 'string' ? data.error : 'Could not update member.')
        return
      }
      applyPayload(data)
    } catch {
      setError('Could not update member.')
    } finally {
      setPromotingId(null)
    }
  }

  async function setAsMember(row: Row) {
    const name = displayName(row)
    if (!window.confirm(`Set “${name}” (${row.email}) as Member? They will lose admin access.`)) return
    setDemotingId(row.id)
    setError(null)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, roleAction: 'member' }),
      })
      const data = (await res.json().catch(() => ({}))) as MembersPayload
      if (!res.ok || data?.ok !== true) {
        setError(typeof data.error === 'string' ? data.error : 'Could not update member.')
        return
      }
      applyPayload(data)
    } catch {
      setError('Could not update member.')
    } finally {
      setDemotingId(null)
    }
  }

  async function removeMember(row: Row) {
    const name = displayName(row)
    if (!window.confirm(`Remove “${name}” (${row.email})? This cannot be undone.`)) return
    setRemovingId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/members?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as MembersPayload
      if (!res.ok || data?.ok !== true) {
        setError(typeof data.error === 'string' ? data.error : 'Could not remove member.')
        return
      }
      applyPayload(data)
    } catch {
      setError('Could not remove member.')
    } finally {
      setRemovingId(null)
    }
  }

  function canManageRow(row: Row): boolean {
    if (row.id === currentUserId) return false
    if (row.bootstrapAdmin) return false
    if (row.role === 'member') return true
    return canManageAdmins && row.role === 'admin'
  }

  const refreshButton = (
    <button type="button" onClick={() => void load()} disabled={loading} className={actionButtonClass}>
      {loading ? '…' : 'Refresh'}
    </button>
  )

  return (
    <DashboardPanel
      title={`All members${total > 0 ? ` (${total})` : ''}`}
      action={refreshButton}
      className={className}
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {members.length === 0 && !loading ? (
        <p className="text-sm text-muted">No members yet.</p>
      ) : (
        <ul className="max-h-[22rem] space-y-2 overflow-y-auto">
          {members.map((m) => {
            const name = displayName(m)
            const busyRemove = removingId === m.id
            const busyPromote = promotingId === m.id
            const busyDemote = demotingId === m.id
            const busy = busyRemove || busyPromote || busyDemote
            const manageable = canManageRow(m)
            return (
              <li
                key={m.id}
                className="glass-inset flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <p className="min-w-0 flex-1 break-words text-fg">
                  <span>{name}</span>
                  <span className="mx-2 text-muted">·</span>
                  <span className="break-all">{m.email}</span>
                  <span className="mx-2 text-muted">·</span>
                  <span>{memberLevelLabel(m.role)}</span>
                </p>
                {manageable ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {m.role === 'member' ? (
                      <button
                        type="button"
                        disabled={busy || loading}
                        onClick={() => void setAsAdmin(m)}
                        className={actionButtonClass}
                      >
                        {busyPromote ? '…' : 'Set as Admin'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || loading}
                        onClick={() => void setAsMember(m)}
                        className={actionButtonClass}
                      >
                        {busyDemote ? '…' : 'Set as Member'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy || loading}
                      onClick={() => void removeMember(m)}
                      className="rounded-full border border-red-500/50 px-3 py-1 text-xs text-red-300 disabled:opacity-40"
                    >
                      {busyRemove ? '…' : 'Remove'}
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </DashboardPanel>
  )
}
