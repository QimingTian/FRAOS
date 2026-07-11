const DEFAULT_CONTENT_BASE = 'https://www.boreanastro.com'

/** APIs for maps, weather proxies, plate-solve — hosted on boreanastro.com (CORS *). */
export function getContentBaseUrl(): string {
  return DEFAULT_CONTENT_BASE
}

export function contentApiPath(path: string): string {
  const base = getContentBaseUrl()
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
