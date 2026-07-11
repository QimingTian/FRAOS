import { DSO_SESSION_OVERHEAD_SEC } from '../imaging/session-overhead'
import {
  observatoryLocalParts,
  observatoryTimeZone,
  observatoryWallTimeOnLocalDateUtc,
  readObservatoryCoords,
} from '../observatory-local-time'
import {
  altitudeSessionCoverageOk,
  currentAltitudeDeg,
  firstAltitudeAllowedTimeMs,
} from './target-altitude'
import { getTonightScheduleStrip } from './schedule-strip'
import {
  getTonightScheduleEveningAstronomyUtc,
  getTonightScheduleMorningAstronomyUtc,
} from './sunrise-window'
import type { WeatherPrediction } from '../weather-client'

export function buildHourKey(at: Date, lon?: number): string {
  const parts = observatoryLocalParts(at, lon)
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}`
}

export function parseHourKeyToMs(key: string, lon?: number): number | null {
  const parts = key.split('-').map((x) => Number(x))
  if (parts.length !== 4) return null
  const [year, month, day, hour] = parts
  if (![year, month, day, hour].every((x) => Number.isFinite(x))) return null
  const { lon: obsLon } = readObservatoryCoords()
  return observatoryWallTimeOnLocalDateUtc(year, month, day, hour, 0, 0, lon ?? obsLon).getTime()
}

function formatObservatoryHourLabel(at: Date, lon: number, lat: number): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: observatoryTimeZone(lat, lon),
    hour: 'numeric',
    hour12: true,
  }).format(at)
}

export function computeTonightWindow(now: Date): { startMs: number; endMs: number } {
  const strip = getTonightScheduleStrip(now)
  return { startMs: strip.windowStartMs, endMs: strip.windowEndMs }
}

export function mergeWithFrozenPastHours(previous: string[], incoming: string[], now: Date): string[] {
  const { startMs, endMs } = computeTonightWindow(now)
  const nowMs = now.getTime()
  const merged = new Set<string>()

  for (const key of previous) {
    const ms = parseHourKeyToMs(key)
    if (ms == null) continue
    if (ms >= startMs && ms < endMs && ms <= nowMs) merged.add(key)
  }
  for (const key of incoming) {
    const ms = parseHourKeyToMs(key)
    if (ms == null) continue
    if (ms >= startMs && ms < endMs) merged.add(key)
  }

  return Array.from(merged).sort((a, b) => (parseHourKeyToMs(a) ?? 0) - (parseHourKeyToMs(b) ?? 0))
}

export type TonightHourSlot = {
  label: string
  hourKey: string
  hourStartMs: number
}

export type TonightEventBlock = {
  label: string
  startTime: Date
  topPct: number
}

export type TonightAdminClosedBlock = {
  id: string
  topPct: number
  heightPct: number
  label: string
}

export type TonightScheduleLayout = {
  start: Date
  end: Date
  hours: TonightHourSlot[]
  eventBlocks: TonightEventBlock[]
  adminClosedBlocks: TonightAdminClosedBlock[]
  nowTopPct: number | null
  nauticalDawn: Date
  nauticalDusk: Date
  astronomicalDawn: Date
}

export type AdminClosedWindow = {
  id: string
  startIso: string
  endIso: string
  description?: string
}

export function buildTonightScheduleLayout(
  scheduleNowMs: number,
  adminClosedWindows: AdminClosedWindow[] = []
): TonightScheduleLayout {
  const now = new Date(scheduleNowMs)
  const strip = getTonightScheduleStrip(now)
  const { lat, lon } = readObservatoryCoords()
  const start = new Date(strip.windowStartMs)
  const end = new Date(strip.windowEndMs)

  const points: TonightHourSlot[] = []
  let cursor = new Date(start)
  while (cursor.getTime() < end.getTime()) {
    points.push({
      label: formatObservatoryHourLabel(cursor, lon, lat),
      hourKey: buildHourKey(cursor, lon),
      hourStartMs: cursor.getTime(),
    })
    const parts = observatoryLocalParts(cursor, lon)
    cursor = observatoryWallTimeOnLocalDateUtc(
      parts.year,
      parts.month,
      parts.day,
      parts.hour + 1,
      0,
      0,
      lon
    )
  }

  const {
    sunsetUtc: sunset,
    civilDuskUtc: civilDusk,
    nauticalDuskUtc: nauticalDusk,
    astronomicalDarkUtc: astronomicalDark,
  } = getTonightScheduleEveningAstronomyUtc(now)
  const {
    sunriseUtc: sunrise,
    civilDawnUtc: civilDawn,
    nauticalDawnUtc: nauticalDawn,
    astronomicalDawnUtc: astronomicalDawn,
  } = getTonightScheduleMorningAstronomyUtc(now)

  const eventBlocks = [
    { label: 'Sunset', startTime: sunset },
    { label: 'Civil Dusk', startTime: civilDusk },
    { label: 'Nautical Dusk', startTime: nauticalDusk },
    { label: 'Astronomical Dark', startTime: astronomicalDark },
    { label: 'Astronomical Dawn', startTime: astronomicalDawn },
    { label: 'Nautical Dawn', startTime: nauticalDawn },
    { label: 'Civil Dawn', startTime: civilDawn },
    { label: 'Sunrise', startTime: sunrise },
  ]
    .filter((m) => m.startTime >= start && m.startTime <= end)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .map((m) => ({
      ...m,
      topPct: ((m.startTime.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100,
    }))

  const nowInWindow = now.getTime() >= start.getTime() && now.getTime() <= end.getTime()
  const nowTopPct = nowInWindow
    ? ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100
    : null

  const adminClosedBlocks = adminClosedWindows
    .map((w) => {
      const startMs = Date.parse(w.startIso)
      const endMs = Date.parse(w.endIso)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
      const overlapStart = Math.max(start.getTime(), startMs)
      const overlapEnd = Math.min(end.getTime(), endMs)
      if (overlapEnd <= overlapStart) return null
      const topPct = ((overlapStart - start.getTime()) / (end.getTime() - start.getTime())) * 100
      const heightPct = ((overlapEnd - overlapStart) / (end.getTime() - start.getTime())) * 100
      const label =
        typeof w.description === 'string' && w.description.trim() ? w.description.trim() : 'Closed window'
      return { id: w.id, topPct, heightPct, label }
    })
    .filter((x): x is TonightAdminClosedBlock => x != null)

  return {
    start,
    end,
    hours: points,
    eventBlocks,
    adminClosedBlocks,
    nowTopPct,
    nauticalDawn,
    nauticalDusk,
    astronomicalDawn,
  }
}

export type WeatherRunBlock = {
  topPct: number
  heightPct: number
  kind: 'permitted' | 'not_permitted'
  reasons: Array<'cloud' | 'rain' | 'wind'>
}

export function buildWeatherBlocks(input: {
  tonightSchedule: TonightScheduleLayout
  readyWeatherHourKeys: string[]
  nightWeatherHourKeys: string[]
  nightWeatherHourStartsMs?: number[]
  tonightWeatherPrediction: WeatherPrediction
  notPermittedReasonByHourKey: Record<string, Array<'cloud' | 'rain' | 'wind'>>
}): WeatherRunBlock[] {
  const {
    tonightSchedule,
    readyWeatherHourKeys,
    nightWeatherHourKeys,
    nightWeatherHourStartsMs = [],
    tonightWeatherPrediction,
    notPermittedReasonByHourKey,
  } = input

  const effectiveNightHourKeys =
    nightWeatherHourKeys.length > 0
      ? nightWeatherHourKeys
      : tonightWeatherPrediction === 'not_permitted'
        ? tonightSchedule.hours.map((h) => h.hourKey)
        : []

  if (effectiveNightHourKeys.length === 0 && nightWeatherHourStartsMs.length === 0) return []

  const readyKeySet = new Set(readyWeatherHourKeys)
  const nightKeySet = new Set(effectiveNightHourKeys)
  const nightMsSet = new Set(
    nightWeatherHourStartsMs.length > 0
      ? nightWeatherHourStartsMs
      : effectiveNightHourKeys
          .map((key) => parseHourKeyToMs(key))
          .filter((ms): ms is number => ms != null)
  )
  const blocks: WeatherRunBlock[] = []
  let runStartMs: number | null = null
  let runEndMsExclusive: number | null = null
  let runKind: 'permitted' | 'not_permitted' | null = null
  let runReasons = new Set<'cloud' | 'rain' | 'wind'>()

  const windowStartMs = tonightSchedule.start.getTime()
  const windowEndMs = tonightSchedule.end.getTime()
  const span = windowEndMs - windowStartMs

  for (const slot of tonightSchedule.hours) {
    const hasWeather = nightKeySet.has(slot.hourKey) || nightMsSet.has(slot.hourStartMs)
    if (!hasWeather) {
      if (runStartMs != null && runEndMsExclusive != null && runKind) {
        const clampedEnd = Math.min(runEndMsExclusive, windowEndMs)
        const topPct = ((runStartMs - windowStartMs) / span) * 100
        const heightPct = ((clampedEnd - runStartMs) / span) * 100
        if (heightPct > 0) blocks.push({ topPct, heightPct, kind: runKind, reasons: Array.from(runReasons) })
      }
      runStartMs = null
      runEndMsExclusive = null
      runKind = null
      runReasons = new Set<'cloud' | 'rain' | 'wind'>()
      continue
    }

    const kind: 'permitted' | 'not_permitted' = readyKeySet.has(slot.hourKey) ? 'permitted' : 'not_permitted'
    const reasonsForHour = kind === 'not_permitted' ? (notPermittedReasonByHourKey[slot.hourKey] ?? []) : []
    if (runStartMs == null) {
      runStartMs = slot.hourStartMs
      runEndMsExclusive = slot.hourStartMs + 60 * 60 * 1000
      runKind = kind
      runReasons = new Set<'cloud' | 'rain' | 'wind'>(reasonsForHour)
    } else if (runKind === kind) {
      runEndMsExclusive = slot.hourStartMs + 60 * 60 * 1000
      for (const reason of reasonsForHour) runReasons.add(reason)
    } else if (runEndMsExclusive != null && runKind) {
      const clampedEnd = Math.min(runEndMsExclusive, windowEndMs)
      const topPct = ((runStartMs - windowStartMs) / span) * 100
      const heightPct = ((clampedEnd - runStartMs) / span) * 100
      if (heightPct > 0) blocks.push({ topPct, heightPct, kind: runKind, reasons: Array.from(runReasons) })
      runStartMs = slot.hourStartMs
      runEndMsExclusive = slot.hourStartMs + 60 * 60 * 1000
      runKind = kind
      runReasons = new Set<'cloud' | 'rain' | 'wind'>(reasonsForHour)
    }
  }

  if (runStartMs != null && runEndMsExclusive != null && runKind) {
    const clampedEnd = Math.min(runEndMsExclusive, windowEndMs)
    const topPct = ((runStartMs - windowStartMs) / span) * 100
    const heightPct = ((clampedEnd - runStartMs) / span) * 100
    if (heightPct > 0) blocks.push({ topPct, heightPct, kind: runKind, reasons: Array.from(runReasons) })
  }

  return blocks
}

export type ScheduleStripItem = {
  id: string
  target: string
  status: string
  createdAt: string
  nightKey?: string | null
  plannedStartIso?: string | null
  failedAt?: string | null
  scheduleStripNightKey?: string | null
  scheduleBarStartMs?: number | null
  scheduleBarEndMs?: number | null
  estimatedDurationSeconds?: number | null
  filterPlans?: Array<{ filterName: string; exposureSeconds: number; count: number }> | null
  raHours?: number | null
  decDeg?: number | null
}

export type SessionTimelineBlock = {
  id: string
  startMs: number
  endMs: number
  topPct: number
  heightPct: number
  label: string
}

function estimateDurationSecondsFromPlans(
  plans: Array<{ filterName: string; exposureSeconds: number; count: number }> | undefined | null
): number {
  if (!Array.isArray(plans) || plans.length === 0) return DSO_SESSION_OVERHEAD_SEC
  const imagingSeconds = plans.reduce((sum, p) => sum + p.count * p.exposureSeconds, 0)
  return Math.max(imagingSeconds + DSO_SESSION_OVERHEAD_SEC, DSO_SESSION_OVERHEAD_SEC)
}

function sessionDurationMsFromItem(item: {
  estimatedDurationSeconds?: number | null
  filterPlans?: Array<{ filterName: string; exposureSeconds: number; count: number }> | null
}): number {
  const estimatedSeconds =
    typeof item.estimatedDurationSeconds === 'number' && Number.isFinite(item.estimatedDurationSeconds)
      ? item.estimatedDurationSeconds
      : estimateDurationSecondsFromPlans(item.filterPlans)
  return Math.max(estimatedSeconds, 60) * 1000
}

function serverScheduleBarForNight(
  item: ScheduleStripItem,
  nightKey: string
): { startMs: number; endMs: number } | null {
  if (item.scheduleStripNightKey !== nightKey) return null
  const startMs = item.scheduleBarStartMs
  const endMs = item.scheduleBarEndMs
  if (typeof startMs !== 'number' || typeof endMs !== 'number' || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null
  }
  if (endMs <= startMs) return null
  return { startMs, endMs }
}

function imagingWindowStartMs(windowStartMs: number, nauticalDuskMs: number): number {
  return Math.max(windowStartMs, nauticalDuskMs)
}

function placementToTimelineBlock(
  scheduled: { item: { id: string; target: string }; startMs: number; endMs: number },
  windowStartMs: number,
  windowEndMs: number
): SessionTimelineBlock {
  const topPct = ((scheduled.startMs - windowStartMs) / (windowEndMs - windowStartMs)) * 100
  const heightPct = ((scheduled.endMs - scheduled.startMs) / (windowEndMs - windowStartMs)) * 100
  return {
    id: scheduled.item.id,
    startMs: scheduled.startMs,
    endMs: scheduled.endMs,
    topPct,
    heightPct,
    label: scheduled.item.target,
  }
}

function listScheduledPendingPlacements(
  scheduleStripItems: ScheduleStripItem[],
  imagingStartMs: number,
  schedulingDeadlineMs: number,
  tonightNightKey: string
): Array<{ item: ScheduleStripItem; startMs: number; endMs: number }> {
  return scheduleStripItems
    .filter((item) => item.status === 'scheduled')
    .map((item) => {
      const serverBar = serverScheduleBarForNight(item, tonightNightKey)
      if (serverBar) {
        const startMs = Math.max(serverBar.startMs, imagingStartMs)
        const endMs = Math.min(serverBar.endMs, schedulingDeadlineMs)
        if (endMs <= startMs) return null
        return { item, startMs, endMs }
      }
      const startMsRaw = item.plannedStartIso ? Date.parse(item.plannedStartIso) : Number.NaN
      if (!Number.isFinite(startMsRaw)) return null
      if (startMsRaw < imagingStartMs - 60_000) return null
      const durationMs = sessionDurationMsFromItem(item)
      const startMs = Math.max(startMsRaw, imagingStartMs)
      const endMs = Math.min(startMs + durationMs, schedulingDeadlineMs)
      if (endMs <= startMs) return null
      return { item, startMs, endMs }
    })
    .filter((x): x is { item: ScheduleStripItem; startMs: number; endMs: number } => x != null)
    .sort((a, b) => a.startMs - b.startMs)
}

function fallbackPlacementForTerminalSession(
  item: ScheduleStripItem,
  locked: Record<string, { startMs: number; endMs: number }>,
  windowStartMs: number,
  schedulingDeadlineMs: number,
  nowMs: number
): { startMs: number; endMs: number } | null {
  const existing = locked[item.id]
  if (existing && Number.isFinite(existing.startMs) && Number.isFinite(existing.endMs) && existing.endMs > existing.startMs) {
    return { startMs: existing.startMs, endMs: existing.endMs }
  }

  const durationMs = sessionDurationMsFromItem(item)
  let startMs: number | null = null
  if (item.plannedStartIso) {
    const t = Date.parse(item.plannedStartIso)
    if (Number.isFinite(t)) startMs = t
  }
  if (startMs == null) {
    const c = Date.parse(item.createdAt)
    if (Number.isFinite(c)) startMs = c
  }
  if (startMs == null && item.status === 'in_progress') startMs = nowMs
  if (startMs == null) return null

  let s = Math.max(startMs, windowStartMs)
  let e = Math.min(s + durationMs, schedulingDeadlineMs)
  if (item.status === 'failed' && item.failedAt) {
    const failMs = Date.parse(item.failedAt)
    if (Number.isFinite(failMs)) e = Math.min(e, failMs, schedulingDeadlineMs)
  }
  if (e <= s) {
    s = Math.max(windowStartMs, schedulingDeadlineMs - 5 * 60 * 1000)
    e = schedulingDeadlineMs
  }
  if (e <= s) return null
  return { startMs: s, endMs: e }
}

function inProgressSchedulePlacement(
  item: ScheduleStripItem,
  locked: Record<string, { startMs: number; endMs: number }>,
  imagingStartMs: number,
  schedulingDeadlineMs: number,
  nowMs: number
): { startMs: number; endMs: number } | null {
  const durationMs = sessionDurationMsFromItem(item)
  const existing = locked[item.id]

  let startMs: number | null = null
  if (existing && Number.isFinite(existing.startMs)) startMs = existing.startMs
  else if (item.plannedStartIso) {
    const t = Date.parse(item.plannedStartIso)
    if (Number.isFinite(t)) startMs = t
  }
  if (startMs == null) {
    const c = Date.parse(item.createdAt)
    if (Number.isFinite(c)) startMs = c
  }
  if (startMs == null) startMs = nowMs

  const start = Math.max(startMs, imagingStartMs)
  const end = Math.min(start + durationMs, schedulingDeadlineMs)
  if (end <= start) return null
  return { startMs: start, endMs: end }
}

function completedSessionOverlapsTonightStripWindow(
  item: ScheduleStripItem,
  tonightNightKey: string,
  windowStartMs: number,
  windowEndMs: number,
  locked: Record<string, { startMs: number; endMs: number }>
): boolean {
  if (item.nightKey && item.nightKey !== tonightNightKey) return false
  const durationMs = sessionDurationMsFromItem(item)
  const lock = locked[item.id]
  if (lock && Number.isFinite(lock.startMs) && Number.isFinite(lock.endMs) && lock.endMs > lock.startMs) {
    if (lock.endMs > windowStartMs && lock.startMs < windowEndMs) return true
  }
  if (item.plannedStartIso) {
    const t = Date.parse(item.plannedStartIso)
    if (Number.isFinite(t) && t + durationMs > windowStartMs && t < windowEndMs) return true
  }
  const c = Date.parse(item.createdAt)
  return Number.isFinite(c) && c + durationMs > windowStartMs && c < windowEndMs
}

type TimeInterval = { startMs: number; endMs: number }

function subtractInterval(source: TimeInterval[], occupied: TimeInterval): TimeInterval[] {
  const next: TimeInterval[] = []
  for (const interval of source) {
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
  return next
    .filter((x) => x.endMs - x.startMs > 0)
    .sort((a, b) => a.startMs - b.startMs)
}

export function planSessionSchedule(input: {
  scheduleStripItems: ScheduleStripItem[]
  tonightSchedule: TonightScheduleLayout
  tonightNightKey: string
  lockedSessionSchedule: Record<string, { startMs: number; endMs: number }>
  readyWeatherHourKeys: string[]
  tonightWeatherPrediction: WeatherPrediction
  hasAnyPrecipitationTonight: boolean
  adminClosedWindows: AdminClosedWindow[]
  nowMs?: number
  /** Personal hub has no server reconcile; pack pending rows client-side with the same FIFO planner. */
  packPendingClientSide?: boolean
}): { blocks: SessionTimelineBlock[]; newlyLocked: Record<string, { startMs: number; endMs: number }> } {
  const {
    scheduleStripItems,
    tonightSchedule,
    tonightNightKey,
    lockedSessionSchedule,
    readyWeatherHourKeys,
    tonightWeatherPrediction,
    hasAnyPrecipitationTonight,
    adminClosedWindows,
    nowMs = Date.now(),
    packPendingClientSide = true,
  } = input

  const windowStartMs = tonightSchedule.start.getTime()
  const windowEndMs = tonightSchedule.end.getTime()
  const nauticalDuskMs = tonightSchedule.nauticalDusk.getTime()
  const imagingStartMs = imagingWindowStartMs(windowStartMs, nauticalDuskMs)
  const schedulingDeadlineMs = Math.min(windowEndMs, tonightSchedule.astronomicalDawn.getTime())

  const effectiveLocks: Record<string, { startMs: number; endMs: number }> = { ...lockedSessionSchedule }
  for (const item of scheduleStripItems) {
    const bar = serverScheduleBarForNight(item, tonightNightKey)
    if (bar) effectiveLocks[item.id] = bar
  }

  if (tonightWeatherPrediction === 'not_permitted' || hasAnyPrecipitationTonight) {
    const blocks: SessionTimelineBlock[] = []
    const newlyLocked: Record<string, { startMs: number; endMs: number }> = {}

    for (const item of scheduleStripItems) {
      if (item.status !== 'in_progress' && item.status !== 'completed') continue
      if (
        item.status === 'completed' &&
        !completedSessionOverlapsTonightStripWindow(item, tonightNightKey, windowStartMs, windowEndMs, effectiveLocks)
      ) {
        continue
      }
      const placed =
        item.status === 'in_progress'
          ? inProgressSchedulePlacement(item, effectiveLocks, imagingStartMs, schedulingDeadlineMs, nowMs) ??
            fallbackPlacementForTerminalSession(item, effectiveLocks, imagingStartMs, schedulingDeadlineMs, nowMs)
          : serverScheduleBarForNight(item, tonightNightKey) ??
            fallbackPlacementForTerminalSession(item, effectiveLocks, imagingStartMs, schedulingDeadlineMs, nowMs)
      if (!placed) continue
      const startMs = Math.max(placed.startMs, imagingStartMs)
      const endMs = Math.min(placed.endMs, schedulingDeadlineMs)
      if (endMs <= startMs) continue
      const topPct = ((startMs - windowStartMs) / (windowEndMs - windowStartMs)) * 100
      const heightPct = ((endMs - startMs) / (windowEndMs - windowStartMs)) * 100
      blocks.push({ id: item.id, startMs, endMs, topPct, heightPct, label: item.target })
      if (item.status === 'in_progress') {
        const prev = effectiveLocks[item.id]
        if (!prev || prev.startMs !== startMs || prev.endMs !== endMs) newlyLocked[item.id] = { startMs, endMs }
      } else if (!effectiveLocks[item.id]) {
        newlyLocked[item.id] = { startMs, endMs }
      }
    }

    for (const scheduled of listScheduledPendingPlacements(
      scheduleStripItems,
      imagingStartMs,
      schedulingDeadlineMs,
      tonightNightKey
    )) {
      blocks.push(placementToTimelineBlock(scheduled, windowStartMs, windowEndMs))
    }

    blocks.sort((a, b) => a.startMs - b.startMs)
    return { blocks, newlyLocked }
  }

  const readyHourKeySet = new Set(readyWeatherHourKeys)
  const readyHourStartsMs = tonightSchedule.hours
    .filter((h) => readyWeatherHourKeys.includes(h.hourKey))
    .map((h) => h.hourStartMs)
    .sort((a, b) => a - b)

  const blocks: SessionTimelineBlock[] = []
  let freeIntervals: TimeInterval[] = [{ startMs: imagingStartMs, endMs: schedulingDeadlineMs }]
  const adminClosedIntervals = adminClosedWindows
    .map((w) => {
      const startMs = Date.parse(w.startIso)
      const endMs = Date.parse(w.endIso)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
      const overlapStart = Math.max(startMs, windowStartMs)
      const overlapEnd = Math.min(endMs, schedulingDeadlineMs)
      if (overlapEnd <= overlapStart) return null
      return { startMs: overlapStart, endMs: overlapEnd }
    })
    .filter((x): x is TimeInterval => x != null)

  const isPermittedAtMs = (ms: number): boolean => {
    if (readyHourKeySet.size === 0) return true
    return readyHourKeySet.has(buildHourKey(new Date(ms)))
  }
  const nextPermittedStartAtOrAfter = (ms: number): number | null => {
    if (readyHourStartsMs.length === 0) return ms
    const atOrAfter = readyHourStartsMs.find((start) => start >= ms)
    return atOrAfter ?? null
  }
  const permittedCoverageMs = (startMs: number, endMs: number): number => {
    if (readyHourKeySet.size === 0) return Math.max(0, endMs - startMs)
    if (endMs <= startMs) return 0

    let covered = 0
    const cursor = new Date(startMs)
    cursor.setMinutes(0, 0, 0)
    while (cursor.getTime() < endMs) {
      const hourStart = cursor.getTime()
      const hourEnd = hourStart + 60 * 60 * 1000
      const overlapStart = Math.max(startMs, hourStart)
      const overlapEnd = Math.min(endMs, hourEnd)
      if (overlapEnd > overlapStart && readyHourKeySet.has(buildHourKey(cursor))) {
        covered += overlapEnd - overlapStart
      }
      cursor.setHours(cursor.getHours() + 1)
    }
    return covered
  }

  if (adminClosedIntervals.length > 0) {
    for (const c of adminClosedIntervals) {
      freeIntervals = subtractInterval(freeIntervals, c)
    }
  }

  const placeInFreeIntervals = (item: ScheduleStripItem, minStartMs: number): { startMs: number; endMs: number } | null => {
    const createdMs = Number.isFinite(Date.parse(item.createdAt)) ? Date.parse(item.createdAt) : windowStartMs
    const plannedMs = item.plannedStartIso ? Date.parse(item.plannedStartIso) : Number.NaN
    const anchorMs = Number.isFinite(plannedMs) ? plannedMs : createdMs
    const estimatedSeconds =
      typeof item.estimatedDurationSeconds === 'number' && Number.isFinite(item.estimatedDurationSeconds)
        ? item.estimatedDurationSeconds
        : estimateDurationSecondsFromPlans(item.filterPlans)
    const durationMs = Math.max(estimatedSeconds, 60) * 1000

    for (const interval of freeIntervals) {
      if (interval.endMs <= interval.startMs) continue
      let startMs = Math.max(interval.startMs, anchorMs, nauticalDuskMs, minStartMs)

      if (
        typeof item.raHours === 'number' &&
        Number.isFinite(item.raHours) &&
        typeof item.decDeg === 'number' &&
        Number.isFinite(item.decDeg) &&
        currentAltitudeDeg(item.raHours, item.decDeg, new Date(startMs)) < 30
      ) {
        const riseStartMs = firstAltitudeAllowedTimeMs(item.raHours, item.decDeg, startMs, interval.endMs)
        if (riseStartMs == null) continue
        startMs = riseStartMs
      }

      if (!isPermittedAtMs(startMs)) {
        const permittedStart = nextPermittedStartAtOrAfter(startMs)
        if (permittedStart == null || permittedStart >= interval.endMs) continue
        startMs = permittedStart
      }

      const endMs = startMs + durationMs
      if (endMs > interval.endMs || endMs > schedulingDeadlineMs) continue

      if (permittedCoverageMs(startMs, endMs) < durationMs * 0.8) continue
      if (
        typeof item.raHours === 'number' &&
        Number.isFinite(item.raHours) &&
        typeof item.decDeg === 'number' &&
        Number.isFinite(item.decDeg) &&
        !altitudeSessionCoverageOk(item.raHours, item.decDeg, startMs, endMs)
      ) {
        continue
      }

      return { startMs, endMs }
    }

    return null
  }

  const newlyLocked: Record<string, { startMs: number; endMs: number }> = {}
  const lockable = scheduleStripItems
    .filter((item) => item.status === 'in_progress' || item.status === 'completed')
    .filter((item) => {
      if (item.status === 'in_progress') return true
      return completedSessionOverlapsTonightStripWindow(
        item,
        tonightNightKey,
        windowStartMs,
        windowEndMs,
        effectiveLocks
      )
    })
    .sort((a, b) => {
      const aMs = a.plannedStartIso ? Date.parse(a.plannedStartIso) : Date.parse(a.createdAt)
      const bMs = b.plannedStartIso ? Date.parse(b.plannedStartIso) : Date.parse(b.createdAt)
      return (Number.isFinite(aMs) ? aMs : 0) - (Number.isFinite(bMs) ? bMs : 0)
    })

  for (const item of lockable) {
    let placed: { startMs: number; endMs: number } | undefined = effectiveLocks[item.id]
    if (item.status === 'in_progress') {
      const locked = inProgressSchedulePlacement(
        item,
        effectiveLocks,
        imagingStartMs,
        schedulingDeadlineMs,
        nowMs
      )
      if (!locked) continue
      placed = locked
      const prev = effectiveLocks[item.id]
      if (!prev || prev.startMs !== locked.startMs || prev.endMs !== locked.endMs) {
        newlyLocked[item.id] = locked
      }
    } else if (!placed) {
      const computed = placeInFreeIntervals(item, imagingStartMs)
      if (computed) {
        placed = computed
        newlyLocked[item.id] = placed
      } else {
        const fb = fallbackPlacementForTerminalSession(
          item,
          effectiveLocks,
          imagingStartMs,
          schedulingDeadlineMs,
          nowMs
        )
        if (!fb) continue
        placed = fb
        newlyLocked[item.id] = placed
      }
    }

    if (!placed) continue

    const startMs = Math.max(placed.startMs, imagingStartMs)
    const endMs = Math.min(placed.endMs, schedulingDeadlineMs)
    if (endMs <= startMs) continue

    freeIntervals = subtractInterval(freeIntervals, { startMs, endMs })

    const topPct = ((startMs - windowStartMs) / (windowEndMs - windowStartMs)) * 100
    const heightPct = ((endMs - startMs) / (windowEndMs - windowStartMs)) * 100
    blocks.push({ id: item.id, startMs, endMs, topPct, heightPct, label: item.target })
  }

  const scheduledPending = listScheduledPendingPlacements(
    scheduleStripItems,
    imagingStartMs,
    schedulingDeadlineMs,
    tonightNightKey
  )

  for (const scheduled of scheduledPending) {
    freeIntervals = subtractInterval(freeIntervals, {
      startMs: scheduled.startMs,
      endMs: scheduled.endMs,
    })
    blocks.push(placementToTimelineBlock(scheduled, windowStartMs, windowEndMs))
  }

  if (packPendingClientSide) {
    const fifoPending = scheduleStripItems
      .filter((item) => item.status === 'pending')
      .sort((a, b) => {
        const aMs = Date.parse(a.createdAt)
        const bMs = Date.parse(b.createdAt)
        return (Number.isFinite(aMs) ? aMs : 0) - (Number.isFinite(bMs) ? bMs : 0)
      })

    for (const item of fifoPending) {
      const placed = placeInFreeIntervals(item, imagingStartMs)
      if (!placed) continue
      freeIntervals = subtractInterval(freeIntervals, placed)
      blocks.push(
        placementToTimelineBlock({ item, startMs: placed.startMs, endMs: placed.endMs }, windowStartMs, windowEndMs)
      )
    }
  }

  blocks.sort((a, b) => a.startMs - b.startMs)
  return { blocks, newlyLocked }
}

export function sessionScheduleBlocksWithTail(
  blocks: SessionTimelineBlock[],
  tonightSchedule: TonightScheduleLayout
): SessionTimelineBlock[] {
  const baseBlocks = [...blocks]
  if (baseBlocks.length === 0) return baseBlocks

  const windowStartMs = tonightSchedule.start.getTime()
  const windowEndMs = tonightSchedule.end.getTime()
  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) {
    return baseBlocks
  }

  const lastEndMs = baseBlocks.reduce((latest, block) => Math.max(latest, block.endMs), windowStartMs)
  const tailStartMs = Math.min(Math.max(lastEndMs, windowStartMs), windowEndMs)
  const tailEndMs = Math.min(tailStartMs + 15 * 60 * 1000, windowEndMs)
  if (tailEndMs <= tailStartMs) return baseBlocks

  const topPct = ((tailStartMs - windowStartMs) / (windowEndMs - windowStartMs)) * 100
  const heightPct = ((tailEndMs - tailStartMs) / (windowEndMs - windowStartMs)) * 100

  baseBlocks.push({
    id: '__end_night_tail__',
    startMs: tailStartMs,
    endMs: tailEndMs,
    topPct,
    heightPct,
    label: 'Close Dome',
  })

  return baseBlocks
}

export function sessionRowsToScheduleStripItems(
  sessions: Array<{
    id: string
    target: string
    status: string
    createdAt?: string
    plannedStartIso?: string | null
    raHours?: number | null
    decDeg?: number | null
    filter?: string | null
    exposureSeconds?: number | null
    count?: number | null
    estimatedDurationSeconds?: number | null
    filterPlans?: Array<{ filterName: string; exposureSeconds: number; count: number }> | null
    nightKey?: string | null
    failedAt?: string | null
    scheduleStripNightKey?: string | null
    scheduleBarStartMs?: number | null
    scheduleBarEndMs?: number | null
  }>
): ScheduleStripItem[] {
  return sessions
    .filter((s) => s.status !== 'failed')
    .map((s) => {
      const filterPlans =
        s.filterPlans ??
        (s.filter && s.exposureSeconds != null && s.count != null
          ? [{ filterName: s.filter, exposureSeconds: s.exposureSeconds, count: s.count }]
          : null)
      return {
        id: s.id,
        target: s.target,
        status: s.status,
        createdAt: s.createdAt ?? new Date().toISOString(),
        plannedStartIso: s.plannedStartIso ?? null,
        raHours: s.raHours ?? null,
        decDeg: s.decDeg ?? null,
        filterPlans,
        estimatedDurationSeconds: s.estimatedDurationSeconds ?? null,
        nightKey: s.nightKey ?? null,
        failedAt: s.failedAt ?? null,
        scheduleStripNightKey: s.scheduleStripNightKey ?? null,
        scheduleBarStartMs: s.scheduleBarStartMs ?? null,
        scheduleBarEndMs: s.scheduleBarEndMs ?? null,
      }
    })
}
