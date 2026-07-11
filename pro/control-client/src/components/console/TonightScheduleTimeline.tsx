import { useEffect, useMemo, useState } from 'react'
import { getTonightScheduleStrip } from '../../lib/site/schedule-strip'
import {
  buildTonightScheduleLayout,
  buildWeatherBlocks,
  mergeWithFrozenPastHours,
  planSessionSchedule,
  sessionRowsToScheduleStripItems,
  sessionScheduleBlocksWithTail,
  type AdminClosedWindow,
} from '../../lib/site/tonight-schedule'
import type { SessionRow } from '../../lib/types'
import type { TonightWeatherSnapshot } from '../../lib/weather-client'
import { fetchAdminClosedWindows } from '../../lib/hub-client'

type TonightScheduleTimelineProps = {
  weather: TonightWeatherSnapshot | null
  sessions: SessionRow[]
}

export function TonightScheduleTimeline({ weather, sessions }: TonightScheduleTimelineProps) {
  const [scheduleNowMs, setScheduleNowMs] = useState(() => Date.now())
  const [readyWeatherHourKeys, setReadyWeatherHourKeys] = useState<string[]>([])
  const [nightWeatherHourKeys, setNightWeatherHourKeys] = useState<string[]>([])
  const [notPermittedReasonByHourKey, setNotPermittedReasonByHourKey] = useState<
    Record<string, Array<'cloud' | 'rain' | 'wind'>>
  >({})
  const [lockedSessionSchedule, setLockedSessionSchedule] = useState<
    Record<string, { startMs: number; endMs: number }>
  >({})
  const [adminClosedWindows, setAdminClosedWindows] = useState<AdminClosedWindow[]>([])

  useEffect(() => {
    const id = window.setInterval(() => setScheduleNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const res = await fetchAdminClosedWindows()
      if (cancelled || !res.ok || !Array.isArray(res.windows)) return
      setAdminClosedWindows(
        res.windows.map((w) => ({
          id: w.id,
          startIso: w.startIso,
          endIso: w.endIso,
          description: w.description,
        }))
      )
    }
    void load()
    const id = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const now = new Date()
    setReadyWeatherHourKeys((prev) =>
      mergeWithFrozenPastHours(prev, weather?.readyWeatherHourKeys ?? [], now)
    )
    setNightWeatherHourKeys((prev) =>
      mergeWithFrozenPastHours(prev, weather?.nightWeatherHourKeys ?? [], now)
    )
    setNotPermittedReasonByHourKey(weather?.notPermittedReasonByHourKey ?? {})
  }, [weather])

  const tonightSchedule = useMemo(
    () => buildTonightScheduleLayout(scheduleNowMs, adminClosedWindows),
    [scheduleNowMs, adminClosedWindows]
  )

  const tonightNightKey = useMemo(
    () => getTonightScheduleStrip(new Date(scheduleNowMs)).nightKey,
    [scheduleNowMs]
  )

  const scheduleStripItems = useMemo(
    () => sessionRowsToScheduleStripItems(sessions),
    [sessions]
  )

  const weatherBlocks = useMemo(
    () =>
      buildWeatherBlocks({
        tonightSchedule,
        readyWeatherHourKeys,
        nightWeatherHourKeys,
        tonightWeatherPrediction: weather?.prediction ?? 'not_permitted',
        notPermittedReasonByHourKey,
      }),
    [
      tonightSchedule,
      readyWeatherHourKeys,
      nightWeatherHourKeys,
      weather?.prediction,
      notPermittedReasonByHourKey,
    ]
  )

  const sessionSchedulePlan = useMemo(
    () =>
      planSessionSchedule({
        scheduleStripItems,
        tonightSchedule,
        tonightNightKey,
        lockedSessionSchedule,
        readyWeatherHourKeys,
        tonightWeatherPrediction: weather?.prediction ?? 'not_permitted',
        hasAnyPrecipitationTonight: weather?.hasAnyPrecipitationTonight === true,
        adminClosedWindows,
        nowMs: scheduleNowMs,
      }),
    [
      scheduleStripItems,
      tonightSchedule,
      tonightNightKey,
      lockedSessionSchedule,
      readyWeatherHourKeys,
      weather?.prediction,
      weather?.hasAnyPrecipitationTonight,
      adminClosedWindows,
      scheduleNowMs,
    ]
  )

  useEffect(() => {
    const windowStartMs = tonightSchedule.start.getTime()
    const windowEndMs = tonightSchedule.end.getTime()
    setLockedSessionSchedule((prev) => {
      const activeLockableIds = new Set(
        scheduleStripItems
          .filter((x) => x.status === 'in_progress' || x.status === 'completed')
          .map((x) => x.id)
      )

      const next: Record<string, { startMs: number; endMs: number }> = {}
      let changed = false

      for (const [id, placement] of Object.entries(prev)) {
        if (!activeLockableIds.has(id)) {
          changed = true
          continue
        }
        next[id] = placement
      }

      for (const [id, placement] of Object.entries(sessionSchedulePlan.newlyLocked)) {
        const prevPlacement = next[id]
        if (!prevPlacement || prevPlacement.startMs !== placement.startMs || prevPlacement.endMs !== placement.endMs) {
          next[id] = placement
          changed = true
        }
      }

      if (!changed) return prev
      void windowStartMs
      void windowEndMs
      return next
    })
  }, [scheduleStripItems, sessionSchedulePlan.newlyLocked, tonightSchedule.start, tonightSchedule.end])

  const sessionScheduleBlocks = useMemo(
    () => sessionScheduleBlocksWithTail(sessionSchedulePlan.blocks, tonightSchedule),
    [sessionSchedulePlan.blocks, tonightSchedule]
  )

  const hourLines = useMemo(
    () =>
      tonightSchedule.hours.map((slot) => ({
        ...slot,
        topPct:
          ((slot.hourStartMs - tonightSchedule.start.getTime()) /
            (tonightSchedule.end.getTime() - tonightSchedule.start.getTime())) *
          100,
      })),
    [tonightSchedule]
  )

  const nowTopPct = tonightSchedule.nowTopPct

  return (
    <section className="remote-glass-pane timeline-panel">
      <div className="remote-pane-head">
        <h2>Tonight&apos;s Schedule</h2>
      </div>

      <div className="tonight-timeline">
        <div className="tonight-timeline-inner">
          <div className="tonight-timeline-axis-left" aria-hidden />
          <div className="tonight-timeline-axis-right" aria-hidden />

          {hourLines.map((slot, index) => (
            <div key={`hour-line-${slot.hourKey}-${index}`}>
              {index < hourLines.length - 1 && (
                <div className="tonight-timeline-gridline" style={{ top: `${slot.topPct}%` }} />
              )}
              <p
                className={`tonight-timeline-hour${index === 0 ? ' first' : ''}${index === hourLines.length - 1 ? ' last' : ''}`}
                style={{ top: `${slot.topPct}%` }}
              >
                {slot.label}
              </p>
            </div>
          ))}
          <div className="tonight-timeline-gridline tonight-timeline-gridline-end" aria-hidden />

          {nowTopPct !== null && (
            <div className="tonight-timeline-now" style={{ top: `${nowTopPct}%` }} />
          )}

          <div className="tonight-timeline-blocks">
            {weatherBlocks.map((block, idx) => (
            <div
              key={`weather-${block.kind}-${idx}`}
              className="tonight-block tonight-block-weather"
              style={{
                top: `${block.topPct}%`,
                height: `${Math.max(block.heightPct, 4)}%`,
              }}
            >
              <div className="tonight-block-inner tonight-weather-signal">
                <div className="tonight-weather-head">
                  <span
                    className={`tonight-weather-lamp ${block.kind === 'permitted' ? 'ok' : 'error'}`}
                    aria-hidden
                  />
                  <p>Weather</p>
                </div>
                {block.reasons.length > 0 ? (
                  <p className="tonight-block-sub">{block.reasons.join(' / ')}</p>
                ) : null}
              </div>
            </div>
          ))}

          {tonightSchedule.eventBlocks.map((marker) => (
            <div
              key={marker.label}
              className="tonight-block tonight-block-event"
              style={{ top: `${marker.topPct}%` }}
            >
              <p>{marker.label}</p>
            </div>
          ))}

          {sessionScheduleBlocks.map((block, idx) => {
            const isCloseDome = block.id === '__end_night_tail__'
            return (
              <div
                key={`session-${block.id}-${idx}`}
                className={`tonight-block tonight-block-session${isCloseDome ? ' tail tail-marker' : ''}`}
                style={{
                  top: `${block.topPct}%`,
                  ...(isCloseDome ? {} : { height: `${Math.max(block.heightPct, 4)}%` }),
                }}
              >
                <p>{block.label}</p>
              </div>
            )
          })}

          {tonightSchedule.adminClosedBlocks.map((block) => (
            <div
              key={`admin-closed-${block.id}`}
              className="tonight-block tonight-block-closed"
              style={{
                top: `${block.topPct}%`,
                height: `${Math.max(block.heightPct, 4)}%`,
              }}
            >
              <p>{block.label}</p>
            </div>
          ))}
        </div>
        </div>
      </div>
    </section>
  )
}
