import { useCallback, useEffect, useMemo, useState } from 'react'
import NOAAGoesCloudMap from '../site/NOAAGoesCloudMap'
import LibreWxrRadarMap from '../site/LibreWxrRadarMap'
import { moonPhaseInfo, moonRiseSet } from '../../lib/site/moon-avoidance'
import { fetchAstroForecast, type AstroForecastSnapshot } from '../../lib/weather/astro-forecast'
import { useObservatoryLocation } from '../../lib/useObservatoryLocation'
import AstroTimelineStrip from './AstroTimelineStrip'
import CurrentConditionsBar from './CurrentConditionsBar'

type MoonTonight = {
  phaseName: string
  illuminationPct: number
  moonrise: string | null
  moonset: string | null
}

function formatLocalTime(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function computeMoonTonight(lat: number, lon: number): MoonTonight {
  const now = new Date()
  const phase = moonPhaseInfo(now)
  const { rise, set } = moonRiseSet(now, lat, lon)
  return {
    phaseName: phase.name,
    illuminationPct: phase.illumination * 100,
    moonrise: formatLocalTime(rise),
    moonset: formatLocalTime(set),
  }
}

export default function WeatherDashboard() {
  const { lat, lon, label } = useObservatoryLocation()
  const [forecast, setForecast] = useState<AstroForecastSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const moon = useMemo(() => computeMoonTonight(lat, lon), [lat, lon])

  const loadForecast = useCallback(async () => {
    setLoading(true)
    const data = await fetchAstroForecast(lat, lon)
    setForecast(data)
    setLoading(false)
  }, [lat, lon])

  useEffect(() => {
    void loadForecast()
    const id = window.setInterval(() => {
      void loadForecast()
    }, 300_000)
    return () => window.clearInterval(id)
  }, [loadForecast])

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <CurrentConditionsBar
        label={label}
        tempC={forecast?.current.tempC ?? null}
        humidity={forecast?.current.humidity ?? null}
        cloudCover={forecast?.current.cloudCover ?? null}
        windKmh={forecast?.current.windKmh ?? null}
        loading={loading}
        moonPhaseName={moon.phaseName}
        moonIlluminationPct={moon.illuminationPct}
        moonrise={moon.moonrise}
        moonset={moon.moonset}
      />

      {forecast?.error ? (
        <p className="text-sm text-red-400/90 shrink-0">{forecast.error}</p>
      ) : null}

      {forecast ? (
        <div className="shrink-0 min-h-0 overflow-x-auto">
          <AstroTimelineStrip hours={forecast.hours} astroBlocks={forecast.astroBlocks} />
        </div>
      ) : null}

      <div className="glass-panel flex-1 min-h-0 p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="min-h-0 flex flex-col">
          <LibreWxrRadarMap />
        </div>
        <div className="min-h-0 flex flex-col">
          <NOAAGoesCloudMap />
        </div>
      </div>
    </div>
  )
}
