import { randomBytes } from 'node:crypto'
import { kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import type { ProductPlan } from '@/lib/site-config'
import { PLANS } from '@/lib/site-config'
import { normalizeProductPlan } from '@/lib/plan-utils'

export type PromoCodeDefinition = {
  plan: ProductPlan
  percentOff: number
  maxUses?: number | null
  label?: string
  /** License duration in days after redemption (env-defined codes). */
  licenseValidDays?: number | null
}

export type StoredPromoCode = {
  code: string
  plan: ProductPlan
  percentOff: number
  maxUses: number
  uses: number
  /** License duration in days after the user redeems — not a code expiry date. */
  licenseValidDays: number
  createdAt: string
  createdByUserId: string
  redeemedByMemberId: string | null
  redeemedAt: string | null
  label: string | null
  /** @deprecated Legacy field from earlier builds; migrated to licenseValidDays on read. */
  expiresAt?: string
}

export type AdminPromoCodeRow = StoredPromoCode & {
  status: 'available' | 'used'
}

const PROMO_INDEX_KEY = 'borean-promo-index'
const memoryPromos = new Map<string, StoredPromoCode>()
const memoryPromoIndex: string[] = []

function promoKey(code: string): string {
  return `borean-promo:${normalizePromoCode(code)}`
}

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase()
}

export function licenseValidUntilFromDays(validDays: number, from = new Date()): string {
  const days = Math.max(1, Math.min(365, Math.floor(validDays)))
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

function normalizeStoredPromo(raw: StoredPromoCode): StoredPromoCode {
  if (typeof raw.licenseValidDays === 'number' && raw.licenseValidDays > 0) {
    return raw
  }
  if (raw.expiresAt && raw.createdAt) {
    const deltaMs = Date.parse(raw.expiresAt) - Date.parse(raw.createdAt)
    const inferred = Math.max(1, Math.min(365, Math.round(deltaMs / (24 * 60 * 60 * 1000))))
    return { ...raw, licenseValidDays: inferred }
  }
  return { ...raw, licenseValidDays: 30 }
}

function parseEnvPromoDefinitions(): Record<string, PromoCodeDefinition> {
  const raw = process.env.PERSONAL_PROMO_CODES?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, PromoCodeDefinition> = {}
    for (const [code, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue
      const entry = value as Record<string, unknown>
      const plan = normalizeProductPlan(typeof entry.plan === 'string' ? entry.plan : undefined)
      const percentOff =
        typeof entry.percentOff === 'number' && Number.isFinite(entry.percentOff)
          ? Math.max(0, Math.min(100, entry.percentOff))
          : 100
      const maxUses =
        typeof entry.maxUses === 'number' && Number.isFinite(entry.maxUses)
          ? Math.max(1, Math.floor(entry.maxUses))
          : entry.maxUses === null
            ? null
            : undefined
      const licenseValidDays =
        typeof entry.licenseValidDays === 'number' && Number.isFinite(entry.licenseValidDays)
          ? Math.max(1, Math.min(365, Math.floor(entry.licenseValidDays)))
          : entry.licenseValidDays === null
            ? null
            : undefined
      out[normalizePromoCode(code)] = {
        plan,
        percentOff,
        maxUses: maxUses ?? null,
        label: typeof entry.label === 'string' ? entry.label : undefined,
        licenseValidDays: licenseValidDays ?? 365,
      }
    }
    return out
  } catch {
    return {}
  }
}

async function readPromoIndex(): Promise<string[]> {
  const remote = await kvGetJson<{ codes?: string[] }>(PROMO_INDEX_KEY)
  if (remote?.codes && Array.isArray(remote.codes)) return [...remote.codes]
  return [...memoryPromoIndex]
}

async function writePromoIndex(codes: string[]): Promise<void> {
  memoryPromoIndex.splice(0, memoryPromoIndex.length, ...codes)
  await kvSetJson(PROMO_INDEX_KEY, { codes })
}

async function readStoredPromo(code: string): Promise<StoredPromoCode | undefined> {
  const normalized = normalizePromoCode(code)
  if (memoryPromos.has(normalized)) return memoryPromos.get(normalized)
  const remote = await kvGetJson<StoredPromoCode>(promoKey(normalized))
  if (remote?.code) {
    const normalizedRecord = normalizeStoredPromo(remote)
    memoryPromos.set(normalized, normalizedRecord)
    return normalizedRecord
  }
  return undefined
}

async function writeStoredPromo(record: StoredPromoCode): Promise<void> {
  const normalized = normalizePromoCode(record.code)
  memoryPromos.set(normalized, record)
  await kvSetJson(promoKey(normalized), record)
}

function promoStatus(record: StoredPromoCode): AdminPromoCodeRow['status'] {
  if (record.uses >= record.maxUses) return 'used'
  return 'available'
}

function generatePromoCodeValue(): string {
  return `BOREAN-${randomBytes(4).toString('hex').toUpperCase()}`
}

export async function createAdminPromoCode(input: {
  plan: ProductPlan
  validDays: number
  createdByUserId: string
  label?: string | null
}): Promise<{ ok: true; promo: AdminPromoCodeRow } | { ok: false; error: string }> {
  const licenseValidDays = Math.max(1, Math.min(365, Math.floor(input.validDays)))
  const now = Date.now()

  let code = generatePromoCodeValue()
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!(await readStoredPromo(code))) break
    code = generatePromoCodeValue()
  }
  if (await readStoredPromo(code)) {
    return { ok: false, error: 'Could not generate a unique promotion code.' }
  }

  const record: StoredPromoCode = {
    code: normalizePromoCode(code),
    plan: input.plan,
    percentOff: 100,
    maxUses: 1,
    uses: 0,
    licenseValidDays,
    createdAt: new Date(now).toISOString(),
    createdByUserId: input.createdByUserId,
    redeemedByMemberId: null,
    redeemedAt: null,
    label: input.label?.trim() || null,
  }

  await writeStoredPromo(record)
  const index = await readPromoIndex()
  index.unshift(record.code)
  await writePromoIndex(index)

  return { ok: true, promo: { ...record, status: promoStatus(record) } }
}

