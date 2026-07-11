import { personalAuthHeaders, personalTenantApiUrl } from '@shared/tenant-config'
import { loadRuntimeTenant } from '../tenant'
import { readObservatoryCoords } from '../observatory-local-time'

export type SubmitImagingSessionPayload = {
  target: string
  requestName: string
  sessionType: 'dso' | 'variable_star'
  whenClosedBehavior: 'reject' | 'queue_until_ready'
  outputMode: 'raw_zip' | 'none'
  cameraCoolingTempC?: -10 | 0
  projectMode?: boolean
  sessionPassword?: string
  raHours: number
  decDeg: number
  estimatedDurationSeconds?: number
  catalogQuery?: string
  variableStarBlockHours?: number
  filterPlans: Array<{ filterName: string; count: number; exposureSeconds: number }>
}

export type SubmitImagingSessionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function submitImagingSession(
  payload: SubmitImagingSessionPayload
): Promise<SubmitImagingSessionResult> {
  return writeImagingSession('POST', '/imaging/queue', payload)
}

export async function updateImagingSession(
  sessionId: string,
  payload: SubmitImagingSessionPayload
): Promise<SubmitImagingSessionResult> {
  return writeImagingSession(
    'PUT',
    `/imaging/queue/${encodeURIComponent(sessionId)}`,
    payload
  )
}

async function writeImagingSession(
  method: 'POST' | 'PUT',
  path: string,
  payload: SubmitImagingSessionPayload
): Promise<SubmitImagingSessionResult> {
  const tenant = await loadRuntimeTenant()
  const url = personalTenantApiUrl(tenant, path)
  const coords = readObservatoryCoords()
  const firstPlan = payload.filterPlans[0]
  const outputModeForHub = payload.outputMode

  const body = {
    target: payload.target,
    requestName: payload.requestName,
    sessionType: payload.sessionType,
    whenClosedBehavior: payload.whenClosedBehavior,
    outputMode: outputModeForHub,
    outputModeRequested: payload.outputMode,
    cameraCoolingTempC: payload.cameraCoolingTempC,
    projectMode: payload.projectMode === true,
    sessionPassword: payload.sessionPassword?.trim() || undefined,
    raHours: payload.raHours,
    decDeg: payload.decDeg,
    filter: firstPlan?.filterName ?? null,
    exposureSeconds: firstPlan?.exposureSeconds ?? null,
    count: firstPlan?.count ?? null,
    filterPlans: payload.filterPlans,
    estimatedDurationSeconds: payload.estimatedDurationSeconds,
    variableStarBlockHours: payload.variableStarBlockHours,
    catalogQuery: payload.catalogQuery,
    observatoryLat: coords.lat,
    observatoryLon: coords.lon,
    observatoryElevationM: coords.elevationM,
    extendedMetadata: {
      requestName: payload.requestName,
      sessionType: payload.sessionType,
      projectMode: payload.projectMode === true,
      whenClosedBehavior: payload.whenClosedBehavior,
      outputModeRequested: payload.outputMode,
      outputModeSubmitted: outputModeForHub,
      variableStarBlockHours: payload.variableStarBlockHours,
      filterPlanCount: payload.filterPlans.length,
    },
  }

  try {
    const res = await fetch(url, {
      method,
      headers: personalAuthHeaders(tenant, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      request?: { id?: string }
      id?: string
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` }
    }
    const id = typeof data.request?.id === 'string' ? data.request.id : data.id
    if (!id) return { ok: false, error: 'Hub did not return session id.' }
    return { ok: true, id }
  } catch (ex) {
    return { ok: false, error: ex instanceof Error ? ex.message : 'Submit failed' }
  }
}
