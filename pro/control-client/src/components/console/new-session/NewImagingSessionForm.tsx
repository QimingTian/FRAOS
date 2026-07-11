import { VARIABLE_STAR_FILTER_PRESETS } from './constants'
import { useNewImagingSessionForm } from './useNewImagingSessionForm'
import type { SessionPrefill } from './types'
import type { SessionRow } from '../../../lib/types'
import type { WeatherPrediction } from '../../../lib/weather-client'
import { MotionExpand, MotionModal } from '../../motion'
import { VariableStarPreviewCharts } from './variable-star-preview-charts'

type Props = {
  hubReachable: boolean
  observatoryStatus: string | undefined
  weatherPrediction: WeatherPrediction
  prefill?: SessionPrefill | null
  onPrefillConsumed?: () => void
  editingSession?: SessionRow | null
  onEditingSessionClear?: () => void
  onSubmitted?: () => void
}

export function NewImagingSessionForm(props: Props) {
  const s = useNewImagingSessionForm(props)
  const variableStarFilterKey = [...s.variableStarFilterSelection].sort().join('|')

  return (
    <section className="remote-overlay-pane nis-shell">
      <div className="nis-header">
        <h2>New Imaging Session</h2>
        <p className="nis-status-line">
          Observatory status:{' '}
          <span className={props.observatoryStatus === 'ready' ? 'nis-status-ok' : 'nis-status-bad'}>
            {s.statusText}
          </span>
          <span className="nis-sep">|</span>
          Tonight&apos;s weather prediction:{' '}
          <span className={s.weatherTone === 'ok' ? 'nis-status-ok' : s.weatherTone === 'muted' ? 'nis-status-muted' : 'nis-status-bad'}>
            {s.weatherText}
          </span>
        </p>
      </div>

      <form className="nis-form" onSubmit={(e) => void s.handleSubmit(e)}>
        <div className="nis-row">
          <div className="nis-group">
            <span className="nis-label">Session Type</span>
            <div className="nis-pill-row">
              <button
                type="button"
                className={s.sessionType === 'dso' ? 'nis-pill active' : 'nis-pill'}
                onClick={() => s.setSessionType('dso')}
              >
                Deep Sky Object Imaging
              </button>
              <button
                type="button"
                className={s.sessionType === 'variable_star' ? 'nis-pill active' : 'nis-pill'}
                onClick={() => s.setSessionType('variable_star')}
              >
                Variable Star Imaging
              </button>
            </div>
          </div>
          {s.sessionType === 'dso' && (
            <div className="nis-group">
              <span className="nis-label">Project Mode</span>
              <div className="nis-pill-row">
                <button
                  type="button"
                  className={!s.projectMode ? 'nis-pill active' : 'nis-pill'}
                  onClick={() => s.setProjectMode(false)}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={s.projectMode ? 'nis-pill active' : 'nis-pill'}
                  onClick={() => s.setProjectMode(true)}
                >
                  On
                </button>
              </div>
            </div>
          )}
        </div>

        <label className="nis-group">
          <span className="nis-label">Session Name *</span>
          <input
            required
            type="text"
            value={s.requestName}
            onChange={(e) => s.setRequestName(e.target.value)}
            placeholder={s.sessionType === 'variable_star' ? 'e.g. AW UMa Session 1' : 'e.g. M31 LRGB Session 1'}
            className="nis-input"
            disabled={s.submitting || !props.hubReachable}
          />
        </label>

        {s.sessionType === 'variable_star' ? (
          <>
            <div className="nis-grid-3">
              <label className="nis-group">
                <span className="nis-label">Star Filter</span>
                <div className="nis-dropdown-wrap" ref={s.variableStarFilterDropdownRef}>
                  <button
                    type="button"
                    onClick={() => s.setVariableStarFilterDropdownOpen((prev) => !prev)}
                    className="nis-input nis-input-button"
                  >
                    {s.variableStarFilterSelection.length === 0
                      ? '-- Select Filter --'
                      : `${s.variableStarFilterSelection.length} Filter${s.variableStarFilterSelection.length > 1 ? 's' : ''} Selected`}
                  </button>
                  <MotionExpand open={s.variableStarFilterDropdownOpen} className="nis-dropdown-motion">
                    <div className="nis-dropdown">
                      {VARIABLE_STAR_FILTER_PRESETS.map((option) => {
                        const checked = s.variableStarFilterSelection.includes(option.value)
                        return (
                          <label key={option.value} className="nis-dropdown-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                s.setVariableStarFilterSelection((prev) =>
                                  e.target.checked
                                    ? [...prev, option.value]
                                    : prev.filter((x) => x !== option.value)
                                )
                              }
                            />
                            <span>{option.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </MotionExpand>
                </div>
              </label>
              <label className="nis-group">
                <span className="nis-label">Star List</span>
                <select
                  key={variableStarFilterKey}
                  value={s.variableStarListSelection}
                  disabled={s.variableStarCatalogLoading || s.displayedVariableStars.length === 0}
                  onChange={(e) => s.handleVariableStarListSelection(e.target.value)}
                  className="nis-input"
                >
                  <option value="">-- Select A Star --</option>
                  {s.displayedVariableStars.map((star) => (
                    <option key={star.name} value={star.name}>
                      {star.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="nis-group nis-relative">
                <span className="nis-label">Search A Star</span>
                {s.variableStarSimbadSearching && <span className="nis-inline-note">Searching In SIMBAD</span>}
                <input
                  type="text"
                  value={s.catalogQuery}
                  onChange={(e) => {
                    s.setCatalogQuery(e.target.value)
                    s.setVariableStarListSelection('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    void s.handleCatalogLookup()
                  }}
                  placeholder="e.g. RR Lyr"
                  className="nis-input"
                  disabled={s.submitting || !props.hubReachable}
                />
              </label>
            </div>
            <VariableStarPreviewCharts star={s.variableStarPreviewStar} />
          </>
        ) : (
          <div className="nis-inline">
            <label className="nis-group nis-grow">
              <span className="nis-label">Catalog Target Search</span>
              <input
                type="text"
                value={s.catalogQuery}
                onChange={(e) => s.setCatalogQuery(e.target.value)}
                placeholder="Try M31, NGC 7000, IC 434, M42..."
                className="nis-input"
                disabled={s.submitting || !props.hubReachable}
              />
            </label>
            <button
              type="button"
              onClick={() => void s.handleCatalogLookup()}
              disabled={s.catalogLookupLoading || s.submitting || !props.hubReachable}
              className="nis-pill"
            >
              {s.catalogLookupLoading ? 'Searching...' : 'Search Target'}
            </button>
          </div>
        )}

        {s.variableStarCatalogLoading && s.sessionType === 'variable_star' && <p className="nis-note">Loading variable star catalog...</p>}
        {s.variableStarCatalogError && s.sessionType === 'variable_star' && <p className="nis-error">{s.variableStarCatalogError}</p>}
        {s.catalogLookupError && <p className="nis-error">{s.catalogLookupError}</p>}
        {s.catalogLookupResult && s.sessionType === 'dso' && (
          <p className="nis-ok">
            Found <strong>{s.catalogLookupResult.canonicalName}</strong>. Coordinates auto-filled.
          </p>
        )}
        {s.variableStarLastFoundName && s.sessionType === 'variable_star' && (
          <p className="nis-ok">
            Found <strong>{s.variableStarLastFoundName}</strong>{' '}
            {s.variableStarLastFoundSource === 'simbad' ? '(SIMBAD)' : '(Index Catalog)'}. Coordinates auto-filled.
          </p>
        )}

        <div className="nis-grid-2">
          <div className="nis-group">
            <span className="nis-label">Right Ascension (RA) *</span>
            <div className="nis-grid-3">
              <input required type="text" inputMode="numeric" value={s.raHourPart} onChange={(e) => s.setRaHourPart(e.target.value)} placeholder="Hour" className="nis-input" />
              <input required type="text" inputMode="numeric" value={s.raMinutePart} onChange={(e) => s.setRaMinutePart(e.target.value)} placeholder="Min" className="nis-input" />
              <input required type="text" inputMode="decimal" value={s.raSecondPart} onChange={(e) => s.setRaSecondPart(e.target.value)} placeholder="Sec" className="nis-input" />
            </div>
          </div>
          <div className="nis-group">
            <span className="nis-label">Declination (Dec) *</span>
            <div className="nis-grid-4">
              <select value={s.decSign} onChange={(e) => s.setDecSign(e.target.value)} className="nis-input">
                <option value="+">+</option>
                <option value="-">-</option>
              </select>
              <input required type="text" inputMode="numeric" value={s.decDegreePart} onChange={(e) => s.setDecDegreePart(e.target.value)} placeholder="Deg" className="nis-input" />
              <input required type="text" inputMode="numeric" value={s.decMinutePart} onChange={(e) => s.setDecMinutePart(e.target.value)} placeholder="Min" className="nis-input" />
              <input required type="text" inputMode="decimal" value={s.decSecondPart} onChange={(e) => s.setDecSecondPart(e.target.value)} placeholder="Sec" className="nis-input" />
            </div>
          </div>
        </div>

        {s.sessionType === 'variable_star' && s.variableStarDurationPick && (
          <div className="nis-group">
            <span className="nis-label">Session Duration</span>
            <div
              className="nis-duration-grid"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(s.variableStarDurationPick.allOptions.length / 2))}, minmax(0, 1fr))`,
              }}
            >
              {s.variableStarDurationPick.allOptions.map((h) => {
                const halfStepsForH = Math.round(h * 2)
                const enabled =
                  s.variableStarDurationPick?.coordsOk &&
                  halfStepsForH <= s.variableStarDurationPick.starHalfSteps
                const selected = enabled && s.variableStarBlockHours === h
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={!enabled}
                    aria-disabled={!enabled}
                    onClick={() => {
                      if (enabled) {
                        s.setVariableStarBlockHours(h)
                        s.setVariableStarDurationUserSelected(true)
                      }
                    }}
                    className={selected ? 'nis-pill active' : 'nis-pill'}
                  >
                    {h} h
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {s.sessionType === 'dso' && (
          <div className="nis-group">
            <span className="nis-label">Filters *</span>
            <div className="nis-pill-row">
              {s.availableFilterOptions.map((option) => {
                const selected = s.filterPlans.some((x) => x.filterName === option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      s.setFilterPlans((prev) => {
                        const idx = prev.findIndex((x) => x.filterName === option.value)
                        if (idx >= 0) return prev.filter((x) => x.filterName !== option.value)
                        return [...prev, { filterName: option.value, count: '10', exposureSeconds: '' }]
                      })
                    }}
                    className={selected ? 'nis-pill active' : 'nis-pill'}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            {s.filterPlans.length > 0 && (
              <div className="nis-plan-table">
                <div className="nis-plan-head">
                  <span>Filter</span>
                  <span>Frame Count *</span>
                  <span>Exposure per Frame (s) *</span>
                </div>
                {s.filterPlans.map((plan) => (
                  <div key={plan.filterName} className="nis-plan-row">
                    <span className="nis-filter-tag">{plan.filterName}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={plan.count}
                      onChange={(e) =>
                        s.setFilterPlans((prev) =>
                          prev.map((x) =>
                            x.filterName === plan.filterName ? { ...x, count: e.target.value } : x
                          )
                        )
                      }
                      className="nis-input"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={plan.exposureSeconds}
                      onChange={(e) =>
                        s.setFilterPlans((prev) =>
                          prev.map((x) =>
                            x.filterName === plan.filterName
                              ? { ...x, exposureSeconds: e.target.value }
                              : x
                          )
                        )
                      }
                      className="nis-input"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="nis-grid-2">
          <div className="nis-group">
            <span className="nis-label">Output Type *</span>
            <div className="nis-pill-row">
              <button
                type="button"
                disabled={s.storageOverQuota}
                className={s.outputMode === 'raw_zip' ? 'nis-pill active' : 'nis-pill'}
                onClick={() => s.setOutputMode('raw_zip')}
              >
                Raw ZIP
              </button>
              {/* Stacked Master removed — Borean Astro no longer offers this output mode. */}
              <button type="button" className={s.outputMode === 'none' ? 'nis-pill active' : 'nis-pill'} onClick={() => s.setOutputMode('none')}>None</button>
            </div>
            {s.storageOverQuota ? (
              <p className="mt-2 text-xs text-white/55">
                Cloud storage is full. Delete files in Settings or choose None.
              </p>
            ) : null}
          </div>
          <div className="nis-group">
            <span className="nis-label">Camera Temperature</span>
            <div className="nis-pill-row">
              <button type="button" className={s.cameraCoolingTempC === -10 ? 'nis-pill active' : 'nis-pill'} onClick={() => s.setCameraCoolingTempC(-10)}>−10°C</button>
              <button type="button" className={s.cameraCoolingTempC === 0 ? 'nis-pill active' : 'nis-pill'} onClick={() => s.setCameraCoolingTempC(0)}>0°C</button>
            </div>
          </div>
        </div>

        {s.submitError && <p className="nis-error">{s.submitError}</p>}
        {s.submitSuccess && <p className="nis-ok">{s.submitSuccess}</p>}

        <div className="nis-actions">
          <button
            type="submit"
            disabled={s.submitting || !props.hubReachable}
            className="nis-launch"
          >
            {s.submitting
              ? s.editingSessionId
                ? 'Finishing...'
                : 'Starting...'
              : s.editingSessionId
                ? 'Finish Editing'
                : 'Start Session'}
          </button>
          <button type="button" disabled={!props.hubReachable} className="nis-pill" onClick={s.openRunModal}>
            Run Saved
          </button>
          <button type="button" disabled={!s.canSaveRemoteSessionSpec} className="nis-pill" onClick={s.openSaveModal}>
            Save Session
          </button>
        </div>
        <p className="nis-note">Estimated duration: {s.estimatedDurationText}</p>
      </form>

      <MotionModal
        show={s.showClosedModal}
        onClose={() => s.setShowClosedModal(false)}
        backdropClassName="nis-modal-backdrop"
        panelClassName="nis-modal"
      >
        <h3>Observatory Closed</h3>
        <p>Choose how to continue:</p>
        <button type="button" className="nis-modal-btn" onClick={() => {
          s.setShowClosedModal(false)
        }}>
          1. Do not start now.
        </button>
        <button type="button" className="nis-modal-btn" onClick={() => void s.handleSubmitWhenClosed()}>
          2. Start now and queue until observatory is Ready.
        </button>
      </MotionModal>

      <MotionModal
        show={s.showAltitudeModal}
        onClose={() => s.setShowAltitudeModal(false)}
        backdropClassName="nis-modal-backdrop"
        panelClassName="nis-modal"
      >
        <h3>Target Below 30°</h3>
        <p>
          {s.lastComputedAltitude != null
            ? `Current altitude is ${s.lastComputedAltitude.toFixed(2)}° (< 30°).`
            : 'Current altitude is below 30°.'}
        </p>
        <button type="button" className="nis-modal-btn" onClick={() => s.setShowAltitudeModal(false)}>
          1. Do not start.
        </button>
        <button type="button" className="nis-modal-btn" onClick={() => void s.handleSubmitWhenLowAltitude()}>
          2. Start now and wait until altitude reaches 30°.
        </button>
      </MotionModal>

      <MotionModal
        show={s.showSaveModal}
        onClose={() => s.setShowSaveModal(false)}
        backdropClassName="nis-modal-backdrop"
        panelClassName="nis-modal"
      >
        <h3>Save Session</h3>
        <p>Save this form as a reusable template on your local control client.</p>
        <label className="nis-group">
          <span className="nis-label">Session name</span>
          <input type="text" value={s.saveModalName} onChange={(e) => s.setSaveModalName(e.target.value)} className="nis-input" />
        </label>
        {s.saveModalError && <p className="nis-error">{s.saveModalError}</p>}
        <div className="nis-modal-actions">
          <button type="button" className="nis-pill" onClick={() => s.setShowSaveModal(false)}>
            Cancel
          </button>
          <button type="button" className="nis-pill active" onClick={s.saveCurrentSession}>
            Save
          </button>
        </div>
      </MotionModal>

      <MotionModal
        show={s.showRunModal}
        onClose={() => s.setShowRunModal(false)}
        backdropClassName="nis-modal-backdrop"
        panelClassName="nis-modal"
      >
        <h3>Run Saved Session</h3>
        {s.savedSessions.length > 0 && (
          <label className="nis-group">
            <span className="nis-label">Saved templates</span>
            <select value={s.runModalName} onChange={(e) => s.setRunModalName(e.target.value)} className="nis-input">
              <option value="">Select...</option>
              {s.savedSessions.map((session) => (
                <option key={session.id} value={session.name}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="nis-group">
          <span className="nis-label">Session name</span>
          <input type="text" value={s.runModalName} onChange={(e) => s.setRunModalName(e.target.value)} className="nis-input" />
        </label>
        {s.runModalError && <p className="nis-error">{s.runModalError}</p>}
        <div className="nis-modal-actions">
          <button type="button" className="nis-pill" onClick={() => s.setShowRunModal(false)}>
            Cancel
          </button>
          <button type="button" className="nis-pill active" onClick={s.runSavedSession}>
            Load
          </button>
        </div>
      </MotionModal>
    </section>
  )
}
