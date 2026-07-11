import { emitLiveEvent, livePreviewChannel } from './live-bus.js'

type Listener = (updatedAt: string) => void

const listeners = new Map<string, Set<Listener>>()

export function subscribePreview(queueId: string, listener: Listener): () => void {
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

export function publishPreview(queueId: string, updatedAt: string): void {
  const set = listeners.get(queueId)
  if (set && set.size > 0) {
    for (const listener of Array.from(set)) {
      try {
        listener(updatedAt)
      } catch {
        // ignore
      }
    }
  }
  emitLiveEvent(livePreviewChannel(queueId), { type: 'updated', updatedAt })
}
