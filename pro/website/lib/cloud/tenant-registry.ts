import { randomBytes, randomUUID } from 'node:crypto'
import { kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import { SITE_URL, PLANS } from '@/lib/site-config'
import type { ProductPlan } from '@/lib/site-config'

export type LicensePurchaseType =
  | 'promo_code'
  | 'one_time'
  | 'monthly_subscription'
  | 'annual_subscription'

export function inferPurchaseType(
  plan: ProductPlan,
  promoCode: string | null | undefined,
  explicit?: LicensePurchaseType | null
): LicensePurchaseType {
  if (explicit) return explicit
  if (promoCode?.trim()) return 'promo_code'
  const period = PLANS[plan].period.toLowerCase()
  if (period.includes('month')) return 'monthly_subscription'
  if (period.includes('year') || period.includes('annual')) return 'annual_subscription'
  return 'one_time'
}

export type PersonalOrderRecord = {
  orderId: string
  plan: ProductPlan
  tenantId: string
  displayName: string
  email: string | null
  memberId: string | null
  promoCode: string | null
  purchaseType: LicensePurchaseType
  validUntil: string | null
  nextBillAt: string | null
  createdAt: string
  downloadToken: string
  stripeSessionId?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  cancelAtPeriodEnd?: boolean | null
}

type TenantRegistryRecord = {
  tenantId: string
  displayName: string
  plan: ProductPlan
  createdAt: string
  orderId: string
}

const memorySecrets = new Map<string, string>()
const memoryOrders = new Map<string, PersonalOrderRecord>()
const memoryMemberOrderIndex = new Map<string, string[]>()
const memoryAllOrderIndex: string[] = []

const ALL_ORDERS_INDEX_KEY = 'borean-all-orders-index'

function secretKey(tenantId: string): string {
  return `personal-tenant-secret:${tenantId}`
}

function orderKey(orderId: string): string {
  return `personal-order:${orderId}`
}

function registryKey(tenantId: string): string {
  return `personal-tenant-registry:${tenantId}`
}

function memberOrdersKey(memberId: string): string {
  return `borean-member-orders:${memberId}`
}

function stripeSessionKey(sessionId: string): string {
  return `stripe-session:${sessionId}`
}

export async function saveOrder(order: PersonalOrderRecord): Promise<void> {
  const normalized = normalizeOrderRecord(order)
  if (!normalized) return
  memoryOrders.set(normalized.orderId, normalized)
  await kvSetJson(orderKey(normalized.orderId), normalized)
  if (normalized.stripeSubscriptionId?.trim()) {
    await kvSetJson(stripeSubscriptionKey(normalized.stripeSubscriptionId.trim()), {
      orderId: normalized.orderId,
    })
  }
}

function stripeSubscriptionKey(subscriptionId: string): string {
  return `stripe-subscription:${subscriptionId}`
}

export async function orderByStripeSubscription(
  subscriptionId: string
): Promise<PersonalOrderRecord | undefined> {
  const id = subscriptionId.trim()
  if (!id) return undefined
  const link = await kvGetJson<{ orderId?: string }>(stripeSubscriptionKey(id))
  if (!link?.orderId) return undefined
  return loadOrder(link.orderId)
}

export async function linkStripeSession(sessionId: string, orderId: string): Promise<void> {
  await kvSetJson(stripeSessionKey(sessionId), { orderId })
}

export async function orderByStripeSession(sessionId: string): Promise<PersonalOrderRecord | undefined> {
  const link = await kvGetJson<{ orderId?: string }>(stripeSessionKey(sessionId))
  if (!link?.orderId) return undefined
  return loadOrder(link.orderId)
}

function generateApiSecret(): string {
  return randomBytes(32).toString('base64url')
}

export async function storeTenantSecret(tenantId: string, secret: string): Promise<void> {
  memorySecrets.set(tenantId, secret)
  await kvSetJson(secretKey(tenantId), { secret })
}

export async function loadTenantSecret(tenantId: string): Promise<string | undefined> {
  if (memorySecrets.has(tenantId)) return memorySecrets.get(tenantId)
  const remote = await kvGetJson<{ secret?: string }>(secretKey(tenantId))
  if (remote?.secret?.trim()) {
    memorySecrets.set(tenantId, remote.secret.trim())
    return remote.secret.trim()
  }
  return undefined
}

export async function tenantExists(tenantId: string): Promise<boolean> {
  return Boolean(await loadTenantSecret(tenantId))
}

async function appendMemberOrder(memberId: string, orderId: string): Promise<void> {
  const key = memberOrdersKey(memberId)
  let orderIds: string[] = []
  if (memoryMemberOrderIndex.has(memberId)) {
    orderIds = [...memoryMemberOrderIndex.get(memberId)!]
  } else {
    const remote = await kvGetJson<{ orderIds?: string[] }>(key)
    orderIds = remote?.orderIds && Array.isArray(remote.orderIds) ? [...remote.orderIds] : []
  }
  if (!orderIds.includes(orderId)) {
    orderIds.unshift(orderId)
    memoryMemberOrderIndex.set(memberId, orderIds)
    await kvSetJson(key, { orderIds })
  }
}

async function readAllOrdersIndex(): Promise<string[]> {
  if (memoryAllOrderIndex.length > 0) return [...memoryAllOrderIndex]
  const remote = await kvGetJson<{ orderIds?: string[] }>(ALL_ORDERS_INDEX_KEY)
  if (remote?.orderIds && Array.isArray(remote.orderIds)) {
    memoryAllOrderIndex.splice(0, memoryAllOrderIndex.length, ...remote.orderIds)
    return [...remote.orderIds]
  }
  return []
}

async function writeAllOrdersIndex(orderIds: string[]): Promise<void> {
  memoryAllOrderIndex.splice(0, memoryAllOrderIndex.length, ...orderIds)
  await kvSetJson(ALL_ORDERS_INDEX_KEY, { orderIds })
}

async function appendAllOrdersIndex(orderId: string): Promise<void> {
  const orderIds = await readAllOrdersIndex()
  if (orderIds.includes(orderId)) return
  orderIds.unshift(orderId)
  await writeAllOrdersIndex(orderIds)
}

async function rebuildAllOrdersIndexFromMembers(): Promise<string[]> {
  const { listMembersForAdminDirectory } = await import('@/lib/member/member-store')
  const members = await listMembersForAdminDirectory()
  const seen = new Set<string>()
  const orderIds: string[] = []
  for (const member of members) {
    const memberOrders = await listOrdersForMember(member.id)
    for (const order of memberOrders) {
      if (seen.has(order.orderId)) continue
      seen.add(order.orderId)
      orderIds.push(order.orderId)
    }
  }
  return orderIds
}

export function purchaseTypeLabel(purchaseType: LicensePurchaseType): string {
  switch (purchaseType) {
    case 'promo_code':
      return 'Promo code'
    case 'one_time':
      return 'One-time purchase'
    case 'monthly_subscription':
      return 'Monthly subscription'
    case 'annual_subscription':
      return 'Annual subscription'
    default:
      return purchaseType
  }
}

export async function listAllOrders(): Promise<PersonalOrderRecord[]> {
  let orderIds = await readAllOrdersIndex()
  if (orderIds.length === 0) {
    orderIds = await rebuildAllOrdersIndexFromMembers()
    if (orderIds.length > 0) {
      await writeAllOrdersIndex(orderIds)
    }
  }

  const orders: PersonalOrderRecord[] = []
  for (const orderId of orderIds) {
    const order = await loadOrder(orderId)
    if (order) orders.push(order)
  }

  return orders.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export async function loadTenantRegistry(tenantId: string): Promise<TenantRegistryRecord | undefined> {
  const remote = await kvGetJson<TenantRegistryRecord>(registryKey(tenantId))
  if (remote?.tenantId) return remote
  return undefined
}

export async function provisionPersonalTenant(input: {
  plan: ProductPlan
  displayName?: string | null
  email?: string | null
  memberId?: string | null
  promoCode?: string | null
  purchaseType?: LicensePurchaseType | null
  validUntil?: string | null
  nextBillAt?: string | null
}): Promise<{
  order: PersonalOrderRecord
  tenantConfig: {
    tenantId: string
    apiBaseUrl: string
    apiSecret: string
    displayName: string
    plan: ProductPlan
    validUntil: string | null
  }
}> {
  const tenantId = randomUUID()
  const apiSecret = generateApiSecret()
  const orderId = randomUUID()
  const displayName = input.displayName?.trim() || `Personal ${tenantId.slice(0, 8)}`
  const downloadToken = randomBytes(24).toString('base64url')
  const memberId = input.memberId?.trim() || null
  const purchaseType = inferPurchaseType(input.plan, input.promoCode, input.purchaseType)

  const order: PersonalOrderRecord = {
    orderId,
    plan: input.plan,
    tenantId,
    displayName,
    email: input.email?.trim() || null,
    memberId,
    promoCode: input.promoCode?.trim() || null,
    purchaseType,
    validUntil: input.validUntil ?? null,
    nextBillAt: input.nextBillAt ?? null,
    createdAt: new Date().toISOString(),
    downloadToken,
  }

  const registry: TenantRegistryRecord = {
    tenantId,
    displayName,
    plan: input.plan,
    createdAt: order.createdAt,
    orderId,
  }

  await storeTenantSecret(tenantId, apiSecret)
  memoryOrders.set(orderId, order)
  await kvSetJson(orderKey(orderId), order)
  await kvSetJson(registryKey(tenantId), registry)
  await appendAllOrdersIndex(orderId)
  if (memberId) {
    await appendMemberOrder(memberId, orderId)
  }

  return {
    order,
    tenantConfig: {
      tenantId,
      apiBaseUrl: SITE_URL,
      apiSecret,
      displayName,
      plan: input.plan,
      validUntil: input.validUntil ?? null,
    },
  }
}

export async function loadOrder(orderId: string): Promise<PersonalOrderRecord | undefined> {
  if (memoryOrders.has(orderId)) return normalizeOrderRecord(memoryOrders.get(orderId))
  const remote = await kvGetJson<PersonalOrderRecord>(orderKey(orderId))
  if (remote?.orderId) {
    const normalized = normalizeOrderRecord(remote)
    if (normalized) {
      memoryOrders.set(orderId, normalized)
      return normalized
    }
  }
  return undefined
}

function normalizeOrderRecord(raw: PersonalOrderRecord | undefined): PersonalOrderRecord | undefined {
  if (!raw?.orderId) return undefined
  const plan = raw.plan
  const promoCode = raw.promoCode ?? null
  return {
    ...raw,
    purchaseType: raw.purchaseType ?? inferPurchaseType(plan, promoCode),
    validUntil: raw.validUntil ?? null,
    nextBillAt: raw.nextBillAt ?? null,
    stripeSessionId: raw.stripeSessionId ?? null,
    stripeCustomerId: raw.stripeCustomerId ?? null,
    stripeSubscriptionId: raw.stripeSubscriptionId ?? null,
    cancelAtPeriodEnd: raw.cancelAtPeriodEnd ?? null,
  }
}

export async function listOrdersForMember(memberId: string): Promise<PersonalOrderRecord[]> {
  const key = memberOrdersKey(memberId)
  let orderIds: string[] = []
  if (memoryMemberOrderIndex.has(memberId)) {
    orderIds = memoryMemberOrderIndex.get(memberId)!
  } else {
    const remote = await kvGetJson<{ orderIds?: string[] }>(key)
    orderIds = remote?.orderIds && Array.isArray(remote.orderIds) ? remote.orderIds : []
    memoryMemberOrderIndex.set(memberId, orderIds)
  }

  const orders: PersonalOrderRecord[] = []
  for (const orderId of orderIds) {
    const order = await loadOrder(orderId)
    if (order) orders.push(order)
  }
  return orders
}

export async function orderAuthorized(orderId: string, token: string | null): Promise<PersonalOrderRecord | undefined> {
  const order = await loadOrder(orderId)
  if (!order) return undefined
  if (!token || token !== order.downloadToken) return undefined
  return order
}

export async function orderOwnedByMember(
  orderId: string,
  memberId: string
): Promise<PersonalOrderRecord | undefined> {
  const order = await loadOrder(orderId)
  if (!order || order.memberId !== memberId) return undefined
  return order
}

export async function tenantConfigForOrder(order: PersonalOrderRecord) {
  const secret = await loadTenantSecret(order.tenantId)
  if (!secret) return undefined
  return {
    tenantId: order.tenantId,
    apiBaseUrl: SITE_URL,
    apiSecret: secret,
    displayName: order.displayName,
    plan: order.plan,
    validUntil: order.validUntil ?? null,
  }
}

export async function resolveMemberOrderTenant(orderId: string, memberId: string) {
  const order = await orderOwnedByMember(orderId, memberId)
  if (!order) return null
  const tenantConfig = await tenantConfigForOrder(order)
  if (!tenantConfig) return null
  return { order, tenantConfig }
}

export async function primaryTenantConfigForMember(memberId: string) {
  const orders = await listOrdersForMember(memberId)
  if (orders.length === 0) return null
  return tenantConfigForOrder(orders[0])
}
