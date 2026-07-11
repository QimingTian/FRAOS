import estopTemplate from '../../EStop.json'
import { SITE_URL } from '@/lib/site-config'

const ESTOP_TEMPLATE = estopTemplate as Record<string, unknown>

function patchEstopHttpPost(root: Record<string, unknown>, tenantId: string, queueId: string): void {
  const progressUrl = `${SITE_URL.replace(/\/+$/, '')}/api/personal/${encodeURIComponent(tenantId)}/imaging/session-progress`
  const body = JSON.stringify({
    text: 'Dome Closed',
    queueId,
    BoreanAstro: { QueueId: queueId, SessionType: 'estop' },
  })

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    const type = rec.$type
    if (typeof type === 'string' && type.includes('HTTP.HttpClient')) {
      rec.HttpUri = progressUrl
      rec.HttpPostBody = body
      rec.HttpPostContentType = 'application/json'
      rec.HttpAuthUsername = ''
      rec.HttpAuthPassword = ''
    }
    for (const value of Object.values(rec)) walk(value)
  }

  walk(root)
}

export function personalEstopSequenceJson(tenantId: string, queueId: string): string {
  const root = structuredClone(ESTOP_TEMPLATE) as Record<string, unknown>
  root.Name = 'Emergency Stop'
  root.BoreanAstro = {
    QueueId: queueId,
    SessionType: 'estop',
    OutputMode: 'none',
    SessionProgressHint:
      'POST to /api/personal/{tenantId}/imaging/session-progress when dome is closed to clear ESTOP.',
  }
  patchEstopHttpPost(root, tenantId, queueId)
  return JSON.stringify(root, null, 2)
}
