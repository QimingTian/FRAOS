import { NextRequest, NextResponse } from 'next/server'
import { personalIsEmergencyStopBlocking } from '@/lib/cloud/personal-emergency-stop'
import {
  personalEstopDeliveryBlockingResponse,
  personalTryDeliverEmergencyStop,
} from '@/lib/cloud/personal-estop-delivery'
import { personalOptions, requirePersonalTenant } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  const denied = await requirePersonalTenant(tenantId, request)
  if (denied) return denied

  const emergencyDelivered = await personalTryDeliverEmergencyStop(tenantId)
  if (emergencyDelivered) return emergencyDelivered

  if (await personalIsEmergencyStopBlocking(tenantId)) {
    return personalEstopDeliveryBlockingResponse()
  }

  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
