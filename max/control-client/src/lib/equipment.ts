import { astrometryApiOrientationToImageTopPA } from './imaging/plate-solve-orientation'
import { getActiveMaxSiteTenantId } from './active-max-site'
import { getPersonalTenant } from './tenant'

const EQUIPMENT_KEY = 'borean.personal.imagingEquipment'

export const EQUIPMENT_CHANGED = 'borean:equipment-changed'

/** Arcseconds subtended by one radian (3600 * 180 / PI). NINA uses the same constant. */
const ARCSEC_PER_RADIAN = 206264.8062471

export type ImagingEquipment = {
  /** Optional rig name for display. */
  label: string
  /** Telescope/lens focal length in millimetres (after reducer/barlow). */
  focalLengthMm: number
  /** Camera pixel pitch in microns. */
  pixelSizeUm: number
  /** Sensor width in pixels. */
  sensorWidthPx: number
  /** Sensor height in pixels. */
  sensorHeightPx: number
  /**
   * NINA rotator position angle (degrees east of north). Shown in Settings after plate-solve.
   * Not used directly for the Atlas overlay — see `fieldRotationDeg`.
   */
  positionAngleDeg: number
  /**
   * Image top edge on sky (° east of north) — same as nova "Up is …° E of N" after JPEG solve.
   * Drives Atlas camera-frame rotation via computeFovOverlayRotationDeg.
   */
  fieldRotationDeg?: number
  rawImageOrientationDeg?: number
  imageParity?: number | null
}

export type EquipmentFov = {
  arcsecPerPixel: number
  fovWidthDeg: number
  fovHeightDeg: number
}

function resolveSiteTenantId(siteTenantId?: string): string {
  return siteTenantId?.trim() || getActiveMaxSiteTenantId() || getPersonalTenant().tenantId
}

function equipmentStorageKey(siteTenantId?: string): string {
  return `${EQUIPMENT_KEY}.${resolveSiteTenantId(siteTenantId)}`
}

function isPositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Plate-solve orientation overrides manual PA on Atlas until cleared. */
export function mergeEquipmentManualSave(
  prev: ImagingEquipment | null,
  next: ImagingEquipment,
): ImagingEquipment {
  const paChanged =
    prev == null || normalizeDeg(prev.positionAngleDeg) !== normalizeDeg(next.positionAngleDeg)
  if (paChanged) return next
  return {
    ...next,
    fieldRotationDeg: prev.fieldRotationDeg,
    rawImageOrientationDeg: prev.rawImageOrientationDeg,
    imageParity: prev.imageParity,
  }
}

/** A rig is usable for an overlay only when every optical parameter is present and positive. */
export function isEquipmentValid(eq: Partial<ImagingEquipment> | null | undefined): eq is ImagingEquipment {
  if (!eq) return false
  return (
    isPositive(eq.focalLengthMm) &&
    isPositive(eq.pixelSizeUm) &&
    isPositive(eq.sensorWidthPx) &&
    isPositive(eq.sensorHeightPx) &&
    typeof eq.positionAngleDeg === 'number' &&
    Number.isFinite(eq.positionAngleDeg)
  )
}

/** NINA AstroUtil.ArcsecPerPixel / FieldOfView: pixel scale and angular extents. */
export function overlayRotationDeg(eq: ImagingEquipment): number {
  if (typeof eq.fieldRotationDeg === 'number' && Number.isFinite(eq.fieldRotationDeg)) {
    return eq.fieldRotationDeg
  }
  if (typeof eq.rawImageOrientationDeg === 'number' && Number.isFinite(eq.rawImageOrientationDeg)) {
    return astrometryApiOrientationToImageTopPA(eq.rawImageOrientationDeg, 'jpeg')
  }
  // Older saves only had NINA rotator PA (astrometry +X − 180°). Typical JPEG parity −1:
  // image top ≈ rotator PA − 90°.
  return ((eq.positionAngleDeg - 90) % 360 + 360) % 360
}

export function computeFov(eq: ImagingEquipment): EquipmentFov {
  const arcsecPerPixel = (eq.pixelSizeUm / eq.focalLengthMm) * (ARCSEC_PER_RADIAN / 1000)
  return {
    arcsecPerPixel,
    fovWidthDeg: (arcsecPerPixel * eq.sensorWidthPx) / 3600,
    fovHeightDeg: (arcsecPerPixel * eq.sensorHeightPx) / 3600,
  }
}

