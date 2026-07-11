import type { MetadataRoute } from 'next'
import { PUBLIC_SITEMAP_PATHS, absoluteUrl } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency: path === '/fraos' ? 'weekly' : 'monthly',
    priority: path === '/fraos' ? 1 : path.startsWith('/fraos/') ? 0.9 : 0.7,
  }))
}
