function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * Raw `orientation` from GET /api/jobs/:id/calibration/ (TanWCS.get_orientation).
 * This is **not** the nova web UI string "Up is …° E of N" until adjusted for JPEG-like uploads.
 *
 * @see astrometry.net net/models.py Calibration.get_orientation — JPEG/PNG flip: (180 - orient).
 */
export type AstrometryUploadKind = 'jpeg' | 'fits'

/**
 * Image **top** edge direction, degrees east of celestial north — matches nova "Up is …° E of N"
 * for JPEG/PNG uploads (what the Control Client sends to astrometry.net).
 */
export function astrometryApiOrientationToImageTopPA(
  orientationDeg: number,
  uploadKind: AstrometryUploadKind = 'jpeg',
): number {
  if (uploadKind === 'jpeg') {
    return normalizeDeg(180 - orientationDeg)
  }
  return normalizeDeg(orientationDeg)
}

/** @deprecated Use astrometryApiOrientationToImageTopPA — parity is already in the WCS orientation. */
export function astrometryCalibrationToImageTopPA(
  orientationDeg: number,
  _parity?: number | null,
  uploadKind: AstrometryUploadKind = 'jpeg',
): number {
  return astrometryApiOrientationToImageTopPA(orientationDeg, uploadKind)
}

/**
 * Approximate NINA rotator PA (Settings field) from raw API orientation.
 * Legacy heuristic for display only; Atlas uses {@link astrometryApiOrientationToImageTopPA}.
 */
export function astrometryOrientationToPositionAngle(orientationDeg: number): number {
  return normalizeDeg(orientationDeg - 180)
}
