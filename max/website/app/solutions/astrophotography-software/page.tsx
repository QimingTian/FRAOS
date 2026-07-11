import Link from 'next/link'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildPageMetadata, breadcrumbJsonLd, organizationJsonLd } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'Astrophotography & Astronomy Software — FRAOS',
  description:
    'Professional astronomy software for deep-sky imaging: target scheduling, Atlas sky charts, weather integration, NINA remote control, session queue, and cloud storage — built for remote observatories.',
  path: '/solutions/astrophotography-software',
  keywords: [
    'astronomy software',
    'astrophotography software',
    'telescope control software',
    'deep sky imaging software',
    'NINA remote software',
    'observatory scheduling software',
  ],
})

const FEATURES = [
  'Interactive Atlas with day/night sky modes and target search (NGC, Messier, IC)',
  'Tonight schedule strip with weather-permitted hours and twilight boundaries',
  'Session queue with deep-sky and variable-star workflows',
  'LRGB and narrowband filter plans with per-filter exposure counts',
  'Project Mode for multi-night target completion',
  'Live 3D mount and dome telemetry in the remote console',
  'Imaging Dashboard with session progress, previews, and sensor temperature',
  'Integrated weather gates for cloud, rain, and wind',
  '10–50 GB cloud storage depending on plan',
  'Over-the-air updates for Control Client and Station',
] as const

export default function AstrophotographySoftwarePage() {
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Solutions', path: '/solutions/astrophotography-software' },
            { name: 'Astronomy Software', path: '/solutions/astrophotography-software' },
          ]),
        ]}
      />
      <section className="page-shell py-20 md:py-28">
        <StaggerEntrance>
          <p data-stagger className="label-caps">
            Solutions
          </p>
          <h1 data-stagger className="mt-4 max-w-4xl font-display text-5xl font-bold text-fg md:text-6xl">
            Astronomy software built for remote observatories
          </h1>
          <p data-stagger className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
            Generic planetarium apps and desktop remote-desktop tools were not designed for unattended
            imaging. FRAOS is astronomy software that connects scheduling, automation, weather, and
            safety into one remote console — so your observatory keeps working through the night.
          </p>
        </StaggerEntrance>

        <ScrollReveal className="mt-16">
          <h2 className="font-display text-2xl font-semibold text-fg">What FRAOS includes</h2>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm text-muted">
                <span className="text-accent">✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </ScrollReveal>

        <ScrollReveal className="mt-16 max-w-3xl space-y-4 text-base leading-relaxed text-muted">
          <p>
            Borean Control Client runs on your Mac or Windows laptop. Borean Station runs on the
            observatory PC alongside NINA. Together they form a complete astrophotography software
            stack for operators who need reliability more than flashy demos.
          </p>
          <p>
            Whether you image from a suburban roll-off roof or a remote dark-sky site, FRAOS gives
            you the same operational picture: what is scheduled tonight, what is running now, and
            whether the sky is still clear enough to continue.
          </p>
        </ScrollReveal>

        <ScrollReveal className="mt-12 flex flex-wrap gap-4">
          <Link href="/fraos" className="btn-primary">
            Explore FRAOS
          </Link>
          <Link href="/solutions/remote-observatory" className="btn-secondary">
            Remote observatory solutions
          </Link>
        </ScrollReveal>
      </section>
    </>
  )
}
