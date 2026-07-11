import { useEffect, useState, type ReactNode } from 'react'

type MotionFadeProps = {
  show: boolean
  children: ReactNode
  className?: string
}

export function MotionFade({ show, children, className = '' }: MotionFadeProps) {
  const [present, setPresent] = useState(show)
  const [visible, setVisible] = useState(show)

  useEffect(() => {
    if (show) setPresent(true)
  }, [show])

  useEffect(() => {
    if (!present) return
    if (show) {
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setVisible(false)
    return undefined
  }, [show, present])

  if (!present) return null

  return (
    <div
      className={`motion-fade${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      onTransitionEnd={(event) => {
        if (event.propertyName !== 'opacity') return
        if (!show) setPresent(false)
      }}
    >
      {children}
    </div>
  )
}
