import { useCallback, useEffect, useState } from 'react'
import {
  fetchProTeam,
  removeProTeamMember,
  updateProTeamMemberRole,
  type ProTeamMemberRow,
  type ProTeamResponse,
} from '../../lib/hub-client'

function roleLabel(role: ProTeamMemberRow['role']): string {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  return 'Member'
}

export function SettingsTeamPanel() {
  const [payload, setPayload] = useState<ProTeamResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchProTeam()
      if (!data.ok || !data.team) {
        setPayload(null)
        setError(typeof data.error === 'string' ? data.error : 'Could not load team.')
        return
      }
      setPayload(data)
    } catch (ex) {
      setPayload(null)
      setError(ex instanceof Error ? ex.message : 'Could not load team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy team code.')
    }
  }

  async function handleRoleChange(memberId: string, role: 'admin' | 'member') {
    setBusyId(memberId)
    setError(null)
    const result = await updateProTeamMemberRole(memberId, role)
    if (!result.ok) {
      setError(result.error ?? 'Could not update role.')
      setBusyId(null)
      return
    }
    await refresh()
    setBusyId(null)
  }

  async function handleRemove(memberId: string) {
    setBusyId(memberId)
    setError(null)
    const result = await removeProTeamMember(memberId)
    if (!result.ok) {
      setError(result.error ?? 'Could not remove member.')
      setBusyId(null)
      return
    }
    await refresh()
    setBusyId(null)
  }

  if (loading && !payload) {
    return (
      <section className="remote-glass-pane settings-pane settings-pane-team">
        <div className="remote-pane-head">
          <h2>All members</h2>
        </div>
        <p className="text-sm text-white/45">Loading team…</p>
      </section>
    )
  }

  if (!payload?.team) {
    return error ? (
      <section className="remote-glass-pane settings-pane settings-pane-team">
        <div className="remote-pane-head">
          <h2>All members</h2>
        </div>
        <p className="text-sm text-red-300">{error}</p>
      </section>
    ) : null
  }

  const { team, members = [] } = payload
  const isTeamOwner = team.role === 'owner'

  return (
    <section className="remote-glass-pane settings-pane settings-pane-team">
      <div className="remote-pane-head">
        <h2>All members</h2>
      </div>
      <div className="settings-team-panel">
      {isTeamOwner && team.teamCode ? (
        <div className="settings-team-code-block">
          <p className="settings-team-code-label">Team code — new members join as Member</p>
          <div className="settings-team-code-row">
            <span className="settings-team-code-value">{team.teamCode}</span>
            <button type="button" className="btn btn-muted settings-team-btn" onClick={() => void handleCopyCode(team.teamCode!)}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}

      <ul className="settings-team-list">
        {members.map((member) => {
          const busy = busyId === member.memberId
          const showManageControls = isTeamOwner && member.role !== 'owner'
          return (
            <li key={member.memberId} className="settings-team-member">
              <div className="settings-team-member-main">
                <p className="settings-team-member-name">{member.displayName}</p>
                <p className="settings-team-member-email">{member.email}</p>
              </div>
              <div className="settings-team-member-actions">
                {showManageControls ? (
                  <>
                    <select
                      className="settings-team-role-select"
                      value={member.role === 'admin' ? 'admin' : 'member'}
                      disabled={busy}
                      onChange={(e) =>
                        void handleRoleChange(member.memberId, e.target.value as 'admin' | 'member')
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-muted settings-team-btn"
                      disabled={busy}
                      onClick={() => void handleRemove(member.memberId)}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="settings-team-role-badge">{roleLabel(member.role)}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </section>
  )
}
