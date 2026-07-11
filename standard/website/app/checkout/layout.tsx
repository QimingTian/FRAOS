import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Checkout',
  description: 'Subscribe to FRAOS.',
  path: '/checkout',
  noIndex: true,
})

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
