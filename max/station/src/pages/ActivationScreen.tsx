import { useState } from 'react'
import { activateAccount } from '../lib/station-api'

const DEFAULT_HUB_URL = 'https://www.boreanastro.com'

type Props = {
  onActivated: () => void
}

export function ActivationScreen({ onActivated }: Props) {
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

  return (
    <div className="activation-shell">
      <div className="activation-card">
        <h1>Activate Borean Astro Station</h1>
        <p>
          Sign in with your Borean Astro account (same email and password as checkout). Your license
          is saved on this PC — you only need to do this once.
        </p>

        <label>
          <span>Email or username</span>
          <input
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label>
          <span>Password</span>
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
          />
        </label>
        <button
          type="button"
          className="btn btn-primary activation-submit"
          disabled={busy || !login.trim() || !password}
          onClick={() => void handleActivate()}
        >
          {busy ? 'Activating…' : 'Activate'}
        </button>

        {error ? <p className="activation-error">{error}</p> : null}
      </div>
    </div>
  )
}