export async function listAdminPromoCodes(): Promise<AdminPromoCodeRow[]> {
  const index = await readPromoIndex()
  const rows: AdminPromoCodeRow[] = []
  for (const code of index) {
    const record = await readStoredPromo(code)
    if (!record) continue
    rows.push({ ...record, status: promoStatus(record) })
  }
  return rows
}

export type PromoValidationResult =
  | {
      ok: true
      code: string
      plan: ProductPlan
      percentOff: number
      label: string | null
      licenseValidDays: number
      finalPriceLabel: string
      source: 'stored' | 'env'
    }
  | { ok: false; error: string }

async function validateStoredPromo(
  normalized: string,
  requestedPlan: ProductPlan
): Promise<PromoValidationResult | null> {
  const record = await readStoredPromo(normalized)
  if (!record) return null

  if (record.plan !== requestedPlan) {
    return {
      ok: false,
      error: `This code applies to FRAOS ${PLANS[record.plan].shortName} only.`,
    }
  }
  if (record.uses >= record.maxUses) {
    return { ok: false, error: 'Promotion code has already been used.' }
  }

  const finalPriceLabel = record.percentOff >= 100 ? 'Free' : `${100 - record.percentOff}% off`
  return {
    ok: true,
    code: record.code,
    plan: record.plan,
    percentOff: record.percentOff,
    label: record.label,
    licenseValidDays: record.licenseValidDays,
    finalPriceLabel,
    source: 'stored',
  }
}

async function validateEnvPromo(
  normalized: string,
  requestedPlan: ProductPlan
): Promise<PromoValidationResult | null> {
  const definitions = parseEnvPromoDefinitions()
  const definition = definitions[normalized]
  if (!definition) return null
  if (definition.plan !== requestedPlan) {
    return {
      ok: false,
      error: `This code applies to FRAOS ${PLANS[definition.plan].shortName} only.`,
    }
  }

  const usesKey = `personal-promo-uses:${normalized}`
  if (definition.maxUses != null) {
    const remote = await kvGetJson<{ count?: number }>(usesKey)
    const uses = typeof remote?.count === 'number' ? remote.count : 0
    if (uses >= definition.maxUses) {
      return { ok: false, error: 'Promotion code has already been used.' }
    }
  }

  const finalPriceLabel =
    definition.percentOff >= 100 ? 'Free' : `${100 - definition.percentOff}% off`
  return {
    ok: true,
    code: normalized,
    plan: definition.plan,
    percentOff: definition.percentOff,
    label: definition.label ?? null,
    licenseValidDays: definition.licenseValidDays ?? 365,
    finalPriceLabel,
    source: 'env',
  }
}

export async function validatePromoCode(
  code: string,
  requestedPlan: ProductPlan
): Promise<PromoValidationResult> {
  const normalized = normalizePromoCode(code)
  if (!normalized) return { ok: false, error: 'Enter a promotion code.' }

  const stored = await validateStoredPromo(normalized, requestedPlan)
  if (stored) {
    if (!stored.ok) return stored
    return stored
  }

  const env = await validateEnvPromo(normalized, requestedPlan)
  if (env) {
    if (!env.ok) return env
    return env
  }

  return { ok: false, error: 'Promotion code is not valid.' }
}

export async function consumePromoCode(
  code: string,
  memberId?: string | null
): Promise<void> {
  const normalized = normalizePromoCode(code)
  const record = await readStoredPromo(normalized)
  if (record) {
    const updated: StoredPromoCode = {
      ...record,
      uses: record.uses + 1,
      redeemedByMemberId: memberId ?? record.redeemedByMemberId,
      redeemedAt: new Date().toISOString(),
    }
    await writeStoredPromo(updated)
    return
  }

  const definitions = parseEnvPromoDefinitions()
  const definition = definitions[normalized]
  if (!definition || definition.maxUses == null) return
  const usesKey = `personal-promo-uses:${normalized}`
  const remote = await kvGetJson<{ count?: number }>(usesKey)
  const uses = typeof remote?.count === 'number' ? remote.count : 0
  await kvSetJson(usesKey, { count: uses + 1 })
}
