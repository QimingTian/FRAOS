type ProductChapterHeadingProps = {
  headline: string
  subheadline?: string
  intro?: string
}

export function ProductChapterHeading({ headline, subheadline, intro }: ProductChapterHeadingProps) {
  return (
    <div data-reveal-item className="mx-auto max-w-3xl text-center">
      <h2 className="font-display text-4xl font-bold tracking-tight text-fg md:text-5xl lg:text-6xl">
        {headline}
      </h2>
      {subheadline ? (
        <p className="mt-4 font-display text-xl text-muted md:text-2xl">{subheadline}</p>
      ) : null}
      {intro ? (
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted/90">{intro}</p>
      ) : null}
    </div>
  )
}
