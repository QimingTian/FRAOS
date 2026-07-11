import { readObservatoryCoords } from '@/lib/imaging/observatory-local-time'

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const SYNODIC_MONTH = 29.530588853
const NEW_MOON_REF_MS = Date.UTC(2000, 0, 6, 18, 14, 0)

function normDeg(x: number): number {
  let v = x % 360
  if (v < 0) v += 360
  return v
}
function sinD(d: number): number {
  return Math.sin(d * DEG2RAD)
}
function cosD(d: number): number {
  return Math.cos(d * DEG2RAD)
}

/** Low-accuracy solar ecliptic longitude (Meeus Ch. 25, ~0.01° accuracy). */
function sunEclipticLonDeg(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525
  const L0 = normDeg(280.46646 + 36000.76983 * T + 0.0003032 * T * T)
  const M = normDeg(357.52911 + 35999.05029 * T - 0.0001537 * T * T)
  const C = (1.9146 - 0.004817 * T) * sinD(M) + 0.019993 * sinD(2 * M) + 0.00029 * sinD(3 * M)
  return normDeg(L0 + C)
}

function moonEclipticLonDeg(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525
  const L0 = normDeg(218.3165 + 481267.8813 * T)
  const M = normDeg(134.9634 + 477198.8676 * T)
  const M1 = normDeg(357.5291 + 35999.0503 * T)
  const D = normDeg(297.8502 + 445267.1115 * T)
  const F = normDeg(93.272 + 483202.0175 * T)
  return normDeg(
    L0 + 6.289 * sinD(M) + 1.274 * sinD(2 * D - M) + 0.658 * sinD(2 * D) + 0.214 * sinD(2 * M) -
      0.186 * sinD(M1) -
      0.114 * sinD(2 * F)
  )
}

export type MoonPhaseInfo = {
  /** Days since last new moon (0 = new, ~14.77 = full). */
  ageDays: number
  /** Illuminated fraction 0..1. */
  illumination: number
  /** Phase name (e.g. "Waxing Gibbous"). */
  name: string
}

