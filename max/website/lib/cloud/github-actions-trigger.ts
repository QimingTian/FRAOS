/**
 * Triggers a GitHub Actions workflow_dispatch event for the per-order build.
 *
 * Uses the GitHub REST API to fire `fraos-per-order.yml` with the customer's
 * tenant credentials as inputs. The workflow builds Control Client and Station
 * installers with the tenantId + apiSecret baked in, uploads them to R2, and
 * POSTs back to the build-complete webhook.
 */

export type PerOrderBuildInputs = {
  tenantId: string
  apiSecret: string
  plan: string
  customerEmail: string
  stripeSessionId: string
}

export type TriggerResult =
  | { ok: true; runId: number | null; htmlUrl: string | null }
  | { ok: false; error: string }

function githubConfig(): {
  token: string
  owner: string
  repo: string
  workflowId: string
} | null {
  const token = process.env.GITHUB_TOKEN?.trim()
  const owner = process.env.GITHUB_REPO_OWNER?.trim()
  const repo = process.env.GITHUB_REPO_NAME?.trim()
  const workflowId = process.env.GITHUB_PER_ORDER_WORKFLOW?.trim() || 'fraos-per-order.yml'
  if (!token || !owner || !repo) return null
  return { token, owner, repo, workflowId }
}

export function githubActionsTriggerConfigured(): boolean {
  return githubConfig() !== null
}

export async function triggerPerOrderBuild(
  inputs: PerOrderBuildInputs
): Promise<TriggerResult> {
  const config = githubConfig()
  if (!config) {
    return {
      ok: false,
      error: 'GitHub Actions trigger not configured (GITHUB_TOKEN / GITHUB_REPO_OWNER / GITHUB_REPO_NAME).',
    }
  }

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflowId}/dispatches`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        tenantId: inputs.tenantId,
        apiSecret: inputs.apiSecret,
        plan: inputs.plan,
        customerEmail: inputs.customerEmail,
        stripeSessionId: inputs.stripeSessionId,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      error: `GitHub dispatch failed (${res.status}): ${text.slice(0, 200)}`,
    }
  }

  // The dispatch endpoint returns 204 No Content; we don't get a runId back.
  // The workflow run URL can be constructed but the runId is unknown until
  // the run starts. Return null and let the build-complete webhook signal readiness.
  return {
    ok: true,
    runId: null,
    htmlUrl: `https://github.com/${config.owner}/${config.repo}/actions/workflows/${config.workflowId}`,
  }
}
