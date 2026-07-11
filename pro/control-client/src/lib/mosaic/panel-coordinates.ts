import type { ImagingEquipment } from './equipment-types'
import { shiftCoordinatesPixels } from './shift-coordinates'

const DEG2RAD = Math.PI / 180

export function viewportArcsecPerPixel(
  viewportWidthPx: number,
  viewportHeightPx: number,
  hFovDeg: number,
  vFovDeg: number,
): { x: number; y: number } {
  return {
    x: (hFovDeg * 3600) / Math.max(1, viewportWidthPx),
    y: (vFovDeg * 3600) / Math.max(1, viewportHeightPx),
  }
}

/** Rotate a screen-space pixel offset into sensor/image coordinates. */
export function screenDeltaToLayoutDelta(
  screenDeltaXPx: number,
  screenDeltaYPx: number,
  rotationDeg: number,
): { x: number; y: number } {
  const rad = -rotationDeg * DEG2RAD
  return {
    x: screenDeltaXPx * Math.cos(rad) - screenDeltaYPx * Math.sin(rad),
    y: screenDeltaXPx * Math.sin(rad) + screenDeltaYPx * Math.cos(rad),
  }
}

/** Rotate sensor-aligned layout offset into screen coordinates. */
export function layoutDeltaToScreenDelta(
  layoutDeltaXPx: number,
  layoutDeltaYPx: number,
  rotationDeg: number,
): { x: number; y: number } {
  const rad = rotationDeg * DEG2RAD
  return {
    x: layoutDeltaXPx * Math.cos(rad) - layoutDeltaYPx * Math.sin(rad),
    y: layoutDeltaXPx * Math.sin(rad) + layoutDeltaYPx * Math.cos(rad),
  }
}

export function panelScreenOffsetToRaDec(
  centerRaHours: number,
  centerDecDeg: number,
  screenDeltaXPx: number,
  screenDeltaYPx: number,
  rotationDeg: number,
  arcsecPerPixelX: number,
  arcsecPerPixelY: number,
): { raHours: number; decDeg: number } {
  const layout = screenDeltaToLayoutDelta(screenDeltaXPx, screenDeltaYPx, rotationDeg)
  return shiftCoordinatesPixels(
    centerRaHours,
    centerDecDeg,
    layout.x,
    layout.y,
    rotationDeg,
    arcsecPerPixelX,
    arcsecPerPixelY,
  )
}

/** Inverse of {@link panelScreenOffsetToRaDec} — same stereographic path as Lock drag. */
export function skyToScreenOffset(
  centerRaHours: number,
  centerDecDeg: number,
  targetRaHours: number,
  targetDecDeg: number,
  rotationDeg: number,
  arcsecPerPixelX: number,
  arcsecPerPixelY: number,
): { x: number; y: number } {
  let dx = 0
  let dy = 0
  const step = 1

  for (let i = 0; i < 24; i++) {
    const got = panelScreenOffsetToRaDec(
      centerRaHours,
      centerDecDeg,
      dx,
      dy,
      rotationDeg,
      arcsecPerPixelX,
      arcsecPerPixelY,
    )
    let dRa = targetRaHours - got.raHours
    while (dRa > 12) dRa -= 24
    while (dRa < -12) dRa += 24
    const dDec = targetDecDeg - got.decDeg
    const ex = (dRa * 15 * 3600) / arcsecPerPixelX
    const ey = (dDec * 3600) / arcsecPerPixelY
    if (Math.hypot(ex, ey) < 0.05) return { x: dx, y: dy }

    const dxPlus = panelScreenOffsetToRaDec(
      centerRaHours,
      centerDecDeg,
      dx + step,
      dy,
      rotationDeg,
      arcsecPerPixelX,
      arcsecPerPixelY,
    )
    const dyPlus = panelScreenOffsetToRaDec(
      centerRaHours,
      centerDecDeg,
      dx,
      dy + step,
      rotationDeg,
      arcsecPerPixelX,
      arcsecPerPixelY,
    )

    let dRaDx = dxPlus.raHours - got.raHours
    while (dRaDx > 12) dRaDx -= 24
    while (dRaDx < -12) dRaDx += 24
    let dRaDy = dyPlus.raHours - got.raHours
    while (dRaDy > 12) dRaDy -= 24
    while (dRaDy < -12) dRaDy += 24

    const j11 = ((dRaDx * 15 * 3600) / arcsecPerPixelX / step)
    const j12 = ((dRaDy * 15 * 3600) / arcsecPerPixelX / step)
    const j21 = ((dxPlus.decDeg - got.decDeg) * 3600) / arcsecPerPixelY / step
    const j22 = ((dyPlus.decDeg - got.decDeg) * 3600) / arcsecPerPixelY / step
    const det = j11 * j22 - j12 * j21
    if (Math.abs(det) < 1e-12) break
    dx += (ex * j22 - ey * j12) / det
    dy += (j11 * ey - j21 * ex) / det
  }

  return { x: dx, y: dy }
}

export function defaultPositionAngleDeg(
  equipment: ImagingEquipment | null,
  previousRotationDeg = 0,
  viewportRotationDeg = 0,
): number {
  const dsoRotation = previousRotationDeg + viewportRotationDeg
  return 360 - ((dsoRotation % 360) + 360) % 360
}
