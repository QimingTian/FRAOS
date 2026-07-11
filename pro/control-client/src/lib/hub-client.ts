import {
  personalAuthHeaders,
  personalTenantApiUrl,
} from '@shared/tenant-config'
import { getPersonalTenant, loadRuntimeTenant } from './tenant'
import type {
  CurrentSessionsResponse,
  HubProbeResult,
  ObservatoryMode,
  ObservatoryStatus,
  ObservatoryStatusResponse,
} from './types'

const FETCH_TIMEOUT_MS = 12_000

function formatHubError(message: string, tenant: ReturnType<typeof getPersonalTenant>): string {
  if (/load failed|failed to fetch|networkerror|network request failed|aborted/i.test(message)) {
    const local =
      tenant.apiBaseUrl.includes('127.0.0.1') || tenant.apiBaseUrl.includes('localhost')
    if (local) {
      return 'Dev hub offline — activate license in Settings or start local hub'
    }
    return 'Unreachable — check network or license in Settings'
  }
  if (/unauthorized|401/i.test(message)) {
    return 'License invalid — re-import tenant.json in Settings'
  }
  return message
}

async function hubFetch<T>(path: string): Promise<T> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, path)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: personalAuthHeaders(tenant),
    })
    const data = (await res.json().catch(() => ({}))) as T
    if (!res.ok) {
      throw new Error(
        typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : `HTTP ${res.status}`
      )
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchObservatoryStatus(): Promise<ObservatoryStatusResponse> {
  return hubFetch<ObservatoryStatusResponse>('/imaging/observatory-status')
}

export type StormApproachResponse = {
  safe?: boolean
  radiusKm?: number
  threat?: { reason?: string; detail?: Record<string, unknown> } | null
  error?: string
}

/** Hub `/weather/storm-approach`, with website `/api/weather/storm-approach` fallback. */
export async function fetchStormApproach(): Promise<StormApproachResponse> {
  try {
    return await hubFetch<StormApproachResponse>('/weather/storm-approach')
  } catch {
    try {
      const { contentApiPath } = await import('./content-base')
      const res = await fetch(contentApiPath('/api/weather/storm-approach'), { cache: 'no-store' })
      return (await res.json().catch(() => ({}))) as StormApproachResponse
    } catch {
      return { error: 'Storm approach unavailable' }
    }
  }
}

export async function fetchCurrentSessions(): Promise<CurrentSessionsResponse> {
  return hubFetch<CurrentSessionsResponse>('/imaging/current-sessions')
}

export async function deleteSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, `/imaging/sessions/${encodeURIComponent(sessionId)}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      signal: controller.signal,
      headers: personalAuthHeaders(tenant),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      }
    }
    return { ok: true }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Unable to delete session',
    }
  } finally {
    clearTimeout(timer)
  }
}

export type SessionControlAction =
  | 'run'
  | 'hold'
  | 'release_hold'
  | 'complete'
  | 'fail'
  | 'in_progress'
  | 'delete'

export async function postSessionControlAction(
  sessionId: string,
  action: SessionControlAction
): Promise<{ ok: boolean; error?: string }> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, '/imaging/session-control')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessionId, action }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      }
    }
    return { ok: true }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Session control failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function probeHub(): Promise<HubProbeResult> {
  const tenant = await loadRuntimeTenant()
  try {
    const healthUrl = personalTenantApiUrl(tenant, '/health')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(healthUrl, {
        signal: controller.signal,
        headers: personalAuthHeaders(tenant),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } finally {
      clearTimeout(timer)
    }
    const observatory = await fetchObservatoryStatus()
    return { hubReachable: true, observatory }
  } catch (ex) {
    const raw = ex instanceof Error ? ex.message : 'Hub unreachable'
    return { hubReachable: false, error: formatHubError(raw, tenant) }
  }
}

export async function patchObservatoryMode(
  mode: 'manual' | 'auto'
): Promise<ObservatoryStatusResponse> {
  return patchObservatory({ mode })
}

export async function patchObservatory(input: {
  mode?: ObservatoryMode
  status?: ObservatoryStatus
}): Promise<ObservatoryStatusResponse> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, '/imaging/observatory-status')
  const res = await fetch(url, {
    method: 'PATCH',
    headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
  const data = (await res.json().catch(() => ({}))) as ObservatoryStatusResponse
  if (!res.ok || !data.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
  }
  return data
}

export type AuditLogResponse = {
  ok: boolean
  error?: string
  entries?: Array<{
    id: string
    at: string
    kind: string
    message: string
    detail?: Record<string, unknown>
  }>
}

export type LicenseSummaryResponse = {
  ok: boolean
  error?: string
  active?: boolean
  ownerName?: string
  plan?: string
  planLabel?: string
  purchaseType?: string
  purchaseTypeLabel?: string
  validUntil?: string | null
  nextBillAt?: string | null
}

export async function fetchLicenseSummary(): Promise<LicenseSummaryResponse> {
  return hubFetch<LicenseSummaryResponse>('/license')
}

export type ProTeamMemberRow = {
  memberId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  email: string
  displayName: string
}

export type ProTeamResponse = {
  ok: boolean
  error?: string
  team?: {
    teamId: string
    tenantId: string
    displayName: string
    teamCode?: string
    role: 'owner' | 'admin' | 'member'
  }
  members?: ProTeamMemberRow[]
}

export async function fetchProTeam(): Promise<ProTeamResponse> {
  return hubFetch<ProTeamResponse>('/team')
}

export async function updateProTeamMemberRole(
  memberId: string,
  role: 'admin' | 'member'
): Promise<{ ok: boolean; error?: string; members?: ProTeamMemberRow[] }> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, `/team/members/${encodeURIComponent(memberId)}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      signal: controller.signal,
      headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ role }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      members?: ProTeamMemberRow[]
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      }
    }
    return { ok: true, members: data.members }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Unable to update member role',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function removeProTeamMember(
  memberId: string
): Promise<{ ok: boolean; error?: string; members?: ProTeamMemberRow[] }> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, `/team/members/${encodeURIComponent(memberId)}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      signal: controller.signal,
      headers: personalAuthHeaders(tenant),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      members?: ProTeamMemberRow[]
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      }
    }
    return { ok: true, members: data.members }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Unable to remove member',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchAuditLog(limit = 200): Promise<AuditLogResponse> {
  return hubFetch<AuditLogResponse>(`/imaging/audit-log?limit=${encodeURIComponent(String(limit))}`)
}

export type AdminClosedWindowRow = {
  id: string
  startIso: string
  endIso: string
  description?: string
  createdAtIso?: string
}

export async function fetchAdminClosedWindows(): Promise<{
  ok: boolean
  windows?: AdminClosedWindowRow[]
  error?: string
}> {
  try {
    return await hubFetch<{ ok: boolean; windows?: AdminClosedWindowRow[]; error?: string }>(
      '/imaging/schedule-control'
    )
  } catch (ex) {
    return { ok: false, error: ex instanceof Error ? ex.message : 'Failed to load closed windows' }
  }
}

export async function addAdminClosedWindow(input: {
  startIso: string
  endIso: string
  description: string
}): Promise<{ ok: boolean; window?: AdminClosedWindowRow; error?: string }> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, '/imaging/schedule-control')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      window?: AdminClosedWindowRow
      error?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` }
    }
    return { ok: true, window: data.window }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Failed to add closed window',
    }
  }
}

