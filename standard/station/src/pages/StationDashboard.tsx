import { useCallback, useEffect, useRef, useState } from 'react'
import { SettingsLicensePanel } from '../components/SettingsLicensePanel'
import { StatusRow, type StatusAction } from '../components/StatusRow'
import { StationHeader } from '../components/StationHeader'
import {
  agentIsRunning,
  applyUpdate,
  clearAgentLogs,
  installPython,
  installNinaPlugin,
  loadConfig,
  loadTenant,
  readAgentLogs,
  runDiagnostics,
  saveConfig,
  scanNina,
  setupAutostart,
  startAgent,
  stopAgent,
} from '../lib/station-api'
import { planDisplayLabel } from '../lib/plan-label'
import type { CheckItem, PersonalTenantInfo, StationConfig } from '../lib/types'

const emptyConfig: StationConfig = {
  ninaInstallDir: '',
  jobsDir: '',
  ninaOutputDir: '',
  r2Enabled: false,
  autostartEnabled: false,
  pythonPath: '',
  pduEnabled: false,
  pduBaseUrl: '',
  pduUser: '',
  pduPassword: '',
}

export function StationDashboard() {
  const [config, setConfig] = useState<StationConfig>(emptyConfig)
  const [tenant, setTenant] = useState<PersonalTenantInfo | null>(null)
  const [checks, setChecks] = useState<CheckItem[]>([])
  const [logs, setLogs] = useState('')
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const [checksLoading, setChecksLoading] = useState(true)
  const refreshInFlight = useRef(false)

  const refreshChecks = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      const [d, l, r] = await Promise.all([runDiagnostics(), readAgentLogs(), agentIsRunning()])
      setChecks(d)
      setLogs(l)
      setRunning(r)
    } finally {
      setChecksLoading(false)
      refreshInFlight.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const [c, t] = await Promise.all([loadConfig(), loadTenant()])
    setConfig(c)
    setTenant(t)
    await refreshChecks()
  }, [refreshChecks])

  useEffect(() => {
    void (async () => {
      const [c, t] = await Promise.all([loadConfig(), loadTenant()])
      setConfig(c)
      setTenant(t)
      await refreshChecks()
    })()
    const id = window.setInterval(() => void refreshChecks(), 8000)
    return () => window.clearInterval(id)
  }, [refreshChecks])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  function invokeErrorMessage(ex: unknown, fallback: string): string {
    if (typeof ex === 'string' && ex.trim()) return ex
    if (ex instanceof Error && ex.message) return ex.message
    return fallback
  }

  function appendUiLog(message: string) {
    setLogs((prev) => `${prev}\n[ui] ${message}`.trim())
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSaveMsg(null)
    try {
      await saveConfig(config)
      setSaveMsg('Saved.')
      await refresh()
    } catch (ex) {
      setSaveMsg(ex instanceof Error ? ex.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleStart() {
    setBusy(true)
    try {
      await startAgent()
      await refresh()
    } catch (ex) {
      appendUiLog(ex instanceof Error ? ex.message : 'Start failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    setBusy(true)
    try {
      await stopAgent()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleClearLogs() {
    setBusy(true)
    try {
      await clearAgentLogs()
      setLogs('')
    } catch (ex) {
      appendUiLog(ex instanceof Error ? ex.message : 'Clear failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleScanNina() {
    setActionId('nina_installed')
    try {
      const next = await scanNina()
      setConfig(next)
      await refreshChecks()
    } catch (ex) {
      appendUiLog(ex instanceof Error ? ex.message : 'NINA scan failed')
    } finally {
      setActionId(null)
    }
  }

  async function handleInstallPython() {
    setActionId('python')
    try {
      await installPython()
      await refreshChecks()
    } catch (ex) {
      appendUiLog(ex instanceof Error ? ex.message : 'Python install failed')
    } finally {
      setActionId(null)
    }
  }

  async function handleInstallNinaPlugin(forceUpdate = false) {
    setActionId('nina_plugin_installed')
    try {
      const msg = await installNinaPlugin(forceUpdate)
      appendUiLog(msg)
      await refreshChecks()
    } catch (ex) {
      appendUiLog(invokeErrorMessage(ex, 'NINA plugin install failed'))
    } finally {
      setActionId(null)
    }
  }

  async function handleSetupAutostart() {
    setActionId('autostart')
    try {
      const next = await setupAutostart()
      setConfig(next)
      await refreshChecks()
    } catch (ex) {
      appendUiLog(ex instanceof Error ? ex.message : 'Autostart setup failed')
    } finally {
      setActionId(null)
    }
  }

  async function handleUpdate() {
    setActionId('station_version')
    try {
      await applyUpdate()
      await refreshChecks()
    } catch (ex) {
      appendUiLog(ex instanceof Error ? ex.message : 'Update failed')
    } finally {
      setActionId(null)
    }
  }

  function statusAction(item: CheckItem): StatusAction | undefined {
    const isOk = item.status === 'ok'
    const isBusy = actionId === item.id

    switch (item.id) {
      case 'nina_installed':
        return {
          label: 'Scan',
          disabled: isOk,
          busy: isBusy,
          onClick: () => void handleScanNina(),
        }
      case 'python':
        return {
          label: 'Install',
          disabled: isOk,
          busy: isBusy,
          onClick: () => void handleInstallPython(),
        }
      case 'nina_plugin_installed': {
        const needsUpdate = item.status === 'warning'
        return {
          label: needsUpdate ? 'Update' : 'Install',
          disabled: isOk,
          busy: isBusy,
          onClick: () => void handleInstallNinaPlugin(needsUpdate),
        }
      }
      case 'autostart':
        return {
          label: 'Set up',
          disabled: isOk,
          busy: isBusy,
          onClick: () => void handleSetupAutostart(),
        }
      case 'station_version':
        return {
          label: 'Update',
          disabled: isOk,
          busy: isBusy,
          onClick: () => void handleUpdate(),
        }
      default:
        return undefined
    }
  }

  return (
    <div className="client-shell">
      <StationHeader
        edition={planDisplayLabel('standard')}
        running={running}
        busy={busy}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
      />

      <main className="station-main">
        <div className="station-glass-grid">
          <section className="station-glass-pane">
            <div className="station-pane-head">
              <h2>System status</h2>
            </div>
            <ul className="check-list">
              {checksLoading && checks.length === 0 ? (
                <li className="check-row check-row-loading">Running system checks…</li>
              ) : (
                checks.map((item) => (
                  <StatusRow
                    key={item.id}
                    label={item.label}
                    status={item.status}
                    detail={item.id === 'station_version' ? item.detail : undefined}
                    action={statusAction(item)}
                  />
                ))
              )}
            </ul>
          </section>

          <section className="station-glass-pane station-glass-pane-log">
            <div className="station-pane-head">
              <h2>Agent log</h2>
            </div>
            <div className="station-log-toolbar">
              <button
                type="button"
                className="btn btn-muted btn-sm"
                disabled={busy || !logs.trim()}
                onClick={() => void handleClearLogs()}
              >
                Clear
              </button>
            </div>
            <pre ref={logRef} className="log-view">
              {logs.trim()}
            </pre>
          </section>

          <div className="station-right-stack">
            <section className="station-glass-pane station-glass-pane-compact">
              <div className="station-pane-head">
                <h2>License</h2>
              </div>
              <SettingsLicensePanel tenant={tenant} />
            </section>

            <section className="station-glass-pane">
              <div className="station-pane-head">
                <h2>Settings</h2>
              </div>
              <form className="settings-form" onSubmit={(e) => void handleSave(e)}>
                <fieldset className="settings-pdu-fieldset">
                  <legend>Power distribution</legend>
                  <div className="settings-pdu-choices">
                    <label className="settings-choice-row">
                      <input
                        type="radio"
                        name="pdu-mode"
                        checked={!config.pduEnabled}
                        onChange={() => setConfig({ ...config, pduEnabled: false })}
                      />
                      <span>No PDU</span>
                    </label>
                    <label className="settings-choice-row">
                      <input
                        type="radio"
                        name="pdu-mode"
                        checked={config.pduEnabled}
                        onChange={() => setConfig({ ...config, pduEnabled: true })}
                      />
                      <span>PDU</span>
                    </label>
                  </div>
                </fieldset>

                {config.pduEnabled ? (
                  <>
                    <label>
                      <span>PDU URL</span>
                      <input
                        type="url"
                        value={config.pduBaseUrl}
                        onChange={(e) => setConfig({ ...config, pduBaseUrl: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>PDU username</span>
                      <input
                        type="text"
                        value={config.pduUser}
                        onChange={(e) => setConfig({ ...config, pduUser: e.target.value })}
                        autoComplete="username"
                      />
                    </label>
                    <label>
                      <span>PDU password</span>
                      <input
                        type="password"
                        value={config.pduPassword}
                        onChange={(e) => setConfig({ ...config, pduPassword: e.target.value })}
                        autoComplete="current-password"
                      />
                    </label>
                  </>
                ) : null}

                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Save settings
                </button>
                {saveMsg ? <p className="save-msg">{saveMsg}</p> : null}
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
