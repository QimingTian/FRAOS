type Listener = (payload: unknown) => void

const listeners = new Map<string, Set<Listener>>()

export type LiveChannel = 'agent:wake' | 'site:sessions' | `progress:${string}` | `preview:${string}`

function notify(channel: LiveChannel, payload: unknown): void {
  const set = listeners.get(channel)
  if (!set) return
  for (const fn of Array.from(set)) {
    try {
      fn(payload)
    } catch {
      // ignore
    }
  }
}

export function emitLiveEvent(channel: LiveChannel, payload: unknown): void {
  notify(channel, payload)
}

export function emitAgentWakePollSequence(): void {
  emitLiveEvent('agent:wake', { type: 'poll_sequence', at: new Date().toISOString() })
}

export function emitSiteSessionsChanged(): void {
  emitLiveEvent('site:sessions', { type: 'sessions_changed', at: new Date().toISOString() })
}

export function subscribeLiveEvents(
  channel: LiveChannel,
  listener: Listener,
  signal?: AbortSignal
): () => void {
  const set = listeners.get(channel) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(channel, set)
  const cleanup = () => {
    const current = listeners.get(channel)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(channel)
  }
  signal?.addEventListener('abort', cleanup, { once: true })
  return cleanup
}

export function liveProgressChannel(queueId: string): LiveChannel {
  return `progress:${queueId}`
}

export function livePreviewChannel(queueId: string): LiveChannel {
  return `preview:${queueId}`
}
