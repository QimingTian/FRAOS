import type { Metadata } from 'next'
import { LiquidGlassProvider } from '@/components/LiquidGlassProvider'
import { SiteHeader } from '@/components/SiteHeader'
import { MemberProvider } from '@/hooks/use-member'
import { SEO, absoluteUrl } from '@/lib/seo'
import { SITE_URL } from '@/lib/site-config'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SEO.defaultTitle,
    template: '%s | Borean Astro',
  },
  description: SEO.defaultDescription,
  keywords: [...SEO.keywords],
  applicationName: SEO.siteName,
  category: 'technology',
  alternates: { canonical: absoluteUrl('/fraos') },
  openGraph: {
    type: 'website',
    locale: SEO.locale,
    url: absoluteUrl('/fraos'),
    siteName: SEO.siteName,
    title: SEO.defaultTitle,
    description: SEO.defaultDescription,
    images: [{ url: absoluteUrl(SEO.ogImage), width: 1200, height: 630, alt: SEO.siteName }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO.defaultTitle,
    description: SEO.defaultDescription,
    images: [absoluteUrl(SEO.ogImage)],
  },
  icons: {
    icon: [{ url: '/brand/borean-logo.png', type: 'image/png' }],
    apple: [{ url: '/brand/borean-logo.png', type: 'image/png' }],
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var u=navigator.userAgent;if(/Safari/i.test(u)&&!/Chrome|Chromium|CriOS|Edg/i.test(u)){document.documentElement.classList.add('liquid-gl-safari');document.body.classList.add('liquid-gl-safari','liquid-gl-fallback');window.__liquidGLHeaderInit__=true;}catch(e){}})();`,
          }}
        />
        <LiquidGlassProvider />
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
