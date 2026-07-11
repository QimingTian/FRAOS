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
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order') ?? ''
  const token = searchParams.get('token') ?? ''
  const sessionId = searchParams.get('session_id') ?? ''
  const [payload, setPayload] = useState<SuccessPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)

  useEffect(() => {
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
  }, [orderId, token, sessionId])

  if (payload) {
    return <CheckoutSuccessView payload={payload} />
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

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="px-6 py-20 text-muted">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  )
}
