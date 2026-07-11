import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  fetchStormApproach,
  observatoryStatusLabel,
  probeHub,
} from '../../lib/hub-client'
import { getAscStreamUrl } from '../../lib/settings'

const ASC_STREAM_KEY = 'ascStreamUrl'

function allSkyCameraStatusUrl(streamUrl: string | null | undefined): string | null {
  if (!streamUrl) return null
  try {
    const u = new URL(streamUrl)
    if (/\/camera\//.test(u.pathname)) {
      return new URL('status', streamUrl).href
    }
    return new URL('/status', streamUrl).href
  } catch {
    return null
  }
}

function formatOverlayDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatAscExposureUs(exposureUs: number): string {
  if (!Number.isFinite(exposureUs) || exposureUs < 0) return '—'
  if (exposureUs >= 1_000_000) return `${(exposureUs / 1_000_000).toFixed(2)} s`
  if (exposureUs >= 1_000) return `${(exposureUs / 1_000).toFixed(exposureUs >= 10_000 ? 0 : 1)} ms`
  return `${Math.round(exposureUs)} μs`
}

const overlayTitleClass = 'text-white'
const overlayValueGreen = 'text-emerald-400'
const overlayValueRed = 'text-red-400'
const overlayTextShadowStyle: CSSProperties = {
  textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.55)',
}

function overlayValueClass(red: boolean): string {
  return red ? overlayValueRed : overlayValueGreen
}

function resolveStreamUrl(): string {
  try {
    const fromSettings = getAscStreamUrl()
    if (fromSettings) return fromSettings
  } catch {
    /* ignore */
  }
  try {
    const fromLs = localStorage.getItem(ASC_STREAM_KEY)?.trim()
    if (fromLs) return fromLs
  } catch {
    /* ignore */
  }
  const env = (import.meta.env.VITE_ASC_STREAM_URL as string | undefined)?.trim()
  if (env) return env
  return ''
}

const streamAreaClass = 'relative w-full overflow-hidden rounded-lg bg-black'

