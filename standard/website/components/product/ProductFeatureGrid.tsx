import type { StoryFeature } from '@/lib/fraos-product-story'

type ProductFeatureGridProps = {
  features: StoryFeature[]
  columns?: 3 | 4
}

export function ProductFeatureGrid({ features, columns = 4 }: ProductFeatureGridProps) {
  const colClass = columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
  return (
    <div className={`mt-14 grid gap-8 sm:grid-cols-2 ${colClass} lg:gap-10`}>
      {features.map((feature) => (
        <div key={feature.title} data-reveal-item>
          <h3 className="font-display text-xl font-semibold tracking-tight text-fg">{feature.title}</h3>
          <p className="mt-3 text-base leading-relaxed text-muted">{feature.body}</p>
        </div>
      ))}
    </div>
  )
}
