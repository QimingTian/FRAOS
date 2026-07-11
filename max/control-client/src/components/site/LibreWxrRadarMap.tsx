import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import MapFrameTimeOverlay from './MapFrameTimeOverlay'
import { contentApiPath } from '../../lib/content-base'
import { formatEstDateTime } from '../../lib/site/est-datetime'
import {
  createRadarPlayback,
  goToFrameIndex,
  preloadNextFrame,
  radarTileTemplate,
  RADAR_OPACITY,
  type RadarPlayback,
} from '../../lib/site/librewxr-radar-playback'
import {
  librewxrRadarFrames,
  type LibrewxrFrame,
  type LibrewxrWeatherMaps,
} from '../../lib/site/librewxr'
import { useObservatoryLocation } from '../../lib/useObservatoryLocation'

const MAP_ZOOM = 8
/** Frame interval — crossfade + preload-ahead keeps the loop continuous. */
const FRAME_MS = 1100

const BASEMAP_URL = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'

export default function LibreWxrRadarMap() {
  const { lat, lon } = useObservatoryLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const playbackRef = useRef<RadarPlayback | null>(null)

  const [frames, setFrames] = useState<LibrewxrFrame[]>([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(contentApiPath('/api/librewxr/weather-maps'), { cache: 'no-store' })
        const data = (await res.json()) as LibrewxrWeatherMaps & { error?: string }
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        const list = librewxrRadarFrames(data)
        if (list.length === 0) throw new Error('No radar frames available')
        if (cancelled) return
        setFrames(list)
        setFrameIndex(Math.max(0, list.length - 1))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load radar')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (frames.length === 0 || !containerRef.current) return

    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    mapRef.current?.remove()
    mapRef.current = null
    playbackRef.current = null

    ;(async () => {
      const L = await import('leaflet')
      if (disposed || !containerRef.current) return

      const map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: MAP_ZOOM,
        minZoom: MAP_ZOOM,
        maxZoom: MAP_ZOOM,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false,
        attributionControl: false,
      })

      map.createPane('radar')
      const radarPane = map.getPane('radar')
      if (radarPane) radarPane.style.zIndex = '450'

      L.tileLayer(BASEMAP_URL, {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '',
      }).addTo(map)

      const startIdx = Math.max(0, frames.length - 1)
      const startPath = frames[startIdx]!.path

      const layerA = L.tileLayer(radarTileTemplate(startPath), {
        pane: 'radar',
        opacity: RADAR_OPACITY,
        maxZoom: 10,
      }).addTo(map)

      const layerB = L.tileLayer(radarTileTemplate(startPath), {
        pane: 'radar',
        opacity: 0,
        maxZoom: 10,
      }).addTo(map)

      const playback = createRadarPlayback({ a: layerA, b: layerB, active: 'a' }, frames)
      playbackRef.current = playback
      goToFrameIndex(playback, startIdx)
      preloadNextFrame(playback, startIdx)

      map.createPane('obsMarker')
      const markerPane = map.getPane('obsMarker')
      if (markerPane) markerPane.style.zIndex = '650'

      L.circleMarker([lat, lon], {
        pane: 'obsMarker',
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#9da0a7',
        fillOpacity: 0.95,
      }).addTo(map)

      mapRef.current = map

      resizeObserver = new ResizeObserver(() => map.invalidateSize())
      resizeObserver.observe(containerRef.current)
      requestAnimationFrame(() => map.invalidateSize())
    })()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
      playbackRef.current = null
    }
  }, [frames, lat, lon])

  useEffect(() => {
    const playback = playbackRef.current
    if (!playback || frames.length === 0) return
    playback.frames = frames
    goToFrameIndex(playback, frameIndex)
  }, [frameIndex, frames])

  useEffect(() => {
    if (frames.length < 2) return
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length)
    }, FRAME_MS)
    return () => window.clearInterval(id)
  }, [frames.length])

  const frameTimeLabel = useMemo(() => {
    const frame = frames[frameIndex]
    if (!frame) return null
    return formatEstDateTime(new Date(frame.time * 1000))
  }, [frames, frameIndex])

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-[#1a1a1a] librewxr-radar-map obs-map">
        <MapFrameTimeOverlay title="Precipitation Radar" timeLabel={frameTimeLabel} />
        <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" />
        {(loading || error) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-sm text-white px-4 text-center">
            {loading ? 'Loading radar…' : error}
          </div>
        )}
      </div>
    </div>
  )
}
