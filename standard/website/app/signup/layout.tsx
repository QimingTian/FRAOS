import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Sign Up',
  description: 'Create a Borean Astro account.',
  path: '/signup',
  noIndex: true,
})

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
