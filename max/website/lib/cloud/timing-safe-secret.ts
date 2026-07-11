import { timingSafeEqual } from 'node:crypto'

/**
 * Timing-safe comparison for secrets.
 *
 * Compares two strings in constant time to prevent timing attacks. Returns
 * false immediately if lengths differ (the comparison itself is still
 * constant-time for the common-length case).
 */
export function timingSafeSecretCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Validates a bearer token from the Authorization header against an expected
 * secret using timing-safe comparison.
 */
export function validateBearerSecret(
  authHeader: string | null,
  expectedSecret: string
): boolean {
  if (!authHeader || !expectedSecret) return false
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!bearer) return false
  return timingSafeSecretCompare(bearer, expectedSecret)
}
