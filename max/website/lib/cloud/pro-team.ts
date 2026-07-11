import { randomBytes, randomUUID } from 'node:crypto'
import { kvDel, kvGetJson, kvSetJson } from '@/lib/cloud/kv-rest'
import { personalIsTenantLicenseActive } from '@/lib/cloud/personal-license'
import { getMemberById } from '@/lib/member/member-store'
import { loadOrder, loadTenantRegistry } from '@/lib/cloud/tenant-registry'

export type ProTeamRole = 'owner' | 'admin' | 'member'

export function isProTeamPrivileged(role: ProTeamRole): boolean {
  return role === 'owner' || role === 'admin'
}

export type ProTeam = {
  teamId: string
  tenantId: string
  orderId: string
  ownerMemberId: string
  teamCode: string
  displayName: string
  createdAt: string
}

export type ProTeamMember = {
  memberId: string
  role: ProTeamRole
  joinedAt: string
  email: string
  displayName: string
}

export type ProMemberTeamLink = {
  tenantId: string
  teamId: string
  role: ProTeamRole
}

const TEAM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TEAM_CODE_LENGTH = 8

const memoryTeams = new Map<string, ProTeam>()
const memoryTeamCodeIndex = new Map<string, string>()
const memoryTeamMembers = new Map<string, ProTeamMember[]>()
const memoryMemberTeamLinks = new Map<string, ProMemberTeamLink>()

function teamKey(teamId: string): string {
  return `pro-team:${teamId}`
}

function teamCodeKey(code: string): string {
  return `pro-team-code:${code}`
}

function teamMembersKey(tenantId: string): string {
  return `pro-team-members:${tenantId}`
}

function memberTeamKey(memberId: string): string {
  return `pro-member-team:${memberId}`
}

function generateTeamCode(): string {
  const bytes = randomBytes(TEAM_CODE_LENGTH)
  let code = ''
  for (let i = 0; i < TEAM_CODE_LENGTH; i += 1) {
    code += TEAM_CODE_ALPHABET[bytes[i]! % TEAM_CODE_ALPHABET.length]
  }
  return code
}

async function teamCodeInUse(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase()
  if (memoryTeamCodeIndex.has(normalized)) return true
  const remote = await kvGetJson<{ teamId?: string }>(teamCodeKey(normalized))
  return Boolean(remote?.teamId)
}

async function allocateTeamCode(): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const code = generateTeamCode()
    if (!(await teamCodeInUse(code))) return code
  }
  throw new Error('Unable to allocate team code.')
}

async function saveTeam(team: ProTeam): Promise<void> {
  memoryTeams.set(team.teamId, team)
  memoryTeamCodeIndex.set(team.teamCode, team.teamId)
  await kvSetJson(teamKey(team.teamId), team)
  await kvSetJson(teamCodeKey(team.teamCode), { teamId: team.teamId })
}

async function loadTeam(teamId: string): Promise<ProTeam | undefined> {
  if (memoryTeams.has(teamId)) return memoryTeams.get(teamId)
  const remote = await kvGetJson<ProTeam>(teamKey(teamId))
  if (!remote?.teamId) return undefined
  memoryTeams.set(teamId, remote)
  memoryTeamCodeIndex.set(remote.teamCode, teamId)
  return remote
}

async function loadTeamByCode(code: string): Promise<ProTeam | undefined> {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return undefined
  let teamId = memoryTeamCodeIndex.get(normalized)
  if (!teamId) {
    const remote = await kvGetJson<{ teamId?: string }>(teamCodeKey(normalized))
    teamId = remote?.teamId
  }
  if (!teamId) return undefined
  return loadTeam(teamId)
}

async function readTeamMembers(tenantId: string): Promise<ProTeamMember[]> {
  if (memoryTeamMembers.has(tenantId)) return [...memoryTeamMembers.get(tenantId)!]
  const remote = await kvGetJson<{ members?: ProTeamMember[] }>(teamMembersKey(tenantId))
  const members = remote?.members && Array.isArray(remote.members) ? remote.members : []
  memoryTeamMembers.set(tenantId, members)
  return [...members]
}

