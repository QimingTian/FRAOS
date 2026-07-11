import Link from 'next/link'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { JsonLd } from '@/components/seo/JsonLd'
import { ASC } from '@/lib/site-config'
import { buildPageMetadata, organizationJsonLd } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'ASC — All Sky Camera by Borean Astro',
  description:
    'ASC (All Sky Camera) is Borean Astro\'s networked all-sky imaging system for weather-aware observatory operations. Product pages coming soon.',
  path: '/asc',
  keywords: [
    'all sky camera',
    'observatory weather camera',
    'all-sky imaging',
    'ASC Borean Astro',
  ],
})

export default function AscPage() {
  return (
    <>
      <JsonLd data={[organizationJsonLd()]} />
      <section className="page-shell-narrow py-20 text-center md:py-28">
        <StaggerEntrance>
          <p data-stagger className="label-caps">
            {ASC.name}
          </p>
          <h1 data-stagger className="mt-4 font-display text-5xl font-bold text-fg md:text-6xl">
            {ASC.fullName}
          </h1>
          <p data-stagger className="mt-8 text-lg leading-relaxed text-muted">
            {ASC.summary}
          </p>
          <p data-stagger className="mt-6 text-sm text-muted/80">
            Detailed product pages and purchase options are in development.
          </p>
        </StaggerEntrance>
        <ScrollReveal className="mt-12">
          <Link href="/fraos" className="text-link text-sm">
            Explore FRAOS while ASC launches →
          </Link>
        </ScrollReveal>
      </section>
    </>
  )
}
