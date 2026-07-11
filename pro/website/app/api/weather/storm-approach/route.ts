import { NextResponse } from 'next/server'
import {
  evaluateStormApproachStatus,
  STORM_APPROACH_RADIUS_KM,
} from '@/lib/imaging/weather-safety-estop'

export const runtime = 'nodejs'

/** ASC overlay + weather-safety ESTOP share this 20 km Open-Meteo thunderstorm ring. */
export async function GET() {
  try {
    const status = await evaluateStormApproachStatus()
    if (!status) {
      return NextResponse.json(
        { error: 'Storm approach forecast unavailable', radiusKm: STORM_APPROACH_RADIUS_KM },
        { status: 502 }
      )
    }
    return NextResponse.json({
      safe: status.safe,
      radiusKm: status.radiusKm,
      threat: status.threat
        ? {
            reason: status.threat.reason,
            detail: status.threat.detail,
          }
        : null,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'Storm approach check failed',
        radiusKm: STORM_APPROACH_RADIUS_KM,
      },
      { status: 502 }
    )
  }
}
