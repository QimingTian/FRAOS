/**
 * Field-of-view overlay geometry, including field rotation.
 *
 * The Stellarium view is rendered in the horizon-aligned (alt-az) frame, so a camera
 * frame that is defined relative to the *equatorial* sky (a fixed position angle east
 * of celestial north) appears to rotate as the target moves across the sky. That apparent
 * rotation is the parallactic angle. Rather than computing the parallactic angle in closed
 * form (and then fighting projection/parity sign conventions), we read the engine's own
 * projection: we project celestial north and east at the boresight onto the screen and build
 * the sensor's on-screen orientation from those two measured directions. This is exact for
 * whatever projection/roll the engine is using and is parity-correct by construction.
 */

type Observer = { utc?: number; yaw?: number; pitch?: number }

export type FovOverlayStel = {
  core?: { observer?: Observer; fov?: number }
  convertFrame?: (obs: Observer, origin: string, dest: string, v: number[]) => number[]
  c2s?: (v: number[]) => [number, number]
}

const DEG = Math.PI / 180

function icrfUnit(raRad: number, decRad: number): number[] {
  const cd = Math.cos(decRad)
  return [cd * Math.cos(raRad), cd * Math.sin(raRad), Math.sin(decRad), 0]
}

/**
 * On-screen rotation (CSS degrees, clockwise) for a camera frame whose sensor "up" edge
 * sits at `positionAngleDeg` east of celestial north at the current boresight.
 * Returns null if the engine isn't ready.
 */
export function computeFovOverlayRotationDeg(
  stel: FovOverlayStel | null,
  positionAngleDeg: number,
): number | null {
  const obs = stel?.core?.observer
  if (!stel || !obs || !stel.convertFrame || !stel.c2s) return null
  try {
    // Boresight direction (screen center) in ICRF, then its RA/Dec.
    const centerIcrf = stel.convertFrame(obs, 'VIEW', 'ICRF', [0, 0, -1, 0])
    const [raRad, decRad] = stel.c2s(centerIcrf)
    if (!Number.isFinite(raRad) || !Number.isFinite(decRad)) return null

    // Small steps toward celestial north (+dec) and east (+ra), clamped near the pole.
    const step = 0.25 * DEG
    const decN = Math.min(decRad + step, 89.999 * DEG)
    const northIcrf = icrfUnit(raRad, decN)
    const eastIcrf = icrfUnit(raRad + step, decRad)

    const c = stel.convertFrame(obs, 'ICRF', 'VIEW', centerIcrf)
    const n = stel.convertFrame(obs, 'ICRF', 'VIEW', northIcrf)
    const e = stel.convertFrame(obs, 'ICRF', 'VIEW', eastIcrf)

    // VIEW frame: x → right, y → up (looking down −z). Screen directions of N and E.
    let nx = n[0] - c[0]
    let ny = n[1] - c[1]
    let ex = e[0] - c[0]
    let ey = e[1] - c[1]

    const nLen = Math.hypot(nx, ny)
    const eLen = Math.hypot(ex, ey)
    if (nLen < 1e-9 || eLen < 1e-9) return null
    nx /= nLen
    ny /= nLen
    ex /= eLen
    ey /= eLen

    // Sensor "up" = north rotated toward east by the position angle.
    const pa = positionAngleDeg * DEG
    const upx = Math.cos(pa) * nx + Math.sin(pa) * ex
    const upy = Math.cos(pa) * ny + Math.sin(pa) * ey

    // CSS rotate() is clockwise with screen y pointing down; our VIEW y points up.
    // atan2(x, y) gives the clockwise angle from screen-up to the (x,y) direction.
    const deg = (Math.atan2(upx, upy) * 180) / Math.PI
    return Number.isFinite(deg) ? deg : null
  } catch {
    return null
  }
}
