import { personalListAuditLog } from '@/lib/cloud/personal-audit-log'

export type SessionProgressLine = { at: string; text: string }

function progressLineText(d: Record<string, unknown>): string {
  const text = typeof d.text === 'string' ? d.text.trim() : ''
  if (text) return text
  const message = typeof d.message === 'string' ? d.message.trim() : ''
  if (message) return message
  return ''
}

function detailMatchesQueue(d: Record<string, unknown>, queueId: string): boolean {
  const q = typeof d.queueId === 'string' ? d.queueId.trim() : ''
  if (q === queueId) return true
  const sub = typeof d.subSessionId === 'string' ? d.subSessionId.trim() : ''
  if (sub === queueId) return true
  return false
}

export async function listSessionProgressLinesFromAudit(
  tenantId: string,
  queueId: string,
  limit = 400
): Promise<SessionProgressLine[]> {
  const entries = await personalListAuditLog(tenantId, limit)
  const matched = entries.filter((e) => {
    if (e.kind !== 'session.progress') return false
    const d =
      e.detail && typeof e.detail === 'object' && !Array.isArray(e.detail)
        ? (e.detail as Record<string, unknown>)
        : {}
    return detailMatchesQueue(d, queueId)
  })
  matched.sort((a, b) => a.at.localeCompare(b.at))
  return matched
    .map((e) => {
      const d =
        e.detail && typeof e.detail === 'object' && !Array.isArray(e.detail)
          ? (e.detail as Record<string, unknown>)
          : {}
      const text = progressLineText(d) || e.message.trim()
      return { at: e.at, text }
    })
    .filter((line) => line.text.length > 0)
}
