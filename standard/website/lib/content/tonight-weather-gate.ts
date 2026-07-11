export const MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS = 2

export type HourlyForecastSample = {
  hourStartSec: number
  cloudCover: number
  precipProbability: number
  windSpeedMs: number
}

export function evaluateGlobalTonightWeatherPermitted(input: {
  hours: HourlyForecastSample[]
  gateStartSec: number
  gateEndSec: number
  nowSec: number
}): boolean {
  const { hours, gateStartSec, gateEndSec, nowSec } = input
  if (!Number.isFinite(gateStartSec) || !Number.isFinite(gateEndSec) || gateEndSec <= gateStartSec) {
    return false
  }
  const beforeGate = nowSec < gateStartSec
  const gateHours = hours.filter(
    (h) => h.hourStartSec >= gateStartSec && h.hourStartSec < gateEndSec
  )
  if (gateHours.length === 0) return false

  const countsToward = (hourStartSec: number): boolean => {
    const hourFullyEnded = hourStartSec + 3600 <= nowSec
    return beforeGate || !hourFullyEnded
  }

  let allPrecipUnder10 = true
  let windOver10HourCount = 0
  for (const h of gateHours) {
    if (!countsToward(h.hourStartSec)) continue
    if (!Number.isFinite(h.precipProbability) || h.precipProbability >= 10) {
      allPrecipUnder10 = false
    }
    if (!Number.isFinite(h.windSpeedMs) || h.windSpeedMs > 10) {
      windOver10HourCount += 1
    }
  }
  const windAllowedByHours = windOver10HourCount <= 3

  let consecutiveUnder10 = 0
  let hasMinConsecutiveUnder10 = false
  if (allPrecipUnder10 && windAllowedByHours) {
    for (const h of gateHours) {
      if (!countsToward(h.hourStartSec)) continue
      if (Number.isFinite(h.cloudCover) && h.cloudCover < 10) {
        consecutiveUnder10 += 1
        if (consecutiveUnder10 >= MIN_CONSECUTIVE_CLEAR_CLOUD_HOURS) {
          hasMinConsecutiveUnder10 = true
          break
        }
      } else {
        consecutiveUnder10 = 0
      }
    }
  }

  return allPrecipUnder10 && windAllowedByHours && hasMinConsecutiveUnder10
}
