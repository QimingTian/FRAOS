'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isSafariBrowser } from '@/lib/is-safari'

const LIQUID_GL_OPTIONS: LiquidGLOptions = {
  target: '.header-glass-lens',
  snapshot: 'body',
  resolution: 2,
  refraction: 0.055,
  bevelDepth: 0.14,
  bevelWidth: 0.22,
  frost: 4,
  shadow: false,
  specular: true,
  reveal: 'none',
  tilt: false,
  on: {
    init() {
      document.body.classList.add('liquid-gl-active')
      document.body.classList.remove('liquid-gl-fallback')
      patchRendererCapture()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.classList.add('liquid-gl-ready')
        })
      })
    },
  },
}

const FALLBACK_MS = 3200

function showHeaderBackdrop() {
  document.body.classList.remove('liquid-gl-ready')
}

function enableSafariCssGlass() {
  document.body.classList.add('liquid-gl-safari', 'liquid-gl-fallback')
  showHeaderBackdrop()
  window.__liquidGLHeaderInit__ = true
}

function patchRendererCapture() {
  const renderer = window.__liquidGLRenderer__
  if (!renderer || renderer.__headerCapturePatched) return

  const original = renderer.captureSnapshot?.bind(renderer)
  if (!original) return

  renderer.__headerCapturePatched = true

  renderer.captureSnapshot = async () => {
    document.body.classList.add('liquid-gl-capturing')
    showHeaderBackdrop()
    try {
      const ok = await original()
      if (!ok) {
        document.body.classList.add('liquid-gl-fallback')
        return false
      }
      document.body.classList.remove('liquid-gl-fallback')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.classList.add('liquid-gl-ready')
        })
      })
      return true
    } finally {
      document.body.classList.remove('liquid-gl-capturing')
    }
  }
}

export function LiquidGlassProvider() {
  const pathname = usePathname()
  const html2canvasReady = useRef(false)
  const liquidGLReady = useRef(false)
  const [useWebGL, setUseWebGL] = useState<boolean | null>(null)

  const enableCssFallback = useCallback(() => {
    document.body.classList.add('liquid-gl-fallback')
    showHeaderBackdrop()
  }, [])

  useEffect(() => {
    if (isSafariBrowser()) {
      enableSafariCssGlass()
      setUseWebGL(false)
      return
    }
    setUseWebGL(true)
  }, [])

  const tryInit = useCallback(() => {
    if (window.__liquidGLHeaderInit__) return
    if (!html2canvasReady.current || !liquidGLReady.current) return
    if (typeof window.liquidGL !== 'function' || typeof window.html2canvas === 'undefined') {
      enableCssFallback()
      return
    }

    if (!document.querySelector('.header-glass-lens')) {
      enableCssFallback()
      return
    }

    window.__liquidGLHeaderInit__ = true
    window.liquidGL(LIQUID_GL_OPTIONS)
  }, [enableCssFallback])

  const scheduleInit = useCallback(() => {
    const run = () => tryInit()
    if (document.readyState === 'complete') {
      window.setTimeout(run, 120)
    } else {
      window.addEventListener('load', () => window.setTimeout(run, 120), { once: true })
    }
  }, [tryInit])

  useEffect(() => {
    if (useWebGL !== true) return
    const fallbackTimer = window.setTimeout(enableCssFallback, FALLBACK_MS)
    return () => window.clearTimeout(fallbackTimer)
  }, [enableCssFallback, useWebGL])

  useEffect(() => {
    if (useWebGL !== true || !window.__liquidGLHeaderInit__) return
    patchRendererCapture()
  }, [pathname, useWebGL])

  useEffect(() => {
    if (useWebGL !== true) return

    const watchdog = window.setInterval(() => {
      if (!document.body.classList.contains('liquid-gl-active')) return
      if (!document.body.classList.contains('liquid-gl-ready')) return
      if (document.body.classList.contains('liquid-gl-capturing')) return

      const canvas = document.querySelector<HTMLCanvasElement>(
        'body > canvas[style*="pointer-events: none"]',
      )
      if (!canvas) {
        showHeaderBackdrop()
        return
      }

      const canvasHidden =
        canvas.style.visibility === 'hidden' ||
        canvas.style.opacity === '0' ||
        canvas.style.display === 'none'

      if (canvasHidden) showHeaderBackdrop()
    }, 800)

    return () => window.clearInterval(watchdog)
  }, [useWebGL])

  if (useWebGL !== true) return null

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          html2canvasReady.current = true
          scheduleInit()
        }}
        onError={() => enableCssFallback()}
      />
      <Script
        src="/scripts/liquidGL.js"
        strategy="afterInteractive"
        onLoad={() => {
          liquidGLReady.current = true
          scheduleInit()
        }}
        onError={() => enableCssFallback()}
      />
    </>
  )
}
