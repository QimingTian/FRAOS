/** DSO / multi-night project: sum(exposure × frames) + this overhead for scheduling and ETA. */
export const DSO_SESSION_OVERHEAD_SEC = 30 * 60

/** Variable star: total = (N × 0.5 h block) + this overhead. */
export const VARIABLE_STAR_SESSION_OVERHEAD_SEC = 20 * 60

export const VARIABLE_STAR_SESSION_OVERHEAD_HOURS = VARIABLE_STAR_SESSION_OVERHEAD_SEC / 3600

// Borean Astro no longer offers stacked master output (formerly required 600s exposures).
// export const STACKED_MASTER_REQUIRED_EXPOSURE_SECONDS = 600
