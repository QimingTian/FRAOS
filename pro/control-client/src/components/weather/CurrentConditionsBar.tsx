type CurrentConditionsBarProps = {
  label: string
  tempC: number | null
  humidity: number | null
  cloudCover: number | null
  windKmh: number | null
  loading?: boolean
  moonPhaseName?: string | null
  moonIlluminationPct?: number | null
  moonrise?: string | null
  moonset?: string | null
}

function fmt(value: number | null, suffix: string): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(suffix.includes('°') ? 1 : 0)}${suffix}`
}

type Metric = { label: string; value: string }

export default function CurrentConditionsBar({
  tempC,
  humidity,
  cloudCover,
  windKmh,
  loading,
  moonPhaseName,
  moonIlluminationPct,
  moonrise,
  moonset,
}: CurrentConditionsBarProps) {
  const metrics: Metric[] = [
    { label: 'Temp', value: fmt(tempC, '°C') },
    { label: 'Humidity', value: fmt(humidity, '%') },
    { label: 'Cloud', value: fmt(cloudCover, '%') },
    { label: 'Wind', value: fmt(windKmh, ' km/h') },
    {
      label: 'Moon',
      value:
        moonPhaseName && moonIlluminationPct != null
          ? `${moonPhaseName} · ${Math.round(moonIlluminationPct)}%`
          : moonPhaseName ?? '—',
    },
    { label: 'Moonrise', value: moonrise ?? '—' },
    { label: 'Moonset', value: moonset ?? '—' },
  ]

  return (
    <div className="glass-panel px-4 py-3 shrink-0">
      {loading ? (
        <p className="text-sm text-white/50">Loading conditions…</p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-white/40">{m.label}</p>
              <p className="text-base font-medium text-white whitespace-nowrap">{m.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
