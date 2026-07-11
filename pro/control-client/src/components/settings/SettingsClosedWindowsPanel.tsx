import { useCallback, useEffect, useState } from 'react'
import {
  addAdminClosedWindow,
  fetchAdminClosedWindows,
  removeAdminClosedWindow,
  type AdminClosedWindowRow,
} from '../../lib/hub-client'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SettingsClosedWindowsPanel() {
  const [windows, setWindows] = useState<AdminClosedWindowRow[]>([])
  const [description, setDescription] = useState('')
  const [startLocal, setStartLocal] = useState(() => toLocalInputValue(new Date()))
  const [endLocal, setEndLocal] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 2)
    return toLocalInputValue(d)
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetchAdminClosedWindows()
    if (res.ok && Array.isArray(res.windows)) setWindows(res.windows)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const startIso = new Date(startLocal).toISOString()
      const endIso = new Date(endLocal).toISOString()
      const res = await addAdminClosedWindow({ startIso, endIso, description })
      if (!res.ok) {
        setError(res.error ?? 'Failed to add')
        return
      }
      setDescription('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string) {
    setError(null)
    const res = await removeAdminClosedWindow(id)
    if (!res.ok) {
      setError(res.error ?? 'Failed to remove')
      return
    }
    await refresh()
  }

  return (
    <section className="remote-glass-pane settings-pane">
      <div className="remote-pane-head">
        <h2>Closed windows</h2>
      </div>
      <p className="mt-2 text-sm text-white/55">
        Block scheduling for maintenance or other closures. Shown on tonight&apos;s timeline.
      </p>
      <form className="mt-3 space-y-3" onSubmit={(e) => void handleAdd(e)}>
        <label className="block text-sm text-white/70">
          Description
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-white/70">
            Start
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            End
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
            />
          </label>
        </div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Adding…' : 'Add closed window'}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      {windows.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {windows.map((w) => (
            <li
              key={w.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-white">{w.description ?? 'Closed'}</p>
                <p className="text-xs text-white/50">
                  {new Date(w.startIso).toLocaleString()} → {new Date(w.endIso).toLocaleString()}
                </p>
              </div>
              <button type="button" className="btn btn-muted" onClick={() => void handleRemove(w.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-white/45">No closed windows scheduled.</p>
      )}
    </section>
  )
}