export default function AllSkyPersonalView() {
  const [obsStatus, setObsStatus] = useState<string>('loading')
  const [streamError, setStreamError] = useState(false)
  const [streamUrl, setStreamUrl] = useState('')
  const [now, setNow] = useState<Date | null>(null)
  const [lastFrameAt, setLastFrameAt] = useState<Date | null>(null)
  const [exposureUs, setExposureUs] = useState<number | null>(null)
  const [gain, setGain] = useState<number | null>(null)
  const [cloudPct, setCloudPct] = useState<number | null>(null)
  const [raining, setRaining] = useState<boolean | null>(null)
  const [stormSafe, setStormSafe] = useState<boolean | null>(null)

  useEffect(() => {
    setStreamUrl(resolveStreamUrl())
  }, [])

  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    void probeHub().then((p) => {
      setObsStatus(p.observatory?.status ?? (p.hubReachable ? 'unknown' : 'disconnected'))
    })
    const id = window.setInterval(() => {
      void probeHub().then((p) => {
        setObsStatus(p.observatory?.status ?? (p.hubReachable ? 'unknown' : 'disconnected'))
      })
    }, 15_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadStorm = async () => {
      try {
        const data = await fetchStormApproach()
        if (cancelled) return
        setStormSafe(typeof data.safe === 'boolean' ? data.safe : null)
      } catch {
        if (!cancelled) setStormSafe(null)
      }
    }
    void loadStorm()
    const id = window.setInterval(() => void loadStorm(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const statusUrl = allSkyCameraStatusUrl(streamUrl || null)
    if (!statusUrl) {
      setLastFrameAt(null)
      setExposureUs(null)
      setGain(null)
      setCloudPct(null)
      setRaining(null)
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(statusUrl, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          sensors?: {
            allSkyCam?: {
              mode?: string
              autoMode?: boolean
              lastStreamFrameIso?: string | null
              lastAutoFrameIso?: string | null
              exposureUs?: number | null
              gain?: number | null
              autoModeTargetGain?: number | null
              autoTuning?: { photoExposureUs?: number | null } | null
              ascCloud?: {
                cloudCoverPercent?: number | null
                rain?: { detected?: boolean } | null
              }
            }
          }
        }
        const cam = data?.sensors?.allSkyCam
        const ascCloud = cam?.ascCloud?.cloudCoverPercent
        if (typeof ascCloud === 'number' && Number.isFinite(ascCloud) && !cancelled) {
          setCloudPct(ascCloud)
        }
        const rainDetected = cam?.ascCloud?.rain?.detected
        if (!cancelled) {
          setRaining(typeof rainDetected === 'boolean' ? rainDetected : null)
        }
        const expRaw =
          typeof cam?.exposureUs === 'number' && Number.isFinite(cam.exposureUs)
            ? cam.exposureUs
            : typeof cam?.autoTuning?.photoExposureUs === 'number' &&
                Number.isFinite(cam.autoTuning.photoExposureUs)
              ? cam.autoTuning.photoExposureUs
              : null
        const gainRaw =
          typeof cam?.gain === 'number' && Number.isFinite(cam.gain)
            ? cam.gain
            : typeof cam?.autoModeTargetGain === 'number' && Number.isFinite(cam.autoModeTargetGain)
              ? cam.autoModeTargetGain
              : null
        if (!cancelled) {
          setExposureUs(expRaw)
          setGain(gainRaw)
        }
        const iso =
          cam?.mode === 'auto' || cam?.mode === 'half_hour' || cam?.mode === 'hour' || cam?.autoMode
            ? (cam?.lastAutoFrameIso ?? cam?.lastStreamFrameIso)
            : cam?.lastStreamFrameIso
        if (typeof iso === 'string' && iso.length > 0 && !cancelled) {
          const d = new Date(iso)
          if (!Number.isNaN(d.getTime())) setLastFrameAt(d)
        }
      } catch {
        /* keep previous */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [streamUrl])

  const overlay = useMemo(() => {
    const obsText = obsStatus === 'loading' ? '…' : observatoryStatusLabel(obsStatus)
    const obsValueRed = obsStatus !== 'ready' && obsStatus !== 'loading'
    const exposureGainText =
      exposureUs != null && gain != null
        ? `${formatAscExposureUs(exposureUs)} / gain ${Math.round(gain)}`
        : exposureUs != null
          ? `${formatAscExposureUs(exposureUs)} / gain —`
          : gain != null
            ? `— / gain ${Math.round(gain)}`
            : '—'
    const cloudText =
      cloudPct != null && Number.isFinite(cloudPct) ? `${Math.round(cloudPct)}%` : '—'
    const cloudValueRed = cloudPct != null && Number.isFinite(cloudPct) && cloudPct > 20
    const rainingText = raining === true ? 'True' : raining === false ? 'False' : '—'
    const dashClass = overlayValueGreen

    return (
      <div
        className="pointer-events-none absolute left-0 top-0 z-10 max-w-[min(100%,min(92vw,28rem))] space-y-0.5 px-2.5 py-1.5 text-left text-[0.8rem] leading-tight sm:space-y-1 sm:px-3 sm:py-2 sm:text-[0.9375rem] sm:leading-snug"
        style={overlayTextShadowStyle}
      >
        <p className="break-words font-semibold text-white">All Sky Camera</p>
        <p className="break-words">
          <span className={overlayTitleClass}>Current Time: </span>
          <span className={overlayValueClass(false)}>{now ? formatOverlayDateTime(now) : '—'}</span>
        </p>
        <p className="break-words">
          <span className={overlayTitleClass}>ASC View Last Updated: </span>
          <span className={lastFrameAt ? overlayValueGreen : dashClass}>
            {lastFrameAt ? formatOverlayDateTime(lastFrameAt) : '—'}
          </span>
        </p>
        <p className="break-words">
          <span className={overlayTitleClass}>ASC Exposure &amp; Gain: </span>
          <span className={exposureGainText === '—' ? dashClass : overlayValueGreen}>{exposureGainText}</span>
        </p>
        <p className="break-words">
          <span className={overlayTitleClass}>Observatory Status: </span>
          <span className={obsText === '—' || obsText === '…' ? dashClass : obsValueRed ? overlayValueRed : overlayValueGreen}>
            {obsText}
          </span>
        </p>
        <p className="break-words">
          <span className={overlayTitleClass}>Cloud: </span>
          <span className={cloudText === '—' ? dashClass : overlayValueClass(cloudValueRed)}>{cloudText}</span>
        </p>
        <p className="break-words">
          <span className={overlayTitleClass}>Raining: </span>
          <span
            className={
              rainingText === '—' ? dashClass : raining ? overlayValueRed : overlayValueGreen
            }
          >
            {rainingText}
          </span>
        </p>
        <p className="break-words">
          <span className={overlayTitleClass}>Thunderstorm Detection: </span>
          <span
            className={
              stormSafe == null ? dashClass : stormSafe ? overlayValueGreen : overlayValueRed
            }
          >
            {stormSafe == null ? '—' : stormSafe ? 'Safe' : 'Unsafe'}
          </span>
        </p>
      </div>
    )
  }, [now, lastFrameAt, exposureUs, gain, obsStatus, cloudPct, raining, stormSafe])

  return (
    <div className="mb-6">
      <div className={`${streamAreaClass} aspect-[16/9] max-h-[420px]`}>
        {overlay}
        {streamUrl && !streamError ? (
          <img
            src={streamUrl}
            alt="All-sky camera"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setStreamError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-400">
            <p>All-sky stream unavailable.</p>
            <p className="text-xs">
              Set stream URL in Settings (ascStreamUrl) or VITE_ASC_STREAM_URL.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
