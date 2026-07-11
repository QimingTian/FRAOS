'use client'

import { AccountInfoSection } from '@/app/account/account-info-section'
import { AccountPageHeader } from '@/app/account/account-page-header'
import { PurchaseHistorySection } from '@/app/account/purchase-history-section'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import type { PublicMemberUser } from '@/lib/member/member-store'

export function MemberAccountDashboard({ user }: { user: PublicMemberUser }) {
  return (
    <StaggerEntrance className="space-y-4 pb-4 sm:pb-8" stagger={0.08}>
      <div data-stagger>
        <AccountPageHeader username={user.username} />
      </div>
      <div data-stagger>
        <AccountInfoSection user={user} />
      </div>
      <div data-stagger>
        <PurchaseHistorySection />
      </div>
    </StaggerEntrance>
  )
}
