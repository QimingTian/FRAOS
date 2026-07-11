import { useCallback, useEffect, useState } from 'react'
import {
  appVersion,
  applyUpdate,
  checkForUpdate,
  loadAppTenant,
  type PersonalTenantInfo,
  type UpdateStatus,
} from '../lib/control-app-api'
import {
  setObservatoryLocation,
  validateObservatoryInput,
} from '../lib/settings'
import { useObservatoryLocation } from '../lib/useObservatoryLocation'
import {
  clearEquipment,
  computeFov,
  mergeEquipmentManualSave,
  setEquipment,
  validateEquipmentInput,
} from '../lib/equipment'
import { useEquipment } from '../lib/useEquipment'
import { solvePhoto } from '../lib/plate-solve'
import { SettingsObsLogRow } from '../components/settings/SettingsObsLogRow'
import { SettingsObservatoryStatusPanel } from '../components/settings/SettingsObservatoryStatusPanel'
import { SettingsActivityLogPanel } from '../components/settings/SettingsActivityLogPanel'
import { SettingsLicensePanel } from '../components/settings/SettingsLicensePanel'
import { SettingsStoragePanel } from '../components/settings/SettingsStoragePanel'
import { SettingsTeamPanel } from '../components/settings/SettingsTeamPanel'
import { SettingsClosedWindowsPanel } from '../components/settings/SettingsClosedWindowsPanel'
import { getAscStreamUrl, setAscStreamUrl } from '../lib/settings'

