import type { ImagingEquipment } from './equipment-types'
import type { MosaicPanel } from './framing-rectangle'
import { defaultPositionAngleDeg, layoutDeltaToScreenDelta } from './panel-coordinates'
import { shiftCoordinatesPixels } from './shift-coordinates'

export type CalculateMosaicInput = {
  centerRaHours: number
  centerDecDeg: number
  horizontalPanels: number
  verticalPanels: number
  horizontalOverlapPercent: number
  verticalOverlapPercent: number
  equipment: ImagingEquipment
  viewportWidthPx: number
  viewportHeightPx: number
  viewportHFovDeg: number
  viewportVFovDeg: number
  viewportRotationDeg: number
  previousRotationDeg?: number
  /** Field rotation (deg) at mosaic center (or each panel when chaining). */
  fieldRotationDegAt?: (raHours: number, decDeg: number) => number
}

export type CalculateMosaicResult = {
  panels: MosaicPanel[]
  isMosaic: boolean
}

const ARCSEC_PER_RADIAN = 206264.8062471

function arcsecPerPixel(eq: ImagingEquipment): number {
  return (eq.pixelSizeUm / eq.focalLengthMm) * (ARCSEC_PER_RADIAN / 1000)
}

function viewportScale(
  equipment: ImagingEquipment,
  viewportWidthPx: number,
  viewportHeightPx: number,
  viewportHFovDeg: number,
  viewportVFovDeg: number,
) {
  const imageArcsecWidth = (viewportHFovDeg * 3600) / Math.max(1, viewportWidthPx)
  const imageArcsecHeight = (viewportVFovDeg * 3600) / Math.max(1, viewportHeightPx)
  const sensorArcsec = arcsecPerPixel(equipment)
  return {
    imageArcsecWidth,
    imageArcsecHeight,
    conversionX: sensorArcsec / imageArcsecWidth,
    conversionY: sensorArcsec / imageArcsecHeight,
  }
}

export type GridLayoutParams = {
  horizontalPanels: number
  verticalPanels: number
  horizontalOverlapPercent: number
  verticalOverlapPercent: number
}

/** Sensor-aligned layout offset for one grid cell at the current viewport zoom. */
export function computeGridPanelLayoutDeltaPx(
  col: number,
  row: number,
  params: GridLayoutParams,
  equipment: ImagingEquipment,
  viewportWidthPx: number,
  viewportHeightPx: number,
  vFovRad: number,
): { layoutDeltaXPx: number; layoutDeltaYPx: number } {
  const hPanels = Math.max(1, Math.round(params.horizontalPanels))
  const vPanels = Math.max(1, Math.round(params.verticalPanels))
  const vFovDeg = (vFovRad * 180) / Math.PI
  const hFovDeg = vFovDeg * (viewportWidthPx / Math.max(1, viewportHeightPx))
  const { conversionX, conversionY } = viewportScale(
    equipment,
    viewportWidthPx,
    viewportHeightPx,
    hFovDeg,
    vFovDeg,
  )
  const panelWidthPx = equipment.sensorWidthPx * conversionX
  const panelHeightPx = equipment.sensorHeightPx * conversionY
  const panelOverlapWidthPx = equipment.sensorWidthPx * params.horizontalOverlapPercent * conversionX
  const panelOverlapHeightPx = equipment.sensorHeightPx * params.verticalOverlapPercent * conversionY
  const stepX = panelWidthPx - panelOverlapWidthPx
  const stepY = panelHeightPx - panelOverlapHeightPx
  return {
    layoutDeltaXPx: (col - (hPanels - 1) / 2) * stepX,
    layoutDeltaYPx: (row - (vPanels - 1) / 2) * stepY,
  }
}

