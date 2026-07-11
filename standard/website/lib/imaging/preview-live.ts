import { emitLiveEvent, livePreviewChannel } from '@/lib/imaging/live-bus'

type Listener = (updatedAt: string) => void

type GlobalWithPreviewLive = typeof globalThis & {
  __borean_imaging_preview_live__?: Map<string, Set<Listener>>
}

function listenersMap(): Map<string, Set<Listener>> {
  const g = globalThis as GlobalWithPreviewLive
  if (!g.__borean_imaging_preview_live__) g.__borean_imaging_preview_live__ = new Map()
  return g.__borean_imaging_preview_live__
}

export function subscribePreview(queueId: string, listener: Listener): () => void {
  const map = listenersMap()
  const set = map.get(queueId) ?? new Set<Listener>()
  set.add(listener)
  map.set(queueId, set)
  return () => {
    const current = map.get(queueId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) map.delete(queueId)
  }
}

export function publishPreview(queueId: string, updatedAt: string): void {
  const set = listenersMap().get(queueId)
  if (set && set.size > 0) {
    for (const listener of Array.from(set)) {
      try {
        listener(updatedAt)
      } catch {
        // ignore listener failures
      }
    }
  }
  void emitLiveEvent(livePreviewChannel(queueId), { type: 'updated', updatedAt })
}
