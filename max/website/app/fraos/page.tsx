import { FraosEditionPanel } from '@/components/FraosEditionPanel'
import { FraosOpenSourceBanner } from '@/components/FraosOpenSourceBanner'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { JsonLd } from '@/components/seo/JsonLd'
import { FRAOS, PRODUCT_PLANS } from '@/lib/site-config'
import { FRAOS_PRODUCT_DESCRIPTION, buildPageMetadata, organizationJsonLd, websiteJsonLd } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'FRAOS — Fully Remote Automated Observatory System',
  description: FRAOS_PRODUCT_DESCRIPTION,
  path: '/fraos',
  keywords: [
    'FRAOS',
    'remote observatory software',
    'automated observatory system',
    'telescope scheduling',
    'NINA remote control',
    'observatory cloud hub',
  ],
})

export default function FraosPage() {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <section className="page-shell pb-8 pt-20 text-center md:pt-28">
        <StaggerEntrance>
          <h1
            data-stagger
            className="font-display text-5xl font-bold tracking-tight text-fg md:text-6xl"
          >
            {FRAOS.name}
          </h1>
          <p data-stagger className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            {FRAOS.fullName}
          </p>
          <p data-stagger className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted/90">
            {FRAOS.homeSummary}
          </p>
        </StaggerEntrance>
      </section>

      <section className="page-shell pb-24 pt-8 md:pb-32">
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {PRODUCT_PLANS.map((plan, index) => (
            <ScrollReveal key={plan} delay={(index % 2) * 0.08} className="h-full">
              <FraosEditionPanel plan={plan} />
            </ScrollReveal>
          ))}
        </div>
        <ScrollReveal delay={0.12}>
          <FraosOpenSourceBanner />
        </ScrollReveal>
      </section>
    </>
  )
}
