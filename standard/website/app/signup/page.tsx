'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MemberAuthPanel } from '@/components/member-auth-panel'
import { useMember } from '@/hooks/use-member'

export default function SignupPage() {
  const router = useRouter()
  const member = useMember()

  if (member.status === 'loading') {
    return (
      <section className="page-shell-narrow py-16 md:py-20">
        <p className="text-muted">Loading…</p>
      </section>
    )
  }

  if (member.status === 'authenticated') {
    router.replace('/account')
    return (
      <section className="page-shell-narrow py-16 md:py-20">
        <p className="text-muted">Redirecting…</p>
      </section>
    )
  }

  return (
    <section className="page-shell-narrow py-16 md:py-20">
      <Link href="/fraos" className="text-sm text-muted hover:text-fg">
        ← Back to Borean Astro
      </Link>
      <MemberAuthPanel
        initialMode="signup"
        onSignedIn={() => {
          router.replace('/account')
        }}
      />
    </section>
  )
}
