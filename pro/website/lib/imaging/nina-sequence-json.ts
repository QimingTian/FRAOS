import { firstAltitudeAllowedTimeMs, currentAltitudeDeg, MIN_ALTITUDE_DEG } from '@/lib/imaging/astro/target-altitude'
import { getTonightAstronomicalNightWindow } from '@/lib/imaging/astro/sunrise-window'
import classicSingleTemplate from '@/assets/nina/Classic DSO Imaging Sequence.json'
import classicMultiTemplate from '@/assets/nina/Classic DSO Imaging Sequence Multi Filter.json'
import variableStarTemplate from '@/assets/nina/Variable Star Sequence.json'

const TEMPLATE_SINGLE_JSON = classicSingleTemplate as Record<string, unknown>
const TEMPLATE_MULTI_JSON = classicMultiTemplate as Record<string, unknown>
const TEMPLATE_VARIABLE_STAR_JSON = variableStarTemplate as Record<string, unknown>

export interface NinaSequenceParams {
  raHoursDecimal: number
  decDegDecimal: number
  filterName: string
  exposureSeconds: number
  exposureCount: number
  /** Echoed into JSON for NINA HTTP POST `queueId` (ignored by NINA if unused). */
  boreanQueueId?: string
  outputMode?: 'raw_zip' | 'none' // | 'stacked_master' — discontinued
  filterPlans?: Array<{
    filterName: string
    exposureSeconds: number
    exposureCount: number
  }>
  sessionProgressUrl?: string
  templateKind?: 'dso' | 'variable_star'
  targetName?: string
  variableStarObservingSeconds?: number
  cameraCoolingTempC?: number
}

function roundSeconds(x: number): number {
  return Math.round(x * 1e6) / 1e6
}

/** Decimal RA hours [0,24) → NINA InputCoordinates components */
export function raDecimalToNina(raDecimalHours: number) {
  let h = raDecimalHours % 24
  if (h < 0) h += 24
  let totalSec = h * 3600
  const RAHours = Math.floor(totalSec / 3600)
  totalSec -= RAHours * 3600
  const RAMinutes = Math.floor(totalSec / 60)
  const RASeconds = roundSeconds(totalSec - RAMinutes * 60)
  return { RAHours, RAMinutes, RASeconds }
}

/** Decimal Dec degrees [-90,90] → NINA InputCoordinates components */
export function decDecimalToNina(decDegDecimal: number) {
  const NegativeDec = decDegDecimal < 0
  let abs = Math.abs(decDegDecimal)
  const DecDegrees = Math.floor(abs)
  abs = (abs - DecDegrees) * 60
  const DecMinutes = Math.floor(abs)
  const DecSeconds = roundSeconds((abs - DecMinutes) * 60)
  return { NegativeDec, DecDegrees, DecMinutes, DecSeconds }
}

function asRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('Expected object')
  }
  return v as Record<string, unknown>
}

/**
 * NINA exports often set `Target` to `{ $ref: "…" }` while the real
 * `InputCoordinates` live on a sibling (e.g. `ExoPlanetInputTarget`).
 * Inline `InputTarget` still has `Target.InputCoordinates` directly.
 */
function resolveSequencerTarget(dso: Record<string, unknown>): Record<string, unknown> {
  const raw = dso['Target']
  const base = asRecord(raw)
  if (base['InputCoordinates'] != null) return base
  const refId = base['$ref']
  if (typeof refId !== 'string') {
    throw new Error('Template: Target has no InputCoordinates and no $ref')
  }
  for (const value of Object.values(dso)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const rec = value as Record<string, unknown>
    if (rec['$id'] === refId && rec['InputCoordinates'] != null) return rec
  }
  throw new Error(`Template: could not resolve Target $ref "${refId}"`)
}

function asArray(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error('Expected array')
  return v
}

