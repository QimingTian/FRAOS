import { getPersonalTenant } from './tenant'
import { isProTeamPrivileged } from '@shared/pro-team'
import type { SessionRow } from './types'

export function currentTeamRole() {
  return getPersonalTenant().teamRole ?? null
}

export function isProTeamOwner(): boolean {
  return currentTeamRole() === 'owner'
}

export function isProTeamAdmin(): boolean {
  return currentTeamRole() === 'admin'
}

export function isProTeamMember(): boolean {
  return currentTeamRole() === 'member'
}

export function proTeamRbacActive(): boolean {
  return currentTeamRole() !== null
}

export function canMutateSession(session: SessionRow): boolean {
  const role = currentTeamRole()
  if (!role) return true
  if (isProTeamPrivileged(role)) return true
  const memberId = getPersonalTenant().memberId
  if (!memberId) return false
  return session.createdByMemberId === memberId
}

/** Observatory mode, e-stop, storage delete, and all-session control. */
export function canUseOwnerControls(): boolean {
  const role = currentTeamRole()
  if (!role) return true
  return isProTeamPrivileged(role)
}

/** Team roster, role changes, and member removal. */
export function canManageTeam(): boolean {
  return isProTeamOwner()
}
