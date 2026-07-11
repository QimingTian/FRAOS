export type MosaicPanel = {
  id: number
  raHours: number
  decDeg: number
  positionAngleDeg: number
  name: string
  /** Sensor-aligned offset from boresight (grid mode). */
  layoutDeltaXPx?: number
  layoutDeltaYPx?: number
  /** Screen-space offset from viewport center (custom mode). */
  screenDeltaXPx: number
  screenDeltaYPx: number
}

export type MosaicBoundingRectangle = {
  raHours: number
  decDeg: number
  widthDeg: number
  heightDeg: number
}

export type MosaicDraft = {
  targetName: string
  panels: MosaicPanel[]
  equipmentSnapshot: unknown
  centerRaHours: number
  centerDecDeg: number
}

export const PLAN_MOSAIC_DRAFT_KEY = 'pomfret:plan-mosaic-draft'
