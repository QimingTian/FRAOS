/** Subtract a time range from a list of disjoint free intervals (scheduling helper). */
export function subtractOccupiedFromFree(
  freeIntervals: Array<{ startMs: number; endMs: number }>,
  occupied: { startMs: number; endMs: number }
): Array<{ startMs: number; endMs: number }> {
  const next: Array<{ startMs: number; endMs: number }> = []
  for (const interval of freeIntervals) {
    if (occupied.endMs <= interval.startMs || occupied.startMs >= interval.endMs) {
      next.push(interval)
      continue
    }
    if (occupied.startMs > interval.startMs) {
      next.push({ startMs: interval.startMs, endMs: occupied.startMs })
    }
    if (occupied.endMs < interval.endMs) {
      next.push({ startMs: occupied.endMs, endMs: interval.endMs })
    }
  }
  return next.filter((x) => x.endMs - x.startMs > 0).sort((a, b) => a.startMs - b.startMs)
}


import type Database from 'better-sqlite3'
import { getTonightSchedulingWindow } from '../astro/sunrise-window.js'

type Interval = { startMs: number; endMs: number }

/**
 * Compute the free (unoccupied) time intervals tonight during which a target
 * could be imaged for `durationMinutes`, after subtracting all already-
 * scheduled / in-progress session windows from the SQLite `sessions` table.
 *
 * This is the SQLite-backed analogue of the Pomfret web app's free-intervals
 * helper. It does NOT apply weather, altitude, or moon rules — only FIFO
 * occupancy. Those gates are layered on by the schedule-insight engine.
 *
 * @param db open database handle (hub.db)
 * @param targetRa target right ascension in decimal hours (reserved for
 *   future altitude pre-filtering; currently unused)
 * @param targetDec target declination in decimal degrees (reserved)
 * @param durationMinutes required contiguous session length in minutes;
 *   intervals shorter than this are dropped
 * @param filters filter names for the session (reserved for future moon
 *   pre-filtering; currently unused)
 * @returns disjoint free intervals (ms since epoch) large enough for the
 *   requested duration, in ascending start order
 */
export function getFreeIntervals(
  db: Database.Database,
  _targetRa: number,
  _targetDec: number,
  durationMinutes: number,
  _filters?: readonly string[]
): Interval[] {
  const durationMs = Math.max(0, Math.floor(durationMinutes)) * 60_000
  const now = new Date()
  const window = getTonightSchedulingWindow(now)
  const windowStartMs = Math.max(now.getTime(), window.nauticalDuskUtc.getTime())
  const deadlineMs = window.nauticalDawnUtc.getTime()

  let free: Interval[] =
    deadlineMs > windowStartMs ? [{ startMs: windowStartMs, endMs: deadlineMs }] : []

  const rows = db
    .prepare(
      `SELECT planned_start_iso, estimated_duration_seconds, exposure_seconds, count, status
       FROM sessions
       WHERE status IN ('scheduled', 'in_progress')
         AND planned_start_iso IS NOT NULL`
    )
    .all() as Array<{
    planned_start_iso?: string
    estimated_duration_seconds?: number
    exposure_seconds?: number
    count?: number
  }>

  for (const r of rows) {
    const startMs = Date.parse(r.planned_start_iso ?? '')
    if (!Number.isFinite(startMs)) continue
    let durSec =
      typeof r.estimated_duration_seconds === 'number' && Number.isFinite(r.estimated_duration_seconds)
        ? r.estimated_duration_seconds
        : Number(r.exposure_seconds) * Number(r.count)
    if (!Number.isFinite(durSec) || durSec <= 0) continue
    const endMs = startMs + durSec * 1000
    if (endMs <= windowStartMs || startMs >= deadlineMs) continue
    free = subtractOccupiedFromFree(free, {
      startMs: Math.max(startMs, windowStartMs),
      endMs: Math.min(endMs, deadlineMs),
    })
  }

  if (durationMs > 0) {
    free = free.filter((iv) => iv.endMs - iv.startMs >= durationMs)
  }
  return free.sort((a, b) => a.startMs - b.startMs)
}
