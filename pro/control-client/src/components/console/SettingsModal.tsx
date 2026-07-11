import { useState } from 'react'
import { canUseOwnerControls } from '../../lib/pro-team-access'
import { getCloudHubLabel, probeHub, patchObservatoryMode } from '../../lib/hub-client'
import {
  getObservatoryLocation,
  setObservatoryLocation,
  validateObservatoryInput,
} from '../../lib/settings'
import { getTenantLabel } from '../../lib/tenant'
import type { ObservatoryMode } from '../../lib/types'
import { MotionModal } from '../motion'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const loc = getObservatoryLocation()
  const [lat, setLat] = useState(String(loc.lat))
  const [lon, setLon] = useState(String(loc.lon))
  const [elevationM, setElevationM] = useState(String(loc.elevationM))
  const [label, setLabel] = useState(loc.label)
  const [mode, setMode] = useState<ObservatoryMode>('auto')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const validated = validateObservatoryInput({ label, lat, lon, elevationM })
    if (!validated.ok) {
      setTestResult(validated.error)
      return
    }
    setObservatoryLocation(validated.location)
    setBusy(true)
    try {
      const probe = await probeHub()
      if (probe.hubReachable && canUseOwnerControls()) {
        await patchObservatoryMode(mode)
        setTestResult('Saved.')
      } else if (probe.hubReachable) {
        setTestResult('Saved locally. Team members cannot change observatory mode.')
      } else {
        setTestResult('Saved locally. Cloud hub offline — mode not synced.')
      }
      onSaved()
    } catch (ex) {
      setTestResult(ex instanceof Error ? ex.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setBusy(true)
    setTestResult(null)
    const result = await probeHub()
    if (result.hubReachable) {
      setMode(result.observatory?.mode ?? 'auto')
      setTestResult(
        `OK — ${result.observatory?.status ?? 'unknown'} (${result.observatory?.mode ?? '?'})`
      )
    } else {
      setTestResult(result.error ?? 'Hub unreachable')
    }
    setBusy(false)
  }

  return (
    <MotionModal
      show={open}
      onClose={onClose}
      backdropClassName="modal-backdrop"
      panelClassName="modal console-panel"
      aria-labelledby="settings-title"
    >
      <div className="panel-head">
        <h2 id="settings-title">Configuration</h2>
        <button type="button" className="btn console-btn" onClick={onClose}>
          CLOSE
        </button>
      </div>

      <form className="settings-form" onSubmit={(e) => void handleSave(e)}>
          <p className="panel-footnote">
            License / hub: <strong>{getTenantLabel()}</strong> — {getCloudHubLabel()} (built into this app)
          </p>

          <label className="settings-field">
            <span>Site label</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>

          <div className="settings-row">
            <label className="settings-field">
              <span>Latitude</span>
              <input type="text" value={lat} onChange={(e) => setLat(e.target.value)} />
            </label>
            <label className="settings-field">
              <span>Longitude</span>
              <input type="text" value={lon} onChange={(e) => setLon(e.target.value)} />
            </label>
          </div>

          <label className="settings-field">
            <span>Elevation (m)</span>
            <input type="text" value={elevationM} onChange={(e) => setElevationM(e.target.value)} />
          </label>

          <fieldset className="settings-field">
            <span>Observatory mode</span>
            <div className="segmented">
              {(['auto', 'manual'] as ObservatoryMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={mode === m ? 'segment active' : 'segment'}
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="settings-actions">
            <button type="submit" className="btn launch-btn" disabled={busy}>
              SAVE
            </button>
            <button
              type="button"
              className="btn console-btn"
              disabled={busy}
              onClick={() => void handleTest()}
            >
              TEST HUB
            </button>
          </div>
      </form>

      {testResult && (
        <p className={testResult.startsWith('OK') || testResult === 'Saved.' ? 'panel-ok' : 'panel-error'}>
          {testResult}
        </p>
      )}
    </MotionModal>
  )
}
