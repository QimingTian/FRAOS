import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatObservatoryLocalTimeFromUnixSec } from '../lib/observatory-local-time'
import {
  getTonightScheduleEveningAstronomyUtc,
  getTonightScheduleMorningAstronomyUtc,
} from '../lib/site/sunrise-window'
import { contentApiPath } from '../lib/content-base'
import {
  fetchSunsetSunriseFallback,
  getTonightScheduleStrip,
} from '../lib/site/schedule-strip'
import { useObservatoryLocation } from '../lib/useObservatoryLocation'
import { computeFov, overlayRotationDeg } from '../lib/equipment'
import { useEquipment } from '../lib/useEquipment'
import { computeFovOverlayRotationDeg } from '../lib/site/fov-overlay'

export type RemotePrefill = {
  target: string
  raHours: number
  decDeg: number
}

type AtlasPageProps = {
  onSendToRemote?: (prefill: RemotePrefill) => void
}

/** Camera frame geometry derived from the configured imaging rig. Angular FOV in radians;
 * the on-screen rotation is computed live from the engine projection (field rotation). */
type CameraFrameProfile = { fovWRad: number; fovHRad: number; positionAngleDeg: number }

const DEG2RAD = Math.PI / 180

type WeatherPrediction = {
  ok: boolean
  prediction?: 'permitted' | 'not_permitted' | 'unavailable'
  nightHourStartsSec?: number[]
  readyHourStartsSec?: number[]
  notPermittedHourReasons?: Array<{ hourStartSec: number; reasons: Array<'cloud' | 'rain' | 'wind'> }>
}

type ResolvedCatalogObject = {
  query: string
  canonicalName: string
  aliases: string[]
  raHours: number
  decDeg: number
  ra: { hour: number; minute: number; second: number }
  dec: { sign: '+' | '-'; degree: number; minute: number; second: number }
}

/** A SweObj-shaped handle as exposed by the engine's JS glue. We only touch
 * the members we actually need: `.icrs` (4-vec containing unit RA/Dec) and
 * pass it back to `stel.pointAndLock`. Intentionally loose — the engine
 * returns null / object, and we guard accordingly. */
type SweObj = {
  icrs?: number[]
  radec?: number[]
  id?: string
  type?: string
  getInfo?: (key: string) => unknown
} | null

/** Payload from iframe boreanPostSelectionInfo (engine getInfo keys). */
type SelectionInfoPayload = {
  id: string
  rows: Array<{ label: string; value: string }>
}

/** Minimum engine surface the Atlas parent needs. The engine also exposes
 * getObj / pointAndLock / convertFrame / c2s at the top level of `stel`
 * (not nested under core). */
type LayerToggleTarget = { visible?: boolean }
type Observer = { utc?: number; yaw?: number; pitch?: number }
type StelLike = {
  core?: {
    fov?: number
    selection?: SweObj
    observer?: Observer
    landscapes?: LayerToggleTarget
    atmosphere?: LayerToggleTarget
    dsos?: LayerToggleTarget
    dss?: LayerToggleTarget
    lines?: { azimuthal?: LayerToggleTarget; equatorial?: LayerToggleTarget }
  }
  getObj?: (name: string) => SweObj
  pointAndLock?: (obj: NonNullable<SweObj>, duration: number) => void
  convertFrame?: (obs: Observer, origin: string, dest: string, v: number[]) => number[]
  c2s?: (v: number[]) => [number, number]
}

/** Stellarium Web `c2s` expects a 4-component direction; see `public/stellarium/engine.html` (`boreanSexagesimalRaDec`). */
function icrfDirToRaDecHoursDeg(stel: Pick<StelLike, 'c2s'>, vec: number[]): { raHours: number; decDeg: number } | null {
  if (!stel.c2s || !vec || vec.length < 3) return null
  try {
    const s = stel.c2s([vec[0], vec[1], vec[2], vec.length > 3 ? vec[3] || 0 : 0])
    if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) return null
    return {
      raHours: (((s[0] * 12) / Math.PI) % 24 + 24) % 24,
      decDeg: (s[1] * 180) / Math.PI,
    }
  } catch {
    return null
  }
}

type LayerKey = 'landscapes' | 'atmosphere' | 'dsos' | 'dss' | 'azimuthal' | 'equatorial'
const LAYER_LABELS: Record<LayerKey, string> = {
  landscapes: 'Ground',
  atmosphere: 'Atmosphere',
  dsos: 'Deep sky',
  dss: 'DSS imagery',
  azimuthal: 'Azimuthal grid',
  equatorial: 'Equatorial grid',
}
const LAYER_ORDER: LayerKey[] = ['landscapes', 'atmosphere', 'dsos', 'dss', 'azimuthal', 'equatorial']

