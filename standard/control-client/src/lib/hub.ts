/**
 * hub.ts — Typed Hub API client methods
 *
 * Provides a clean, typed interface for all imaging API endpoints.
 * Complements hub-client.ts (which owns the core probe/session/ESTOP calls).
 */

import { personalAuthHeaders, personalTenantApiUrl } from '@shared/tenant-config'
import { contentApiPath } from './content-base'
import { loadRuntimeTenant } from './tenant'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ResolvedCatalogObject = {
  query: string
  canonicalName: string
  aliases: string[]
  raHours: number
  decDeg: number
  ra: { hour: number; minute: number; second: number }
  dec: { sign: '+' | '-'; degree: number; minute: number; second: number }
}

export type ObjectResolveResult =
  | { ok: true; object: ResolvedCatalogObject }
  | { ok: false; error: string }

export type VariableStarRow = {
  name: string
  raHours: number
  decDeg: number
  varType: string | null
  periodDays: number | null
  minMag: number | null
  maxMag: number | null
  highPriority: boolean
}

export type VariableStarLookupResult =
  | { ok: true; source: 'simbad' | 'catalog'; star: VariableStarRow }
  | { ok: false; error: string }

export type ScheduleInsightResult = {
  ok: boolean
  error?: string
  /** ISO string for tonight's imaging window start (nautical dusk). */
  imagingWindowStart?: string | null
  /** ISO string for tonight's imaging window end (nautical dawn). */
  imagingWindowEnd?: string | null
  /** Prediction: 'permitted' | 'not_permitted' | 'unavailable' */
  weatherPrediction?: 'permitted' | 'not_permitted' | 'unavailable'
  /** Scheduled sessions on the strip tonight. */
  scheduledSessions?: Array<{
    id: string
    target: string
    startMs: number
    endMs: number
    status: string
  }>
}

export type TonightWeatherResult = {
  ok: boolean
  error?: string
  /** 'permitted' | 'not_permitted' | 'unavailable' */
  prediction?: 'permitted' | 'not_permitted' | 'unavailable'
  hasAnyPrecipitationTonight?: boolean
  readyHourStartsSec?: number[]
  nightHourStartsSec?: number[]
  notPermittedHourReasons?: Array<{
    hourStartSec: number
    reasons: Array<'cloud' | 'rain' | 'wind'>
  }>
}

export type EmergencyStopResult = {
  ok: boolean
  error?: string
  phase?: 'idle' | 'stopping' | 'stopped'
  progress?: number
  label?: string
}

export type AgentEventType =
  | 'snapshot'
  | 'line'
  | 'status'
  | 'ping'
  | 'preview_updated'
  | 'sessions_changed'
  | 'observatory_status'

export type AgentEvent = {
  type: AgentEventType
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// object-resolve
// ---------------------------------------------------------------------------

/**
 * Resolve a DSO target name via CDS Sesame (through the boreanastro.com proxy).
 * Returns canonical name, aliases, and J2000 coordinates.
 */
export async function objectResolve(query: string): Promise<ObjectResolveResult> {
  const trimmed = query.trim()
  if (!trimmed) return { ok: false, error: 'query is required' }
  try {
    const url = contentApiPath(`/api/imaging/object-resolve?query=${encodeURIComponent(trimmed)}`)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        object?: ResolvedCatalogObject
        error?: string
      }
      if (!res.ok || data.ok !== true || !data.object) {
        return { ok: false, error: data.error ?? `HTTP ${res.status}` }
      }
      return { ok: true, object: data.object }
    } finally {
      clearTimeout(timer)
    }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? ex.message : 'Object lookup failed',
    }
  }
}

// ---------------------------------------------------------------------------
// variable-star-lookup
// ---------------------------------------------------------------------------

/**
 * Look up a variable star by name via SIMBAD TAP (through the boreanastro.com proxy).
 */
export async function variableStarLookup(query: string): Promise<VariableStarLookupResult> {
  const trimmed = query.trim()
  if (!trimmed) return { ok: false, error: 'query is required' }
  try {
    const url = contentApiPath(
      `/api/imaging/variable-star-lookup?query=${encodeURIComponent(trimmed)}`
    )
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        source?: 'simbad' | 'catalog'
        star?: VariableStarRow
        error?: string
      }
      if (!res.ok || data.ok !== true || !data.star) {
        return { ok: false, error: data.error ?? `HTTP ${res.status}` }
      }
      return { ok: true, source: data.source ?? 'simbad', star: data.star }
    } finally {
      clearTimeout(timer)
    }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? ex.message : 'Variable star lookup failed',
    }
  }
}

// ---------------------------------------------------------------------------
// schedule-insight  (hub-routed)
// ---------------------------------------------------------------------------

/**
 * Fetch tonight's schedule insight from the personal hub.
 * Returns imaging window times and tonight's session schedule.
 */
