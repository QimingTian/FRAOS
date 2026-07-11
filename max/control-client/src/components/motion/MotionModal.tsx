import { useEffect, useState, type ReactNode } from 'react'

type MotionModalProps = {
  show: boolean
  onClose?: () => void
  children: ReactNode
  backdropClassName?: string
  panelClassName?: string
  panelRole?: 'dialog' | 'alertdialog'
  'aria-labelledby'?: string
}

export function MotionModal({
  show,
  onClose,
  children,
  backdropClassName = 'motion-modal-backdrop',
  panelClassName = '',
  panelRole = 'dialog',
  'aria-labelledby': ariaLabelledBy,
}: MotionModalProps) {
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
      className={`${backdropClassName} motion-modal${visible ? ' is-visible' : ''}`}
      role="presentation"
      onClick={onClose}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.propertyName !== 'opacity') return
        if (!show) setPresent(false)
      }}
    >
      <div
        className={`motion-modal-panel${panelClassName ? ` ${panelClassName}` : ''}`}
        role={panelRole}
        aria-labelledby={ariaLabelledBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
