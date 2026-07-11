import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Log In',
  description: 'Sign in to your Borean Astro account.',
  path: '/login',
  noIndex: true,
})

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
