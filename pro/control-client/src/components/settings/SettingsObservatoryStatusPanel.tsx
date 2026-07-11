import { useCallback, useEffect, useState } from 'react'
import { canUseOwnerControls } from '../../lib/pro-team-access'
import {
  fetchObservatoryStatus,
  patchObservatory,
} from '../../lib/hub-client'
import {
  OBSERVATORY_STATUS_OPTIONS,
  type ObservatoryMode,
  type ObservatoryStatus,
} from '../../lib/observatory-status-options'

type SettingsObservatoryStatusPanelProps = {
  onChanged?: () => void
}

export function SettingsObservatoryStatusPanel({ onChanged }: SettingsObservatoryStatusPanelProps) {
  const ownerControls = canUseOwnerControls()
  const [mode, setMode] = useState<ObservatoryMode>('manual')
  const [status, setStatus] = useState<ObservatoryStatus>('ready')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchObservatoryStatus()
      if (!data.ok || !data.status) return
      if (data.mode === 'manual' || data.mode === 'auto') setMode(data.mode)
      setStatus(data.status)
      setError(null)
    } catch {
      setError('Unable to load observatory status.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function updateMode(next: ObservatoryMode) {
    setSaving(true)
    setError(null)
    try {
      const data = await patchObservatory({ mode: next })
      if (!data.ok) throw new Error(data.error ?? 'Update failed')
      if (data.mode) setMode(data.mode)
      if (data.status) setStatus(data.status)
      onChanged?.()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Failed to update mode.')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(next: ObservatoryStatus) {
    setSaving(true)
    setError(null)
    try {
      const data = await patchObservatory({ status: next })
      if (!data.ok) throw new Error(data.error ?? 'Update failed')
      if (data.mode) setMode(data.mode)
      if (data.status) setStatus(data.status)
      onChanged?.()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Failed to update status.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-observatory-panel">
      {!loaded ? <p className="text-sm text-white/50">Loading…</p> : null}
      {!ownerControls ? (
        <p className="text-sm text-white/55">Only team owners and admins can change observatory mode and status.</p>
      ) : null}
      <div className="space-y-3">
        <p className="text-sm font-medium text-white">Mode</p>
        <div className="settings-pill-row">
          <button
            type="button"
            onClick={() => void updateMode('manual')}
            disabled={saving || !ownerControls}
            className={`settings-pill ${mode === 'manual' ? 'settings-pill-active' : ''}`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => void updateMode('auto')}
            disabled={saving || !ownerControls}
            className={`settings-pill ${mode === 'auto' ? 'settings-pill-active' : ''}`}
          >
            Auto
          </button>
        </div>

        <p className="text-sm font-medium text-white">Status</p>
        <div className="settings-status-list">
          {OBSERVATORY_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => void updateStatus(opt.value)}
              disabled={saving || mode === 'auto' || !ownerControls}
              className={`settings-status-pill ${status === opt.value ? 'settings-pill-active' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </div>
  )
}
