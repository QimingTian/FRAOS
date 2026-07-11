/** Session delivery mode — shared by Control Client and Station Agent. */
export type SessionOutputMode = 'none' | 'raw_zip'

export const OUTPUT_MODE_LABELS: Record<SessionOutputMode, string> = {
  none: 'Local only (no cloud upload)',
  raw_zip: 'Raw ZIP → cloud storage',
}

/** Personal default when R2 is not configured on the station. */
export const PERSONAL_DEFAULT_OUTPUT_MODE: SessionOutputMode = 'none'
