import Link from 'next/link'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildPageMetadata, breadcrumbJsonLd, organizationJsonLd } from '@/lib/seo'

export const metadata = buildPageMetadata({
  title: 'Remote Observatory Solutions — FRAOS by Borean Astro',
  description:
    'Run a fully remote automated observatory without VPN or screen sharing. FRAOS provides cloud-backed telescope control, weather-aware scheduling, NINA automation, and emergency stop for unattended imaging.',
  path: '/solutions/remote-observatory',
  keywords: [
    'remote observatory solution',
    'remote observatory system',
    'automated remote telescope',
    'unattended observatory',
    'observatory remote access',
  ],
})

const CAPABILITIES = [
  {
    title: 'Control from anywhere',
    body: 'Plan targets, monitor mount and dome status, queue sessions, and stop the rig from Control Client on Windows or macOS — at home or traveling.',
  },
  {
    title: 'Station on the observatory PC',
    body: 'Borean Station runs the NINA agent, diagnostics, and autostart on the Windows machine at the pier. Your imaging PC stays on-site; you stay remote.',
  },
  {
    title: 'Private cloud hub per site',
    body: 'Each observatory gets its own tenant on Borean Astro cloud. No shared accounts, no port forwarding, no VPN tunnel to maintain.',
  },
  {
    title: 'Weather-aware automation',
    body: 'Cloud, rain, and wind gates keep sessions off the timeline when conditions fail. Closed dome? The queue waits until the sky clears.',
  },
  {
    title: 'Closed-loop safety',
    body: 'Emergency STOP halts sequences and parks the mount instantly. Role-based access on Pro and Ultra keeps teams accountable.',
  },
  {
    title: 'Works with NINA',
    body: 'FRAOS orchestrates NINA sequences remotely — filter plans, frame counts, project mode across multiple nights, and live progress in the dashboard.',
  },
] as const

export default function RemoteObservatoryPage() {
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Solutions', path: '/solutions/remote-observatory' },
            { name: 'Remote Observatory', path: '/solutions/remote-observatory' },
          ]),
        ]}
      />
      <section className="page-shell py-20 md:py-28">
        <StaggerEntrance>
          <p data-stagger className="label-caps">
            Solutions
          </p>
          <h1 data-stagger className="mt-4 max-w-4xl font-display text-5xl font-bold text-fg md:text-6xl">
            Remote observatory solutions that actually run unattended
          </h1>
          <p data-stagger className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
            FRAOS (Fully Remote Automated Observatory System) is Borean Astro&apos;s answer to the
            hardest problem in astrophotography: operating a telescope reliably when you are not
            standing next to it. Schedule imaging, monitor weather, and intervene safely — from
            anywhere with an internet connection.
          </p>
        </StaggerEntrance>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {CAPABILITIES.map((item, index) => (
            <ScrollReveal key={item.title} delay={index * 0.05}>
              <article className="glass-panel h-full p-6">
                <h2 className="font-display text-xl font-semibold text-fg">{item.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.body}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal className="glass-card mt-16 max-w-3xl p-8">
          <h2 className="font-display text-2xl font-semibold text-fg">Who uses FRAOS?</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            <li>Solo imagers with a backyard observatory or remote dark-sky shed</li>
            <li>Astronomy clubs and schools sharing one pier across many student operators</li>
            <li>Advanced imagers running multiple sites from a single owner account</li>
            <li>Institutions planning multi-site observatory networks (FRAOS Ultra)</li>
          </ul>
        </ScrollReveal>

        <ScrollReveal className="mt-12 flex flex-wrap gap-4">
          <Link href="/fraos/standard" className="btn-primary">
            FRAOS Standard
          </Link>
          <Link href="/fraos/pro" className="btn-secondary">
            FRAOS Pro for teams
          </Link>
          <Link href="/fraos" className="text-link text-sm self-center">
            Compare FRAOS editions →
          </Link>
        </ScrollReveal>
      </section>
    </>
  )
}
