import { NextResponse } from 'next/server'
import { runWithTenantImaging } from '@/lib/cloud/personal-imaging/ctx'
import {
  clearStaleUndeliveredEmergencyStop,
  estopSequenceJson,
  getEmergencyStopState,
  isEmergencyStopStopping,
  isStaleUndeliveredEmergencyStop,
  markEmergencyStopDelivered,
} from '@/lib/cloud/personal-imaging/estop-sync'
import { personalIsEmergencyStopBlocking } from '@/lib/cloud/personal-emergency-stop'
import { personalTenantSecret } from '@/lib/cloud/tenant-auth'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function personalTryDeliverEmergencyStop(
  tenantId: string
): Promise<NextResponse | null> {
  const secret = await personalTenantSecret(tenantId)
  return runWithTenantImaging(tenantId, () => {
    if (!isEmergencyStopStopping()) return null
    const state = getEmergencyStopState()
    if (!state) return null

    if (!state.deliveredAt) {
      if (isStaleUndeliveredEmergencyStop(state)) {
        clearStaleUndeliveredEmergencyStop(state)
        return null
      }
      markEmergencyStopDelivered(state.queueId)
    }

    const payload = estopSequenceJson(tenantId, state.queueId, secret)
    return new NextResponse(payload, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  })
}

export function personalEstopDeliveryBlockingResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Emergency STOP active; no imaging sequences are available.' },
    { status: 409, headers: CORS_HEADERS }
  )
}

export async function personalIsEstopDeliveryBlocking(tenantId: string): Promise<boolean> {
  return personalIsEmergencyStopBlocking(tenantId)
}
