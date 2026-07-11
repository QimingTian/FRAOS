/** Minimal equipment shape for mosaic panel math (matches Control Settings rig). */
export type ImagingEquipment = {
  label?: string
  focalLengthMm: number
  pixelSizeUm: number
  sensorWidthPx: number
  sensorHeightPx: number
  positionAngleDeg: number
}
