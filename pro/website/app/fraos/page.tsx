import { FraosEditionPanel } from '@/components/FraosEditionPanel'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { FRAOS, PRODUCT_PLANS } from '@/lib/site-config'

export const metadata = {
  title: 'FRAOS — Borean Astro',
  description: FRAOS.homeSummary,
}

export default function FraosPage() {
  return (
    <>
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
      </section>
    </>
  )
}
