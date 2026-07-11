'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import {
  CheckoutSuccessView,
  type CheckoutSuccessPayload,
} from '@/components/checkout/CheckoutSuccessView'

type SuccessPayload = CheckoutSuccessPayload & {
  ok: boolean
  orderId: string
  buildStatus?: 'building' | 'ready' | 'failed'
}

type BuildStatusResponse = {
  ok?: boolean
  status?: 'building' | 'ready' | 'failed'
  downloads?: {
    controlWinUrl: string | null
    stationWinUrl: string | null
    controlMacUrl: string | null
  }
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order') ?? ''
  const token = searchParams.get('token') ?? ''
  const sessionId = searchParams.get('session_id') ?? ''
  const joined = searchParams.get('joined') === '1'
  const [payload, setPayload] = useState<SuccessPayload | null>(null)
  const [joinHeadline, setJoinHeadline] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [buildInProgress, setBuildInProgress] = useState(false)
  const [buildFailed, setBuildFailed] = useState(false)

  useEffect(() => {
    if (joined) {
      void (async () => {
        try {
          const res = await fetch('/api/member/license', { credentials: 'include', cache: 'no-store' })
          const data = (await res.json()) as {
            ok?: boolean
            error?: string
            tenantConfig?: {
              tenantId: string
              displayName: string
            }
            teamDisplayName?: string
            downloads?: CheckoutSuccessPayload['downloads']
          }
          if (!res.ok || !data.ok || !data.tenantConfig || !data.downloads) {
            setError(data.error ?? 'Could not load your team license.')
            return
          }
          const teamLabel = data.teamDisplayName ?? data.tenantConfig.displayName
          setJoinHeadline(`Joined ${teamLabel}`)
          setPayload({
            ok: true,
            orderId: '',
            displayName: data.tenantConfig.displayName,
            tenantId: data.tenantConfig.tenantId,
            tenantConfigUrl: '',
            downloads: data.downloads,
          })
        } catch (ex) {
          setError(ex instanceof Error ? ex.message : 'Could not load your team license.')
        }
      })()
      return
    }

    if (sessionId) {
      let cancelled = false
      let attempts = 0

      const poll = async () => {
        if (cancelled) return
        attempts += 1
        setWaiting(true)
        try {
          const res = await fetch(
            `/api/checkout/fulfill?session_id=${encodeURIComponent(sessionId)}`
          )
          const data = (await res.json()) as SuccessPayload & {
            error?: string
            pending?: boolean
          }
          if (res.status === 202 || data.pending) {
            if (attempts < 12) {
              window.setTimeout(() => void poll(), 1500)
              return
            }
            setError('Payment received — provisioning is taking longer than expected. Refresh in a moment.')
            setWaiting(false)
            return
          }
          if (!res.ok || !data.ok) {
            setError(data.error ?? 'Could not confirm your order.')
            setWaiting(false)
            return
          }

          setPayload(data)
          setWaiting(false)

          // If a per-order custom build is in progress, poll the build status
          // endpoint until the custom installers are ready.
          if (data.buildStatus === 'building' && !cancelled) {
            setBuildInProgress(true)
            void pollBuildStatus(sessionId, () => cancelled, (buildData) => {
              if (cancelled) return
              if (buildData.status === 'ready' && buildData.downloads) {
                const dl = buildData.downloads
                setBuildInProgress(false)
                setBuildFailed(false)
                setPayload((prev) =>
                  prev
                    ? {
                        ...prev,
                        downloads: {
                          controlWindows: dl.controlWinUrl ?? prev.downloads.controlWindows,
                          controlMac: dl.controlMacUrl ?? prev.downloads.controlMac,
                          stationWindows: dl.stationWinUrl ?? prev.downloads.stationWindows,
                        },
                        buildStatus: 'ready',
                      }
                    : prev
                )
              } else if (buildData.status === 'failed') {
                setBuildInProgress(false)
                setBuildFailed(true)
              }
            })
          } else if (data.buildStatus === 'failed') {
            setBuildFailed(true)
          }
        } catch (ex) {
          setError(ex instanceof Error ? ex.message : 'Could not confirm your order.')
          setWaiting(false)
        }
      }

      void poll()
      return () => {
        cancelled = true
      }
    }

    if (!orderId || !token) {
      setError('Missing order information.')
      return
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/checkout/order/${orderId}/summary?token=${encodeURIComponent(token)}`
        )
        const data = (await res.json()) as SuccessPayload & { error?: string }
        if (!res.ok || !data.ok) {
          setError(data.error ?? 'Could not load order.')
          return
        }
        setPayload(data)
      } catch (ex) {
        setError(ex instanceof Error ? ex.message : 'Could not load order.')
      }
    })()
  }, [orderId, token, sessionId, joined])

  if (payload) {
    return (
      <CheckoutSuccessView
        payload={payload}
        headline={joinHeadline ?? undefined}
        subhead={
          joined
            ? 'You now share the same cloud hub as your team. Install the apps below and sign in with your Borean Astro account.'
            : undefined
        }
        buildInProgress={buildInProgress}
        buildFailed={buildFailed}
      />
    )
  }

  return (
    <section className="page-shell-form py-16 md:py-20">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!error ? (
        <p className="text-muted">
          {waiting ? 'Confirming payment and provisioning your cloud hub…' : 'Loading your downloads…'}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Polls /api/orders/status until the build is ready or failed.
 * Retries up to 80 times with a 5-second interval (~6.5 minutes max).
 */
async function pollBuildStatus(
  sessionId: string,
  isCancelled: () => boolean,
  onUpdate: (data: BuildStatusResponse) => void
): Promise<void> {
  const maxAttempts = 80
  const intervalMs = 5000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) return
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
    if (isCancelled()) return

    try {
      const res = await fetch(
        `/api/orders/status?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: 'no-store' }
      )
      const data = (await res.json()) as BuildStatusResponse
      if (data.status === 'ready' || data.status === 'failed') {
        onUpdate(data)
        return
      }
    } catch {
      // Network errors are retried on the next interval.
    }
  }

  // Timed out waiting — treat as failed so the user sees fallback installers.
  onUpdate({ ok: false, status: 'failed' })
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="px-6 py-20 text-muted">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  )
}