async function writeTeamMembers(tenantId: string, members: ProTeamMember[]): Promise<void> {
  memoryTeamMembers.set(tenantId, members)
  await kvSetJson(teamMembersKey(tenantId), { members })
}

async function saveMemberTeamLink(memberId: string, link: ProMemberTeamLink): Promise<void> {
  memoryMemberTeamLinks.set(memberId, link)
  await kvSetJson(memberTeamKey(memberId), link)
}

export async function loadMemberTeamLink(memberId: string): Promise<ProMemberTeamLink | undefined> {
  if (memoryMemberTeamLinks.has(memberId)) return memoryMemberTeamLinks.get(memberId)
  const remote = await kvGetJson<ProMemberTeamLink>(memberTeamKey(memberId))
  if (!remote?.tenantId) return undefined
  memoryMemberTeamLinks.set(memberId, remote)
  return remote
}

export async function loadProTeamForTenant(tenantId: string): Promise<ProTeam | undefined> {
  for (const team of memoryTeams.values()) {
    if (team.tenantId === tenantId) return team
  }
  const registry = await loadTenantRegistry(tenantId)
  if (!registry) return undefined
  const order = await loadOrder(registry.orderId)
  if (!order || order.plan !== 'pro') return undefined
  const members = await readTeamMembers(tenantId)
  const owner = members.find((m) => m.role === 'owner')
  if (!owner) return undefined
  return loadTeamByOwnerMember(owner.memberId)
}

async function loadTeamByOwnerMember(ownerMemberId: string): Promise<ProTeam | undefined> {
  for (const team of memoryTeams.values()) {
    if (team.ownerMemberId === ownerMemberId) return team
  }
  const link = await loadMemberTeamLink(ownerMemberId)
  if (!link || link.role !== 'owner') return undefined
  return loadTeam(link.teamId)
}

function memberDisplayName(user: {
  firstName: string
  lastName: string
  username: string
  email: string
}): string {
  const full = `${user.firstName} ${user.lastName}`.trim()
  return full || user.username || user.email
}

export async function createProTeamForOwner(input: {
  tenantId: string
  orderId: string
  ownerMemberId: string
  displayName: string
  ownerEmail: string
}): Promise<ProTeam> {
  const existing = await loadMemberTeamLink(input.ownerMemberId)
  if (existing) {
    throw new Error('This account already belongs to a Pro team.')
  }

  const teamCode = await allocateTeamCode()
  const team: ProTeam = {
    teamId: randomUUID(),
    tenantId: input.tenantId,
    orderId: input.orderId,
    ownerMemberId: input.ownerMemberId,
    teamCode,
    displayName: input.displayName.trim() || 'Pro Team',
    createdAt: new Date().toISOString(),
  }

  const ownerMember: ProTeamMember = {
    memberId: input.ownerMemberId,
    role: 'owner',
    joinedAt: team.createdAt,
    email: input.ownerEmail,
    displayName: input.displayName.trim() || input.ownerEmail,
  }

  await saveTeam(team)
  await writeTeamMembers(input.tenantId, [ownerMember])
  await saveMemberTeamLink(input.ownerMemberId, {
    tenantId: input.tenantId,
    teamId: team.teamId,
    role: 'owner',
  })

  return team
}

export async function getProTeamContextForMember(memberId: string): Promise<{
  team: ProTeam
  role: ProTeamRole
  members: ProTeamMember[]
} | null> {
  const link = await loadMemberTeamLink(memberId)
  if (!link) return null
  const team = await loadTeam(link.teamId)
  if (!team) return null
  const members = await readTeamMembers(team.tenantId)
  return { team, role: link.role, members }
}

