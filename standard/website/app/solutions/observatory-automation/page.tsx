import Link from 'next/link'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildPageMetadata, breadcrumbJsonLd, organizationJsonLd } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'Observatory Automation Software — FRAOS',
  description:
    'Automate dome, mount, and imaging sequences with weather-aware scheduling, closed-loop safety, and NINA integration. FRAOS is observatory automation software for unattended remote sites.',
  path: '/solutions/observatory-automation',
  keywords: [
    'observatory automation',
    'telescope automation software',
    'automated dome control',
    'unattended imaging automation',
    'NINA automation',
    'observatory scheduler',
  ],
})

export default function ObservatoryAutomationPage() {
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Solutions', path: '/solutions/observatory-automation' },
            { name: 'Observatory Automation', path: '/solutions/observatory-automation' },
          ]),
        ]}
      />
      <section className="page-shell py-20 md:py-28">
        <StaggerEntrance>
          <p data-stagger className="label-caps">
            Solutions
          </p>
          <h1 data-stagger className="mt-4 max-w-4xl font-display text-5xl font-bold text-fg md:text-6xl">
            Observatory automation from sunset to sunrise
          </h1>
          <p data-stagger className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
            FRAOS automates the operational loop around your telescope: open when conditions allow,
            run NINA sequences on schedule, react to weather changes, and park safely before dawn.
            You set the plan; the observatory executes it.
          </p>
        </StaggerEntrance>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            {
              title: 'Schedule',
              body: 'Build tonight\'s timeline with weather-permitted windows, twilight limits, and ordered session blocks.',
            },
            {
              title: 'Execute',
              body: 'Station drives NINA sequences on the observatory PC while Control shows live progress and telemetry.',
            },
            {
              title: 'Protect',
              body: 'Weather gates pause or skip sessions. Emergency STOP parks the mount immediately from anywhere.',
            },
          ].map((step, index) => (
            <ScrollReveal key={step.title} delay={index * 0.08}>
              <article className="glass-panel h-full p-6">
                <p className="label-caps text-accent">{String(index + 1).padStart(2, '0')}</p>
                <h2 className="mt-2 font-display text-xl font-semibold text-fg">{step.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal className="mt-16 flex flex-wrap gap-4">
          <Link href="/fraos/standard" className="btn-primary">
            Start with FRAOS Standard
          </Link>
          <Link href="/solutions/astrophotography-software" className="btn-secondary">
            Full feature list
          </Link>
        </ScrollReveal>
      </section>
    </>
  )
}
