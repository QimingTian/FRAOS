export function sessionControlCanRun(status: string): boolean {
  return status === 'pending' || status === 'scheduled' || status === 'planned'
}

export function sessionControlCanHold(status: string): boolean {
  return sessionControlCanRun(status)
}

export function sessionControlOnHold(status: string): boolean {
  return status === 'on_hold' || status === 'on hold'
}