export async function joinProTeamWithCode(input: {
  memberId: string
  email: string
  teamCode: string
}): Promise<{ team: ProTeam; members: ProTeamMember[] }> {
  const existing = await loadMemberTeamLink(input.memberId)
  if (existing) {
    throw new Error('This account already belongs to a Pro team.')
  }

  const team = await loadTeamByCode(input.teamCode)
  if (!team) {
    throw new Error('Team code not found.')
  }

  const active = await personalIsTenantLicenseActive(team.tenantId)
  if (!active) {
    throw new Error('This team license is not active.')
  }

  const user = await getMemberById(input.memberId)
  const displayName = user ? memberDisplayName(user) : input.email

  const member: ProTeamMember = {
    memberId: input.memberId,
    role: 'member',
    joinedAt: new Date().toISOString(),
    email: input.email,
    displayName,
  }

  const members = await readTeamMembers(team.tenantId)
  if (members.some((m) => m.memberId === input.memberId)) {
    throw new Error('You are already on this team.')
  }

  members.push(member)
  await writeTeamMembers(team.tenantId, members)
  await saveMemberTeamLink(input.memberId, {
    tenantId: team.tenantId,
    teamId: team.teamId,
    role: 'member',
  })

  return { team, members }
}

export async function removeProTeamMember(input: {
  ownerMemberId: string
  memberId: string
}): Promise<ProTeamMember[]> {
  const ownerContext = await getProTeamContextForMember(input.ownerMemberId)
  if (!ownerContext || ownerContext.role !== 'owner') {
    throw new Error('Only the team owner can remove members.')
  }
  if (input.memberId === input.ownerMemberId) {
    throw new Error('The owner cannot be removed from the team.')
  }

  const target = ownerContext.members.find((m) => m.memberId === input.memberId)
  if (!target) {
    throw new Error('Member not found on this team.')
  }
  if (target.role === 'owner') {
    throw new Error('The owner cannot be removed from the team.')
  }

  const members = ownerContext.members.filter((m) => m.memberId !== input.memberId)
  await writeTeamMembers(ownerContext.team.tenantId, members)
  memoryMemberTeamLinks.delete(input.memberId)
  await kvDel(memberTeamKey(input.memberId))

  return members
}

export async function updateProTeamMemberRole(input: {
  ownerMemberId: string
  memberId: string
  role: Exclude<ProTeamRole, 'owner'>
}): Promise<ProTeamMember[]> {
  const ownerContext = await getProTeamContextForMember(input.ownerMemberId)
  if (!ownerContext || ownerContext.role !== 'owner') {
    throw new Error('Only the team owner can change member roles.')
  }
  if (input.memberId === input.ownerMemberId) {
    throw new Error('The owner role cannot be changed.')
  }

  const members = [...ownerContext.members]
  const index = members.findIndex((m) => m.memberId === input.memberId)
  if (index < 0) {
    throw new Error('Member not found on this team.')
  }
  if (members[index]!.role === 'owner') {
    throw new Error('The owner role cannot be changed.')
  }

  members[index] = { ...members[index]!, role: input.role }
  await writeTeamMembers(ownerContext.team.tenantId, members)
  await saveMemberTeamLink(input.memberId, {
    tenantId: ownerContext.team.tenantId,
    teamId: ownerContext.team.teamId,
    role: input.role,
  })

  return members
}

export async function regenerateProTeamCode(ownerMemberId: string): Promise<ProTeam> {
  const context = await getProTeamContextForMember(ownerMemberId)
  if (!context || context.role !== 'owner') {
    throw new Error('Only the team owner can regenerate the team code.')
  }

  const newCode = await allocateTeamCode()
  const oldCode = context.team.teamCode
  const updated: ProTeam = { ...context.team, teamCode: newCode }

  memoryTeamCodeIndex.delete(oldCode)
  await kvDel(teamCodeKey(oldCode))
  await saveTeam(updated)

  return updated
}

export async function isProTeamMember(tenantId: string, memberId: string): Promise<ProTeamRole | null> {
  const link = await loadMemberTeamLink(memberId)
  if (!link || link.tenantId !== tenantId) return null
  return link.role
}
