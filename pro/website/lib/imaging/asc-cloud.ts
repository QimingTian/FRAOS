/** ASC camera status client — URL from env (tenant-configurable). */

export type AscCloudRain = { detected?: boolean }
export type AscCloudInference = {
  cloudCoverPercent?: number | null
  rain?: AscCloudRain | null
  frameIso?: string | null
  modelPhase?: string | null
  lastError?: string | null
}

export function allSkyCameraStatusUrl(streamUrl: string | null | undefined): string | null {
  if (!streamUrl) return null
  try {
    const u = new URL(streamUrl)
    if (/\/camera\//.test(u.pathname)) {
      return new URL('status', streamUrl).href
    }
    return new URL('/status', streamUrl).href
  } catch {
    return null
  }
}

export function configuredAscStatusUrl(): string | null {
  const direct = process.env.HUB_ASC_STATUS_URL?.trim() || process.env.ASC_STATUS_URL?.trim()
  if (direct) return direct
  return allSkyCameraStatusUrl(
    process.env.HUB_ASC_STREAM_URL?.trim() || process.env.ASC_STREAM_URL?.trim() || null
  )
}

type StatusPayload = {
  sensors?: {
    allSkyCam?: {
      ascCloud?: AscCloudInference | null
    }
  }
}

export function parseAscCloudFromStatus(data: unknown): AscCloudInference | null {
  if (!data || typeof data !== 'object') return null
  const ascCloud = (data as StatusPayload).sensors?.allSkyCam?.ascCloud
  if (!ascCloud || typeof ascCloud !== 'object') return null
  return ascCloud
}

export async function fetchAscCloud(statusUrl?: string | null): Promise<AscCloudInference | null> {
  const url = statusUrl ?? configuredAscStatusUrl()
  if (!url) return null
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return parseAscCloudFromStatus((await res.json()) as unknown)
  } catch {
    return null
  }
}
