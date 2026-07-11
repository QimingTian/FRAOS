export type ProductPlan = 'standard' | 'pro' | 'max' | 'ultra'

export type PlanAvailability = 'available' | 'coming-soon'

export const PRODUCT_PLANS: ProductPlan[] = ['standard', 'pro', 'max', 'ultra']

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://YOUR_DOMAIN'

export const FRAOS_GITHUB_URL = 'https://github.com/QimingTian/FRAOS'

export const FRAOS = {
  name: 'FRAOS',
  fullName: 'Fully Remote Automated Observatory System',
  /** Shared intro — homepage card and FRAOS hero. */
  homeSummary:
    'The intelligent operating system for unattended remote observatories — advanced scheduling algorithms, closed-loop automation, and a private cloud hub for every site. No VPN, no screen sharing: just two apps.',
  openSource: {
    eyebrow: 'Open source',
    title: 'Build it yourself — or let Borean Astro run it',
    body:
      'FRAOS source is public on GitHub. Self-host Control, Station, and the cloud hub, and configure R2, Astrometry, storage, billing, and every other integration yourself.',
    contrast:
      'Licensed editions from Borean Astro are the same software — we handle cloud setup, keys, hosting, and ongoing configuration so you can image instead of ops.',
  },
} as const

export const ASC = {
  name: 'ASC',
  fullName: 'All Sky Camera',
  summary: 'Networked all-sky imaging for weather-aware observatory operations. Product pages coming soon.',
} as const

export const PLANS: Record<
  ProductPlan,
  {
    name: string
    shortName: string
    tagline: string
    tierBlurb: string
    headline: string
    price: string
    period: string
    availability: PlanAvailability
    features: string[]
    highlights: Array<{ title: string; body: string }>
  }
> = {
  standard: {
    name: 'FRAOS Standard',
    shortName: 'Standard',
    tagline: 'One telescope · one operator.',
    tierBlurb:
      'The full intelligent stack for a solo remote imager — one pier, one private hub, Control anywhere plus Station on the observatory PC.',
    headline: 'Your backyard observatory, always within reach.',
    price: 'Starting from $15',
    period: 'per month',
    availability: 'available',
    features: [
      'Borean Control Client (Windows / macOS)',
      'Borean Station + NINA agent (Windows)',
      'Dedicated cloud hub on www.boreanastro.com',
      'Remote scheduling & session queue',
      '10 GB online storage included',
      'In-app OTA updates for Control Client and Station',
    ],
    highlights: [
      {
        title: 'Control from anywhere',
        body: 'Plan targets, check weather, queue sessions, and monitor status from Control Client — whether you are at home or traveling.',
      },
      {
        title: 'Station on the observatory PC',
        body: 'Borean Station runs the NINA agent, system diagnostics, and one-click setup for Python, autostart, and updates on Windows.',
      },
      {
        title: 'Your own cloud hub',
        body: 'Every license embeds a tenant on Borean Astro cloud. Your installer connects only to your hub — not a shared account.',
      },
    ],
  },
  pro: {
    name: 'FRAOS Pro',
    shortName: 'Pro',
    tagline: 'One telescope · your team.',
    tierBlurb:
      'Same automation for one shared observatory — your whole team on one pier, with roles and a single team hub for clubs and schools.',
    headline: 'Share one observatory safely across operators.',
    price: 'Starting from $49',
    period: 'per month',
    availability: 'coming-soon',
    features: [
      'Everything in FRAOS Standard',
      'Unlimited team members with role-based permissions',
      'Operator vs admin roles for night sessions',
      'Shared session queue with accountability',
      'Team cloud hub on www.boreanastro.com',
      '100 GB included cloud storage',
    ],
    highlights: [
      {
        title: 'Built for clubs and schools',
        body: 'Give members remote access to one club observatory without sharing passwords or mixing personal data.',
      },
      {
        title: 'Roles that match real operations',
        body: 'Admins configure the system; operators queue targets and monitor sessions — clear separation for safe handoffs.',
      },
      {
        title: 'One rig, many people',
        body: 'Add as many operators as your club or school needs — one shared pier, one hub, no per-seat cap.',
      },
    ],
  },
  max: {
    name: 'FRAOS Max',
    shortName: 'Max',
    tagline: 'Multiple telescopes · one operator.',
    tierBlurb:
      'Run as many remote sites as you need from one owner account — a dedicated hub per observatory and cross-site visibility in Control.',
    headline: 'Run every site from a single account.',
    price: 'Starting from $99',
    period: 'per month',
    availability: 'coming-soon',
    features: [
      'Everything in FRAOS Standard',
      'Multi-site dashboard under one owner account',
      'Add sites anytime — dedicated cloud hub per observatory',
      '50 GB cloud storage per site',
      'Cross-site visibility in Control Client',
      'Priority email support',
    ],
    highlights: [
      {
        title: 'Home plus remote dark sites',
        body: 'Manage backyard and remote observatories from one login — each site keeps its own tenant and credentials.',
      },
      {
        title: 'Scale sites, not seats',
        body: 'Designed for advanced imagers who operate multiple rigs solo. Pay for observatories, not operator headcount.',
      },
      {
        title: 'Cloud that grows with you',
        body: 'Each site provisions its own hub and storage — add observatories whenever you expand, with no site cap.',
      },
    ],
  },
  ultra: {
    name: 'FRAOS Ultra',
    shortName: 'Ultra',
    tagline: 'Multiple telescopes · your organization.',
    tierBlurb:
      'Observatory networks at scale — many sites and many teams under one organization, with enterprise roles, audit, and onboarding.',
    headline: 'Operate observatory networks at scale.',
    price: 'Custom',
    period: 'contact sales',
    availability: 'coming-soon',
    features: [
      'Everything in FRAOS Pro and Max',
      'Organization dashboard across all sites',
      'Enterprise role-based access & audit',
      'Priority support & SLA',
      'Custom branding & white-label options',
      'Dedicated onboarding & migration',
    ],
    highlights: [
      {
        title: 'Multi-site, multi-team',
        body: 'Run several observatories with distinct operator groups — unified visibility without mixing customer data.',
      },
      {
        title: 'Enterprise operations',
        body: 'Separate admin and operator access so teams can run night sessions safely with clear accountability.',
      },
      {
        title: 'Built for institutions',
        body: 'Priority onboarding, SLA-backed support, and optional white-label branding for clubs, schools, and commercial sites.',
      },
    ],
  },
}

export function planLabel(plan: ProductPlan): string {
  return PLANS[plan].shortName
}

export function planIsPurchasable(plan: ProductPlan): boolean {
  return PLANS[plan].availability === 'available'
}