/** Screen offset of one grid panel from the viewport center (same path as the overlay RAF). */
export function gridPanelScreenOffsetFromCenter(
  panel: MosaicPanel,
  panelIndex: number,
  params: GridLayoutParams,
  equipment: ImagingEquipment,
  viewportWidthPx: number,
  viewportHeightPx: number,
  vFovRad: number,
  layoutRotDeg: number,
  mosaicCenterScreen: { x: number; y: number },
): { x: number; y: number } {
  let layoutDeltaXPx = panel.layoutDeltaXPx
  let layoutDeltaYPx = panel.layoutDeltaYPx
  if (layoutDeltaXPx == null || layoutDeltaYPx == null) {
    const hPanels = Math.max(1, Math.round(params.horizontalPanels))
    const col = panelIndex % hPanels
    const row = Math.floor(panelIndex / hPanels)
    const layout = computeGridPanelLayoutDeltaPx(
      col,
      row,
      params,
      equipment,
      viewportWidthPx,
      viewportHeightPx,
      vFovRad,
    )
    layoutDeltaXPx = layout.layoutDeltaXPx
    layoutDeltaYPx = layout.layoutDeltaYPx
  }
  const local = layoutDeltaToScreenDelta(layoutDeltaXPx, layoutDeltaYPx, layoutRotDeg)
  return {
    x: mosaicCenterScreen.x + local.x,
    y: mosaicCenterScreen.y + local.y,
  }
}

/** Geometric center of panel screen offsets (arithmetic mean). */
export function screenCentroid(
  offsets: ReadonlyArray<{ x: number; y: number }>,
): { x: number; y: number } | null {
  if (offsets.length === 0) return null
  let sx = 0
  let sy = 0
  for (const o of offsets) {
    sx += o.x
    sy += o.y
  }
  return { x: sx / offsets.length, y: sy / offsets.length }
}

/** Reference grid cell (floor of geometric center). */
export function gridReferenceCell(hPanels: number, vPanels: number): { col: number; row: number } {
  return {
    col: Math.floor((Math.max(1, hPanels) - 1) / 2),
    row: Math.floor((Math.max(1, vPanels) - 1) / 2),
  }
}

