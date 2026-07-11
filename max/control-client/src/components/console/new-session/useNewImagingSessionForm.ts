import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  VARIABLE_STAR_SESSION_OVERHEAD_HOURS,
  VARIABLE_STAR_SESSION_OVERHEAD_SEC,
} from '../../../lib/imaging/session-overhead'
import {
  applySexagesimalPartsFromRadec,
  formatDurationShort,
  parseCoordsFromFormParts,
} from '../../../lib/imaging/coords'
import {
  fetchLocalSavedSessions,
  loadLocalSavedSessionByName,
  saveLocalSavedSession,
  type RemoteSavedSessionFormV1,
  type SavedSessionEntry,
} from '../../../lib/imaging/saved-sessions-local'
import { submitImagingSession, updateImagingSession } from '../../../lib/imaging/submit-imaging-session'
import {
  getActiveMaxSiteTenantId,
} from '../../../lib/active-max-site'
import {
  listControlMaxSites,
  maxPlanActive,
  maxSiteAsTenant,
  resolveSelectedMaxSite,
} from '../../../lib/max-sites-access'
import type { MaxSiteConfig } from '@shared/max-sites'
import { fetchStorageQuota } from '../../../lib/hub-client'
import type { SessionRow } from '../../../lib/types'
import { contentApiPath } from '../../../lib/content-base'
import type { WeatherPrediction } from '../../../lib/weather-client'
import {
  MIN_ALTITUDE_DEG,
  TONIGHT_OBSERVABLE_MIN_COVERAGE_MS,
  altitudeAllowedCoverageMs,
  currentAltitudeDeg,
} from '../../../lib/site/target-altitude'
import {
  getTonightAstronomicalNightWindow,
  getTonightSchedulingWindow,
} from '../../../lib/site/sunrise-window'
import { FILTER_OPTIONS } from './constants'
import {
  estimateDurationSecondsFromPlans,
  observatoryStatusLabel,
  pickVariableStarRow,
  rowToVariableChartStar,
  variableStarDurationButtonModel,
  variableStarNightHalfHourLadder,
  weatherPredictionLabel,
} from './helpers'
import type {
  ImagingSessionTypeUi,
  ResolvedCatalogObject,
  SessionPrefill,
  VariableStarFilterUi,
  VariableStarRow,
} from './types'
import type { VariableStarChartStar } from './variable-star-preview-charts'

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

type FilterPlanInput = { filterName: string; count: string; exposureSeconds: string }

export function useNewImagingSessionForm({
  hubReachable,
  observatoryStatus,
  weatherPrediction,
  prefill,
  onPrefillConsumed,
  editingSession,
  onEditingSessionClear,
  onSubmitted,
}: Props) {
  const editingSessionId = editingSession?.id ?? null
  const [maxSites, setMaxSites] = useState<MaxSiteConfig[]>([])
  const maxMultiSite = maxPlanActive() && maxSites.length > 1
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [sessionType, setSessionType] = useState<ImagingSessionTypeUi>('dso')
  const [projectMode, setProjectMode] = useState(false)
  const [requestName, setRequestName] = useState('')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogLookupLoading, setCatalogLookupLoading] = useState(false)
  const [catalogLookupError, setCatalogLookupError] = useState<string | null>(null)
  const [catalogLookupResult, setCatalogLookupResult] = useState<ResolvedCatalogObject | null>(null)
  const [variableStarCatalog, setVariableStarCatalog] = useState<VariableStarRow[]>([])
  const [variableStarCatalogLoading, setVariableStarCatalogLoading] = useState(false)
  const [variableStarCatalogError, setVariableStarCatalogError] = useState<string | null>(null)
  const [variableStarPreviewStar, setVariableStarPreviewStar] = useState<VariableStarChartStar | null>(null)
  const [variableStarLastFoundName, setVariableStarLastFoundName] = useState<string | null>(null)
  const [variableStarLastFoundSource, setVariableStarLastFoundSource] = useState<'catalog' | 'simbad' | null>(null)
  const [variableStarSimbadSearching, setVariableStarSimbadSearching] = useState(false)
  const [variableStarListSelection, setVariableStarListSelection] = useState('')
  const [variableStarFilterSelection, setVariableStarFilterSelection] = useState<VariableStarFilterUi[]>([])
  const [variableStarFilterDropdownOpen, setVariableStarFilterDropdownOpen] = useState(false)
  const [variableStarBlockHours, setVariableStarBlockHours] = useState(1)
  const [variableStarDurationUserSelected, setVariableStarDurationUserSelected] = useState(false)
  const [raHourPart, setRaHourPart] = useState('')
  const [raMinutePart, setRaMinutePart] = useState('')
  const [raSecondPart, setRaSecondPart] = useState('')
  const [decSign, setDecSign] = useState('+')
  const [decDegreePart, setDecDegreePart] = useState('')
  const [decMinutePart, setDecMinutePart] = useState('')
  const [decSecondPart, setDecSecondPart] = useState('')
  const [sessionPassword, setSessionPassword] = useState('')
  const [outputMode, setOutputMode] = useState<'raw_zip' | 'none'>('raw_zip')
  const [storageOverQuota, setStorageOverQuota] = useState(false)
  const [cameraCoolingTempC, setCameraCoolingTempC] = useState<-10 | 0>(-10)
  const [filterPlans, setFilterPlans] = useState<FilterPlanInput[]>([])
  const [showClosedModal, setShowClosedModal] = useState(false)
  const [showAltitudeModal, setShowAltitudeModal] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showRunModal, setShowRunModal] = useState(false)
  const [saveModalName, setSaveModalName] = useState('')
  const [saveModalError, setSaveModalError] = useState<string | null>(null)
  const [runModalName, setRunModalName] = useState('')
  const [runModalError, setRunModalError] = useState<string | null>(null)
  const [savedSessions, setSavedSessions] = useState<SavedSessionEntry[]>([])
  const [lastComputedAltitude, setLastComputedAltitude] = useState<number | null>(null)
  const variableStarFilterDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      if (!maxPlanActive()) {
        setMaxSites([])
        return
      }
      const sites = await listControlMaxSites()
      setMaxSites(sites)
    })()
  }, [])

  const refreshStorageQuota = useCallback(async () => {
    if (!hubReachable) {
      setStorageOverQuota(false)
      return
    }
    const res = await fetchStorageQuota()
    if (res.ok) setStorageOverQuota(res.overQuota === true)
  }, [hubReachable])

  useEffect(() => {
    void refreshStorageQuota()
  }, [refreshStorageQuota, submitSuccess])

  useEffect(() => {
    if (storageOverQuota && outputMode === 'raw_zip') setOutputMode('none')
  }, [storageOverQuota, outputMode])

