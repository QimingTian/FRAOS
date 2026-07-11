'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { MemberAuthPanel } from '@/components/member-auth-panel'
import { useMember } from '@/hooks/use-member'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/account'
  const member = useMember()

  if (member.status === 'loading') {
    return <p className="text-muted">Loading…</p>
  }

  if (member.status === 'authenticated') {
    router.replace(next)
    return <p className="text-muted">Redirecting…</p>
  }

  return (
    <MemberAuthPanel
      onSignedIn={() => {
        router.replace(next)
      }}
    />
  )
}

export default function LoginPage() {
  return (
    <section className="page-shell-narrow py-16 md:py-20">
      <Link href="/fraos" className="text-sm text-muted hover:text-fg">
        ← Back to Borean Astro
      </Link>
      <Suspense fallback={<p className="mt-10 text-muted">Loading…</p>}>
        <LoginContent />
      </Suspense>
    </section>
  )
}
