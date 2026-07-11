import Link from 'next/link'
import { FRAOS, FRAOS_GITHUB_URL } from '@/lib/site-config'

export function FraosOpenSourceBanner() {
  const copy = FRAOS.openSource

  return (
    <aside className="glass-card mt-8 w-full px-8 py-10 text-left md:mt-10 md:px-12 md:py-12">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-12">
        <div className="max-w-3xl">
          <p className="label-caps">{copy.eyebrow}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            {copy.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">{copy.body}</p>
          <p className="mt-4 text-base leading-relaxed text-muted/90 md:text-lg">{copy.contrast}</p>
        </div>
        <div className="shrink-0">
          <a
            href={FRAOS_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex px-7 py-2.5 text-sm"
          >
            View on GitHub
          </a>
          <p className="mt-3 text-xs text-muted/70">
            <Link href="/checkout?plan=standard" className="text-link">
              Prefer managed?
            </Link>{' '}
            Start with a licensed edition.
          </p>
        </div>
      </div>
    </aside>
  )
}
