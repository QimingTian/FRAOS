const DEG = Math.PI / 180

function euclidianModulus(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

export function calculatePositionAngle(
  ra1Deg: number,
  ra2Deg: number,
  dec1Deg: number,
  dec2Deg: number,
): number {
  const a1 = ra1Deg * DEG
  const a2 = ra2Deg * DEG
  const d1 = dec1Deg * DEG
  const d2 = dec2Deg * DEG
  const numerator = Math.sin(a1 - a2)
  const denominator = Math.cos(d2) * Math.tan(d1) - Math.sin(d2) * Math.cos(a1 - a2)
  return (Math.atan(numerator / denominator) * 180) / Math.PI
}

/** Stereographic shift (NINA default). deltaX/deltaY in degrees on the tangent plane; rotation clockwise. */
export function shiftCoordinatesStereographic(
  raHours: number,
  decDeg: number,
  deltaXDeg: number,
  deltaYDeg: number,
  rotationDeg: number,
): { raHours: number; decDeg: number } {
  let dx = -deltaXDeg
  let dy = -deltaYDeg
  const rot = rotationDeg * DEG
  if (rotationDeg !== 0) {
    const rdx = dx
    dx = dx * Math.cos(rot) - dy * Math.sin(rot)
    dy = dy * Math.cos(rot) + rdx * Math.sin(rot)
  }

  const raRad = raHours * 15 * DEG
  const decRad = decDeg * DEG
  const originDecSin = Math.sin(decRad)
  const originDecCos = Math.cos(decRad)

  const dxRad = dx * DEG
  const dyRad = dy * DEG
  const sins = dxRad * dxRad + dyRad * dyRad
  const dz = (4.0 - sins) / (4.0 + sins)

  const targetDecRad = Math.asin(
    dz * originDecSin + dyRad * originDecCos * (1.0 + dz) / 2.0,
  )
  let targetRaDelta = Math.asin((dxRad * (1.0 + dz)) / (2.0 * Math.cos(targetDecRad)))

  const mg =
    (2 *
      (Math.sin(targetDecRad) * originDecCos -
        Math.cos(targetDecRad) * originDecSin * Math.cos(targetRaDelta))) /
    (1.0 + Math.sin(targetDecRad) * originDecSin + Math.cos(targetDecRad) * originDecCos * Math.cos(targetRaDelta))

  if (Math.abs(mg - dyRad) > 1.0e-5) {
    targetRaDelta = Math.PI - targetRaDelta
  }

  let targetRaRad = raRad + targetRaDelta
  if (targetRaRad < 0) targetRaRad += 2 * Math.PI
  if (targetRaRad >= 2 * Math.PI) targetRaRad -= 2 * Math.PI

  return {
    raHours: targetRaRad / (15 * DEG),
    decDeg: targetDecRad / DEG,
  }
}

/** Pixel delta → sky shift using arcsec/pixel scales (NINA Coordinates.Shift overload). */
export function shiftCoordinatesPixels(
  raHours: number,
  decDeg: number,
  deltaXPx: number,
  deltaYPx: number,
  rotationDeg: number,
  arcsecPerPixelX: number,
  arcsecPerPixelY: number,
): { raHours: number; decDeg: number } {
  const deltaXDeg = (deltaXPx * arcsecPerPixelX) / 3600
  const deltaYDeg = (deltaYPx * arcsecPerPixelY) / 3600
  return shiftCoordinatesStereographic(raHours, decDeg, deltaXDeg, deltaYDeg, rotationDeg)
}

export function raHoursToDeg(raHours: number): number {
  return raHours * 15
}

export function normalizeRaHours(raHours: number): number {
  return euclidianModulus(raHours, 24)
}
