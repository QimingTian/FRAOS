export type LiveChannel =
  | `agent:wake:${string}`
  | `site:sessions:${string}`
  | `progress:${string}`
  | `preview:${string}`
  | `mount:${string}:${string}`

type Listener = (payload: unknown) => void

type GlobalWithLiveBus = typeof globalThis & {
  __borean_live_bus_listeners__?: Map<string, Set<Listener>>
}

function listenersMap(): Map<string, Set<Listener>> {
  const g = globalThis as GlobalWithLiveBus
  if (!g.__borean_live_bus_listeners__) g.__borean_live_bus_listeners__ = new Map()
  return g.__borean_live_bus_listeners__
}

function notify(channel: LiveChannel, payload: unknown): void {
  const listeners = listenersMap().get(channel)
  if (!listeners || listeners.size === 0) return
  for (const listener of Array.from(listeners)) {
    try {
      listener(payload)
    } catch {
      // ignore listener failures
    }
  }
}

export function emitLiveEvent(channel: LiveChannel, payload: unknown): void {
  notify(channel, payload)
}

export function liveAgentWakeChannel(tenantId: string): LiveChannel {
  return `agent:wake:${tenantId.trim() || 'global'}`
}

export function liveSiteSessionsChannel(tenantId: string): LiveChannel {
  return `site:sessions:${tenantId.trim() || 'global'}`
}

export function liveProgressChannel(queueId: string): LiveChannel {
  return `progress:${queueId}`
}

export function livePreviewChannel(queueId: string): LiveChannel {
  return `preview:${queueId}`
}

export function emitAgentWakePollSequence(tenantId?: string): void {
  const channel = liveAgentWakeChannel(tenantId ?? 'global')
  emitLiveEvent(channel, { type: 'poll_sequence', at: new Date().toISOString() })
}

export function emitSiteSessionsChanged(tenantId?: string): void {
  const channel = liveSiteSessionsChannel(tenantId ?? 'global')
  emitLiveEvent(channel, { type: 'sessions_changed', at: new Date().toISOString() })
}

export function subscribeLiveEvents(
  channel: LiveChannel,
  listener: Listener,
  signal?: AbortSignal
): () => void {
  const map = listenersMap()
  const set = map.get(channel) ?? new Set<Listener>()
  set.add(listener)
  map.set(channel, set)

  signal?.addEventListener(
    'abort',
    () => {
      const current = map.get(channel)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) map.delete(channel)
    },
    { once: true }
  )

  return () => {
    const current = map.get(channel)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) map.delete(channel)
  }
}

export function liveMountChannel(
  tenantId: string | undefined | null,
  stationId?: string | null
): LiveChannel {
  const tenant = typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : 'global'
  const t = typeof stationId === 'string' ? stationId.trim() : ''
  return `mount:${tenant}:${t.length > 0 ? t : 'default'}`
}

export async function emitAgentWakePollSequenceAsync(tenantId: string): Promise<void> {
  emitAgentWakePollSequence(tenantId)
}