export async function getScheduleInsight(): Promise<ScheduleInsightResult> {
  try {
    const tenant = await loadRuntimeTenant()
    const url = personalTenantApiUrl(tenant, '/imaging/schedule-insight')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: personalAuthHeaders(tenant),
      })
      const data = (await res.json().catch(() => ({}))) as ScheduleInsightResult
      if (!res.ok) {
        return { ok: false, error: data.error ?? `HTTP ${res.status}` }
      }
      return { ...data, ok: true }
    } finally {
      clearTimeout(timer)
    }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? ex.message : 'Schedule insight unavailable',
    }
  }
}

// ---------------------------------------------------------------------------
// tonight-weather-prediction  (hub-routed)
// ---------------------------------------------------------------------------

/**
 * Fetch tonight's weather prediction from the personal hub.
 * Includes per-hour permitted/not-permitted reasons.
 */
export async function getTonightWeather(): Promise<TonightWeatherResult> {
  try {
    const tenant = await loadRuntimeTenant()
    // Compute tonight's 4pm -> 8am window
    const now = new Date()
    const startDate = new Date(now)
    startDate.setHours(16, 0, 0, 0)
    // If we're in the early morning (before noon) we're still on "last night"
    if (now.getHours() < 12) startDate.setDate(startDate.getDate() - 1)
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 1)
    endDate.setHours(8, 0, 0, 0)

    const startSec = Math.floor(startDate.getTime() / 1000)
    const endSec = Math.floor(endDate.getTime() / 1000)
    const url = personalTenantApiUrl(
      tenant,
      `/imaging/tonight-weather-prediction?startSec=${startSec}&endSec=${endSec}`
    )
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: personalAuthHeaders(tenant),
      })
      const data = (await res.json().catch(() => ({}))) as TonightWeatherResult
      if (!res.ok) {
        return { ok: false, error: data.error ?? `HTTP ${res.status}` }
      }
      return { ...data, ok: true }
    } finally {
      clearTimeout(timer)
    }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? ex.message : 'Weather prediction unavailable',
    }
  }
}

// ---------------------------------------------------------------------------
// emergency-stop  (hub-routed)
// ---------------------------------------------------------------------------

/**
 * Fire the emergency stop on the personal hub.
 * Arms and triggers the stop sequence. Returns phase + progress.
 */
export async function emergencyStop(): Promise<EmergencyStopResult> {
  try {
    const tenant = await loadRuntimeTenant()
    const url = personalTenantApiUrl(tenant, '/imaging/emergency-stop')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
        body: '{}',
      })
      const data = (await res.json().catch(() => ({}))) as EmergencyStopResult
      if (!res.ok) {
        return { ok: false, error: data.error ?? `HTTP ${res.status}` }
      }
      return { ...data, ok: true }
    } finally {
      clearTimeout(timer)
    }
  } catch (ex) {
    return {
      ok: false,
      error: ex instanceof Error ? ex.message : 'Emergency STOP failed',
    }
  }
}

// ---------------------------------------------------------------------------
// connectAgentEvents -- SSE with exponential-backoff auto-reconnect
// ---------------------------------------------------------------------------

export type AgentEventUnsubscribe = () => void

/**
 * Connect to the agent-events SSE stream on the personal hub.
 * Auto-reconnects with exponential backoff (max 30 s) on disconnect.
 *
 * Returns a cleanup function; call it to permanently close the connection.
 */
export function connectAgentEvents(
  onEvent: (e: AgentEvent) => void,
  onStateChange?: (connected: boolean) => void
): AgentEventUnsubscribe {
  let cancelled = false
  let source: EventSource | null = null
  let retryMs = 1_000
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function cleanup() {
    cancelled = true
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    source?.close()
    source = null
  }

  async function connect() {
    if (cancelled) return
    try {
      const tenant = await loadRuntimeTenant()
      if (cancelled) return
      const token = encodeURIComponent(tenant.apiSecret)
      const base = personalTenantApiUrl(tenant, '/imaging/agent-events')
      const url = `${base}?access_token=${token}`

      source = new EventSource(url)

      source.onopen = () => {
        if (cancelled) return
        retryMs = 1_000 // reset backoff on successful connect
        onStateChange?.(true)
      }

      source.onmessage = (evt) => {
        if (cancelled) return
        let payload: AgentEvent | null = null
        try {
          payload = JSON.parse(evt.data as string) as AgentEvent
        } catch {
          return
        }
        if (payload && typeof payload === 'object' && 'type' in payload) {
          onEvent(payload)
        }
      }

      source.onerror = () => {
        if (cancelled) return
        source?.close()
        source = null
        onStateChange?.(false)
        // Exponential backoff, cap at 30 s
        retryMs = Math.min(retryMs * 2, 30_000)
        retryTimer = setTimeout(() => {
          retryTimer = null
          void connect()
        }, retryMs)
      }
    } catch {
      if (cancelled) return
      onStateChange?.(false)
      retryMs = Math.min(retryMs * 2, 30_000)
      retryTimer = setTimeout(() => {
        retryTimer = null
        void connect()
      }, retryMs)
    }
  }

  void connect()
  return cleanup
}
