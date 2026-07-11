/** Desktop/iOS Safari — liquidGL/html2canvas snapshot is unreliable; use CSS header glass. */
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg/i.test(ua)
}
