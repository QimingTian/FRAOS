import { personalJson, personalOptions } from '@/lib/cloud/route-helpers'

export const runtime = 'nodejs'

export function OPTIONS() {
  return personalOptions()
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await context.params
  return personalJson({ ok: true, edition: 'standard', tenantId, hub: 'cloud' })
}
