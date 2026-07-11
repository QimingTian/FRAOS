import { kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'

export type AgentHeartbeat = {
  agentLastSeenMs: number
  ninaRunning: boolean
  ninaRunningReportedAt: number
}

const memory = new Map<string, AgentHeartbeat>()

function kvKey(tenantId: string): string {
  return `personal-hub:${tenantId}:agent-heartbeat`
}

function normalize(raw: unknown): AgentHeartbeat | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const agentLastSeenMs = Number(r.agentLastSeenMs)
  if (!Number.isFinite(agentLastSeenMs) || agentLastSeenMs <= 0) return null
  return {
    agentLastSeenMs,
    ninaRunning: Boolean(r.ninaRunning),
    ninaRunningReportedAt: Number(r.ninaRunningReportedAt) || 0,
  }
}

export function defaultAgentHeartbeat(): AgentHeartbeat {
  return { agentLastSeenMs: 0, ninaRunning: false, ninaRunningReportedAt: 0 }
}

export async function loadAgentHeartbeat(tenantId: string): Promise<AgentHeartbeat> {
  const remote = await kvGetJson<unknown>(kvKey(tenantId))
  const normalized = normalize(remote) ?? defaultAgentHeartbeat()
  memory.set(tenantId, normalized)
  return { ...normalized }
}

export function mergeHeartbeat(existing: AgentHeartbeat, input: { ninaRunning?: boolean; nowMs?: number }): AgentHeartbeat {
  const nowMs = input.nowMs ?? Date.now()
  const ninaRunning = input.ninaRunning ?? existing.ninaRunning
  const ninaRunningReportedAt =
    input.ninaRunning !== undefined ? nowMs : Math.max(existing.ninaRunningReportedAt, 0)
  return {
    agentLastSeenMs: Math.max(existing.agentLastSeenMs, nowMs),
    ninaRunning,
    ninaRunningReportedAt: input.ninaRunning !== undefined ? ninaRunningReportedAt : existing.ninaRunningReportedAt,
  }
}

/** Standalone heartbeat touch (SSE keepalive, agent-events connect). */
export async function touchAgentHeartbeatRemote(
  tenantId: string,
  input: { ninaRunning?: boolean } = {}
): Promise<AgentHeartbeat> {
  const existing = await loadAgentHeartbeat(tenantId)
  const next = mergeHeartbeat(existing, input)
  memory.set(tenantId, next)
  await kvSetJson(kvKey(tenantId), next)
  return next
}

export function touchAgentHeartbeatInCtx(
  heartbeat: AgentHeartbeat,
  input: { ninaRunning?: boolean; nowMs?: number }
): AgentHeartbeat {
  return mergeHeartbeat(heartbeat, input)
}

export async function persistAgentHeartbeat(tenantId: string, heartbeat: AgentHeartbeat): Promise<void> {
  const remote = await kvGetJson<unknown>(kvKey(tenantId))
  const existing = normalize(remote) ?? defaultAgentHeartbeat()
  const next: AgentHeartbeat = {
    agentLastSeenMs: Math.max(existing.agentLastSeenMs, heartbeat.agentLastSeenMs),
    ninaRunning:
      heartbeat.ninaRunningReportedAt >= existing.ninaRunningReportedAt
        ? heartbeat.ninaRunning
        : existing.ninaRunning,
    ninaRunningReportedAt: Math.max(existing.ninaRunningReportedAt, heartbeat.ninaRunningReportedAt),
  }
  memory.set(tenantId, next)
  await kvSetJson(kvKey(tenantId), next)
}
