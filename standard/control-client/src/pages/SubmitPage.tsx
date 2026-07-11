import { useEffect, useState, type FormEvent } from 'react'
import {
  OUTPUT_MODE_LABELS,
  PERSONAL_DEFAULT_OUTPUT_MODE,
  type SessionOutputMode,
} from '@shared/output-mode'
import { fetchStorageQuota } from '../lib/hub-client'
import { submitSession } from '../lib/submit-session'

type SubmitPageProps = {
  onSubmitted?: () => void
}

export function SubmitPage({ onSubmitted }: SubmitPageProps) {
  const [target, setTarget] = useState('')
  const [outputMode, setOutputMode] = useState<SessionOutputMode>(PERSONAL_DEFAULT_OUTPUT_MODE)
  const [filter, setFilter] = useState('L')
  const [exposureSeconds, setExposureSeconds] = useState(600)
  const [count, setCount] = useState(10)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [storageOverQuota, setStorageOverQuota] = useState(false)

  useEffect(() => {
    void fetchStorageQuota().then((res) => {
      if (res.ok) setStorageOverQuota(res.overQuota === true)
    })
  }, [])

  useEffect(() => {
    if (storageOverQuota && outputMode === 'raw_zip') setOutputMode('none')
  }, [storageOverQuota, outputMode])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    const trimmed = target.trim()
    if (!trimmed) {
      setError('Enter a target name.')
      setBusy(false)
      return
    }
    const result = await submitSession({
      target: trimmed,
      outputMode,
      filter: filter.trim() || null,
      exposureSeconds,
      count,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(`Session queued (${result.id.slice(0, 8)}…). Open Sessions to view.`)
    setTarget('')
    onSubmitted?.()
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Submit session</h1>
      </header>

      <p className="muted">
        Sessions queue to your licensed cloud hub on www.boreanastro.com (built into this app).
      </p>

      <form className="form card" onSubmit={(e) => void handleSubmit(e)}>
        <label className="field">
          <span>Target name</span>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. M42"
            autoComplete="off"
            disabled={busy}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Filter</span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Exposure (s)</span>
            <input
              type="number"
              min={1}
              value={exposureSeconds}
              onChange={(e) => setExposureSeconds(Number(e.target.value))}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Count</span>
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={busy}
            />
          </label>
        </div>

        <fieldset className="field">
          <legend>Output mode</legend>
          {(Object.keys(OUTPUT_MODE_LABELS) as SessionOutputMode[]).map((mode) => (
            <label key={mode} className="radio-row">
              <input
                type="radio"
                name="outputMode"
                checked={outputMode === mode}
                onChange={() => setOutputMode(mode)}
                disabled={busy || (mode === 'raw_zip' && storageOverQuota)}
              />
              <span>
                <strong>{mode}</strong> — {OUTPUT_MODE_LABELS[mode]}
              </span>
            </label>
          ))}
          {storageOverQuota ? (
            <p className="muted text-sm">Cloud storage is full. Delete files in Settings or choose none.</p>
          ) : null}
        </fieldset>

        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit session'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}
      {message && <p className="ok-text">{message}</p>}
    </div>
  )
}