function hasType(v: unknown, expectedTypePrefix: string): boolean {
  if (!v || typeof v !== 'object') return false
  const t = (v as Record<string, unknown>)['$type']
  return typeof t === 'string' && t.startsWith(expectedTypePrefix)
}

function findFirstByType(node: unknown, expectedTypePrefix: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findFirstByType(item, expectedTypePrefix)
      if (hit) return hit
    }
    return null
  }
  const rec = node as Record<string, unknown>
  if (hasType(rec, expectedTypePrefix)) return rec
  for (const v of Object.values(rec)) {
    const hit = findFirstByType(v, expectedTypePrefix)
    if (hit) return hit
  }
  return null
}

/** Target instruction set under TargetArea: native DSO or ExoPlanets plugin containers. */
function findFirstTargetInstructionContainer(node: unknown): Record<string, unknown> | null {
  const prefixes = [
    'NINA.Sequencer.Container.DeepSkyObjectContainer',
    'NINA.Plugin.ExoPlanets.Sequencer.Container.ExoPlanetObjectContainer',
    'NINA.Plugin.ExoPlanets.Sequencer.Container.VariableStarObjectContainer',
  ]
  for (const p of prefixes) {
    const hit = findFirstByType(node, p)
    if (hit) return hit
  }
  return null
}

function findLastByType(node: unknown, expectedTypePrefix: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i -= 1) {
      const hit = findLastByType(node[i], expectedTypePrefix)
      if (hit) return hit
    }
    return null
  }
  const rec = node as Record<string, unknown>
  for (const v of Object.values(rec).reverse()) {
    const hit = findLastByType(v, expectedTypePrefix)
    if (hit) return hit
  }
  return hasType(rec, expectedTypePrefix) ? rec : null
}

function collectNumericIds(node: unknown, out: number[]) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectNumericIds(item, out)
    return
  }
  const rec = node as Record<string, unknown>
  const id = rec['$id']
  if (typeof id === 'string' && /^\d+$/.test(id)) {
    out.push(Number(id))
  }
  for (const v of Object.values(rec)) {
    collectNumericIds(v, out)
  }
}

function nextId(root: Record<string, unknown>, used: Set<number>): string {
  if (used.size === 0) {
    const all: number[] = []
    collectNumericIds(root, all)
    for (const n of all) used.add(n)
  }
  let max = 0
  used.forEach((n) => {
    if (n > max) max = n
  })
  const id = max + 1
  used.add(id)
  return String(id)
}

function buildFilterInfoObject(
  root: Record<string, unknown>,
  usedIds: Set<number>,
  filterName: string
): Record<string, unknown> {
  const filterId = nextId(root, usedIds)
  const flatId = nextId(root, usedIds)
  return {
    $id: filterId,
    $type: 'NINA.Core.Model.Equipment.FilterInfo, NINA.Core',
    _name: filterName,
    _focusOffset: 0,
    _position: 0,
    _autoFocusExposureTime: -1.0,
    _autoFocusFilter: false,
    FlatWizardFilterSettings: {
      $id: flatId,
      $type: 'NINA.Core.Model.Equipment.FlatWizardFilterSettings, NINA.Core',
      FlatWizardMode: 0,
      HistogramMeanTarget: 0.5,
    },
  }
}

function remapIdsInClone(root: Record<string, unknown>, usedIds: Set<number>, node: unknown): unknown {
  const cloned = structuredClone(node)
  const idMap = new Map<string, string>()

  const collect = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) collect(item)
      return
    }
    const rec = value as Record<string, unknown>
    const rawId = rec['$id']
    if (typeof rawId === 'string' && !idMap.has(rawId)) {
      idMap.set(rawId, nextId(root, usedIds))
    }
    for (const child of Object.values(rec)) collect(child)
  }

  const rewrite = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) rewrite(item)
      return
    }
    const rec = value as Record<string, unknown>
    const rawId = rec['$id']
    if (typeof rawId === 'string' && idMap.has(rawId)) {
      rec['$id'] = idMap.get(rawId)
    }
    const rawRef = rec['$ref']
    if (typeof rawRef === 'string' && idMap.has(rawRef)) {
      rec['$ref'] = idMap.get(rawRef)
    }
    for (const child of Object.values(rec)) rewrite(child)
  }

  collect(cloned)
  rewrite(cloned)
  return cloned
}

