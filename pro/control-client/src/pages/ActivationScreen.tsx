import { useState } from 'react'
import { activateAccount, importTenantLicense } from '../lib/control-app-api'

const DEFAULT_HUB_URL = 'https://www.boreanastro.com'

type Props = {
  onActivated: () => void
  /** Shown when tenant.json on this device is missing or past validUntil. */
  notice?: string | null
}

export function ActivationScreen({ onActivated, notice }: Props) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleActivate() {
    setBusy(true)
    setError(null)
    try {
      await activateAccount({
        apiBaseUrl: DEFAULT_HUB_URL,
        login: login.trim(),
        password,
      })
      onActivated()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Activation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport() {
    setBusy(true)
    setError(null)
    try {
      await importTenantLicense()
      onActivated()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08090a] px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#151616] p-8 shadow-xl">
        <h1 className="font-display text-2xl font-semibold text-white">Activate Control Client</h1>
        <p className="mt-3 text-sm text-white/60">
          Sign in with your Borean Astro account (same email and password as checkout). Your license
          is saved on this device — you only need to do this once.
        </p>
        {notice ? (
          <p className="mt-3 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
            {notice}
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          <label className="block text-sm text-white/70">
            Email or username
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoFocus
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && login.trim() && password && !busy) {
                  void handleActivate()
                }
              }}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={busy || !login.trim() || !password}
            className="btn w-full py-2.5"
          >
            {busy ? 'Activating…' : 'Activate'}
          </button>
        </div>

        <details className="mt-6 text-sm text-white/50">
          <summary className="cursor-pointer text-white/70">Already have tenant.json?</summary>
          <p className="mt-2 text-xs text-white/45">
            Import the file from your checkout email instead of signing in.
          </p>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={busy}
            className="btn mt-3 w-full py-2"
          >
            Import tenant.json
          </button>
        </details>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  )
}
