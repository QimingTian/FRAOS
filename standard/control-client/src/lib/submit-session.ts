import { personalAuthHeaders, personalTenantApiUrl } from '@shared/tenant-config'
import type { SessionOutputMode } from '@shared/output-mode'
import { loadRuntimeTenant } from './tenant'

export type SubmitSessionInput = {
  target: string
  outputMode: SessionOutputMode
  raHours?: number | null
  decDeg?: number | null
  filter?: string | null
  exposureSeconds?: number | null
  count?: number | null
}

export type SubmitSessionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function submitSession(input: SubmitSessionInput): Promise<SubmitSessionResult> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, '/imaging/queue')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      request?: { id?: string }
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` }
    }
    const id = data.request?.id
    if (!id) return { ok: false, error: 'Hub did not return session id' }
    return { ok: true, id }
  } catch (ex) {
    return { ok: false, error: ex instanceof Error ? ex.message : 'Submit failed' }
  }
}