export async function removeAdminClosedWindow(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(
    tenant,
    `/imaging/schedule-control?id=${encodeURIComponent(id)}`
  )
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: personalAuthHeaders(tenant),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      return { ok: false, error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Failed to remove closed window',
    }
  }
}

export type SessionProgressResponse = {
  ok: boolean
  error?: string
  queueStatus?: string
  lines?: Array<{ at: string; text: string }>
}

export async function fetchSessionProgress(sessionId: string): Promise<SessionProgressResponse> {
  return hubFetch<SessionProgressResponse>(
    `/imaging/queue/${encodeURIComponent(sessionId)}/progress`
  )
}

export type SessionPreviewResponse = {
  ok: boolean
  error?: string
  updatedAt?: string
  contentType?: string
  dataBase64?: string
}

export async function fetchSessionPreviewJson(queueId: string): Promise<SessionPreviewResponse> {
  return hubFetch<SessionPreviewResponse>(
    `/imaging/preview?queueId=${encodeURIComponent(queueId)}&mode=json`
  )
}

export type StorageQuotaResponse = {
  ok: boolean
  error?: string
  usedBytes?: number
  limitBytes?: number
  overQuota?: boolean
  sessions?: Array<{
    queueId: string
    objectKey: string
    sizeBytes: number
    uploadedAt: string
    target?: string | null
  }>
}

