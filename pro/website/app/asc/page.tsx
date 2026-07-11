import Link from 'next/link'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { ASC } from '@/lib/site-config'

export const metadata = {
  title: `${ASC.name} — Borean Astro`,
  description: ASC.fullName,
}

export default function AscPage() {
  return (
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
          Back to FRAOS
        </Link>
      </ScrollReveal>
    </section>
  )
}