function findIndexByTypePrefix(values: unknown[], typePrefix: string): number {
  return values.findIndex((v) => hasType(v, typePrefix))
}

function findHttpClientPostBodyIndex(values: unknown[], postBody: string): number {
  return values.findIndex((v) => {
    if (!v || typeof v !== 'object') return false
    const rec = v as Record<string, unknown>
    if (!hasType(rec, 'DaleGhent.NINA.GroundStation.HTTP.HttpClient')) return false
    return rec['HttpPostBody'] === postBody
  })
}

function sliceInclusive(values: unknown[], start: number, end: number): unknown[] {
  if (start < 0 || end < start || end >= values.length) {
    throw new Error('Template slice out of range')
  }
  return values.slice(start, end + 1)
}

function applyNinaCoordinates(coordsObj: Record<string, unknown>, raDecimalHours: number, decDegDecimal: number) {
  const ra = raDecimalToNina(raDecimalHours)
  const dec = decDecimalToNina(decDegDecimal)
  coordsObj['RAHours'] = ra.RAHours
  coordsObj['RAMinutes'] = ra.RAMinutes
  coordsObj['RASeconds'] = ra.RASeconds
  coordsObj['NegativeDec'] = dec.NegativeDec
  coordsObj['DecDegrees'] = dec.DecDegrees
  coordsObj['DecMinutes'] = dec.DecMinutes
  coordsObj['DecSeconds'] = dec.DecSeconds
}

/** Some ExoPlanets containers also carry DSO.Coordinates (NINA.Astrometry.Coordinates). Keep it in sync. */
function applyExoPlanetCoordinates(coordsObj: Record<string, unknown>, raDecimalHours: number, decDegDecimal: number) {
  const ra = raDecimalToNina(raDecimalHours)
  const dec = decDecimalToNina(decDegDecimal)
  const raHours = ra.RAHours + ra.RAMinutes / 60 + ra.RASeconds / 3600
  const raDegrees = raHours * 15
  const decAbs = dec.DecDegrees + dec.DecMinutes / 60 + dec.DecSeconds / 3600
  const decSigned = dec.NegativeDec ? -decAbs : decAbs
  const sign = dec.NegativeDec ? '-' : '+'
  const pad2 = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0')
  const raSec = ra.RASeconds.toFixed(3).padStart(6, '0')
  const decSec = dec.DecSeconds.toFixed(2).padStart(5, '0')
  coordsObj['RA'] = raHours
  coordsObj['RADegrees'] = raDegrees
  coordsObj['Dec'] = decSigned
  coordsObj['RAString'] = `${pad2(ra.RAHours)}:${pad2(ra.RAMinutes)}:${raSec}`
  coordsObj['DecString'] = `${sign}${pad2(dec.DecDegrees)}° ${pad2(dec.DecMinutes)}' ${decSec}"`
}

function dateToObservatoryHms(date: Date): { hours: number; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const getNum = (type: 'hour' | 'minute' | 'second'): number => {
    const part = parts.find((p) => p.type === type)?.value
    const n = Number(part)
    return Number.isFinite(n) ? n : 0
  }
  return {
    hours: getNum('hour'),
    minutes: getNum('minute'),
    seconds: getNum('second'),
  }
}

function lastAltitudeAllowedTimeMs(
  raHours: number,
  decDeg: number,
  startMs: number,
  endMs: number,
  stepMs = 5 * 60 * 1000
): number | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null
  const step = Math.max(60_000, Math.floor(stepMs))
  for (let t = endMs; t >= startMs; t -= step) {
    if (currentAltitudeDeg(raHours, decDeg, new Date(t)) >= MIN_ALTITUDE_DEG) return t
  }
  return null
}

