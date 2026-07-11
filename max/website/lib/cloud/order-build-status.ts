import { kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'

/**
 * Per-order custom installer build status.
 *
 * When a FRAOS Standard customer checks out, the webhook fires a GitHub Actions
 * workflow that builds Control Client and Station installers with the customer's
 * tenantId + apiSecret baked in. These records track that async build so the
 * checkout success page can show a "building your installer" state and surface
 * download URLs once the build completes.
 */

export type OrderBuildStatus = 'building' | 'ready' | 'failed'

export type OrderBuildDownloads = {
  controlWinUrl: string | null
  stationWinUrl: string | null
  controlMacUrl: string | null
}

export type OrderBuildRecord = {
  tenantId: string
  stripeSessionId: string
  customerEmail: string | null
  plan: string
  status: OrderBuildStatus
  startedAt: string
  readyAt: string | null
  failedAt: string | null
  failureReason: string | null
  downloads: OrderBuildDownloads
}

function orderStatusKey(stripeSessionId: string): string {
  return `order:${stripeSessionId}`
}

function orderDownloadsKey(tenantId: string): string {
  return `order-downloads:${tenantId}`
}

export async function setOrderBuildStatus(
  stripeSessionId: string,
  record: Partial<OrderBuildRecord> & { tenantId: string }
): Promise<void> {
  const key = orderStatusKey(stripeSessionId)
  const existing = await kvGetJson<OrderBuildRecord>(key)
  const merged: OrderBuildRecord = {
    tenantId: record.tenantId,
    stripeSessionId,
    customerEmail: record.customerEmail ?? existing?.customerEmail ?? null,
    plan: record.plan ?? existing?.plan ?? 'standard',
    status: record.status ?? existing?.status ?? 'building',
    startedAt: record.startedAt ?? existing?.startedAt ?? new Date().toISOString(),
    readyAt: record.readyAt ?? existing?.readyAt ?? null,
    failedAt: record.failedAt ?? existing?.failedAt ?? null,
    failureReason: record.failureReason ?? existing?.failureReason ?? null,
    downloads: {
      controlWinUrl: record.downloads?.controlWinUrl ?? existing?.downloads.controlWinUrl ?? null,
      stationWinUrl: record.downloads?.stationWinUrl ?? existing?.downloads.stationWinUrl ?? null,
      controlMacUrl: record.downloads?.controlMacUrl ?? existing?.downloads.controlMacUrl ?? null,
    },
  }
  await kvSetJson(key, merged)
}

export async function getOrderBuildStatus(
  stripeSessionId: string
): Promise<OrderBuildRecord | undefined> {
  return kvGetJson<OrderBuildRecord>(orderStatusKey(stripeSessionId))
}

export async function getOrderDownloads(
  tenantId: string
): Promise<OrderBuildRecord | undefined> {
  return kvGetJson<OrderBuildRecord>(orderDownloadsKey(tenantId))
}

export async function setOrderDownloads(
  tenantId: string,
  record: OrderBuildRecord
): Promise<void> {
  await kvSetJson(orderDownloadsKey(tenantId), record)
}

export async function markOrderBuildComplete(
  stripeSessionId: string,
  tenantId: string,
  downloads: OrderBuildDownloads
): Promise<OrderBuildRecord> {
  const now = new Date().toISOString()
  const existing = await getOrderBuildStatus(stripeSessionId)
  const record: OrderBuildRecord = {
    tenantId,
    stripeSessionId,
    customerEmail: existing?.customerEmail ?? null,
    plan: existing?.plan ?? 'standard',
    status: 'ready',
    startedAt: existing?.startedAt ?? now,
    readyAt: now,
    failedAt: null,
    failureReason: null,
    downloads,
  }
  await setOrderBuildStatus(stripeSessionId, record)
  await setOrderDownloads(tenantId, record)
  return record
}
