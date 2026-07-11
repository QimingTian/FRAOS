import type { MetadataRoute } from 'next'
import { SEO, absoluteUrl } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SEO.siteName,
    short_name: 'Borean Astro',
    description: SEO.defaultDescription,
    start_url: '/fraos',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#0a0a0f',
    icons: [
      { src: absoluteUrl('/brand/borean-logo.png'), sizes: '512x512', type: 'image/png' },
    ],
  }
}