function parseEquipment(raw: string | null): ImagingEquipment | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ImagingEquipment>
    if (!isEquipmentValid(parsed)) return null
    return {
      label: typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim() : 'Imaging rig',
      focalLengthMm: parsed.focalLengthMm,
      pixelSizeUm: parsed.pixelSizeUm,
      sensorWidthPx: parsed.sensorWidthPx,
      sensorHeightPx: parsed.sensorHeightPx,
      positionAngleDeg: parsed.positionAngleDeg,
      fieldRotationDeg:
        typeof parsed.fieldRotationDeg === 'number' && Number.isFinite(parsed.fieldRotationDeg)
          ? parsed.fieldRotationDeg
          : undefined,
      rawImageOrientationDeg:
        typeof parsed.rawImageOrientationDeg === 'number' &&
        Number.isFinite(parsed.rawImageOrientationDeg)
          ? parsed.rawImageOrientationDeg
          : undefined,
      imageParity: typeof parsed.imageParity === 'number' ? parsed.imageParity : undefined,
    }
  } catch {
    return null
  }
}

export function getEquipment(siteTenantId?: string): ImagingEquipment | null {
  const scoped = parseEquipment(localStorage.getItem(equipmentStorageKey(siteTenantId)))
  if (scoped) return scoped

  const legacyTenantId = getPersonalTenant().tenantId
  if (resolveSiteTenantId(siteTenantId) !== legacyTenantId) return null
  return parseEquipment(localStorage.getItem(EQUIPMENT_KEY))
}

export function isEquipmentConfigured(siteTenantId?: string): boolean {
  return getEquipment(siteTenantId) !== null
}

export function setEquipment(eq: ImagingEquipment, siteTenantId?: string): void {
  if (!isEquipmentValid(eq)) return
  const normalized: ImagingEquipment = {
    label: eq.label.trim() || 'Imaging rig',
    focalLengthMm: eq.focalLengthMm,
    pixelSizeUm: eq.pixelSizeUm,
    sensorWidthPx: eq.sensorWidthPx,
    sensorHeightPx: eq.sensorHeightPx,
    positionAngleDeg: ((eq.positionAngleDeg % 360) + 360) % 360,
    fieldRotationDeg:
      typeof eq.fieldRotationDeg === 'number' && Number.isFinite(eq.fieldRotationDeg)
        ? ((eq.fieldRotationDeg % 360) + 360) % 360
        : undefined,
    rawImageOrientationDeg:
      typeof eq.rawImageOrientationDeg === 'number' && Number.isFinite(eq.rawImageOrientationDeg)
        ? eq.rawImageOrientationDeg
        : undefined,
    imageParity: typeof eq.imageParity === 'number' ? eq.imageParity : undefined,
  }
  localStorage.setItem(equipmentStorageKey(siteTenantId), JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(EQUIPMENT_CHANGED, { detail: normalized }))
}

export function clearEquipment(siteTenantId?: string): void {
  localStorage.removeItem(equipmentStorageKey(siteTenantId))
  window.dispatchEvent(new CustomEvent(EQUIPMENT_CHANGED, { detail: null }))
}

export type EquipmentInput = {
  label: string
  focalLengthMm: string
  pixelSizeUm: string
  sensorWidthPx: string
  sensorHeightPx: string
  positionAngleDeg: string
}

export function validateEquipmentInput(
  input: EquipmentInput,
): { ok: true; equipment: ImagingEquipment } | { ok: false; error: string } {
  const focalLengthMm = Number(input.focalLengthMm)
  const pixelSizeUm = Number(input.pixelSizeUm)
  const sensorWidthPx = Number(input.sensorWidthPx)
  const sensorHeightPx = Number(input.sensorHeightPx)
  const positionAngleDeg = input.positionAngleDeg.trim() === '' ? 0 : Number(input.positionAngleDeg)

  if (!isPositive(focalLengthMm)) return { ok: false, error: 'Focal length must be a positive number (mm).' }
  if (!isPositive(pixelSizeUm)) return { ok: false, error: 'Pixel size must be a positive number (µm).' }
  if (!isPositive(sensorWidthPx)) return { ok: false, error: 'Sensor width must be a positive number (px).' }
  if (!isPositive(sensorHeightPx)) return { ok: false, error: 'Sensor height must be a positive number (px).' }
  if (!Number.isFinite(positionAngleDeg)) return { ok: false, error: 'Position angle must be a number (degrees).' }

  return {
    ok: true,
    equipment: {
      label: input.label.trim() || 'Imaging rig',
      focalLengthMm,
      pixelSizeUm,
      sensorWidthPx,
      sensorHeightPx,
      positionAngleDeg,
    },
  }
}
