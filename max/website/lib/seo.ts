import type { Metadata } from 'next'
import { fraosFaqForPlan } from '@/lib/fraos-product-story'
import { FRAOS, PLANS, PRODUCT_PLANS, SITE_URL, type ProductPlan } from '@/lib/site-config'

export const SEO = {
  siteName: 'Borean Astro',
  defaultTitle: 'Borean Astro — Remote Observatory Software & FRAOS',
  defaultDescription:
    'Borean Astro builds FRAOS — the fully remote automated observatory system. Control telescopes, schedule imaging sessions, and monitor weather from anywhere. Astronomy software for solo imagers, clubs, schools, and multi-site operators.',
  tagline: 'Precision tools for remote astronomy.',
  locale: 'en_US',
  twitterHandle: '@boreanastro',
  ogImage: '/media/fraos/remote.png',
  logo: '/brand/borean-logo-light.png',
  keywords: [
    'Borean Astro',
    'FRAOS',
    'remote observatory',
    'remote observatory software',
    'automated observatory',
    'observatory automation',
    'astronomy software',
    'astrophotography software',
    'telescope remote control',
    'NINA remote',
    'observatory scheduling',
    'cloud observatory hub',
    'remote telescope control',
    'observatory management',
  ],
} as const

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildPageMetadata(input: {
  title: string
  description: string
  path: string
  ogImage?: string
  keywords?: string[]
  noIndex?: boolean
}): Metadata {
  const url = absoluteUrl(input.path)
  const image = absoluteUrl(input.ogImage ?? SEO.ogImage)
  const title = input.title.includes('Borean Astro') ? input.title : `${input.title} | Borean Astro`

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords ?? [...SEO.keywords],
    alternates: { canonical: url },
    robots: input.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: SEO.locale,
      url,
      siteName: SEO.siteName,
      title,
      description: input.description,
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: input.description,
      images: [image],
    },
  }
}

export function tierPageMetadata(plan: ProductPlan): Metadata {
  const product = PLANS[plan]
  const description = `${product.tierBlurb} ${product.headline}`.slice(0, 320)
  return buildPageMetadata({
    title: `${product.name} — Remote Observatory Software`,
    description,
    path: `/fraos/${plan}`,
    keywords: [
      ...SEO.keywords,
      product.name,
      product.tagline,
      `${product.shortName} observatory plan`,
    ],
  })
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SEO.siteName,
    url: SITE_URL,
    logo: absoluteUrl(SEO.logo),
    description: SEO.defaultDescription,
    sameAs: [],
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SEO.siteName,
    url: SITE_URL,
    description: SEO.defaultDescription,
    publisher: { '@type': 'Organization', name: SEO.siteName },
  }
}

export function softwareApplicationJsonLd(plan: ProductPlan) {
  const product = PLANS[plan]
  const purchasable = product.availability === 'available'
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: product.name,
    applicationCategory: 'AstronomyApplication',
    operatingSystem: 'Windows, macOS',
    description: `${product.tierBlurb} ${product.headline}`,
    url: absoluteUrl(`/fraos/${plan}`),
    offers: purchasable
      ? {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: product.price.replace(/[^0-9.]/g, '') || '0',
          description: `${product.price} ${product.period}`,
          url: absoluteUrl(`/checkout?plan=${plan}`),
        }
      : undefined,
    featureList: product.features,
    provider: { '@type': 'Organization', name: SEO.siteName, url: SITE_URL },
  }
}

export function faqPageJsonLd(plan: ProductPlan) {
  const items = fraosFaqForPlan(plan)
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export const PUBLIC_SITEMAP_PATHS = [
  '/fraos',
  '/fraos/standard',
  '/fraos/pro',
  '/fraos/max',
  '/fraos/ultra',
  '/asc',
  '/solutions/remote-observatory',
  '/solutions/astrophotography-software',
  '/solutions/observatory-automation',
] as const

export const PRODUCT_PLAN_PATHS = PRODUCT_PLANS.map((plan) => `/fraos/${plan}` as const)

export const FRAOS_PRODUCT_DESCRIPTION = FRAOS.homeSummary
