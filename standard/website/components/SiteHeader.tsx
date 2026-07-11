'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useMember } from '@/hooks/use-member'

gsap.registerPlugin(useGSAP)

const NAV = [{ href: '/fraos', label: 'FRAOS' }] as const

function accountNavLabel(member: ReturnType<typeof useMember>): string {
  if (member.status !== 'authenticated') return 'Log In'
  const user = member.user
  const label = user.username?.trim() || user.email.split('@')[0] || user.email
  return label.toUpperCase()
}

export function SiteHeader() {
  const pathname = usePathname()
  const headerRef = useRef<HTMLElement>(null)
  const member = useMember()

  useGSAP(
    () => {
      const header = headerRef.current
      if (!header) return
      gsap.from(header, { y: -16, duration: 0.55, ease: 'power2.out', delay: 0.1 })
    },
    { scope: headerRef }
  )

  const accountHref = member.status === 'authenticated' ? '/account' : '/login'
  const accountLabel = accountNavLabel(member)
  const accountActive = pathname === '/account' || pathname === '/login' || pathname === '/signup'

  return (
    <header
      ref={headerRef}
      id="site-header"
      className="lg-header fixed inset-x-0 top-0 z-50"
    >
      <div className="header-glass-backdrop" aria-hidden />
      <div className="header-glass-lens" aria-hidden />
      <div className="lg-glass-content page-shell flex h-16 items-center justify-between">
        <Link href="/fraos" className="inline-flex shrink-0 items-center" aria-label="Borean Astro home">
          <Image
            src="/brand/borean-logo-light.png"
            alt="Borean Astro"
            width={1351}
            height={417}
            priority
            className="h-8 w-auto opacity-95 md:h-9"
          />
        </Link>
        <nav className="flex items-center gap-6 text-sm md:gap-10">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative transition ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
              >
                {item.label}
                {active ? (
                  <span className="absolute -bottom-1 left-0 right-0 h-px bg-fg" aria-hidden />
                ) : null}
              </Link>
            )
          })}
          <Link
            href={accountHref}
            className={`relative transition ${accountActive ? 'text-fg' : 'text-muted hover:text-fg'}`}
          >
            {accountLabel}
            {accountActive ? (
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-fg" aria-hidden />
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  )
}
