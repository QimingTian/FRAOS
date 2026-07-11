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
