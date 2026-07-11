import { getDb } from './db.js'

export type ObservatorySite = { lat: number; lon: number; elevationM: number }

export function getObservatorySite(): ObservatorySite {
  const row = getDb()
    .prepare(`SELECT lat, lon, elevation_m FROM observatory_site WHERE id = 1`)
    .get() as { lat?: number; lon?: number; elevation_m?: number } | undefined
  const envLat = process.env.HUB_OBS_LAT
  const envLon = process.env.HUB_OBS_LON
  const lat = row?.lat ?? (envLat != null ? Number(envLat) : 0)
  const lon = row?.lon ?? (envLon != null ? Number(envLon) : 0)
  return {
    lat: Number.isFinite(lat) ? lat : 0,
    lon: Number.isFinite(lon) ? lon : 0,
    elevationM: Number.isFinite(row?.elevation_m) ? Number(row!.elevation_m) : 0,
  }
}

export function setObservatorySite(patch: Partial<ObservatorySite>): void {
  const current = getObservatorySite()
  getDb()
    .prepare(
      `INSERT INTO observatory_site (id, lat, lon, elevation_m) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, elevation_m = excluded.elevation_m`
    )
    .run(
      patch.lat ?? current.lat,
      patch.lon ?? current.lon,
      patch.elevationM ?? current.elevationM
    )
}
