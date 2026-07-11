'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardPanel } from '@/app/account/dashboard-panel'
import { useMember } from '@/hooks/use-member'
import { memberLevelLabel, type PublicMemberUser } from '@/lib/member/member-store'

const actionButtonClass =
  'rounded-full border border-white/25 bg-surface px-4 py-2 text-sm font-medium text-fg hover:bg-[#1b1c1c] disabled:opacity-50'

const fieldClass = 'glass-field w-full text-sm'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <p className="text-muted">{label}</p>
      <p className="truncate text-fg">{value || '—'}</p>
    </div>
  )
}

export function AccountInfoSection({
  user,
  className = '',
}: {
  user: PublicMemberUser
  className?: string
}) {
  const member = useMember()
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const closePasswordModal = useCallback(() => {
    setPasswordModalOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setPasswordError(null)
  }, [])

  function openPasswordModal() {
    setCurrentPassword('')
    setNewPassword('')
    setPasswordError(null)
    setPasswordModalOpen(true)
  }

  useEffect(() => {
    if (!passwordModalOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) closePasswordModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [passwordModalOpen, saving, closePasswordModal])

  async function handleLogout() {
    await member.signOut()
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setPasswordError(null)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok !== true) {
        setPasswordError(typeof data.error === 'string' ? data.error : 'Could not update password.')
        return
      }
      closePasswordModal()
    } catch {
      setPasswordError('Could not update password.')
    } finally {
      setSaving(false)
    }
  }

  const body = (
    <>
      <div className="flex w-full flex-wrap items-end justify-between gap-x-6 gap-y-2 sm:gap-x-8 lg:gap-x-10">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-6 gap-y-2 sm:gap-x-8 lg:gap-x-10">
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="First name" value={user.firstName} />
          <InfoRow label="Last name" value={user.lastName} />
          <InfoRow label="Role" value={memberLevelLabel(user.role)} />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:gap-3">
          <button type="button" onClick={openPasswordModal} className={actionButtonClass}>
            Update password
          </button>
          <button type="button" onClick={() => void handleLogout()} className={actionButtonClass}>
            Log out
          </button>
        </div>
      </div>

      {passwordModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!saving) closePasswordModal()
          }}
        >
          <div
            role="dialog"
            aria-labelledby="change-password-title"
            className="glass-card w-full max-w-md space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="change-password-title" className="text-lg font-semibold text-fg">
              Update password
            </h2>
            <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className={fieldClass}
                autoComplete="current-password"
                autoFocus
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (8+ characters)"
                className={fieldClass}
                autoComplete="new-password"
                minLength={8}
              />
              {passwordError ? <p className="text-sm text-red-400">{passwordError}</p> : null}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!saving) closePasswordModal()
                  }}
                  disabled={saving}
                  className={actionButtonClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !currentPassword || newPassword.length < 8}
                  className={actionButtonClass}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )

  return (
    <DashboardPanel title="Account Info" className={className}>
      {body}
    </DashboardPanel>
  )
}