function applyVariableStarStartEndTimes(
  dso: Record<string, unknown>,
  raHoursDecimal: number,
  decDegDecimal: number,
  observingDurationMs?: number
) {
  const { astronomicalDuskUtc, astronomicalDawnUtc } = getTonightAstronomicalNightWindow(new Date())
  const winStartMs = astronomicalDuskUtc.getTime()
  const winEndMs = astronomicalDawnUtc.getTime()

  const startAllowedMs = firstAltitudeAllowedTimeMs(raHoursDecimal, decDegDecimal, winStartMs, winEndMs) ?? winStartMs
  const clampedStartMs = Math.max(winStartMs, Math.min(startAllowedMs, winEndMs))

  let clampedEndMs: number
  if (typeof observingDurationMs === 'number' && Number.isFinite(observingDurationMs) && observingDurationMs > 0) {
    clampedEndMs = Math.min(clampedStartMs + observingDurationMs, winEndMs)
    clampedEndMs = Math.max(clampedEndMs, clampedStartMs)
  } else {
    const endAllowedMs = lastAltitudeAllowedTimeMs(raHoursDecimal, decDegDecimal, winStartMs, winEndMs) ?? winEndMs
    clampedEndMs = Math.max(clampedStartMs, Math.min(endAllowedMs, winEndMs))
  }

  const waitForTransit = findFirstByType(dso, 'NINA.Plugin.ExoPlanets.Sequencer.Utility.WaitForTransit')
  if (waitForTransit) {
    const hms = dateToObservatoryHms(new Date(clampedStartMs))
    waitForTransit['Hours'] = hms.hours
    waitForTransit['Minutes'] = hms.minutes
    waitForTransit['Seconds'] = hms.seconds
    waitForTransit['MinutesOffset'] = 0
  }

  const transitCondition = findLastByType(dso, 'NINA.Plugin.ExoPlanets.Sequencer.Conditions.TransitCondition')
  if (transitCondition) {
    const hms = dateToObservatoryHms(new Date(clampedEndMs))
    transitCondition['Hours'] = hms.hours
    transitCondition['Minutes'] = hms.minutes
    transitCondition['Seconds'] = hms.seconds
    transitCondition['MinutesOffset'] = 0
  }
}

/**
 * Loads the repo template JSON, clones it, and overwrites only:
 * - Target.InputCoordinates + Center.Coordinates (RA/Dec in NINA HMS / DMS)
 * - SwitchFilter.Filter
 * - LoopCondition.Iterations (张数)
 * - TakeExposure.ExposureTime (单张曝光秒)
 *
 * Throws if the template structure or $ids drift from the shipped file.
 */
