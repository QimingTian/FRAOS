/** Client-safe ESTOP display helpers (no server imports). */

export function emergencyStopActorLabel(input: {
  requestedBy?: string | null
  requestedByEmail?: string | null
  requestedByUsername?: string | null
}): string {
  const by = typeof input.requestedBy === 'string' ? input.requestedBy.trim() : ''
  if (by && by.toLowerCase() !== 'admin') return by
  const email = typeof input.requestedByEmail === 'string' ? input.requestedByEmail.trim() : ''
  if (email) return email
  const username =
    typeof input.requestedByUsername === 'string' ? input.requestedByUsername.trim() : ''
  if (username && username.toLowerCase() !== 'admin') return username
  return by || 'unknown operator'
}