export async function fetchStorageQuota(): Promise<StorageQuotaResponse> {
  return hubFetch<StorageQuotaResponse>('/imaging/storage')
}

export async function deleteSessionStorage(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, `/imaging/storage/${encodeURIComponent(sessionId)}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      signal: controller.signal,
      headers: personalAuthHeaders(tenant),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      }
    }
    return { ok: true }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Unable to delete stored files',
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchSessionDownloadUrl(queueId: string): Promise<string> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(
    tenant,
    `/imaging/download?queueId=${encodeURIComponent(queueId)}&mode=json`
  )
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: personalAuthHeaders(tenant),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string }
    if (!res.ok || !data.ok || typeof data.signedUrl !== 'string') {
      throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
    }
    return data.signedUrl
  } finally {
    clearTimeout(timer)
  }
}

/** Observatory status labels for the control-client status bar. */
export function observatoryStatusLabel(status: string | undefined | null): string {
  if (!status) return '—'
  if (status === 'ready') return 'Ready'
  if (status === 'busy_in_use') return 'Busy — In Use'
  if (status === 'disconnected') return 'Disconnected'
  if (status === 'closed_daytime') return 'Closed — Daytime'
  if (status === 'closed_weather_not_permitted') return 'Closed — Weather Not Permitted'
  if (status === 'closed_observatory_maintenance') return 'Closed — Observatory Maintenance'
  return 'Closed'
}

export function stationConnected(probe: HubProbeResult | null): boolean | null {
  if (!probe?.hubReachable) return null
  return probe.observatory?.status !== 'disconnected'
}

export function stationStatusLabel(probe: HubProbeResult | null): string {
  const connected = stationConnected(probe)
  if (connected === null) return '—'
  return connected ? 'Connected' : 'Disconnected'
}

export function getCloudHubLabel(): string {
  const tenant = getPersonalTenant()
  const host = tenant.apiBaseUrl.includes('boreanastro.com')
    ? 'www.boreanastro.com'
    : tenant.apiBaseUrl.replace(/^https?:\/\//, '')
  return `${tenant.displayName ?? tenant.tenantId} @ ${host}`
}

export type EmergencyStopStatusResponse = {
  ok: boolean
  error?: string
  phase?: 'idle' | 'stopping' | 'stopped'
  progress?: number
  label?: string
  agentConnected?: boolean
  canArm?: boolean
}

export async function fetchEmergencyStopStatus(): Promise<EmergencyStopStatusResponse> {
  return hubFetch<EmergencyStopStatusResponse>('/imaging/emergency-stop')
}

export async function armEmergencyStop(): Promise<EmergencyStopStatusResponse> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, '/imaging/emergency-stop')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
      body: '{}',
    })
    const data = (await res.json().catch(() => ({}))) as EmergencyStopStatusResponse
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      }
    }
    return { ...data, ok: true }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? formatHubError(ex.message, tenant) : 'Emergency STOP failed.',
    }
  } finally {
    clearTimeout(timer)
  }
}