export function buildNinaSequenceJson(params: NinaSequenceParams): string {
  const templateKind = params.templateKind === 'variable_star' ? 'variable_star' : 'dso'
  const normalizedPlans =
    Array.isArray(params.filterPlans) && params.filterPlans.length > 0
      ? params.filterPlans
      : [
          {
            filterName: params.filterName,
            exposureSeconds: params.exposureSeconds,
            exposureCount: params.exposureCount,
          },
        ]

  const templateRoot =
    templateKind === 'variable_star'
      ? TEMPLATE_VARIABLE_STAR_JSON
      : normalizedPlans.length > 1
        ? TEMPLATE_MULTI_JSON
        : TEMPLATE_SINGLE_JSON
  const root = structuredClone(templateRoot) as Record<string, unknown>
  const usedIds = new Set<number>()

  const targetArea = findFirstByType(root, 'NINA.Sequencer.Container.TargetAreaContainer')
  if (!targetArea) throw new Error('Template: TargetAreaContainer not found')

  const dso = findFirstTargetInstructionContainer(targetArea)
  if (!dso) throw new Error('Template: target instruction container (DSO / ExoPlanet / VariableStar) not found')

  const target = resolveSequencerTarget(dso)
  if (params.targetName && params.targetName.trim()) {
    target['TargetName'] = params.targetName.trim()
  }
  const inputCoords = asRecord(target['InputCoordinates'])
  if (!hasType(inputCoords, 'NINA.Astrometry.InputCoordinates')) {
    throw new Error('Template: target InputCoordinates not found')
  }

  const center = findFirstByType(dso, 'NINA.Sequencer.SequenceItem.Platesolving.Center')
  let centerCoords: Record<string, unknown> | null = null
  if (center) {
    const parsed = asRecord(center['Coordinates'])
    if (!hasType(parsed, 'NINA.Astrometry.InputCoordinates')) {
      throw new Error('Template: Center coordinates not found')
    }
    centerCoords = parsed
  }

  const dsoItems = asRecord(dso['Items'])
  const dsoItemValues = asArray(dsoItems['$values'])

  applyNinaCoordinates(inputCoords, params.raHoursDecimal, params.decDegDecimal)
  if (centerCoords) {
    applyNinaCoordinates(centerCoords, params.raHoursDecimal, params.decDegDecimal)
  }
  const exoPlanetDso = dso['ExoPlanetDSO']
  if (exoPlanetDso && typeof exoPlanetDso === 'object' && !Array.isArray(exoPlanetDso)) {
    const exoDsoRec = exoPlanetDso as Record<string, unknown>
    const exoCoords = exoDsoRec['Coordinates']
    if (exoCoords && typeof exoCoords === 'object' && !Array.isArray(exoCoords)) {
      applyExoPlanetCoordinates(
        exoCoords as Record<string, unknown>,
        params.raHoursDecimal,
        params.decDegDecimal
      )
    }
  }

  if (templateKind === 'variable_star') {
    const obsSec = params.variableStarObservingSeconds
    const observingMs =
      typeof obsSec === 'number' && Number.isFinite(obsSec) && obsSec > 0 ? Math.round(obsSec * 1000) : undefined
    applyVariableStarStartEndTimes(dso, params.raHoursDecimal, params.decDegDecimal, observingMs)
    const switchFilter = findFirstByType(dsoItemValues, 'NINA.Sequencer.SequenceItem.FilterWheel.SwitchFilter')
    if (!switchFilter) throw new Error('Template: SwitchFilter not found')
    switchFilter['Filter'] = buildFilterInfoObject(root, usedIds, normalizedPlans[0].filterName)
  } else if (normalizedPlans.length === 1) {
    const switchIndex = findIndexByTypePrefix(dsoItemValues, 'NINA.Sequencer.SequenceItem.FilterWheel.SwitchFilter')
    if (switchIndex < 0) throw new Error('Template: SwitchFilter not found')
    const takeManyIndex = findIndexByTypePrefix(dsoItemValues, 'NINA.Sequencer.SequenceItem.Imaging.TakeManyExposures')
    if (takeManyIndex < 0) throw new Error('Template: TakeManyExposures not found')

    const switchFilter = asRecord(dsoItemValues[switchIndex])
    switchFilter['Filter'] = buildFilterInfoObject(root, usedIds, normalizedPlans[0].filterName)

    const takeMany = asRecord(dsoItemValues[takeManyIndex])
    const conditions = asRecord(takeMany['Conditions'])
    const condValues = asArray(conditions['$values'])
    const loop = condValues.find((v) => hasType(v, 'NINA.Sequencer.Conditions.LoopCondition'))
    if (!loop || typeof loop !== 'object') throw new Error('Template: LoopCondition not found')
    ;(loop as Record<string, unknown>)['Iterations'] = normalizedPlans[0].exposureCount
    ;(loop as Record<string, unknown>)['CompletedIterations'] = 0

    const takeExposure = findFirstByType(takeMany, 'NINA.Sequencer.SequenceItem.Imaging.TakeExposure')
    if (!takeExposure) throw new Error('Template: TakeExposure not found')
    takeExposure['ExposureTime'] = normalizedPlans[0].exposureSeconds + 0.0
  } else {
    const targetCenteredIdx = findHttpClientPostBodyIndex(dsoItemValues, 'Target Centered')
    if (targetCenteredIdx < 0) throw new Error('Template: Target Centered HTTP item not found')

    const firstSwitchIdx = findIndexByTypePrefix(dsoItemValues, 'NINA.Sequencer.SequenceItem.FilterWheel.SwitchFilter')
    if (firstSwitchIdx < 0) throw new Error('Template: SwitchFilter not found')
    if (firstSwitchIdx <= targetCenteredIdx) {
      throw new Error('Template: SwitchFilter appears before expected anchor item')
    }

    const firstTakeManyIdx = findIndexByTypePrefix(dsoItemValues, 'NINA.Sequencer.SequenceItem.Imaging.TakeManyExposures')
    if (firstTakeManyIdx < 0) throw new Error('Template: TakeManyExposures not found')
    if (firstTakeManyIdx <= firstSwitchIdx) {
      throw new Error('Template: TakeManyExposures appears before SwitchFilter')
    }

    const stopGuidingIdx = findIndexByTypePrefix(dsoItemValues, 'NINA.Sequencer.SequenceItem.Guider.StopGuiding')
    if (stopGuidingIdx < 0) throw new Error('Template: StopGuiding not found')
    if (stopGuidingIdx <= firstTakeManyIdx) {
      throw new Error('Template: StopGuiding appears before first TakeManyExposures')
    }

    const secondTakeManyIdx = findIndexByTypePrefix(dsoItemValues.slice(stopGuidingIdx + 1), 'NINA.Sequencer.SequenceItem.Imaging.TakeManyExposures')
    if (secondTakeManyIdx < 0) throw new Error('Template: second TakeManyExposures not found')
    const secondTakeManyAbsIdx = stopGuidingIdx + 1 + secondTakeManyIdx

    const prefix = sliceInclusive(dsoItemValues, 0, targetCenteredIdx)
    const firstBlock = sliceInclusive(dsoItemValues, firstSwitchIdx, firstTakeManyIdx)
    const repeatBlock = sliceInclusive(dsoItemValues, stopGuidingIdx, secondTakeManyAbsIdx)
    const suffixStart = secondTakeManyAbsIdx + 1
    const suffixEnd = dsoItemValues.length - 1
    const suffix =
      suffixStart > suffixEnd
        ? []
        : sliceInclusive(dsoItemValues, suffixStart, suffixEnd)

    const rebuilt: unknown[] = [...prefix]
    for (let i = 0; i < normalizedPlans.length; i += 1) {
      const plan = normalizedPlans[i]
      const templateSegment = i === 0 ? firstBlock : repeatBlock
      const clonedSegment = remapIdsInClone(root, usedIds, templateSegment) as unknown[]

      const segSwitch = clonedSegment.find((v) => hasType(v, 'NINA.Sequencer.SequenceItem.FilterWheel.SwitchFilter'))
      if (!segSwitch || typeof segSwitch !== 'object') throw new Error('Template: SwitchFilter missing in cloned segment')
      ;(segSwitch as Record<string, unknown>)['Filter'] = buildFilterInfoObject(root, usedIds, plan.filterName)

      const segTakeMany = clonedSegment.find((v) => hasType(v, 'NINA.Sequencer.SequenceItem.Imaging.TakeManyExposures'))
      if (!segTakeMany || typeof segTakeMany !== 'object') throw new Error('Template: TakeManyExposures missing in cloned segment')
      const conditions = asRecord((segTakeMany as Record<string, unknown>)['Conditions'])
      const condValues = asArray(conditions['$values'])
      const loop = condValues.find((v) => hasType(v, 'NINA.Sequencer.Conditions.LoopCondition'))
      if (!loop || typeof loop !== 'object') throw new Error('Template: LoopCondition not found')
      ;(loop as Record<string, unknown>)['Iterations'] = plan.exposureCount
      ;(loop as Record<string, unknown>)['CompletedIterations'] = 0

      const takeExposure = findFirstByType(segTakeMany, 'NINA.Sequencer.SequenceItem.Imaging.TakeExposure')
      if (!takeExposure) throw new Error('Template: TakeExposure not found')
      takeExposure['ExposureTime'] = plan.exposureSeconds + 0.0

      rebuilt.push(...clonedSegment)
    }
    rebuilt.push(...suffix)
    dsoItems['$values'] = rebuilt
  }

  const boreanQueueId = params.boreanQueueId?.trim() ?? ''
  if (boreanQueueId) {
    root['BoreanAstro'] = {
      QueueId: boreanQueueId,
      OutputMode: params.outputMode ?? 'raw_zip',
      FilterName: normalizedPlans[0]?.filterName ?? params.filterName,
      FilterPlans: normalizedPlans,
      SessionProgressHint:
        'POST JSON to /api/imaging/session-progress with { "queueId": "<QueueId>", ... }',
    }
    applySessionProgressQueueIdInHttpPosts(root, boreanQueueId, params.sessionProgressUrl)
  }

  if (params.cameraCoolingTempC != null) {
    applyCameraCoolingTemp(root, params.cameraCoolingTempC)
  }

  applyNinaHttpAuthCredentials(root)

  return JSON.stringify(root, null, 2)
}

