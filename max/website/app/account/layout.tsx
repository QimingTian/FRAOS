import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Account',
  description: 'Manage your Borean Astro subscription and licenses.',
  path: '/account',
  noIndex: true,
})

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children
}