export function SettingsPage() {
  const observatory = useObservatoryLocation()
  const equipment = useEquipment()
  const [lat, setLat] = useState(String(observatory.lat))
  const [lon, setLon] = useState(String(observatory.lon))
  const [elevationM, setElevationM] = useState(String(observatory.elevationM))
  const [label, setLabel] = useState(observatory.label)

  const [eqLabel, setEqLabel] = useState(equipment?.label ?? '')
  const [focalLengthMm, setFocalLengthMm] = useState(equipment ? String(equipment.focalLengthMm) : '')
  const [pixelSizeUm, setPixelSizeUm] = useState(equipment ? String(equipment.pixelSizeUm) : '')
  const [sensorWidthPx, setSensorWidthPx] = useState(equipment ? String(equipment.sensorWidthPx) : '')
  const [sensorHeightPx, setSensorHeightPx] = useState(equipment ? String(equipment.sensorHeightPx) : '')
  const [positionAngleDeg, setPositionAngleDeg] = useState(equipment ? String(equipment.positionAngleDeg) : '0')
  const [eqError, setEqError] = useState<string | null>(null)
  const [eqMessage, setEqMessage] = useState<string | null>(null)
  const [solving, setSolving] = useState(false)
  const [solvedArcsec, setSolvedArcsec] = useState<number | null>(null)
  const [tenant, setTenant] = useState<PersonalTenantInfo | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logRefreshToken, setLogRefreshToken] = useState(0)
  const [ascStreamUrl, setAscStreamUrlState] = useState('')
  const [ascMessage, setAscMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [t, v, u] = await Promise.all([
      loadAppTenant(),
      appVersion(),
      checkForUpdate(),
    ])
    setTenant(t)
    setVersion(v)
    setUpdate(u)
  }, [])

  useEffect(() => {
    void refresh()
    setAscStreamUrlState(getAscStreamUrl())
  }, [refresh])

  useEffect(() => {
    setLat(String(observatory.lat))
    setLon(String(observatory.lon))
    setElevationM(String(observatory.elevationM))
    setLabel(observatory.label)
  }, [observatory])

  useEffect(() => {
    if (!equipment) return
    setEqLabel(equipment.label)
    setFocalLengthMm(String(equipment.focalLengthMm))
    setPixelSizeUm(String(equipment.pixelSizeUm))
    setSensorWidthPx(String(equipment.sensorWidthPx))
    setSensorHeightPx(String(equipment.sensorHeightPx))
    setPositionAngleDeg(String(equipment.positionAngleDeg))
  }, [equipment])

  function handleSaveEquipment(e: React.FormEvent) {
    e.preventDefault()
    setEqError(null)
    setEqMessage(null)
    const validated = validateEquipmentInput({
      label: eqLabel,
      focalLengthMm,
      pixelSizeUm,
      sensorWidthPx,
      sensorHeightPx,
      positionAngleDeg,
    })
    if (!validated.ok) {
      setEqError(validated.error)
      return
    }
    setEquipment(mergeEquipmentManualSave(equipment, validated.equipment))
    const fov = computeFov(validated.equipment)
    setEqMessage(
      `Saved. FOV ${fov.fovWidthDeg.toFixed(2)}° × ${fov.fovHeightDeg.toFixed(2)}° · ${fov.arcsecPerPixel.toFixed(2)}″/px.`,
    )
  }

  function handleClearEquipment() {
    clearEquipment()
    setEqLabel('')
    setFocalLengthMm('')
    setPixelSizeUm('')
    setSensorWidthPx('')
    setSensorHeightPx('')
    setPositionAngleDeg('0')
    setSolvedArcsec(null)
    setEqError(null)
    setEqMessage('Imaging rig cleared. The Atlas camera-frame button is now hidden.')
  }

  async function handleSolvePhoto(file: File) {
    setEqError(null)
    setEqMessage('Solving…')
    setSolving(true)
    setSolvedArcsec(null)
    try {
      const result = await solvePhoto(file)
      const nextWidth = String(result.sensorWidthPx)
      const nextHeight = String(result.sensorHeightPx)
      const nextPa =
        result.orientationDeg != null
          ? String((((result.orientationDeg % 360) + 360) % 360).toFixed(2))
          : positionAngleDeg
      setSensorWidthPx(nextWidth)
      setSensorHeightPx(nextHeight)
      setPositionAngleDeg(nextPa)
      setSolvedArcsec(result.arcsecPerPixel)
      const px = Number(pixelSizeUm)
      let nextFocal = focalLengthMm
      if (Number.isFinite(px) && px > 0) {
        nextFocal = ((px / result.arcsecPerPixel) * (206264.8062471 / 1000)).toFixed(1)
        setFocalLengthMm(nextFocal)
      }
      const validated = validateEquipmentInput({
        label: eqLabel,
        focalLengthMm: nextFocal,
        pixelSizeUm,
        sensorWidthPx: nextWidth,
        sensorHeightPx: nextHeight,
        positionAngleDeg: nextPa,
      })
      if (validated.ok) {
        setEquipment({
          ...validated.equipment,
          fieldRotationDeg: result.fieldRotationDeg ?? undefined,
          rawImageOrientationDeg: result.rawImageOrientationDeg ?? undefined,
          imageParity: result.parity,
        })
        const framePa =
          result.fieldRotationDeg != null
            ? `${(((result.fieldRotationDeg % 360) + 360) % 360).toFixed(1)}° frame`
            : null
        setEqMessage(
          `Solved and saved: ${result.arcsecPerPixel.toFixed(2)}″/px · FOV ${result.fovWidthDeg.toFixed(2)}° × ${result.fovHeightDeg.toFixed(2)}° · NINA PA ${nextPa}°` +
            (framePa ? ` · Atlas ${framePa}` : '') +
            '.' +
            (Number.isFinite(px) && px > 0
              ? ' Focal length updated.'
              : ' Enter pixel size (µm) to compute focal length.'),
        )
      } else {
        setEqMessage(
          `Solved: ${result.arcsecPerPixel.toFixed(2)}″/px · FOV ${result.fovWidthDeg.toFixed(2)}° × ${result.fovHeightDeg.toFixed(2)}° · PA ${nextPa}°. Fill in remaining fields and Save.`,
        )
      }
    } catch (ex) {
      setEqError(ex instanceof Error ? ex.message : 'Plate solving failed.')
      setEqMessage(null)
    } finally {
      setSolving(false)
    }
  }

  // After a solve, computing focal length needs the pixel size; fill it in once both are known.
  useEffect(() => {
    if (solvedArcsec == null) return
    const px = Number(pixelSizeUm)
    if (Number.isFinite(px) && px > 0) {
      setFocalLengthMm(((px / solvedArcsec) * (206264.8062471 / 1000)).toFixed(1))
    }
  }, [solvedArcsec, pixelSizeUm])

  function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    const validated = validateObservatoryInput({ label, lat, lon, elevationM })
    if (!validated.ok) {
      setError(validated.error)
      return
    }
    setObservatoryLocation(validated.location)
    setMessage('Observatory location saved.')
  }

  async function handleUpdate() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await applyUpdate()
      setMessage(
        'Update download opened in your browser. Fully quit Control (Cmd+Q), open the DMG, drag Borean Astro Control to Applications and choose Replace, then launch from Applications. If the version still looks old, remove Borean Astro Control from the Dock and add it again from Applications.'
      )
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  const equipmentPreviewInput = validateEquipmentInput({
    label: eqLabel,
    focalLengthMm,
    pixelSizeUm,
    sensorWidthPx,
    sensorHeightPx,
    positionAngleDeg,
  })
  const equipmentPreview = equipmentPreviewInput.ok ? computeFov(equipmentPreviewInput.equipment) : null

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <section className="remote-glass-pane settings-pane settings-pane-location">
          <div className="remote-pane-head">
            <h2>Observatory location</h2>
          </div>
          <form className="mt-2 space-y-3" onSubmit={handleSaveLocation}>
            <label className="block text-sm text-white/70">
              Site label
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-white/70">
                Latitude
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-white/70">
                Longitude
                <input
                  type="text"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
            </div>
            <label className="block text-sm text-white/70">
              Elevation (m)
              <input
                type="text"
                value={elevationM}
                onChange={(e) => setElevationM(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <button type="submit" className="btn mt-2">
              Save location
            </button>
          </form>
        </section>

        <section className="remote-glass-pane settings-pane settings-pane-system">
          <div className="settings-system-block">
            <div className="remote-pane-head">
              <h2>License</h2>
            </div>
            <SettingsLicensePanel tenant={tenant} />
          </div>

          <div className="settings-system-divider" aria-hidden />

          <div className="settings-system-block">
            <div className="remote-pane-head">
              <h2>Updates</h2>
            </div>
            <p className="mt-2 text-sm text-white/60">
              Installed: <span className="text-white">{version ?? '—'}</span>
              {update ? (
                <>
                  {' '}
                  · Latest: <span className="text-white">{update.latestVersion}</span>
                </>
              ) : null}
            </p>
            {update?.updateAvailable ? null : update ? (
              <p className="mt-2 text-sm text-white/50">You are up to date.</p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleUpdate()}
              disabled={busy || !update?.updateAvailable}
              className="btn mt-4"
            >
              {busy ? 'Checking…' : 'Download update'}
            </button>
          </div>
        </section>

        <section className="remote-glass-pane settings-pane settings-pane-equipment">
          <div className="remote-pane-head">
            <h2>Imaging equipment</h2>
          </div>
          <form className="mt-2 space-y-3" onSubmit={handleSaveEquipment}>
            <label className="block text-sm text-white/70">
              Rig name
              <input
                type="text"
                value={eqLabel}
                onChange={(e) => setEqLabel(e.target.value)}
                placeholder="e.g. TOA-106 + IMX571"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-white/70">
                Focal length (mm)
                <input
                  type="text"
                  inputMode="decimal"
                  value={focalLengthMm}
                  onChange={(e) => setFocalLengthMm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-white/70">
                Pixel size (µm)
                <input
                  type="text"
                  inputMode="decimal"
                  value={pixelSizeUm}
                  onChange={(e) => setPixelSizeUm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-white/70">
                Sensor width (px)
                <input
                  type="text"
                  inputMode="numeric"
                  value={sensorWidthPx}
                  onChange={(e) => setSensorWidthPx(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-white/70">
                Sensor height (px)
                <input
                  type="text"
                  inputMode="numeric"
                  value={sensorHeightPx}
                  onChange={(e) => setSensorHeightPx(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
            </div>
            <label className="block text-sm text-white/70">
              Position angle (° east of north)
              <input
                type="text"
                inputMode="decimal"
                value={positionAngleDeg}
                onChange={(e) => setPositionAngleDeg(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            {equipmentPreview ? (
              <p className="text-xs text-white/55">
                Preview:{' '}
                <span className="text-white/80">
                  {equipmentPreview.fovWidthDeg.toFixed(2)}° × {equipmentPreview.fovHeightDeg.toFixed(2)}°
                </span>
                {' · '}
                <span className="text-white/80">{equipmentPreview.arcsecPerPixel.toFixed(2)}″/px</span>
              </p>
            ) : null}
            <div className="rounded-lg border border-dashed border-white/15 p-3">
              <label className="btn btn-muted cursor-pointer">
                {solving ? 'Solving…' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={solving}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void handleSolvePhoto(f)
                  }}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn mt-2">
                Save equipment
              </button>
              {equipment ? (
                <button type="button" onClick={handleClearEquipment} className="btn btn-muted mt-2">
                  Clear
                </button>
              ) : null}
            </div>
          </form>
          {eqMessage ? <p className="mt-3 text-sm text-green-400">{eqMessage}</p> : null}
          {eqError ? <p className="mt-3 text-sm text-red-400">{eqError}</p> : null}
        </section>

        <SettingsObsLogRow
          observatory={
            <>
              <div className="remote-pane-head">
                <h2>Observatory Status</h2>
              </div>
              <SettingsObservatoryStatusPanel onChanged={() => setLogRefreshToken((n) => n + 1)} />
            </>
          }
          log={<SettingsActivityLogPanel refreshToken={logRefreshToken} />}
        />

        <SettingsStoragePanel />

        <SettingsClosedWindowsPanel />

        <section className="remote-glass-pane settings-pane">
          <div className="remote-pane-head">
            <h2>All-sky camera</h2>
          </div>
          <form
            className="mt-2 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setAscStreamUrl(ascStreamUrl)
              setAscMessage('ASC stream URL saved.')
            }}
          >
            <label className="block text-sm text-white/70">
              Stream URL (ascStreamUrl)
              <input
                type="url"
                value={ascStreamUrl}
                onChange={(e) => setAscStreamUrlState(e.target.value)}
                placeholder="https://cam.example.com/stream"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <button type="submit" className="btn">
              Save ASC URL
            </button>
          </form>
          {ascMessage ? <p className="mt-3 text-sm text-green-400">{ascMessage}</p> : null}
        </section>

        <SettingsTeamPanel />
      </div>

      {message ? <p className="settings-footnote-msg text-green-400">{message}</p> : null}
      {error ? <p className="settings-footnote-msg text-red-400">{error}</p> : null}
    </div>
  )
}
