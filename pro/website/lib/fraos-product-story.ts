import type { ProductPlan } from '@/lib/site-config'

export type StoryNavItem = {
  id: string
  label: string
}

export type StoryFeature = {
  title: string
  body: string
}

export type FaqItem = {
  question: string
  answer: string
}

export const MEDIA = {
  remote: '/media/fraos/remote.png',
  createSession: '/media/fraos/create-session.png',
  atlas: '/media/fraos/atlas.png',
  atlasNight: '/media/fraos/atlas-night.png',
  weather: '/media/fraos/weather.png',
  station: '/media/fraos/station.png',
  logoFull: '/media/fraos/borean-logo-full.png',
} as const

export const FRAOS_STORY_NAV: StoryNavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'apps', label: 'Two apps' },
  { id: 'plan', label: 'Plan' },
  { id: 'execute', label: 'Automate' },
  { id: 'sky', label: 'Atlas' },
  { id: 'night', label: 'Night mode' },
  { id: 'weather', label: 'Weather' },
  { id: 'station', label: 'Station' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'faq', label: 'FAQ' },
]

/** Bullets revealed beside the pinned Remote console screenshot. */
export const PLAN_PINNED_FEATURES: StoryFeature[] = [
  {
    title: 'Tonight\'s schedule',
    body: 'Sunset to sunrise on one strip. Weather-permitted hours, twilight boundaries, and every scheduled session block — at a glance.',
  },
  {
    title: 'Current sessions',
    body: 'Pending, scheduled, in progress, completed, failed. Check progress, edit, or delete any row without leaving the console.',
  },
  {
    title: 'Live telescope status',
    body: 'A 3D view of your mount and dome, with connection and tracking state updating in real time.',
  },
  {
    title: 'One safety switch',
    body: 'Emergency STOP halts the sequence and parks the rig instantly — from anywhere you happen to be.',
  },
]

export const CREATE_SESSION_FEATURES: StoryFeature[] = [
  {
    title: 'Deep-sky or variable-star',
    body: 'Pick a workflow. Search NGC, Messier, IC, or named targets and let coordinates fill themselves in.',
  },
  {
    title: 'Filters and frames',
    body: 'Build LRGB and SHO filter rows with per-filter exposure and frame counts. Raw ZIP uploads to your included cloud storage when the session completes.',
  },
  {
    title: 'Project Mode',
    body: 'Turn one ambitious target into a multi-night project. The plan picks up clear nights until every frame is collected.',
  },
]

export const EXECUTE_FEATURES: StoryFeature[] = [
  {
    title: 'Weather-aware placement',
    body: 'Cloud, rain, and wind gates keep sessions off the timeline when the forecast fails. Closed dome? Queue until ready.',
  },
  {
    title: 'Altitude & timing',
    body: 'The scheduler waits for targets to clear the horizon, finds the first viable window, and tells you why.',
  },
  {
    title: 'Moon avoidance',
    body: 'Broadband LRGB respects lunar separation. Narrowband keeps shooting when the Moon is up.',
  },
]

export const ATLAS_CHIPS = [
  'Ground',
  'Atmosphere',
  'Deep sky',
  'DSS imagery',
  'Azimuthal grid',
  'Equatorial grid',
  'Alt 30°',
  'Orbit',
] as const

export const ATLAS_FEATURES: StoryFeature[] = [
  {
    title: 'A real sky, rendered',
    body: 'Pan and zoom a live Stellarium engine with horizon, atmosphere, planets, and the Milky Way.',
  },
  {
    title: 'Your field of view',
    body: 'Overlay the exact frame your rig captures — rotated for field angle, so framing previews are honest.',
  },
  {
    title: 'Send to Remote',
    body: 'Find a target, then open a new session with its name, RA, and Dec already filled in.',
  },
]

export const WEATHER_FEATURES: StoryFeature[] = [
  {
    title: 'Tonight at a glance',
    body: 'Temperature, humidity, cloud, wind, and the Moon — the night\'s headline numbers up top.',
  },
  {
    title: 'Hour-by-hour grid',
    body: 'Cloud, wind, precipitation, transparency, and seeing scored green to red across the dark hours.',
  },
  {
    title: 'Radar & satellite',
    body: 'Live precipitation radar beside NOAA GOES cloud imagery, centered on your observatory.',
  },
]

export const STATION_FEATURES: StoryFeature[] = [
  {
    title: 'NINA integration',
    body: 'The Windows agent watches your hub queue, builds the sequence, and starts NINA when a session is due.',
  },
  {
    title: 'Live progress',
    body: 'Terminal log and the latest preview frame stream back to Control — no remote desktop required.',
  },
  {
    title: 'System checks',
    body: 'Hub reachability, agent heartbeat, and observatory status, surfaced where you can act on them.',
  },
  {
    title: 'In-app updates',
    body: 'OTA delivery keeps Control Client and Station current without hunting for installers.',
  },
]

