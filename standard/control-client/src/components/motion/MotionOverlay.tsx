import { useEffect, useState, type ReactNode } from 'react'

type MotionOverlayProps = {
  open: boolean
  children: ReactNode
  className?: string
}

export function MotionOverlay({ open, children, className = '' }: MotionOverlayProps) {
  const [present, setPresent] = useState(open)
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) setPresent(true)
  }, [open])

  useEffect(() => {
    if (!present) return
    if (open) {
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setVisible(false)
    return undefined
  }, [open, present])

  if (!present) return null

  return (
    <div
      className={`motion-overlay${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden={!open}
      onTransitionEnd={(event) => {
        if (event.propertyName !== 'opacity') return
        if (!open) setPresent(false)
      }}
    >
      {children}
    </div>
  )
}
