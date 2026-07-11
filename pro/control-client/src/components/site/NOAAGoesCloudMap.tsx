import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import MapFrameTimeOverlay from './MapFrameTimeOverlay'
import { formatEstDateTime } from '../../lib/site/est-datetime'
import { useObservatoryLocation } from '../../lib/useObservatoryLocation'

const MAP_ZOOM = 7
const REFRESH_MS = 300_000
const BASEMAP_URL = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
// Iowa Environmental Mesonet GOES-East infrared satellite (free WMS, works day and night).
const GOES_WMS_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes/conus_ir.cgi'
const GOES_LAYER = 'goes_conus_ir'
const CLOUD_OPACITY = 0.85

export default function NOAAGoesCloudMap() {
  const { lat, lon } = useObservatoryLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const cloudLayerRef = useRef<import('leaflet').TileLayer.WMS | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const [timeLabel, setTimeLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false
    let resizeObserver: ResizeObserver | undefined
    let refreshTimer: number | undefined

    mapRef.current?.remove()
    mapRef.current = null

    const makeCloudLayer = (L: typeof import('leaflet')) =>
      L.tileLayer.wms(`${GOES_WMS_URL}?_t=${Date.now()}`, {
        pane: 'clouds',
        layers: GOES_LAYER,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        opacity: CLOUD_OPACITY,
      })

    ;(async () => {
      const L = await import('leaflet')
      if (disposed || !containerRef.current) return
      leafletRef.current = L

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

      L.tileLayer(BASEMAP_URL, { subdomains: 'abcd', maxZoom: 19 }).addTo(map)

      map.createPane('clouds')
      const cloudPane = map.getPane('clouds')
      if (cloudPane) cloudPane.style.zIndex = '450'

      const clouds = makeCloudLayer(L)
      clouds.addTo(map)
      cloudLayerRef.current = clouds

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
      setTimeLabel(formatEstDateTime(new Date()))

      refreshTimer = window.setInterval(() => {
        const Lr = leafletRef.current
        const m = mapRef.current
        if (Lr && m) {
          const next = makeCloudLayer(Lr).addTo(m)
          const prev = cloudLayerRef.current
          cloudLayerRef.current = next
          next.once('load', () => prev?.remove())
        }
        setTimeLabel(formatEstDateTime(new Date()))
      }, REFRESH_MS)

      resizeObserver = new ResizeObserver(() => map.invalidateSize())
      resizeObserver.observe(containerRef.current)
      requestAnimationFrame(() => map.invalidateSize())
    })()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      if (refreshTimer) window.clearInterval(refreshTimer)
      mapRef.current?.remove()
      mapRef.current = null
      cloudLayerRef.current = null
    }
  }, [lat, lon])

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-[#1a1a1a] obs-map">
        <MapFrameTimeOverlay title="Cloud Map" timeLabel={timeLabel} />
        <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" />
      </div>
    </div>
  )
}
