import Link from 'next/link'
import { SITE_URL } from '@/lib/site-config'

export function SiteFooter() {
  return (
    <footer className="border-t border-white/15 py-12">
      <div className="page-shell flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-lg font-semibold text-fg">Borean Astro</p>
          <p className="mt-1 text-sm text-muted">Precision tools for remote astronomy.</p>
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-muted">
          <Link href="/fraos" className="hover:text-fg">
            FRAOS
          </Link>
          {/* <Link href="/asc" className="hover:text-fg">
            ASC
          </Link> */}
          <a href={SITE_URL} className="hover:text-fg">
            www.boreanastro.com
          </a>
        </div>
        <p className="text-xs text-muted/70">© {new Date().getFullYear()} Borean Astro. All rights reserved.</p>
      </div>
    </footer>
  )
}
