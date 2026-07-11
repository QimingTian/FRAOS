export const DEFAULT_OBS_LAT = Number(
  process.env.BOREAN_DEFAULT_LAT ?? process.env.HUB_OBS_LAT ?? '0'
)
export const DEFAULT_OBS_LON = Number(
  process.env.BOREAN_DEFAULT_LON ?? process.env.HUB_OBS_LON ?? '0'
)
