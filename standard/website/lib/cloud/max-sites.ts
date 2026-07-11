import { personalIsTenantLicenseActive } from '@/lib/cloud/personal-license'
import { SITE_URL } from '@/lib/site-config'
import {
  loadOrder,
  loadTenantRegistry,
  listOrdersForMember,
  provisionPersonalTenant,
  saveOrder,
  tenantConfigForOrder,
  updateTenantDisplayName,
  type PersonalOrderRecord,
} from '@/lib/cloud/tenant-registry'

export type MaxSiteSummary = {
  tenantId: string
  displayName: string
  apiBaseUrl: string
  apiSecret: string
  orderId: string
  downloadToken: string
  createdAt: string
  validUntil: string | null
  isPrimary: boolean
}

function isMaxPrimaryOrder(order: PersonalOrderRecord): boolean {
  return order.plan === 'max' && Boolean(order.stripeSubscriptionId?.trim())
}

function isMaxSatelliteOrder(order: PersonalOrderRecord): boolean {
  return order.plan === 'max' && Boolean(order.maxSubscriptionOrderId?.trim())
}

export async function findPrimaryMaxOrder(memberId: string): Promise<PersonalOrderRecord | undefined> {
  const orders = await listOrdersForMember(memberId)
  const primary = orders.find(isMaxPrimaryOrder)
  if (primary) return primary
  return orders.find((order) => order.plan === 'max' && !isMaxSatelliteOrder(order))
}

export async function memberHasActiveMaxLicense(memberId: string): Promise<boolean> {
  const primary = await findPrimaryMaxOrder(memberId)
  if (!primary) return false
  return personalIsTenantLicenseActive(primary.tenantId)
}

export async function memberOwnsMaxTenant(memberId: string, tenantId: string): Promise<boolean> {
  const orders = await listOrdersForMember(memberId)
  return orders.some((order) => order.plan === 'max' && order.tenantId === tenantId)
}

export async function listMaxSitesForMember(memberId: string): Promise<MaxSiteSummary[]> {
  const orders = await listOrdersForMember(memberId).then((rows) =>
    rows.filter((order) => order.plan === 'max')
  )
  const primaryOrderId = (await findPrimaryMaxOrder(memberId))?.orderId ?? null

  const sites: MaxSiteSummary[] = []
  for (const order of orders) {
    const tenantConfig = await tenantConfigForOrder(order)
    if (!tenantConfig) continue
    sites.push({
      tenantId: tenantConfig.tenantId,
      displayName: tenantConfig.displayName,
      apiBaseUrl: tenantConfig.apiBaseUrl,
      apiSecret: tenantConfig.apiSecret,
      orderId: order.orderId,
      downloadToken: order.downloadToken,
      createdAt: order.createdAt,
      validUntil: tenantConfig.validUntil,
      isPrimary: order.orderId === primaryOrderId,
    })
  }

  return sites.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

export async function provisionMaxSite(input: {
  memberId: string
  email?: string | null
  displayName?: string | null
}): Promise<{
  order: PersonalOrderRecord
  tenantConfig: {
    tenantId: string
    apiBaseUrl: string
    apiSecret: string
    displayName: string
    plan: 'max'
    validUntil: string | null
  }
}> {
  const primary = await findPrimaryMaxOrder(input.memberId)
  if (!primary) {
    throw new Error('No active FRAOS Max subscription found on this account.')
  }
  if (!(await personalIsTenantLicenseActive(primary.tenantId))) {
    throw new Error('Your FRAOS Max subscription is not active.')
  }

  const { order, tenantConfig } = await provisionPersonalTenant({
    plan: 'max',
    memberId: input.memberId,
    email: input.email ?? primary.email,
    displayName: input.displayName?.trim() || `Site ${Date.now().toString(36).slice(-4).toUpperCase()}`,
    purchaseType: primary.purchaseType,
    validUntil: primary.validUntil,
    nextBillAt: primary.nextBillAt,
  })

  const enriched: PersonalOrderRecord = {
    ...order,
    maxSubscriptionOrderId: primary.orderId,
    stripeCustomerId: primary.stripeCustomerId ?? null,
  }
  await saveOrder(enriched)

  return {
    order: enriched,
    tenantConfig: {
      ...tenantConfig,
      apiBaseUrl: SITE_URL,
      plan: 'max',
    },
  }
}

export async function renameMaxSite(input: {
  memberId: string
  tenantId: string
  displayName: string
}): Promise<void> {
  const owns = await memberOwnsMaxTenant(input.memberId, input.tenantId)
  if (!owns) {
    throw new Error('Site not found on this account.')
  }
  await updateTenantDisplayName(input.tenantId, input.displayName)
}

export async function syncMaxSiteBillingFromPrimary(primary: PersonalOrderRecord): Promise<void> {
  if (primary.plan !== 'max' || !primary.memberId) return
  const orders = await listOrdersForMember(primary.memberId)
  for (const order of orders) {
    if (order.orderId === primary.orderId) continue
    if (order.plan !== 'max' || !order.maxSubscriptionOrderId) continue
    await saveOrder({
      ...order,
      validUntil: primary.validUntil,
      nextBillAt: primary.nextBillAt,
      cancelAtPeriodEnd: primary.cancelAtPeriodEnd ?? null,
    })
  }
}

export async function tenantIsMaxPlan(tenantId: string): Promise<boolean> {
  const registry = await loadTenantRegistry(tenantId)
  return registry?.plan === 'max'
}
