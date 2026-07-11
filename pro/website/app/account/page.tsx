'use client'

import { AdminAccountDashboard } from '@/app/account/admin-account-dashboard'
import { MemberAccountDashboard } from '@/app/account/member-account-dashboard'
import { MemberAuthPanel } from '@/components/member-auth-panel'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import { useMember } from '@/hooks/use-member'

export default function AccountPage() {
  const member = useMember()

  if (member.status === 'loading') {
    return (
      <section className="page-shell py-16 md:py-20">
        <p className="text-muted">Loading…</p>
      </section>
    )
  }

  if (member.status === 'guest') {
    return (
      <section className="page-shell-narrow py-16 md:py-20">
        <StaggerEntrance>
          <div data-stagger>
            <MemberAuthPanel
              onSignedIn={(user) => {
                if (user) member.completeSignIn(user)
                else void member.refresh()
              }}
            />
          </div>
        </StaggerEntrance>
      </section>
    )
  }

  const { user } = member
  if (member.isAdmin) {
    return (
      <section className="page-shell py-12 md:py-16">
        <AdminAccountDashboard user={user} />
      </section>
    )
  }

  return (
    <section className="page-shell py-12 md:py-16">
      <MemberAccountDashboard user={user} />
    </section>
  )
}