const VARIABLE_STAR_FILTER_VALUES: VariableStarFilterUi[] = [
  'tonight_observable',
  'high_priority',
  'short_period',
  'mid_period',
  'long_period',
  'type_na',
  'type_lc',
  'type_m',
  'type_src',
  'type_ea',
]

  useEffect(() => {
    if (!prefill || editingSessionId) return
    setRequestName(prefill.target)
    if (
      typeof prefill.raHours === 'number' &&
      Number.isFinite(prefill.raHours) &&
      typeof prefill.decDeg === 'number' &&
      Number.isFinite(prefill.decDeg)
    ) {
      applySexagesimalPartsFromRadec(
        prefill.raHours,
        prefill.decDeg,
        setRaHourPart,
        setRaMinutePart,
        setRaSecondPart,
        setDecSign,
        setDecDegreePart,
        setDecMinutePart,
        setDecSecondPart
      )
    }
    onPrefillConsumed?.()
  }, [prefill, editingSessionId, onPrefillConsumed])

  useEffect(() => {
    if (!editingSession) return
    const item = editingSession
    setProjectMode(item.projectMode === true)
    setSessionType(item.sessionType === 'variable_star' ? 'variable_star' : 'dso')
    setVariableStarPreviewStar(null)
    setVariableStarLastFoundName(null)
    setVariableStarListSelection('')
    setCatalogQuery('')
    setCatalogLookupResult(null)
    setCatalogLookupError(null)
    setRequestName(item.target ?? '')
    if (typeof item.raHours === 'number' && Number.isFinite(item.raHours)) {
      const totalRaSec = item.raHours * 3600
      const raH = Math.floor(totalRaSec / 3600)
      const raM = Math.floor((totalRaSec - raH * 3600) / 60)
      const raS = totalRaSec - raH * 3600 - raM * 60
      setRaHourPart(String(raH))
      setRaMinutePart(String(raM))
      setRaSecondPart(String(Number(raS.toFixed(3))))
    }
    if (typeof item.decDeg === 'number' && Number.isFinite(item.decDeg)) {
      const sign: '+' | '-' = item.decDeg < 0 ? '-' : '+'
      const absDec = Math.abs(item.decDeg)
      const decD = Math.floor(absDec)
      const decM = Math.floor((absDec - decD) * 60)
      const decS = (absDec - decD - decM / 60) * 3600
      setDecSign(sign)
      setDecDegreePart(String(decD))
      setDecMinutePart(String(decM))
      setDecSecondPart(String(Number(decS.toFixed(3))))
    }
    if (item.sessionType === 'variable_star') {
      const est = item.estimatedDurationSeconds
      if (typeof est === 'number' && Number.isFinite(est) && est > VARIABLE_STAR_SESSION_OVERHEAD_SEC) {
        const blockH = est / 3600 - VARIABLE_STAR_SESSION_OVERHEAD_HOURS
        const snapped = Math.round(blockH * 2) / 2
        setVariableStarBlockHours(Number.isFinite(snapped) && snapped >= 0.5 ? snapped : 1)
      } else {
        setVariableStarBlockHours(1)
      }
      setVariableStarDurationUserSelected(true)
    } else {
      setVariableStarBlockHours(1)
    }
    const output = item.outputMode === 'none' ? 'none' : 'raw_zip'
    setOutputMode(output)
    if (item.cameraCoolingTempC === 0 || item.cameraCoolingTempC === -10) {
      setCameraCoolingTempC(item.cameraCoolingTempC)
    }
    if (Array.isArray(item.filterPlans) && item.filterPlans.length > 0) {
      setFilterPlans(
        item.filterPlans.map((p) => ({
          filterName: p.filterName,
          count: String(p.count),
          exposureSeconds: String(p.exposureSeconds),
        }))
      )
    }
    setSessionPassword('')
    setSubmitError(null)
    setSubmitSuccess('Editing pending session. Update fields then click Finish Editing.')
  }, [editingSession])

  useEffect(() => {
    if (sessionType !== 'variable_star') {
      setVariableStarFilterDropdownOpen(false)
      return
    }
    let cancelled = false
    setVariableStarCatalogLoading(true)
    setVariableStarCatalogError(null)
    void (async () => {
      try {
        const res = await fetch(contentApiPath('/api/imaging/variable-stars'))
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          stars?: VariableStarRow[]
          error?: string
        }
        if (cancelled) return
        if (!res.ok || data.ok !== true || !Array.isArray(data.stars)) {
          setVariableStarCatalog([])
          setVariableStarCatalogError(data.error ?? 'Failed to load variable star catalog.')
          return
        }
        setVariableStarCatalog(data.stars)
      } catch {
        if (!cancelled) {
          setVariableStarCatalog([])
          setVariableStarCatalogError('Failed to load variable star catalog.')
        }
      } finally {
        if (!cancelled) setVariableStarCatalogLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionType])

  useEffect(() => {
    if (!variableStarFilterDropdownOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      const root = variableStarFilterDropdownRef.current
      if (!root) return
      if (root.contains(event.target as Node)) return
      setVariableStarFilterDropdownOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [variableStarFilterDropdownOpen])

  const sortedVariableStars = useMemo(
    () =>
      [...variableStarCatalog].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [variableStarCatalog]
  )

  const displayedVariableStars = useMemo(() => {
    const selected = new Set(variableStarFilterSelection)
    if (selected.size === 0) return sortedVariableStars
    const hasShortPeriod = selected.has('short_period')
    const hasMidPeriod = selected.has('mid_period')
    const hasLongPeriod = selected.has('long_period')
    const hasAnyPeriodFilter = hasShortPeriod || hasMidPeriod || hasLongPeriod
    const hasTypeNa = selected.has('type_na')
    const hasTypeLc = selected.has('type_lc')
    const hasTypeM = selected.has('type_m')
    const hasTypeSrc = selected.has('type_src')
    const hasTypeEa = selected.has('type_ea')
    const hasAnyTypeFilter = hasTypeNa || hasTypeLc || hasTypeM || hasTypeSrc || hasTypeEa
    const wantsTonightObservable = selected.has('tonight_observable')

    let filtered = sortedVariableStars
    if (selected.has('high_priority')) filtered = filtered.filter((s) => s.highPriority)
    if (hasAnyPeriodFilter) {
      filtered = filtered.filter((s) => {
        const p = s.periodDays
        if (p == null) return false
        if (hasShortPeriod && p < 1) return true
        if (hasMidPeriod && p >= 1 && p < 100) return true
        if (hasLongPeriod && p >= 100) return true
        return false
      })
    }
    if (hasAnyTypeFilter) {
      filtered = filtered.filter((s) => {
        const t = (s.varType ?? '').toUpperCase()
        if (hasTypeNa && t.includes('NA')) return true
        if (hasTypeLc && t.includes('LC')) return true
        if (hasTypeM && t === 'M') return true
        if (hasTypeSrc && t.includes('SRC')) return true
        if (hasTypeEa && t.includes('EA')) return true
        return false
      })
    }
    if (!wantsTonightObservable && !hasAnyPeriodFilter && !hasAnyTypeFilter) return filtered
    const { astronomicalDuskUtc, astronomicalDawnUtc } = getTonightAstronomicalNightWindow(new Date())
    const startMs = astronomicalDuskUtc.getTime()
    const endMs = astronomicalDawnUtc.getTime()
    const withCoverage = filtered
      .map((s) => ({
        star: s,
        coverageMs: altitudeAllowedCoverageMs(
          s.raHours,
          s.decDeg,
          startMs,
          endMs
        ),
      }))
      .sort((a, b) => b.coverageMs - a.coverageMs || a.star.name.localeCompare(b.star.name))
    if (wantsTonightObservable) {
      return withCoverage
        .filter((x) => x.coverageMs >= TONIGHT_OBSERVABLE_MIN_COVERAGE_MS)
        .map((x) => x.star)
    }
    return withCoverage.map((x) => x.star)
  }, [sortedVariableStars, variableStarFilterSelection])

  const variableStarDurationPick = useMemo(() => {
    if (sessionType !== 'variable_star') return null
    const { nauticalDuskUtc, nauticalDawnUtc } = getTonightSchedulingWindow(new Date())
    const { allOptions, nightHours, nightHalfSteps } = variableStarNightHalfHourLadder(
      nauticalDuskUtc,
      nauticalDawnUtc
    )
    const parsed = parseCoordsFromFormParts(
      raHourPart,
      raMinutePart,
      raSecondPart,
      decSign,
      decDegreePart,
      decMinutePart,
      decSecondPart
    )
    if (!parsed.ok) {
      return {
        coordsOk: false as const,
        allOptions,
        nightHours,
        nightHalfSteps,
        starHalfSteps: 0,
        above30Ms: 0,
        above30Hours: 0,
      }
    }
    const model = variableStarDurationButtonModel(
      parsed.raHours,
      parsed.decDeg,
      nauticalDuskUtc,
      nauticalDawnUtc
    )
    return { coordsOk: true as const, raHours: parsed.raHours, decDeg: parsed.decDeg, ...model }
  }, [
    sessionType,
    raHourPart,
    raMinutePart,
    raSecondPart,
    decSign,
    decDegreePart,
    decMinutePart,
    decSecondPart,
  ])

  useEffect(() => {
    if (sessionType !== 'variable_star') return
    if (!variableStarDurationPick?.coordsOk) return
    const { allOptions, starHalfSteps } = variableStarDurationPick
    if (allOptions.length === 0 || starHalfSteps < 1) return
    const maxEnabled = starHalfSteps * 0.5
    setVariableStarBlockHours((prev) => {
      const enabled = allOptions.filter((o) => o <= maxEnabled + 1e-9)
      if (enabled.length === 0) return prev
      if (enabled.includes(prev)) return prev
      return enabled[enabled.length - 1]!
    })
  }, [sessionType, variableStarDurationPick])

  useEffect(() => {
    if (sessionType !== 'dso') setProjectMode(false)
  }, [sessionType])

  const dsoEstimatedDurationPreviewSeconds = useMemo(() => {
    if (sessionType !== 'dso') return null
    if (filterPlans.length === 0) return null
    const normalized: Array<{ filterName: string; count: number; exposureSeconds: number }> = []
    for (const plan of filterPlans) {
      const filterName = plan.filterName.trim()
      const frames = Math.round(Number(plan.count))
      const exposure = Math.round(Number(plan.exposureSeconds))
      if (!filterName) return null
      if (!Number.isFinite(frames) || frames < 1 || frames > 500) return null
      if (!Number.isFinite(exposure) || exposure < 1 || exposure > 3600) return null
      normalized.push({ filterName, count: frames, exposureSeconds: exposure })
    }
    return estimateDurationSecondsFromPlans(normalized)
  }, [sessionType, filterPlans, outputMode])

  const estimatedDurationText = useMemo(() => {
    if (sessionType === 'variable_star') {
      if (
        !variableStarDurationPick?.coordsOk ||
        (variableStarDurationPick.starHalfSteps ?? 0) < 1 ||
        !variableStarDurationUserSelected
      ) {
        return '--'
      }
      return formatDurationShort((variableStarBlockHours + VARIABLE_STAR_SESSION_OVERHEAD_HOURS) * 3600)
    }
    return dsoEstimatedDurationPreviewSeconds == null
      ? '--'
      : formatDurationShort(dsoEstimatedDurationPreviewSeconds)
  }, [
    dsoEstimatedDurationPreviewSeconds,
    sessionType,
    variableStarBlockHours,
    variableStarDurationPick,
    variableStarDurationUserSelected,
  ])

  const canSaveRemoteSessionSpec = useMemo(() => {
    if (!hubReachable) return false
    if (!requestName.trim()) return false
    const coord = parseCoordsFromFormParts(
      raHourPart,
      raMinutePart,
      raSecondPart,
      decSign,
      decDegreePart,
      decMinutePart,
      decSecondPart
    )
    if (!coord.ok) return false
    if (sessionType === 'variable_star') {
      if (!variableStarDurationPick?.coordsOk) return false
      const maxEnabled = variableStarDurationPick.starHalfSteps * 0.5
      return (
        variableStarDurationPick.allOptions.includes(variableStarBlockHours) &&
        variableStarBlockHours <= maxEnabled + 1e-9
      )
    }
    if (filterPlans.length === 0) return false
    for (const plan of filterPlans) {
      const filterName = plan.filterName.trim()
      const frames = Math.round(Number(plan.count))
      const exposure = Math.round(Number(plan.exposureSeconds))
      if (!filterName) return false
      if (!Number.isFinite(frames) || frames < 1 || frames > 500) return false
      if (!Number.isFinite(exposure) || exposure < 1 || exposure > 3600) return false
    }
    return true
  }, [
    hubReachable,
    requestName,
    raHourPart,
    raMinutePart,
    raSecondPart,
    decSign,
    decDegreePart,
    decMinutePart,
    decSecondPart,
    sessionType,
    variableStarDurationPick,
    variableStarBlockHours,
    filterPlans,
    outputMode,
  ])

  const parseCoordinates = useCallback((): { raHours: number; decDeg: number } | null => {
    const r = parseCoordsFromFormParts(
      raHourPart,
      raMinutePart,
      raSecondPart,
      decSign,
      decDegreePart,
      decMinutePart,
      decSecondPart
    )
    if (!r.ok) {
      setSubmitError(r.message)
      return null
    }
    return { raHours: r.raHours, decDeg: r.decDeg }
  }, [raHourPart, raMinutePart, raSecondPart, decSign, decDegreePart, decMinutePart, decSecondPart])

  const applyVariableStarCatalogRow = useCallback((row: VariableStarRow, source: 'catalog' | 'simbad') => {
    applySexagesimalPartsFromRadec(
      row.raHours,
      row.decDeg,
      setRaHourPart,
      setRaMinutePart,
      setRaSecondPart,
      setDecSign,
      setDecDegreePart,
      setDecMinutePart,
      setDecSecondPart
    )
    setVariableStarPreviewStar(rowToVariableChartStar(row))
    setVariableStarLastFoundName(row.name)
    setVariableStarLastFoundSource(source)
    setCatalogQuery(row.name)
    const visibleInCurrentFilters = displayedVariableStars.some((s) => s.name === row.name)
    setVariableStarListSelection(source === 'catalog' && visibleInCurrentFilters ? row.name : '')
    setCatalogLookupError(null)
    setCatalogLookupResult(null)
  }, [displayedVariableStars])

  const handleVariableStarListSelection = useCallback((name: string) => {
    setVariableStarListSelection(name)
    if (!name) return
    const row = variableStarCatalog.find((s) => s.name === name)
    if (row) applyVariableStarCatalogRow(row, 'catalog')
  }, [variableStarCatalog, applyVariableStarCatalogRow])

  const handleCatalogLookup = useCallback(async () => {
    const trimmedQuery = catalogQuery.trim()
    if (!trimmedQuery) {
      setCatalogLookupError(
        sessionType === 'variable_star'
          ? 'Enter a variable star name (e.g. RR Lyr).'
          : 'Enter a catalog target name first (e.g. M31, NGC 7000).'
      )
      setCatalogLookupResult(null)
      return
    }
    setCatalogLookupLoading(true)
    setCatalogLookupError(null)
    setCatalogLookupResult(null)
    setVariableStarLastFoundName(null)
    setVariableStarLastFoundSource(null)
    setVariableStarSimbadSearching(false)
    setVariableStarPreviewStar(null)
    setVariableStarListSelection('')
    try {
      if (sessionType === 'variable_star') {
        if (variableStarCatalogLoading) {
          setCatalogLookupError('Catalog is still loading. Try again in a moment.')
          return
        }
        let localError: string | null = null
        if (variableStarCatalog.length > 0) {
          const picked = pickVariableStarRow(variableStarCatalog, trimmedQuery)
          if (picked.ok) {
            applyVariableStarCatalogRow(picked.row, 'catalog')
            return
          }
          localError = picked.error
        } else if (variableStarCatalogError) {
          localError = variableStarCatalogError
        }
        setVariableStarSimbadSearching(true)
        try {
          const simbadRes = await fetch(
            contentApiPath(`/api/imaging/variable-star-lookup?query=${encodeURIComponent(trimmedQuery)}`)
          )
          const simbadData = (await simbadRes.json().catch(() => ({}))) as {
            ok?: boolean
            star?: VariableStarRow
            error?: string
          }
          if (!simbadRes.ok || simbadData.ok !== true || !simbadData.star) {
            const simbadError =
              typeof simbadData.error === 'string'
                ? simbadData.error
                : `No SIMBAD variable-star match for "${trimmedQuery}".`
            setCatalogLookupError(localError ? `${localError} Also tried SIMBAD: ${simbadError}` : simbadError)
            return
          }
          applyVariableStarCatalogRow(simbadData.star, 'simbad')
        } finally {
          setVariableStarSimbadSearching(false)
        }
        return
      }
      const res = await fetch(
        contentApiPath(`/api/imaging/object-resolve?query=${encodeURIComponent(trimmedQuery)}`)
      )
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        object?: ResolvedCatalogObject
        error?: string
      }
      if (!res.ok || data.ok !== true || !data.object) {
        setCatalogLookupError(typeof data.error === 'string' ? data.error : 'Target lookup failed.')
        return
      }
      const object = data.object
      setCatalogLookupResult(object)
      setRaHourPart(String(object.ra.hour))
      setRaMinutePart(String(object.ra.minute))
      setRaSecondPart(String(object.ra.second))
      setDecSign(object.dec.sign)
      setDecDegreePart(String(object.dec.degree))
      setDecMinutePart(String(object.dec.minute))
      setDecSecondPart(String(object.dec.second))
      if (!requestName.trim()) setRequestName(object.canonicalName)
    } finally {
      setCatalogLookupLoading(false)
    }
  }, [
    catalogQuery,
    sessionType,
    variableStarCatalogLoading,
    variableStarCatalog,
    variableStarCatalogError,
    applyVariableStarCatalogRow,
    requestName,
  ])

  const captureRemoteSavedForm = useCallback((): RemoteSavedSessionFormV1 => {
    return {
      sessionType,
      requestName,
      raHourPart,
      raMinutePart,
      raSecondPart,
      decSign,
      decDegreePart,
      decMinutePart,
      decSecondPart,
      sessionPassword,
      outputMode,
      cameraCoolingTempC,
      filterPlans: filterPlans.map((p) => ({ ...p })),
      variableStarBlockHours,
      variableStarListSelection,
      variableStarFilterSelection: [...variableStarFilterSelection],
      catalogQuery,
      projectMode,
    }
  }, [
    sessionType,
    requestName,
    raHourPart,
    raMinutePart,
    raSecondPart,
    decSign,
    decDegreePart,
    decMinutePart,
    decSecondPart,
    sessionPassword,
    outputMode,
    cameraCoolingTempC,
    filterPlans,
    variableStarBlockHours,
    variableStarListSelection,
    variableStarFilterSelection,
    catalogQuery,
    projectMode,
  ])

  const applyRemoteSavedForm = useCallback((form: RemoteSavedSessionFormV1) => {
    setSubmitError(null)
    setSessionType(form.sessionType === 'variable_star' ? 'variable_star' : 'dso')
    setProjectMode(form.projectMode === true)
    setRequestName(form.requestName)
    setRaHourPart(form.raHourPart)
    setRaMinutePart(form.raMinutePart)
    setRaSecondPart(form.raSecondPart)
    setDecSign(form.decSign)
    setDecDegreePart(form.decDegreePart)
    setDecMinutePart(form.decMinutePart)
    setDecSecondPart(form.decSecondPart)
    setSessionPassword(form.sessionPassword)
    // Legacy saved sessions may have outputMode `stacked_master` (discontinued).
    setOutputMode(form.outputMode === 'stacked_master' ? 'raw_zip' : form.outputMode)
    if (form.cameraCoolingTempC === 0 || form.cameraCoolingTempC === -10) {
      setCameraCoolingTempC(form.cameraCoolingTempC)
    }
    setFilterPlans(
      form.filterPlans.length > 0
        ? form.filterPlans.map((p) => ({ ...p }))
        : [{ filterName: 'G', count: '10', exposureSeconds: '60' }]
    )
    setVariableStarBlockHours(form.variableStarBlockHours)
    setVariableStarDurationUserSelected(form.sessionType === 'variable_star')
    setVariableStarListSelection(form.variableStarListSelection)
    setVariableStarFilterSelection(
      form.variableStarFilterSelection.filter((value): value is VariableStarFilterUi =>
        VARIABLE_STAR_FILTER_VALUES.includes(value as VariableStarFilterUi)
      )
    )
    setCatalogQuery(form.catalogQuery)
  }, [])

  const refreshSavedSessions = useCallback(() => {
    setSavedSessions(fetchLocalSavedSessions())
  }, [])

  const submitRequest = useCallback(async (
    whenClosedBehavior: 'reject' | 'queue_until_ready',
    coords: { raHours: number; decDeg: number }
  ) => {
    if (sessionType !== 'variable_star' && filterPlans.length === 0) {
      setSubmitError('Select at least one filter.')
      return false
    }
    const normalizedPlans: Array<{ filterName: string; count: number; exposureSeconds: number }> = []
    if (sessionType === 'variable_star') {
      normalizedPlans.push({ filterName: 'G', count: 1, exposureSeconds: 30 })
    } else {
      for (const plan of filterPlans) {
        const filterName = plan.filterName.trim()
        const frames = Math.round(Number(plan.count))
        const exposure = Math.round(Number(plan.exposureSeconds))
        if (!filterName) {
          setSubmitError('Filter name is required for each row.')
          return false
        }
        if (!Number.isFinite(frames) || frames < 1 || frames > 500) {
          setSubmitError(`Frame count for ${filterName} must be between 1 and 500.`)
          return false
        }
        if (!Number.isFinite(exposure) || exposure < 1 || exposure > 3600) {
          setSubmitError(`Exposure for ${filterName} must be between 1 and 3600 seconds.`)
          return false
        }
        normalizedPlans.push({ filterName, count: frames, exposureSeconds: exposure })
      }
    }
    if (sessionType === 'variable_star') {
      if (!variableStarDurationPick?.coordsOk) {
        setSubmitError('Enter valid RA and Dec for a variable star session.')
        return false
      }
      const { starHalfSteps, allOptions } = variableStarDurationPick
      if (starHalfSteps < 1) {
        setSubmitError("This target is not high enough in tonight's scheduling window for the chosen duration.")
        return false
      }
      const maxEnabled = starHalfSteps * 0.5
      if (!allOptions.includes(variableStarBlockHours) || variableStarBlockHours > maxEnabled + 1e-9) {
        setSubmitError("Pick a session duration that fits tonight's visibility (the enabled buttons above).")
        return false
      }
    }

    const estimatedDurationSeconds =
      sessionType === 'variable_star'
        ? Math.round((variableStarBlockHours + VARIABLE_STAR_SESSION_OVERHEAD_HOURS) * 3600)
        : estimateDurationSecondsFromPlans(normalizedPlans)

    const payload = {
      target: requestName.trim(),
      requestName: requestName.trim(),
      sessionType,
      whenClosedBehavior,
      outputMode,
      cameraCoolingTempC,
      projectMode: sessionType === 'dso' ? projectMode : false,
      sessionPassword: sessionPassword.trim() || undefined,
      raHours: coords.raHours,
      decDeg: coords.decDeg,
      estimatedDurationSeconds,
      catalogQuery,
      variableStarBlockHours: sessionType === 'variable_star' ? variableStarBlockHours : undefined,
      filterPlans: normalizedPlans,
    }

    const selectedSite = maxMultiSite
      ? resolveSelectedMaxSite(maxSites, getActiveMaxSiteTenantId())
      : undefined
    if (maxMultiSite && !editingSessionId && !selectedSite) {
      setSubmitError('Choose an observatory site from the header Switch Site control.')
      return false
    }
    const targetTenant = selectedSite ? maxSiteAsTenant(selectedSite) : undefined

    const result = editingSessionId
      ? await updateImagingSession(editingSessionId, payload, targetTenant)
      : await submitImagingSession(payload, targetTenant)

    if (!result.ok) {
      setSubmitError(result.error)
      return false
    }
    setSubmitError(null)
    if (editingSessionId) {
      setSubmitSuccess('Session edited successfully.')
      onEditingSessionClear?.()
    } else {
      setSubmitSuccess(`Queued · ${result.id.slice(0, 8).toUpperCase()}`)
    }
    onSubmitted?.()
    return true
  }, [
    sessionType,
    filterPlans,
    outputMode,
    variableStarDurationPick,
    variableStarBlockHours,
    requestName,
    cameraCoolingTempC,
    projectMode,
    sessionPassword,
    catalogQuery,
    editingSessionId,
    onEditingSessionClear,
    onSubmitted,
    maxMultiSite,
    maxSites,
  ])

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!hubReachable || submitting) return
    setSubmitError(null)
    setSubmitSuccess(null)
    setSubmitting(true)
    try {
      const coords = parseCoordinates()
      if (!coords) return
      if (editingSessionId) {
        await submitRequest('reject', coords)
        return
      }
      const altitudeDeg = currentAltitudeDeg(coords.raHours, coords.decDeg)
      setLastComputedAltitude(altitudeDeg)
      if (altitudeDeg < MIN_ALTITUDE_DEG) {
        setShowAltitudeModal(true)
        return
      }
      if (observatoryStatus !== 'ready') {
        setShowClosedModal(true)
        return
      }
      await submitRequest('reject', coords)
    } finally {
      setSubmitting(false)
    }
  }, [hubReachable, submitting, parseCoordinates, editingSessionId, observatoryStatus, submitRequest])

  const handleSubmitWhenClosed = useCallback(async () => {
    const coords = parseCoordinates()
    if (!coords) return
    setShowClosedModal(false)
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitRequest('queue_until_ready', coords)
    } finally {
      setSubmitting(false)
    }
  }, [parseCoordinates, submitRequest])

  const handleSubmitWhenLowAltitude = useCallback(async () => {
    const coords = parseCoordinates()
    if (!coords) return
    setShowAltitudeModal(false)
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (observatoryStatus !== 'ready') {
        setShowClosedModal(true)
        return
      }
      const ok = await submitRequest('reject', coords)
      if (ok) {
        setSubmitSuccess('Session started. It will be downloadable only when altitude reaches 30°+.')
      }
    } finally {
      setSubmitting(false)
    }
  }, [parseCoordinates, observatoryStatus, submitRequest])

  const openSaveModal = useCallback(() => {
    refreshSavedSessions()
    setSaveModalError(null)
    setSaveModalName(requestName.trim())
    setShowSaveModal(true)
  }, [refreshSavedSessions, requestName])

  const saveCurrentSession = useCallback(() => {
    const name = saveModalName.trim()
    if (!name) {
      setSaveModalError('Session name is required.')
      return
    }
    const form = captureRemoteSavedForm()
    form.requestName = name
    form.sessionPassword = ''
    const result = saveLocalSavedSession({ name, form })
    if (!result.ok) {
      setSaveModalError(result.error)
      return
    }
    refreshSavedSessions()
    setRequestName(name)
    setShowSaveModal(false)
    setSubmitError(null)
    setSubmitSuccess(`Saved session "${name}".`)
  }, [saveModalName, captureRemoteSavedForm, refreshSavedSessions])

  const openRunModal = useCallback(() => {
    refreshSavedSessions()
    setRunModalError(null)
    setRunModalName('')
    setShowRunModal(true)
  }, [refreshSavedSessions])

  const runSavedSession = useCallback(() => {
    const name = runModalName.trim()
    if (!name) {
      setRunModalError('Session name is required.')
      return
    }
    const found = loadLocalSavedSessionByName(name)
    if (!found) {
      setRunModalError('No saved session with that name.')
      return
    }
    applyRemoteSavedForm(found.form)
    setShowRunModal(false)
    setRunModalError(null)
    setSubmitError(null)
    setSubmitSuccess(`Loaded saved session "${found.name}".`)
  }, [runModalName, applyRemoteSavedForm])

  const statusText = observatoryStatusLabel(observatoryStatus)
  const weatherText = weatherPredictionLabel(weatherPrediction)
  const weatherTone =
    weatherPrediction === 'permitted'
      ? 'ok'
      : weatherPrediction === 'unavailable'
        ? 'muted'
        : 'bad'

  return {
    submitting,
    submitError,
    submitSuccess,
    sessionType,
    setSessionType,
    projectMode,
    setProjectMode,
    requestName,
    setRequestName,
    catalogQuery,
    setCatalogQuery,
    catalogLookupLoading,
    catalogLookupError,
    catalogLookupResult,
    handleCatalogLookup,
    variableStarCatalogLoading,
    variableStarCatalogError,
    variableStarCatalog,
    variableStarPreviewStar,
    variableStarLastFoundName,
    variableStarLastFoundSource,
    variableStarSimbadSearching,
    variableStarListSelection,
    setVariableStarListSelection,
    handleVariableStarListSelection,
    variableStarFilterSelection,
    setVariableStarFilterSelection,
    variableStarFilterDropdownOpen,
    setVariableStarFilterDropdownOpen,
    variableStarFilterDropdownRef,
    displayedVariableStars,
    variableStarBlockHours,
    setVariableStarBlockHours,
    variableStarDurationUserSelected,
    setVariableStarDurationUserSelected,
    variableStarDurationPick,
    raHourPart,
    setRaHourPart,
    raMinutePart,
    setRaMinutePart,
    raSecondPart,
    setRaSecondPart,
    decSign,
    setDecSign,
    decDegreePart,
    setDecDegreePart,
    decMinutePart,
    setDecMinutePart,
    decSecondPart,
    setDecSecondPart,
    sessionPassword,
    setSessionPassword,
    outputMode,
    setOutputMode,
    storageOverQuota,
    cameraCoolingTempC,
    setCameraCoolingTempC,
    filterPlans,
    setFilterPlans,
    estimatedDurationText,
    canSaveRemoteSessionSpec,
    handleSubmit,
    statusText,
    weatherText,
    weatherTone,
    showClosedModal,
    setShowClosedModal,
    handleSubmitWhenClosed,
    showAltitudeModal,
    setShowAltitudeModal,
    handleSubmitWhenLowAltitude,
    lastComputedAltitude,
    showSaveModal,
    setShowSaveModal,
    saveModalName,
    setSaveModalName,
    saveModalError,
    openSaveModal,
    saveCurrentSession,
    showRunModal,
    setShowRunModal,
    runModalName,
    setRunModalName,
    runModalError,
    openRunModal,
    runSavedSession,
    savedSessions,
    availableFilterOptions: FILTER_OPTIONS,
    editingSessionId,
    maxMultiSite,
    maxSites,
  }
}
