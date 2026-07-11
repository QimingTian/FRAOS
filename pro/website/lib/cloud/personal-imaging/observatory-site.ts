import { getImagingState } from '@/lib/cloud/personal-imaging/ctx'

export type ObservatorySite = { lat: number; lon: number; elevationM: number }

export function getObservatorySite(): ObservatorySite {
  const site = getImagingState().observatorySite
  const envLat = process.env.HUB_OBS_LAT
  const envLon = process.env.HUB_OBS_LON
  const lat = site.lat || (envLat != null ? Number(envLat) : 0)
  const lon = site.lon || (envLon != null ? Number(envLon) : 0)
  return {
    lat: Number.isFinite(lat) ? lat : 0,
    lon: Number.isFinite(lon) ? lon : 0,
    elevationM: Number.isFinite(site.elevationM) ? site.elevationM : 0,
  }
}

export function setObservatorySite(patch: Partial<ObservatorySite>): void {
  const current = getObservatorySite()
  const state = getImagingState()
  state.observatorySite = {
    lat: patch.lat ?? current.lat,
    lon: patch.lon ?? current.lon,
    elevationM: patch.elevationM ?? current.elevationM,
  }
}
