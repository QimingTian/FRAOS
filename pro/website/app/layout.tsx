import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { MemberProvider } from '@/hooks/use-member'
import './globals.css'

export const metadata: Metadata = {
  title: 'Borean Astro',
  description:
    'Borean Astro — precision tools for remote astronomy. FRAOS observatory software and ASC all-sky imaging.',
  metadataBase: new URL('https://www.boreanastro.com'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <MemberProvider>
          <div className="relative min-h-screen">
            <SiteHeader />
            <main className="pt-16">{children}</main>
          </div>
        </MemberProvider>
      </body>
    </html>
  )
}