/** Axis-aligned steps from one grid cell to another (horizontal first, then vertical). */
export function gridPathSteps(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Array<{ dc: number; dr: number }> {
  const steps: Array<{ dc: number; dr: number }> = []
  let col = fromCol
  let row = fromRow
  while (col !== toCol) {
    const dc = toCol > col ? 1 : -1
    steps.push({ dc, dr: 0 })
    col += dc
  }
  while (row !== toRow) {
    const dr = toRow > row ? 1 : -1
    steps.push({ dc: 0, dr })
    row += dr
  }
  return steps
}

function chainSkyFromReference(input: {
  centerRaHours: number
  centerDecDeg: number
  col: number
  row: number
  refCol: number
  refRow: number
  stepX: number
  stepY: number
  imageArcsecWidth: number
  imageArcsecHeight: number
  fallbackRotationDeg: number
  fieldRotationDegAt?: (raHours: number, decDeg: number) => number
}): { raHours: number; decDeg: number } {
  if (input.col === input.refCol && input.row === input.refRow) {
    return { raHours: input.centerRaHours, decDeg: input.centerDecDeg }
  }

  const rotationAt = input.fieldRotationDegAt ?? (() => input.fallbackRotationDeg)
  const steps = gridPathSteps(input.refCol, input.refRow, input.col, input.row)

  let raHours = input.centerRaHours
  let decDeg = input.centerDecDeg
  for (const { dc, dr } of steps) {
    const rot = rotationAt(raHours, decDeg)
    const next = shiftCoordinatesPixels(
      raHours,
      decDeg,
      dc * input.stepX,
      dr * input.stepY,
      rot,
      input.imageArcsecWidth,
      input.imageArcsecHeight,
    )
    raHours = next.raHours
    decDeg = next.decDeg
  }
  return { raHours, decDeg }
}

/**
 * NINA-style panel sky position: shift from mosaic geometric center using sensor-pixel
 * layout deltas. Overlap % applies to sensor width/height (not arbitrary screen area).
 */
function panelSkyFromMosaicCenter(input: {
  centerRaHours: number
  centerDecDeg: number
  layoutDeltaXPx: number
  layoutDeltaYPx: number
  imageArcsecWidth: number
  imageArcsecHeight: number
  rotationDeg: number
  fieldRotationDegAt?: (raHours: number, decDeg: number) => number
}): { raHours: number; decDeg: number } {
  const rotationAt = input.fieldRotationDegAt ?? (() => input.rotationDeg)
  const rot = rotationAt(input.centerRaHours, input.centerDecDeg)
  return shiftCoordinatesPixels(
    input.centerRaHours,
    input.centerDecDeg,
    input.layoutDeltaXPx,
    input.layoutDeltaYPx,
    rot,
    input.imageArcsecWidth,
    input.imageArcsecHeight,
  )
}

export function calculateMosaicPanels(input: CalculateMosaicInput): CalculateMosaicResult {
  const hPanels = Math.max(1, Math.round(input.horizontalPanels))
  const vPanels = Math.max(1, Math.round(input.verticalPanels))
  const isMosaic = hPanels > 1 || vPanels > 1

  const { imageArcsecWidth, imageArcsecHeight, conversionX, conversionY } = viewportScale(
    input.equipment,
    input.viewportWidthPx,
    input.viewportHeightPx,
    input.viewportHFovDeg,
    input.viewportVFovDeg,
  )

  const panelWidthPx = input.equipment.sensorWidthPx * conversionX
  const panelHeightPx = input.equipment.sensorHeightPx * conversionY

  const previousRotation = input.previousRotationDeg ?? 0
  const rotationDeg = previousRotation + input.viewportRotationDeg

  if (!isMosaic) {
    const dsoPa = defaultPositionAngleDeg(null, previousRotation, input.viewportRotationDeg)
    return {
      isMosaic: false,
      panels: [
        {
          id: 1,
          raHours: input.centerRaHours,
          decDeg: input.centerDecDeg,
          positionAngleDeg: dsoPa,
          name: 'Panel 1',
          layoutDeltaXPx: 0,
          layoutDeltaYPx: 0,
          screenDeltaXPx: 0,
          screenDeltaYPx: 0,
        },
      ],
    }
  }

  const panelOverlapWidthPx = input.equipment.sensorWidthPx * input.horizontalOverlapPercent * conversionX
  const panelOverlapHeightPx = input.equipment.sensorHeightPx * input.verticalOverlapPercent * conversionY
  const stepX = panelWidthPx - panelOverlapWidthPx
  const stepY = panelHeightPx - panelOverlapHeightPx

  const panels: MosaicPanel[] = []
  let id = 1

  for (let j = 0; j < vPanels; j++) {
    for (let i = 0; i < hPanels; i++) {
      const layoutDeltaXPx = (i - (hPanels - 1) / 2) * stepX
      const layoutDeltaYPx = (j - (vPanels - 1) / 2) * stepY

      const panelCoords = panelSkyFromMosaicCenter({
        centerRaHours: input.centerRaHours,
        centerDecDeg: input.centerDecDeg,
        layoutDeltaXPx,
        layoutDeltaYPx,
        imageArcsecWidth,
        imageArcsecHeight,
        rotationDeg,
        fieldRotationDegAt: input.fieldRotationDegAt,
      })

      const dsoPa = defaultPositionAngleDeg(null, previousRotation, input.viewportRotationDeg)

      panels.push({
        id: id++,
        raHours: panelCoords.raHours,
        decDeg: panelCoords.decDeg,
        positionAngleDeg: dsoPa,
        name: `Panel ${panels.length + 1}`,
        layoutDeltaXPx,
        layoutDeltaYPx,
        screenDeltaXPx: 0,
        screenDeltaYPx: 0,
      })
    }
  }

  return { isMosaic: true, panels }
}

export function cameraFovRadians(eq: ImagingEquipment): { fovWRad: number; fovHRad: number } {
  const chipWidthMm = (eq.sensorWidthPx * eq.pixelSizeUm) / 1000
  const chipHeightMm = (eq.sensorHeightPx * eq.pixelSizeUm) / 1000
  return {
    fovWRad: 2 * Math.atan(chipWidthMm / (2 * eq.focalLengthMm)),
    fovHRad: 2 * Math.atan(chipHeightMm / (2 * eq.focalLengthMm)),
  }
}
