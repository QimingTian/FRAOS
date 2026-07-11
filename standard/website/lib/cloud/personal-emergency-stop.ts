import { runWithTenantImaging } from '@/lib/cloud/personal-imaging/ctx'
import {
  armEmergencyStop,
  getEmergencyStopPublicState,
  getEmergencyStopState,
  isEmergencyStopBlocking,
  isEmergencyStopStopping,
  markEmergencyStopCompleted,
  markEmergencyStopDelivered,
} from '@/lib/cloud/personal-imaging/estop-sync'

export type PersonalEmergencyStopPhase = 'stopping' | 'stopped'
export type PersonalEmergencyStopPublicPhase = 'idle' | PersonalEmergencyStopPhase

export type PersonalEmergencyStopState = {
  phase: PersonalEmergencyStopPhase
  queueId: string
  requestedAt: string
  requestedBy?: string | null
  deliveredAt?: string | null
  completedAt?: string | null
  heldSessionIds: string[]
}

export type PersonalEmergencyStopPublicState = {
  phase: PersonalEmergencyStopPublicPhase
  progress: 0 | 33 | 66 | 100
  label: 'ESTOP' | 'STOPPING' | 'STOPPED'
  queueId: string | null
  canArm: boolean
  blocking: boolean
  stopped: boolean
}

export function isPersonalEstopQueueId(queueId: string): boolean {
  return queueId.startsWith('estop-')
}

export async function isPersonalAgentConnected(tenantId: string): Promise<boolean> {
  const publicState = await runWithTenantImaging(tenantId, () => getEmergencyStopPublicState(), {
    persist: false,
  })
  return publicState.agentConnected
}

export async function personalGetEmergencyStopPublicState(
  tenantId: string
): Promise<PersonalEmergencyStopPublicState & { agentConnected: boolean }> {
  return runWithTenantImaging(tenantId, () => getEmergencyStopPublicState(), { persist: false })
}

export async function personalIsEmergencyStopBlocking(tenantId: string): Promise<boolean> {
  return runWithTenantImaging(tenantId, () => isEmergencyStopBlocking(), { persist: false })
}

export async function personalArmEmergencyStop(
  tenantId: string,
  requestedBy?: string | null
): Promise<PersonalEmergencyStopState> {
  return runWithTenantImaging(tenantId, () => armEmergencyStop(requestedBy))
}

export async function personalMarkEmergencyStopDelivered(
  tenantId: string,
  queueId: string
): Promise<boolean> {
  return runWithTenantImaging(tenantId, () => markEmergencyStopDelivered(queueId))
}

export async function personalMarkEmergencyStopCompleted(
  tenantId: string,
  queueId: string
): Promise<boolean> {
  return runWithTenantImaging(tenantId, () => markEmergencyStopCompleted(queueId))
}

export async function personalGetEmergencyStopState(
  tenantId: string
): Promise<PersonalEmergencyStopState | null> {
  return runWithTenantImaging(tenantId, () => getEmergencyStopState(), { persist: false })
}

export async function personalIsEmergencyStopStopping(tenantId: string): Promise<boolean> {
  return runWithTenantImaging(tenantId, () => isEmergencyStopStopping(), { persist: false })
}
