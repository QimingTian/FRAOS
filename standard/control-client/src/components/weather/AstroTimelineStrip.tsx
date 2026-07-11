import type { AstroTimelineBlock, AstroTimelineHour } from '../../lib/weather/astro-forecast'
import { metricColor } from '../../lib/weather/astro-forecast'

type AstroTimelineStripProps = {
  hours: AstroTimelineHour[]
  astroBlocks: AstroTimelineBlock[]
}

type HourlyRow = {
  key: keyof Pick<AstroTimelineHour, 'cloudCover' | 'windKmh' | 'precipProb'>
  label: string
  metric: 'cloud' | 'wind' | 'precip'
  format: (v: number | null) => string
}

const HOURLY_ROWS: HourlyRow[] = [
  { key: 'cloudCover', label: 'Cloud', metric: 'cloud', format: (v) => (v == null ? '—' : `${Math.round(v)}%`) },
  { key: 'windKmh', label: 'Wind', metric: 'wind', format: (v) => (v == null ? '—' : `${Math.round(v)} km/h`) },
  { key: 'precipProb', label: 'Precip', metric: 'precip', format: (v) => (v == null ? '—' : `${Math.round(v)}%`) },
]

const COL_LABEL = '8.5rem'

function cellText(metric: 'cloud' | 'seeing' | 'transparency' | 'wind' | 'precip', value: number | null): string {
  if (value == null || !Number.isFinite(value)) return ''
  if (metric === 'seeing' || metric === 'transparency') return value.toFixed(1)
  return String(Math.round(value))
}

function gridColumns(count: number): string {
  return `${COL_LABEL} repeat(${count}, minmax(2.4rem, 1fr))`
}

export default function AstroTimelineStrip({ hours, astroBlocks }: AstroTimelineStripProps) {
  if (hours.length === 0) {
    return (
      <div className="glass-panel p-4 text-sm text-white/50">
        No hourly forecast for tonight&apos;s window.
      </div>
    )
  }

  const colCount = hours.length

  return (
    <div className="glass-panel p-4 overflow-x-auto">
      <div className="flex items-center justify-between gap-3 mb-3 min-w-max">
        <h2 className="text-sm font-semibold tracking-wide text-white/80">Tonight</h2>
        <div className="flex items-center gap-3 text-[10px] text-white/45">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#22c55e]" /> Good
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#eab308]" /> Fair
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#ef4444]" /> Poor
          </span>
        </div>
      </div>

      <div className="min-w-max flex flex-col gap-1.5">
        <div className="grid gap-x-1" style={{ gridTemplateColumns: gridColumns(colCount) }}>
          <div />
          {hours.map((h) => (
            <div key={h.hourStartSec} className="text-[10px] text-center text-white/45 pb-1">
              {h.label}
            </div>
          ))}
        </div>

        {HOURLY_ROWS.map((row) => (
          <div
            key={row.key}
            className="grid gap-x-1"
            style={{ gridTemplateColumns: gridColumns(colCount) }}
          >
            <div className="text-[11px] text-white/60 pr-2 min-h-[1.75rem] flex items-center">
              {row.label}
            </div>
            {hours.map((h) => {
              const value = h[row.key] as number | null
              return (
                <div
                  key={`${row.key}-${h.hourStartSec}`}
                  className="h-7 rounded-sm flex items-center justify-center text-[9px] font-medium text-black/80"
                  style={{ backgroundColor: metricColor(row.metric, value) }}
                  title={`${row.label}: ${row.format(value)}`}
                >
                  {cellText(row.metric, value)}
                </div>
              )
            })}
          </div>
        ))}

        {(
          [
            { label: 'Transparency', metric: 'transparency' as const, pick: (b: AstroTimelineBlock) => b.transparencyMag },
            { label: 'Seeing', metric: 'seeing' as const, pick: (b: AstroTimelineBlock) => b.seeingArcsec },
          ] as const
        ).map((row) => (
          <div
            key={row.label}
            className="grid gap-x-1"
            style={{ gridTemplateColumns: gridColumns(colCount) }}
          >
            <div className="text-[11px] text-white/60 pr-2 min-h-[1.75rem] flex items-center">
              {row.label}
            </div>
            {astroBlocks.map((block) => {
              const value = row.pick(block)
              return (
                <div
                  key={`${row.label}-${block.startIndex}-${block.span}`}
                  className="h-7 rounded-sm flex items-center justify-center text-[9px] font-medium text-black/80"
                  style={{
                    gridColumn: `${2 + block.startIndex} / span ${block.span}`,
                    backgroundColor: metricColor(row.metric, value),
                  }}
                  title={`${row.label}: ${value == null ? '—' : value.toFixed(1)}`}
                >
                  {cellText(row.metric, value)}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