export const CLOUD_FEATURES: StoryFeature[] = [
  {
    title: 'Dedicated tenant',
    body: 'Provisioning creates your hub URL and credentials. Control and Station authenticate only to you.',
  },
  {
    title: 'Download anywhere',
    body: 'Finished Raw ZIP sessions land in your site storage. Download from Control whenever you need them — no trip to the observatory PC.',
  },
  {
    title: '10 GB included',
    body: 'Each observatory site includes 10 GB of online storage. Files stay until you delete them in Settings.',
  },
]

const STORAGE_LINE: Record<ProductPlan, string> = {
  standard: '10 GB online storage included with your site.',
  pro: '100 GB included cloud storage per site.',
  max: '50 GB included cloud storage per observatory site.',
  ultra: 'Contract storage and SLA — tailored to your organization.',
}

export function fraosStorageLine(plan: ProductPlan): string {
  return STORAGE_LINE[plan]
}

export type TierDeltaContent = {
  headline: string
  body: string
  bullets: string[]
}

export const FRAOS_TIER_DELTA: Record<ProductPlan, TierDeltaContent> = {
  standard: {
    headline: 'One pier. One operator.',
    body: 'The full intelligent stack for a solo remote imager.',
    bullets: [
      'Complete Control + Station + cloud hub workflow',
      'Private tenant on www.boreanastro.com',
      'Starting from $15 per month',
    ],
  },
  pro: {
    headline: 'One pier. Your whole team.',
    body: 'Share one observatory safely — unlimited members, roles, and included storage.',
    bullets: [
      'Unlimited team members with role-based access',
      'Operator vs admin separation for night sessions',
      '100 GB included cloud storage',
    ],
  },
  max: {
    headline: 'Every site. One login.',
    body: 'Operate every observatory you own from a single Control account.',
    bullets: [
      'Add sites anytime — dedicated hub per pier',
      'Cross-site visibility in Control Client',
      'No cap on how many sites you run',
    ],
  },
  ultra: {
    headline: 'Your organization. Every observatory.',
    body: 'Institution-scale operations across sites and teams.',
    bullets: [
      'Organization dashboard and enterprise RBAC',
      'Audit log and priority SLA support',
      'Custom onboarding, branding, and migration',
    ],
  },
}

export const FRAOS_SHARED_FAQ: FaqItem[] = [
  {
    question: 'Do I need a VPN?',
    answer:
      'No. Control Client talks to your dedicated cloud hub over HTTPS, and Station at the observatory does the same. There is no VPN or screen sharing.',
  },
  {
    question: 'Which apps run where?',
    answer:
      'Control Client runs on macOS or Windows — anywhere you plan and monitor. Borean Station runs on the observatory PC (Windows) and drives NINA locally.',
  },
  {
    question: 'How does FRAOS relate to NINA?',
    answer:
      'FRAOS does not replace NINA. Station delivers sequences and monitors execution through the NINA workflow you already use.',
  },
  {
    question: 'What is Project Mode?',
    answer:
      'A multi-night deep-sky project under one queue row. Each clear night runs Session 1, Session 2, and so on until all frames are collected.',
  },
  {
    question: 'What happens when the weather is bad?',
    answer:
      'The scheduler can hold a session as Pending, reject it if no slot fits while the dome is open, or wait until forecast gates pass. You can also queue while the dome is closed.',
  },
  {
    question: 'How long are files kept?',
    answer:
      'Raw ZIP files stay in your site storage until you delete them in Control Client Settings. Each Standard site includes 10 GB.',
  },
  {
    question: 'Can Station run on Mac?',
    answer:
      'Station is Windows-only because it integrates with NINA on the observatory PC. Control Client is available on macOS and Windows.',
  },
  {
    question: 'How do I update the apps?',
    answer:
      'Control Client and Station support in-app OTA updates whenever a new release is published to your hub.',
  },
]

const TIER_FAQ: Record<ProductPlan, FaqItem[]> = {
  standard: [
    {
      question: 'How is Standard different from Pro?',
      answer:
        'Standard is built for one operator and one pier. Pro adds unlimited team members, roles, and more included cloud storage on the same single observatory.',
    },
  ],
  pro: [
    {
      question: 'Is there a limit on team size?',
      answer:
        'No. Pro supports as many operators as your club or school needs on one shared pier — with admin and operator roles.',
    },
  ],
  max: [
    {
      question: 'Is there a limit on observatory sites?',
      answer:
        'No. Add as many remote sites as you need. Each site gets its own cloud hub and credentials under your owner account.',
    },
  ],
  ultra: [
    {
      question: 'How do I purchase Ultra?',
      answer:
        'Ultra is sold through annual contracts with custom onboarding. Contact sales when you are ready to discuss organization-wide deployment.',
    },
  ],
}

export function fraosFaqForPlan(plan: ProductPlan): FaqItem[] {
  return [...FRAOS_SHARED_FAQ, ...TIER_FAQ[plan]]
}
