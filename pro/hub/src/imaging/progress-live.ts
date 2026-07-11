import { emitLiveEvent, liveProgressChannel } from './live-bus.js'

export type LiveProgressEvent =
  | { type: 'line'; at: string; text: string }
  | { type: 'status'; queueStatus: string }
  | { type: 'progress'; text: string }

type Listener = (event: LiveProgressEvent) => void

const listeners = new Map<string, Set<Listener>>()

export function subscribeProgress(queueId: string, listener: Listener): () => void {
  const set = listeners.get(queueId) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(queueId, set)
  return () => {
    const current = listeners.get(queueId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(queueId)
  }
}

export function publishProgress(queueId: string, event: LiveProgressEvent): void {
  const set = listeners.get(queueId)
  if (set && set.size > 0) {
    for (const listener of Array.from(set)) {
      try {
        listener(event)
      } catch {
        // ignore
      }
    }
  }
  emitLiveEvent(liveProgressChannel(queueId), event)
}
