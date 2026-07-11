'use client'

import { AccountInfoSection } from '@/app/account/account-info-section'
import { AccountPageHeader } from '@/app/account/account-page-header'
import { AllMembersSection } from '@/app/account/all-members-section'
import { AllPurchasesSection } from '@/app/account/all-purchases-section'
import { PromotionCodesSection } from '@/app/account/promotion-codes-section'
import { PurchaseHistorySection } from '@/app/account/purchase-history-section'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { StaggerEntrance } from '@/components/motion/StaggerEntrance'
import type { PublicMemberUser } from '@/lib/member/member-store'

export function AdminAccountDashboard({ user }: { user: PublicMemberUser }) {
  return (
    <div className="space-y-4 pb-4 sm:pb-8">
      <StaggerEntrance className="space-y-4" stagger={0.08}>
        <div data-stagger>
          <AccountPageHeader username={user.username} />
        </div>
        <div data-stagger>
          <AccountInfoSection user={user} />
        </div>
      </StaggerEntrance>

      <ScrollReveal delay={0.04}>
        <PurchaseHistorySection />
      </ScrollReveal>
      <ScrollReveal delay={0.08}>
        <AllMembersSection />
      </ScrollReveal>
      <ScrollReveal delay={0.12}>
        <AllPurchasesSection />
      </ScrollReveal>
      <ScrollReveal delay={0.16}>
        <PromotionCodesSection />
      </ScrollReveal>
    </div>
  )
}
