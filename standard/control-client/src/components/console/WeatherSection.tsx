import type { TonightWeatherSnapshot } from '../../lib/weather-client'

type WeatherSectionProps = {
  weather: TonightWeatherSnapshot | null
  loading: boolean
}

function fmt(v: number | null, suffix: string): string {
  return v != null && Number.isFinite(v) ? `${Math.round(v)}${suffix}` : '—'
}

export function WeatherSection({ weather, loading }: WeatherSectionProps) {
  const prediction = weather?.prediction
  const gateClass =
    prediction === 'permitted'
      ? 'gate-ok'
      : prediction === 'unavailable'
        ? 'gate-live'
        : prediction === 'not_permitted'
          ? 'gate-blocked'
          : 'gate-unknown'

  return (
    <section className="console-panel weather-panel">
      <div className="panel-head">
        <h2>Weather</h2>
        <span className={`gate-badge ${gateClass}`}>
          {loading && !weather
            ? 'LOADING'
            : prediction === 'permitted'
              ? 'GO FOR TONIGHT'
              : prediction === 'unavailable'
                ? 'LIVE NIGHT'
                : prediction === 'not_permitted'
                  ? 'NO-GO'
                  : 'UNKNOWN'}
        </span>
      </div>

      <div className="weather-metrics">
        <div className="metric">
          <span className="metric-label">Temp</span>
          <span className="metric-value">{fmt(weather?.current.tempC ?? null, '°C')}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Humidity</span>
          <span className="metric-value">{fmt(weather?.current.humidity ?? null, '%')}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Cloud</span>
          <span className="metric-value">{fmt(weather?.current.cloudCover ?? null, '%')}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Wind</span>
          <span className="metric-value">{fmt(weather?.current.windKmh ?? null, ' km/h')}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Clear hrs</span>
          <span className="metric-value">
            {weather ? `${weather.readyHours}/${weather.totalNightHours}` : '—'}
          </span>
        </div>
      </div>

      {weather?.error && <p className="panel-error">{weather.error}</p>}

      <div className="weather-timeline-wrap">
        <div className="timeline-label">Tonight hourly gate</div>
        <div className="weather-timeline">
          {(weather?.hours ?? []).length === 0 ? (
            <p className="muted-inline">No forecast hours in window.</p>
          ) : (
            weather?.hours.map((hour) => (
              <div
                key={hour.hourStartSec}
                className={`hour-cell ${hour.permitted ? 'hour-go' : 'hour-nogo'}`}
                title={
                  hour.reasons.length > 0
                    ? `Blocked: ${hour.reasons.join(', ')}`
                    : 'Clear — cloud <10%, precip <10%, wind ≤10 m/s'
                }
              >
                <span className="hour-label">{hour.label}</span>
                <span className="hour-bar" />
                {Number.isFinite(hour.cloudCover) && (
                  <span className="hour-meta">{Math.round(hour.cloudCover)}%</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <p className="panel-footnote">
        Gate: cloud &lt;10%, precip &lt;10%, wind ≤10 m/s per hour. Precip tonight:{' '}
        {weather?.hasAnyPrecipitationTonight ? 'yes' : 'no'}.
      </p>
    </section>
  )
}