export function moonPhaseInfo(now: Date): MoonPhaseInfo {
  const sunLon = sunEclipticLonDeg(now)
  const moonLon = moonEclipticLonDeg(now)
  let elongation = moonLon - sunLon
  if (elongation < 0) elongation += 360

  const illumination = (1 - cosD(elongation)) / 2
  const ageDays =
    ((((now.getTime() - NEW_MOON_REF_MS) / 86400000) % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH

  let name: string
  if (elongation < 22.5) name = 'New Moon'
  else if (elongation < 82.5) name = 'Waxing Crescent'
  else if (elongation < 97.5) name = 'First Quarter'
  else if (elongation < 172.5) name = 'Waxing Gibbous'
  else if (elongation < 187.5) name = 'Full Moon'
  else if (elongation < 262.5) name = 'Waning Gibbous'
  else if (elongation < 277.5) name = 'Last Quarter'
  else if (elongation < 337.5) name = 'Waning Crescent'
  else name = 'New Moon'

  return { ageDays, illumination, name }
}

/** Simplified Meeus low-accuracy lunar position → equatorial RA/Dec. */
export function moonEquatorial(date: Date): { raHours: number; decDeg: number } {
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525

  const L0 = normDeg(218.3165 + 481267.8813 * T)
  const M = normDeg(134.9634 + 477198.8676 * T)
  const M1 = normDeg(357.5291 + 35999.0503 * T)
  const D = normDeg(297.8502 + 445267.1115 * T)
  const F = normDeg(93.272 + 483202.0175 * T)

  const lon = normDeg(
    L0 + 6.289 * sinD(M) + 1.274 * sinD(2 * D - M) + 0.658 * sinD(2 * D) + 0.214 * sinD(2 * M) -
      0.186 * sinD(M1) -
      0.114 * sinD(2 * F)
  )
  const lat = 5.128 * sinD(F) + 0.281 * sinD(M + F) + 0.278 * sinD(M - F)

  const obl = 23.4393 - 0.013 * T
  const lonR = lon * DEG2RAD,
    latR = lat * DEG2RAD,
    oblR = obl * DEG2RAD
  const ra = Math.atan2(
    Math.sin(lonR) * Math.cos(oblR) - Math.tan(latR) * Math.sin(oblR),
    Math.cos(lonR)
  )
  const dec = Math.asin(Math.sin(latR) * Math.cos(oblR) + Math.cos(latR) * Math.sin(oblR) * Math.sin(lonR))

  return { raHours: normDeg(ra * RAD2DEG) / 15, decDeg: dec * RAD2DEG }
}

/** Moon altitude (degrees) above the local horizon at the configured observatory. */
export function moonAltDeg(date: Date, latDeg?: number, lonDeg?: number): number {
  const { lat, lon } = readObservatoryCoords()
  return moonAltDegAt(date, latDeg ?? lat, lonDeg ?? lon)
}

/** Moon altitude (degrees) above the horizon for an arbitrary observer. */
export function moonAltDegAt(date: Date, latDeg: number, lonDeg: number): number {
  const { raHours, decDeg } = moonEquatorial(date)
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525
  const gmst = normDeg(
    280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000
  )
  const lst = normDeg(gmst + lonDeg)
  let ha = lst - raHours * 15
  if (ha > 180) ha -= 360
  if (ha < -180) ha += 360
  const sinAlt = sinD(decDeg) * sinD(latDeg) + cosD(decDeg) * cosD(latDeg) * cosD(ha)
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD2DEG
}

/**
 * Moonrise / moonset for the local day containing `ref`, found by scanning the
 * moon altitude for horizon crossings (accounting for the standard −0.833° refraction
 * + semidiameter offset). Returns the next upcoming rise/set within ±24h, or null.
 */
export function moonRiseSet(
  ref: Date,
  latDeg: number,
  lonDeg: number
): { rise: Date | null; set: Date | null } {
  const HORIZON = -0.833
  const STEP_MIN = 10
  const start = ref.getTime() - 12 * 3600_000
  let prevT = start
  let prevAlt = moonAltDegAt(new Date(prevT), latDeg, lonDeg) - HORIZON
  let rise: Date | null = null
  let set: Date | null = null

  for (let m = STEP_MIN; m <= 36 * 60; m += STEP_MIN) {
    const t = start + m * 60_000
    const alt = moonAltDegAt(new Date(t), latDeg, lonDeg) - HORIZON
    if (prevAlt < 0 && alt >= 0 && !rise) {
      rise = new Date(prevT + ((0 - prevAlt) / (alt - prevAlt)) * (t - prevT))
    } else if (prevAlt >= 0 && alt < 0 && !set) {
      set = new Date(prevT + ((0 - prevAlt) / (alt - prevAlt)) * (t - prevT))
    }
    prevT = t
    prevAlt = alt
    if (rise && set) break
  }

  return { rise, set }
}

/** Great-circle angular separation (degrees) between two equatorial coordinates. */
export function angularSeparationDeg(
  raHoursA: number,
  decDegA: number,
  raHoursB: number,
  decDegB: number
): number {
  const ra1 = raHoursA * 15 * DEG2RAD
  const dec1 = decDegA * DEG2RAD
  const ra2 = raHoursB * 15 * DEG2RAD
  const dec2 = decDegB * DEG2RAD
  const cosSep =
    Math.sin(dec1) * Math.sin(dec2) + Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2)
  return Math.acos(Math.max(-1, Math.min(1, cosSep))) * RAD2DEG
}

/** Target ↔ Moon separation (degrees) at a given instant. */
export function targetMoonSeparationDeg(raHours: number, decDeg: number, date: Date): number {
  const moon = moonEquatorial(date)
  return angularSeparationDeg(raHours, decDeg, moon.raHours, moon.decDeg)
}

/* ------------------------------------------------------------------ */
/*  Moon-avoidance Lorentzian (ACP/NINA model)                        */
/* ------------------------------------------------------------------ */

/** Lorentzian half-lunation width in days. */
export const MOON_AVOIDANCE_WIDTH_DAYS = 14

/** Below this altitude the moon's scattered light is treated as negligible. */
export const MOON_BELOW_HORIZON_DEG = 0
/** Below this altitude the required separation is relaxed (moon low → less skyglow). */
export const MOON_LOW_ALT_DEG = 10
export const MOON_LOW_ALT_RELAX_FACTOR = 0.5

/**
 * Per-filter "distance" parameter (degrees of separation required at full moon).
 * Balanced between SNR-conscious and practical:
 * - Broadband (L/R/G/B): washed out by moonlight → strictest
 * - OIII (O): most moon-sensitive narrowband
 * - SII (S): between Ha and OIII
 * - Ha (H): most moon-tolerant narrowband
 */
export const MOON_FILTER_DISTANCE_DEG: Record<string, number> = {
  L: 110,
  R: 110,
  G: 110,
  B: 110,
  O: 95,
  S: 65,
  H: 55,
}

/** Default distance for unknown filters (treat conservatively as broadband). */
const DEFAULT_FILTER_DISTANCE_DEG = 110

/** Map filter aliases (e.g. "Ha", "OIII", "Lum") to canonical single-letter keys. */
export function normalizeFilterName(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  if (!raw) return ''
  const upper = raw.toUpperCase()
  if (upper === 'HA' || upper === 'H-ALPHA' || upper === 'HALPHA') return 'H'
  if (upper === 'OIII' || upper === 'O3') return 'O'
  if (upper === 'SII' || upper === 'S2') return 'S'
  if (upper === 'LUM' || upper === 'LUMINANCE') return 'L'
  if (upper === 'RED') return 'R'
  if (upper === 'GREEN') return 'G'
  if (upper === 'BLUE') return 'B'
  return upper.charAt(0)
}

export function filterMoonDistanceDeg(filterName: string): number {
  const key = normalizeFilterName(filterName)
  return MOON_FILTER_DISTANCE_DEG[key] ?? DEFAULT_FILTER_DISTANCE_DEG
}

/**
 * Moon-Avoidance Lorentzian required separation (degrees) for a filter at a given lunar age.
 * required = distance / (1 + ((0.5 - age/synodic) / (width/synodic))^2)
 * At full moon (age ≈ width) → distance; one width before/after → distance/2.
 */
export function requiredMoonSeparationDeg(
  filterName: string,
  ageDays: number,
  widthDays = MOON_AVOIDANCE_WIDTH_DAYS
): number {
  const distance = filterMoonDistanceDeg(filterName)
  const phase = (0.5 - ageDays / SYNODIC_MONTH) / (widthDays / SYNODIC_MONTH)
  return distance / (1 + phase * phase)
}

/**
 * Whether the target clears moon avoidance for one filter at a single instant.
 * Relaxes when the moon is low/below the horizon.
 */
export function moonFilterOkAt(
  filterName: string,
  raHours: number,
  decDeg: number,
  date: Date
): boolean {
  const moonAlt = moonAltDeg(date)
  if (moonAlt < MOON_BELOW_HORIZON_DEG) return true

  const { ageDays } = moonPhaseInfo(date)
  let required = requiredMoonSeparationDeg(filterName, ageDays)
  if (moonAlt < MOON_LOW_ALT_DEG) required *= MOON_LOW_ALT_RELAX_FACTOR

  const separation = targetMoonSeparationDeg(raHours, decDeg, date)
  return separation >= required
}

/**
 * Whether the target clears moon avoidance for one filter across the whole session
 * window (100% of 5-minute buckets must pass, mirroring altitude coverage).
 */
export function moonFilterSessionOk(
  filterName: string,
  raHours: number,
  decDeg: number,
  startMs: number,
  endMs: number,
  stepMs = 5 * 60 * 1000
): boolean {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false
  const step = Math.max(60_000, Math.floor(stepMs))
  for (let t = startMs; t < endMs; t += step) {
    const segEnd = Math.min(t + step, endMs)
    const mid = t + (segEnd - t) / 2
    if (!moonFilterOkAt(filterName, raHours, decDeg, new Date(mid))) return false
  }
  return true
}

export type MoonFilterPlanLike = { filterName: string }

/** Filter names (canonical) that fail moon avoidance for the whole session window. */
export function moonBlockedFilters(
  filterPlans: readonly MoonFilterPlanLike[] | undefined | null,
  raHours: number,
  decDeg: number,
  startMs: number,
  endMs: number
): string[] {
  if (!filterPlans?.length) return []
  const blocked: string[] = []
  for (const plan of filterPlans) {
    if (!moonFilterSessionOk(plan.filterName, raHours, decDeg, startMs, endMs)) {
      blocked.push(normalizeFilterName(plan.filterName) || plan.filterName)
    }
  }
  return blocked
}

/** True when every filter in the plan clears moon avoidance for the session window. */
export function allFiltersMoonOk(
  filterPlans: readonly MoonFilterPlanLike[] | undefined | null,
  raHours: number,
  decDeg: number,
  startMs: number,
  endMs: number
): boolean {
  return moonBlockedFilters(filterPlans, raHours, decDeg, startMs, endMs).length === 0
}