function applyCameraCoolingTemp(node: unknown, tempC: number): void {
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    const rec = value as Record<string, unknown>
    if (
      typeof rec['$type'] === 'string' &&
      rec['$type'].includes('CoolCamera') &&
      'Temperature' in rec
    ) {
      rec['Temperature'] = tempC + 0.0
    }
    for (const child of Object.values(rec)) walk(child)
  }
  walk(node)
}

/** Embed queueId in every session-progress HTTP POST so routing survives failed→still-imaging. */
function applySessionProgressQueueIdInHttpPosts(
  node: unknown,
  queueId: string,
  sessionProgressUrl?: string
): void {
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    const rec = value as Record<string, unknown>
    const typeName = typeof rec['$type'] === 'string' ? rec['$type'] : ''
    if (typeName.includes('GroundStation.HTTP.HttpClient')) {
      const uri = rec['HttpUri']
      if (typeof uri === 'string' && uri.includes('/imaging/session-progress')) {
        if (sessionProgressUrl) rec['HttpUri'] = sessionProgressUrl
        const rawBody = typeof rec['HttpPostBody'] === 'string' ? rec['HttpPostBody'] : ''
        const text = rawBody.replace(/\r\n/g, '\n').trim()
        rec['HttpPostContentType'] = 'application/json'
        rec['HttpPostBody'] = JSON.stringify({
          queueId,
          text,
          BoreanAstro: { QueueId: queueId },
        })
      }
    }
    for (const child of Object.values(rec)) walk(child)
  }
  walk(node)
}

/** Replace template HttpAuth* fields with server env (avoids hardcoded passwords in JSON exports). */
function applyNinaHttpAuthCredentials(node: unknown): void {
  const pass = process.env.NINA_SESSION_PROGRESS_BASIC_PASSWORD
  if (!pass) return
  const user = process.env.NINA_SESSION_PROGRESS_BASIC_USER ?? 'boreanastro'

  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    const rec = value as Record<string, unknown>
    if ('HttpAuthPassword' in rec) rec.HttpAuthPassword = pass
    if ('HttpAuthUsername' in rec) rec.HttpAuthUsername = user
    for (const child of Object.values(rec)) walk(child)
  }

  walk(node)
}