function formatHourMinute(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Local date + time to the minute for the time-travel scrubber hover label. */
function formatHoverTimeToMinute(sec: number): string {
  const d = new Date(sec * 1000)
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timePart = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${datePart} ${timePart}`
}

/** Same MJD convention as `public/stellarium/engine.html` `dateToMJD`. */
function dateToMJD(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5 - 2400000.5
}

type AtlasRibbonAstronomyMarker = { id: string; label: string; sec: number; frac: number }

/** Wall time for ribbon astronomy ticks (matches Remote schedule timezone). */
function formatRibbonAstronomyTime(sec: number): string {
  return formatObservatoryLocalTimeFromUnixSec(sec)
}

function usePolling<T>(fn: () => Promise<T | null>, intervalMs: number): T | null {
  const [state, setState] = useState<T | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const v = await fn()
        if (!cancelled) setState(v)
      } catch {
        if (!cancelled) setState(null)
      }
    }
    void load()
    const id = window.setInterval(load, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs])
  return state
}

/** Resolve the engine object whose `visible` owns the given layer. */
function layerObj(stel: StelLike | null, k: LayerKey): LayerToggleTarget | null {
  const core = stel?.core
  if (!core) return null
  if (k === 'azimuthal') return core.lines?.azimuthal ?? null
  if (k === 'equatorial') return core.lines?.equatorial ?? null
  if (k === 'dss') return core.dss ?? null
  return core[k] ?? null
}

/** Engine getObj is a case-insensitive exact-designation match against every
 * child's designation list (core.c `on_designation` -> `strcasecmp`). Simple
 * strings like "Vega" don't always hit; a short set of variants covers most
 * common shapes (plain, upper-cased, compact, with "NAME " prefix). */
function tryEngineGetObj(stel: StelLike | null, candidates: string[]): NonNullable<SweObj> | null {
  const getObj = stel?.getObj
  if (!getObj) return null
  const seen = new Set<string>()
  for (const raw of candidates) {
    if (!raw) continue
    const variants = [raw, raw.toUpperCase(), raw.replace(/\s+/g, ''), `NAME ${raw}`, `NAME ${raw.toUpperCase()}`]
    for (const v of variants) {
      const key = v.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      try {
        const o = getObj(key)
        if (o) return o
      } catch {
        /* ignore engine throws */
      }
    }
  }
  return null
}

/** Extra designation shapes so Sesame-resolved names more often match the engine catalog (getObj). */
function buildEngineResolveCandidates(resolved: ResolvedCatalogObject, rawQuery: string): string[] {
  const out = new Set<string>()
  const add = (s: string) => {
    const t = s.trim()
    if (t) out.add(t)
  }
  add(rawQuery)
  add(resolved.canonicalName)
  for (const a of resolved.aliases ?? []) add(a)
  for (const s of Array.from(out)) {
    const ngc = s.match(/\b(NGC|IC)\s*(\d{1,5})\b/i)
    if (ngc) {
      const abbr = ngc[1]!.toUpperCase()
      const num = ngc[2]!
      add(`${abbr} ${num}`)
      add(`${abbr}${num}`)
    }
    const mess = s.match(/\bM\s*(\d{1,3})\b/i) ?? s.match(/\bMessier\s+(\d{1,3})\b/i)
    if (mess) {
      const n = mess[1]!
      add(`M ${n}`)
      add(`M${n}`)
    }
  }
  return Array.from(out)
}

export function AtlasPage({ onSendToRemote }: AtlasPageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const tonightRibbonBarRef = useRef<HTMLDivElement | null>(null)
  const cameraFrameOverlayRef = useRef<HTMLDivElement | null>(null)
  const [viewerReady, setViewerReady] = useState(false)
  const [stelReady, setStelReady] = useState(false)
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    landscapes: true,
    atmosphere: false,
    dsos: true,
    dss: true,
    azimuthal: false,
    equatorial: false,
  })
  const [hoverFrac, setHoverFrac] = useState<number | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const equipment = useEquipment()
  const [cameraFrameOn, setCameraFrameOn] = useState(false)
  const cameraFrameProfile = useMemo((): CameraFrameProfile | null => {
    if (!cameraFrameOn || !equipment) return null
    const fov = computeFov(equipment)
    return {
      fovWRad: fov.fovWidthDeg * DEG2RAD,
      fovHRad: fov.fovHeightDeg * DEG2RAD,
      positionAngleDeg: overlayRotationDeg(equipment),
    }
  }, [cameraFrameOn, equipment, equipment?.positionAngleDeg, equipment?.fieldRotationDeg])
  const [trackingTarget, setTrackingTarget] = useState<{ name: string; raHours: number; decDeg: number } | null>(null)

  const [alt30OverlayOn, setAlt30OverlayOn] = useState(false)
  const [orbitOverlayOn, setOrbitOverlayOn] = useState(false)
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfoPayload | null>(null)

  const observatory = useObservatoryLocation()
  const scheduleStrip = useMemo(
    () => getTonightScheduleStrip(),
    [observatory.lat, observatory.lon],
  )
  const [fallbackNightWindow, setFallbackNightWindow] = useState<{
    startSec: number
    endSec: number
  } | null>(null)

  useEffect(() => {
    void fetchSunsetSunriseFallback(observatory.lat, observatory.lon).then(setFallbackNightWindow)
  }, [observatory.lat, observatory.lon])

  const viewerSrc = useMemo(
    () =>
      `/stellarium/engine.html?${new URLSearchParams({
        lat: String(observatory.lat),
        lng: String(observatory.lon),
        elev: String(observatory.elevationM),
      }).toString()}`,
    [observatory.lat, observatory.lon, observatory.elevationM],
  )

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const d = ev?.data
      if (!d || typeof d !== 'object' || d.source !== 'borean-stellarium') return
      if (d.type === 'ready') {
        setStelReady(true)
        setViewerReady(true)
      }
      if (d.type === 'selection-info') {
        const p = d.payload as SelectionInfoPayload | null | undefined
        setSelectionInfo(p && typeof p === 'object' && Array.isArray(p.rows) ? p : null)
      }
    }
    window.addEventListener('message', onMessage)
    let attempts = 0
    const poll = window.setInterval(() => {
      const win = iframeRef.current?.contentWindow as (Window & { stel?: unknown }) | null
      if (win?.stel) {
        setStelReady(true)
        setViewerReady(true)
        window.clearInterval(poll)
      } else if (++attempts > 120) {
        window.clearInterval(poll)
      }
    }, 500)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(poll)
    }
  }, [])

  const getStel = useCallback((): StelLike | null => {
    const iframe = iframeRef.current
    if (!iframe) return null
    const win = iframe.contentWindow as (Window & { stel?: StelLike }) | null
    return win?.stel ?? null
  }, [])

  useEffect(() => {
    if (!stelReady) return
    const stel = getStel()
    setLayers((prev) => {
      const next = { ...prev }
      for (const k of LAYER_ORDER) {
        const obj = layerObj(stel, k)
        if (obj && typeof obj.visible === 'boolean') next[k] = obj.visible
      }
      return next
    })
  }, [stelReady, getStel])

  /* Borean engine overlays (alt=30° ring, selection trajectory): iframe listens for postMessage. */
  useEffect(() => {
    if (!stelReady) return
    const w = iframeRef.current?.contentWindow
    if (!w) return
    try {
      w.postMessage({ source: 'borean-atlas', type: 'overlay-alt30', visible: alt30OverlayOn }, '*')
      w.postMessage({ source: 'borean-atlas', type: 'overlay-orbit', visible: orbitOverlayOn }, '*')
    } catch {
      /* ignore */
    }
  }, [stelReady, alt30OverlayOn, orbitOverlayOn])

  /* Camera frame overlay: drive width/height every animation frame by reading
   * core.fov + iframe clientHeight and writing directly to the overlay DOM.
   * Avoids React setState on a 200 ms timer (which caused visible stepping
   * while zooming). */
  useEffect(() => {
    if (!cameraFrameProfile || !stelReady) return
    let rafId = 0
    const tick = () => {
      const el = cameraFrameOverlayRef.current
      const iframe = iframeRef.current
      const stel = getStel()
      const fov = stel?.core?.fov
      const h = iframe?.clientHeight ?? 520
      if (el && typeof fov === 'number' && fov > 0) {
        const scale = h / fov
        el.style.width = `${cameraFrameProfile.fovWRad * scale}px`
        el.style.height = `${cameraFrameProfile.fovHRad * scale}px`
        // Field rotation: rotate the frame by the live on-screen orientation of the sensor.
        const rot = computeFovOverlayRotationDeg(stel, cameraFrameProfile.positionAngleDeg)
        el.style.transform = `translate(-50%, -50%) rotate(${rot ?? cameraFrameProfile.positionAngleDeg}deg)`
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [cameraFrameProfile, stelReady, getStel])

  /* Continuous re-centering fallback used when the engine has no catalog
   * match for a Simbad-resolved target. Converts the stored J2000 RA/Dec
   * vector through ICRF -> OBSERVED each tick, and sets observer yaw/pitch
   * so the target stays centered as sidereal time advances. The effect is
   * a no-op while the engine owns lock (pointAndLock path) because we never
   * set trackingTarget via that path with the simbad-fallback flag. */
  const trackingSourceRef = useRef<'engine-lock' | 'continuous' | null>(null)
  /* API-resolved targets with no engine SweObj: keep boresight on fixed J2000 (ICRF) by updating
   * observer yaw/pitch every animation frame — same math as before but synced to display refresh
   * instead of 200 ms steps (avoids judder). Engine-catalog hits use pointAndLock and skip this. */
  useEffect(() => {
    if (!stelReady || !trackingTarget || trackingSourceRef.current !== 'continuous') return
    const { raHours, decDeg } = trackingTarget
    const raRad = (raHours * Math.PI) / 12
    const decRad = (decDeg * Math.PI) / 180
    const icrfVec = [
      Math.cos(decRad) * Math.cos(raRad),
      Math.cos(decRad) * Math.sin(raRad),
      Math.sin(decRad),
      0,
    ]
    let raf = 0
    const tick = () => {
      const stel = getStel()
      const obs = stel?.core?.observer
      if (!stel || !obs || !stel.convertFrame || !stel.c2s) return
      try {
        const vObs = stel.convertFrame(obs, 'ICRF', 'OBSERVED', icrfVec)
        const [az, alt] = stel.c2s(vObs)
        obs.yaw = az
        obs.pitch = alt
      } catch {
        /* engine may throw during destruction; ignore */
      }
    }
    tick()
    const loop = () => {
      tick()
      raf = window.requestAnimationFrame(loop)
    }
    raf = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(raf)
  }, [stelReady, trackingTarget, getStel])

  const toggleLayer = (k: LayerKey) => {
    const stel = getStel()
    const obj = layerObj(stel, k)
    if (!obj) return
    const v = !layers[k]
    obj.visible = v
    setLayers((prev) => ({ ...prev, [k]: v }))
  }

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q) return
    const stel = getStel()
    if (!stel) {
      setSearchError('Sky viewer not ready yet.')
      return
    }
    setSearchLoading(true)
    setSearchError(null)

    const lockEngineObj = (obj: NonNullable<SweObj>, name: string): boolean => {
      try {
        if (!stel.pointAndLock) return false
        stel.pointAndLock(obj, 1.0)
        if (stel.core) stel.core.fov = (5 * Math.PI) / 180
        /* Read J2000 for Send-to-Remote: prefer icrs/radec unit direction, with the same
         * 4-component c2s convention as the engine overlay; fall back to getInfo('radec'). */
        let raHours = 0
        let decDeg = 0
        const vec = obj.icrs ?? obj.radec
        let fromDir = vec && vec.length >= 3 ? icrfDirToRaDecHoursDeg(stel, vec) : null
        if (!fromDir && typeof obj.getInfo === 'function') {
          try {
            obj.getInfo('radec')
            const pr = obj.getInfo('radec')
            if (Array.isArray(pr) && pr.length >= 3) fromDir = icrfDirToRaDecHoursDeg(stel, pr as number[])
          } catch {
            /* ignore */
          }
        }
        if (fromDir) {
          raHours = fromDir.raHours
          decDeg = fromDir.decDeg
        }
        trackingSourceRef.current = 'engine-lock'
        setTrackingTarget({ name, raHours, decDeg })
        return true
      } catch {
        return false
      }
    }

    /* Path 1: engine local catalog via stel.getObj designation matching. */
    const directHit = tryEngineGetObj(stel, [q])
    if (directHit) {
      if (lockEngineObj(directHit, q)) {
        setSearchLoading(false)
        return
      }
    }

    /* Path 2: Simbad / local catalog backend used by Remote's Target Search. */
    let resolved: ResolvedCatalogObject | null = null
    try {
      const res = await fetch(contentApiPath(`/api/imaging/object-resolve?query=${encodeURIComponent(q)}`))
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok === true && data?.object) {
        resolved = data.object as ResolvedCatalogObject
      } else if (typeof data?.error === 'string') {
        setSearchError(data.error)
      } else {
        setSearchError('Target lookup failed.')
      }
    } catch {
      setSearchError('Target lookup failed.')
    }

    if (!resolved) {
      setSearchLoading(false)
      return
    }

    /* Prefer engine SweObj + pointAndLock (sidereal tracking inside the engine).
     * Expanded designations (NGC compact/space, M31 variants, etc.) improve hits after Sesame. */
    const aliasHit = tryEngineGetObj(stel, buildEngineResolveCandidates(resolved, q))
    if (aliasHit) {
      if (lockEngineObj(aliasHit, resolved.canonicalName)) {
        setSearchLoading(false)
        return
      }
    }

    /* Path 3: continuous re-centering via ICRF->OBSERVED each tick. */
    trackingSourceRef.current = 'continuous'
    setTrackingTarget({
      name: resolved.canonicalName,
      raHours: resolved.raHours,
      decDeg: resolved.decDeg,
    })
    if (stel.core) stel.core.fov = (5 * Math.PI) / 180
    setSearchLoading(false)
  }, [searchQuery, getStel])

  const handleSendToRemote = useCallback(() => {
    const stel = getStel()
    if (!stel) return
    let raHours: number
    let decDeg: number
    let name: string
    /* With the camera frame overlay on, the user is framing the *current* boresight; after a
     * pan that is no longer the locked search target — use VIEW→ICRF instead of trackingTarget. */
    const useViewportCenter = cameraFrameProfile !== null
    if (!useViewportCenter && trackingTarget) {
      ;({ raHours, decDeg, name } = trackingTarget)
    } else {
      const obs = stel.core?.observer
      if (!obs || !stel.convertFrame || !stel.c2s) return
      try {
        const vICRF = stel.convertFrame(obs, 'VIEW', 'ICRF', [0, 0, -1, 0])
        const conv = icrfDirToRaDecHoursDeg(stel, vICRF)
        if (!conv) return
        raHours = conv.raHours
        decDeg = conv.decDeg
      } catch {
        return
      }
      const raH = Math.floor(raHours)
      const raM = Math.floor((raHours - raH) * 60)
      name = `Atlas view ${raH}h${raM.toString().padStart(2, '0')}m ${decDeg >= 0 ? '+' : ''}${decDeg.toFixed(1)}`
    }
    onSendToRemote?.({ target: name, raHours, decDeg })
  }, [getStel, trackingTarget, cameraFrameProfile, onSendToRemote])

  const canSendToRemote = stelReady && (trackingTarget !== null || cameraFrameProfile !== null)

  const weather = usePolling<WeatherPrediction | null>(async () => {
    const startSec = Math.floor(scheduleStrip.windowStartMs / 1000)
    const endSec = Math.floor(scheduleStrip.windowEndMs / 1000)
    const res = await fetch(
      contentApiPath(
        `/api/imaging/tonight-weather-prediction?startSec=${startSec}&endSec=${endSec}&_=${Date.now()}`
      ),
      { cache: 'no-store' }
    )
    const data = (await res.json().catch(() => null)) as WeatherPrediction | null
    return data
  }, 60_000)

  const readySet = useMemo(() => new Set(weather?.readyHourStartsSec ?? []), [weather?.readyHourStartsSec])

  /* Ribbon spans sunset → sunrise (the actual dark window), not the longer 4pm–8am
   * scheduling window. Weather hour cells still overlay within this range. */
  const nightStartSec =
    fallbackNightWindow?.startSec ??
    weather?.nightHourStartsSec?.[0] ??
    Math.floor(scheduleStrip.windowStartMs / 1000)
  const nightEndSec =
    fallbackNightWindow?.endSec ??
    (weather?.nightHourStartsSec && weather.nightHourStartsSec.length > 0
      ? (weather.nightHourStartsSec[weather.nightHourStartsSec.length - 1] as number) + 3600
      : Math.floor(scheduleStrip.windowEndMs / 1000))

  const atlasRibbonAstronomyMarkers = useMemo((): AtlasRibbonAstronomyMarker[] => {
    if (nightStartSec == null || nightEndSec == null || nightEndSec <= nightStartSec) return []
    const span = nightEndSec - nightStartSec
    const now = new Date()
    const { civilDuskUtc, nauticalDuskUtc, astronomicalDarkUtc } = getTonightScheduleEveningAstronomyUtc(now)
    const { civilDawnUtc, nauticalDawnUtc, astronomicalDawnUtc } = getTonightScheduleMorningAstronomyUtc(now)
    const raw: Array<Omit<AtlasRibbonAstronomyMarker, 'frac'>> = [
      { id: 'civil-dusk', label: 'Civil Dusk', sec: Math.floor(civilDuskUtc.getTime() / 1000) },
      { id: 'nautical-dusk', label: 'Nautical Dusk', sec: Math.floor(nauticalDuskUtc.getTime() / 1000) },
      { id: 'astro-dark', label: 'Astronomical Dark', sec: Math.floor(astronomicalDarkUtc.getTime() / 1000) },
      { id: 'astro-dawn', label: 'Astronomical Dawn', sec: Math.floor(astronomicalDawnUtc.getTime() / 1000) },
      { id: 'nautical-dawn', label: 'Nautical Dawn', sec: Math.floor(nauticalDawnUtc.getTime() / 1000) },
      { id: 'civil-dawn', label: 'Civil Dawn', sec: Math.floor(civilDawnUtc.getTime() / 1000) },
    ]
    return raw
      .map((m) => ({ ...m, frac: (m.sec - nightStartSec) / span }))
      .filter((m) => m.frac >= 0 && m.frac <= 1)
      .sort((a, b) => a.frac - b.frac)
  }, [nightStartSec, nightEndSec, weather])

  const handleRibbonClick = (ev: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if (!nightStartSec || !nightEndSec) return
    const stel = getStel()
    const observer = stel?.core?.observer
    if (!observer) return
    const bar = tonightRibbonBarRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const clientX = 'clientX' in ev ? ev.clientX : rect.left + rect.width / 2
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const whenSec = nightStartSec + frac * (nightEndSec - nightStartSec)
    const mjd = whenSec / 86400 + 2440587.5 - 2400000.5
    observer.utc = mjd
  }

  const handleReturnToNow = useCallback(() => {
    const stel = getStel()
    const observer = stel?.core?.observer
    if (!observer) return
    observer.utc = dateToMJD(new Date())
  }, [getStel])

  return (
    <div className="glass-panel flex flex-col gap-3 p-3 pb-4">
      <div className="atlas-sky-viewer">
        <div className="relative h-full min-h-0">
          <iframe
            key={viewerSrc}
            ref={iframeRef}
            src={viewerSrc}
            title="Stellarium sky atlas"
            onLoad={(e) => {
              setViewerReady(true)
              const w = e.currentTarget.contentWindow
              if (!w) return
              const nudge = () => {
                try {
                  w.dispatchEvent(new Event('resize'))
                } catch {
                  /* ignore */
                }
              }
              nudge()
              window.setTimeout(nudge, 100)
              window.setTimeout(nudge, 500)
              window.setTimeout(nudge, 1500)
            }}
            className="block h-full w-full overflow-hidden"
            allow="accelerometer; autoplay; fullscreen; gyroscope; microphone; xr-spatial-tracking"
          />

          {/* Top-left overlay: search + buttons */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(calc(100vw-1.5rem),56rem)] flex-col gap-1 sm:max-w-[min(calc(100vw-1.5rem),72rem)]">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSearch()
              }}
              className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap"
            >
              <input
                type="search"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (searchError) setSearchError(null)
                }}
                placeholder="Vega, M31, NGC 7000, Jupiter..."
                title="Press Enter to search the sky"
                disabled={!stelReady}
                className="w-full min-w-0 flex-1 rounded-lg border border-white/25 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/50 backdrop-blur focus:border-white/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[min(100%,30rem)]"
              />
              <button
                type="submit"
                disabled={!stelReady || searchLoading || !searchQuery.trim()}
                className="shrink-0 rounded-full border border-white/25 bg-[#151616] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b1c1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {searchLoading ? 'Searching...' : 'Search Target'}
              </button>
              <button
                type="button"
                onClick={handleSendToRemote}
                disabled={!canSendToRemote}
                className="shrink-0 rounded-full border border-white/25 bg-[#151616] px-4 py-2 text-sm font-medium text-white hover:bg-[#1b1c1c] disabled:cursor-not-allowed disabled:opacity-40"
                title={
                  canSendToRemote
                    ? 'Open Remote with RA/Dec pre-filled'
                    : 'Center on a target or pick a telescope frame first'
                }
              >
                Send to Remote
              </button>
            </form>
            {searchError ? (
              <div className="pointer-events-auto rounded-md bg-black/50 px-2 py-1 text-xs backdrop-blur">
                <span className="text-rose-300">{searchError}</span>
              </div>
            ) : null}
          </div>

          {/* Camera frame overlay: a non-interactive yellow rectangle anchored
           * to viewport center. When the view is locked on a target, target
           * is at screen center too, so the rectangle indicates exactly what
           * the camera would capture at rotation = 0 deg. */}
          {cameraFrameProfile && stelReady ? (
            <div
              ref={cameraFrameOverlayRef}
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 box-border border-2 border-yellow-400/90"
              style={{
                transform: `translate(-50%, -50%) rotate(${cameraFrameProfile.positionAngleDeg}deg)`,
                transformOrigin: 'center center',
                width: '1px',
                height: '1px',
              }}
            />
          ) : null}

          {!viewerReady && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              Loading sky viewer…
            </div>
          )}
        </div>
      </div>

        <section aria-label="Sky layers" className="flex flex-wrap justify-center gap-2 shrink-0">
          {LAYER_ORDER.map((k) => {
            const active = layers[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleLayer(k)}
                disabled={!stelReady}
                aria-pressed={active}
                className={
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ' +
                  (active
                    ? 'border-white/60 bg-white text-black hover:bg-white/90'
                    : 'border-white/25 bg-[#151616] text-white hover:bg-[#1b1c1c]')
                }
              >
                {LAYER_LABELS[k]}
              </button>
            )
          })}
          {/* Camera frame overlay only appears once an imaging rig is configured in Settings. */}
          {equipment ? (
            <button
              type="button"
              onClick={() => setCameraFrameOn((v) => !v)}
              aria-pressed={cameraFrameOn}
              disabled={!stelReady}
              title={`Camera frame for ${equipment.label} (field rotation applied)`}
              className={
                'rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ' +
                (cameraFrameOn
                  ? 'border-white/60 bg-white text-black hover:bg-white/90'
                  : 'border-white/25 bg-[#151616] text-white hover:bg-[#1b1c1c]')
              }
            >
              Camera frame
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAlt30OverlayOn((v) => !v)}
            aria-pressed={alt30OverlayOn}
            disabled={!stelReady}
            title="Show altitude 30° ring (same geometry as azimuthal grid)"
            className={
              'rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ' +
              (alt30OverlayOn
                ? 'border-white/60 bg-white text-black hover:bg-white/90'
                : 'border-white/25 bg-[#151616] text-white hover:bg-[#1b1c1c]')
            }
          >
            Alt 30°
          </button>
          <button
            type="button"
            onClick={() => setOrbitOverlayOn((v) => !v)}
            aria-pressed={orbitOverlayOn}
            disabled={!stelReady}
            title="Show solid orbit track for the selected object"
            className={
              'rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ' +
              (orbitOverlayOn
                ? 'border-white/60 bg-white text-black hover:bg-white/90'
                : 'border-white/25 bg-[#151616] text-white hover:bg-[#1b1c1c]')
            }
          >
            Orbit
          </button>
        </section>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 shrink-0">
          {nightStartSec && nightEndSec ? (
            <div
              className="relative min-w-0 flex-1 cursor-default pb-5 sm:pb-0"
              onMouseMove={(e) => {
                const bar = tonightRibbonBarRef.current
                if (!bar) return
                const rect = bar.getBoundingClientRect()
                setHoverFrac(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
              }}
              onMouseLeave={() => setHoverFrac(null)}
            >
              <div className="relative w-full">
                <div className="relative mb-0.5 min-h-[2.25rem] w-full sm:min-h-[2.5rem]">
                  {atlasRibbonAstronomyMarkers.map((m, i) =>
                    i % 2 === 0 ? (
                      <div
                        key={`${m.id}-label-above`}
                        className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-full"
                        aria-hidden
                      >
                        <div
                          className="absolute bottom-0 max-w-[5.75rem] -translate-x-1/2 text-center text-[9px] leading-tight text-white/95 sm:max-w-[6.75rem] sm:text-[10px]"
                          style={{ left: `${m.frac * 100}%` }}
                        >
                          <span className="block text-white/65">{m.label}</span>
                          <span className="block font-medium tabular-nums">{formatRibbonAstronomyTime(m.sec)}</span>
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
                <div
                  ref={tonightRibbonBarRef}
                  role="button"
                  tabIndex={0}
                  aria-label="Tonight's observing window — click to time-travel"
                  onClick={handleRibbonClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleRibbonClick(e)
                  }}
                  className="relative h-10 w-full cursor-pointer rounded-lg bg-black/40"
                >
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                    {weather?.nightHourStartsSec?.map((sec) => {
                      const frac = (sec - nightStartSec) / (nightEndSec - nightStartSec)
                      const width = 3600 / (nightEndSec - nightStartSec)
                      const ok = readySet.has(sec)
                      return (
                        <div
                          key={sec}
                          className={`absolute top-0 bottom-0 ${ok ? 'bg-emerald-500/50' : 'bg-rose-600/50'}`}
                          style={{ left: `${frac * 100}%`, width: `${width * 100}%` }}
                        />
                      )
                    })}
                    {weather?.nightHourStartsSec?.map((sec) => {
                      const frac = (sec - nightStartSec) / (nightEndSec - nightStartSec)
                      if (frac <= 0) return null
                      return (
                        <div
                          key={`tick-${sec}`}
                          className="absolute top-0 bottom-0 w-px bg-white/15"
                          style={{ left: `${frac * 100}%` }}
                        />
                      )
                    })}
                  </div>
                  <div className="pointer-events-none absolute inset-x-2 top-1 flex justify-between text-[10px] uppercase tracking-wide text-white/60">
                    <span>{formatHourMinute(nightStartSec)}</span>
                    <span>{formatHourMinute(nightEndSec)}</span>
                  </div>
                  {hoverFrac !== null ? (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500/90"
                      style={{ left: `${hoverFrac * 100}%` }}
                    />
                  ) : null}
                  {hoverFrac !== null ? (
                    <div
                      className="pointer-events-none absolute top-full z-[8] mt-1 max-w-[min(100%,14rem)] -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-center text-[10px] font-medium tabular-nums text-white/95 shadow-sm"
                      style={{ left: `${hoverFrac * 100}%` }}
                      aria-hidden
                    >
                      {formatHoverTimeToMinute(
                        nightStartSec + hoverFrac * (nightEndSec - nightStartSec),
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="relative mt-0.5 min-h-[2.25rem] w-full sm:min-h-[2.5rem]">
                  {atlasRibbonAstronomyMarkers.map((m, i) =>
                    i % 2 === 1 ? (
                      <div
                        key={`${m.id}-label-below`}
                        className="pointer-events-none absolute inset-x-0 top-0 z-[6] h-full"
                        aria-hidden
                      >
                        <div
                          className="absolute max-w-[5.75rem] -translate-x-1/2 text-center text-[9px] leading-tight text-white/95 sm:max-w-[6.75rem] sm:text-[10px]"
                          style={{ left: `${m.frac * 100}%` }}
                        >
                          <span className="block text-white/65">{m.label}</span>
                          <span className="block font-medium tabular-nums">{formatRibbonAstronomyTime(m.sec)}</span>
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleReturnToNow}
            disabled={!stelReady}
            title="Set sky time to the current moment (leave time-travel)"
            className={
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ' +
              'border-white/25 bg-[#151616] text-white hover:bg-[#1b1c1c]'
            }
          >
            Now
          </button>
        </div>

        {stelReady && selectionInfo ? (
          <section
            aria-label="Selected object details"
            className="shrink-0 border-t border-black/10 pt-4 dark:border-white/10"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">Selected object</h3>
            <p className="mt-1 break-words text-base font-medium leading-snug text-white">{selectionInfo.id || '—'}</p>
            <dl className="mt-3 grid grid-cols-1 gap-x-10 gap-y-2.5 sm:grid-cols-2">
              {selectionInfo.rows.map((row, i) => {
                const wide = row.label.includes('JSON')
                return (
                  <div
                    key={`${row.label}-${i}`}
                    className={
                      wide ? 'sm:col-span-2' : ''
                    }
                  >
                    <div className="grid grid-cols-1 items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(9rem,11rem)_minmax(0,1fr)]">
                      <dt className="text-sm leading-snug text-white/55">{row.label}</dt>
                      <dd
                        className={
                          'min-w-0 break-words font-mono text-xs leading-snug text-white/90 tabular-nums ' +
                          (wide ? 'whitespace-pre-wrap text-[11px] leading-relaxed' : '')
                        }
                      >
                        {row.value}
                      </dd>
                    </div>
                  </div>
                )
              })}
            </dl>
          </section>
        ) : null}
    </div>
  )
}
