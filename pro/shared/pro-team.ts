export type ProTeamRole = 'owner' | 'admin' | 'member'

export function isProTeamPrivileged(role: ProTeamRole): boolean {
  return role === 'owner' || role === 'admin'
}

export const BOREAN_MEMBER_ID_HEADER = 'X-Borean-Member-Id'
export const BOREAN_MEMBER_TOKEN_HEADER = 'X-Borean-Member-Token'
