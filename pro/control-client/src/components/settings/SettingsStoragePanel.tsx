import { useCallback, useEffect, useState } from 'react'
import { canUseOwnerControls } from '../../lib/pro-team-access'
import {
  deleteSessionStorage,
  fetchStorageQuota,
  type StorageQuotaResponse,
} from '../../lib/hub-client'
import { formatStorageBytes } from '@shared/site-storage'
import { MotionModal } from '../motion'

type StoredSession = NonNullable<StorageQuotaResponse['sessions']>[number]

export function SettingsStoragePanel() {
  const ownerControls = canUseOwnerControls()
  const [data, setData] = useState<StorageQuotaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchStorageQuota()
      if (!res.ok) {
        setError(typeof res.error === 'string' ? res.error : 'Unable to load storage.')
        setData(null)
        return
      }
      setData(res)
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Unable to load storage.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const usedBytes = data?.usedBytes ?? 0
  const limitBytes = data?.limitBytes ?? 10 * 1024 ** 3
  const pct = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0
  const sessions = data?.sessions ?? []

  async function handleDelete(session: StoredSession) {
    setBusyId(session.queueId)
    setError(null)
    try {
      const res = await deleteSessionStorage(session.queueId)
      if (!res.ok) {
        setError(res.error ?? 'Delete failed.')
        return
      }
      setConfirmId(null)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="remote-glass-pane settings-pane settings-pane-storage">
      <div className="remote-pane-head">
        <h2>Cloud storage</h2>
      </div>

      {loading && !data ? (
        <p className="mt-2 text-sm text-white/50">Loading…</p>
      ) : (
        <>
          <div className="mt-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-white/80">
                {formatStorageBytes(usedBytes)} of {formatStorageBytes(limitBytes)} used
              </span>
              {data?.overQuota ? (
                <span className="text-red-400">Full — Raw ZIP disabled until you free space</span>
              ) : null}
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-all ${data?.overQuota ? 'bg-red-500/80' : 'bg-aurora-cyan/70'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {sessions.length > 0 && (
            <ul className="mt-4 space-y-3">
              {sessions.map((session) => (
                <li
                  key={session.queueId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">
                      {session.target?.trim() || session.queueId}
                    </p>
                    <p className="text-xs text-white/50">
                      {formatStorageBytes(session.sizeBytes)} ·{' '}
                      {new Date(session.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-muted shrink-0"
                    disabled={busyId === session.queueId || !ownerControls}
                    onClick={() => setConfirmId(session.queueId)}
                  >
                    Delete files
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <MotionModal
        show={Boolean(confirmId)}
        onClose={() => {
          if (busyId) return
          setConfirmId(null)
        }}
        backdropClassName="session-modal-backdrop"
        panelClassName="session-delete-modal"
        aria-labelledby="delete-storage-title"
      >
        <h2 id="delete-storage-title">Delete stored files</h2>
        <p className="session-delete-copy">
          Remove the cloud ZIP for this session? The session row in Remote is unchanged. This cannot be undone.
        </p>
        <div className="session-delete-actions">
          <button
            type="button"
            className="session-action-btn"
            disabled={Boolean(busyId)}
            onClick={() => setConfirmId(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="session-action-btn danger solid"
            disabled={Boolean(busyId)}
            onClick={() => {
              const session = sessions.find((s) => s.queueId === confirmId)
              if (session) void handleDelete(session)
            }}
          >
            {busyId ? 'Deleting…' : 'Delete files'}
          </button>
        </div>
      </MotionModal>
    </section>
  )
}
