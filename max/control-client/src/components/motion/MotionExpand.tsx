import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const MotionExpandContext = createContext<boolean | null>(null)

export function useMotionExpandOpen(): boolean {
  const value = useContext(MotionExpandContext)
  return value ?? true
}

type MotionExpandProps = {
  open: boolean
  children: ReactNode
  className?: string
}

export function MotionExpand({ open, children, className = '' }: MotionExpandProps) {
  const [present, setPresent] = useState(open)
  const [shown, setShown] = useState(open)

  useEffect(() => {
    if (open) setPresent(true)
  }, [open])

  useEffect(() => {
    if (!present) return
    if (open) {
      const frame = window.requestAnimationFrame(() => setShown(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setShown(false)
    return undefined
  }, [open, present])

  if (!present) return null

  return (
    <MotionExpandContext.Provider value={shown}>
      <div
        className={`motion-expand${shown ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
        onTransitionEnd={(event) => {
          if (event.propertyName !== 'grid-template-rows') return
          if (!open) setPresent(false)
        }}
      >
        <div className="motion-expand__inner">
          <div className="motion-expand__content">{children}</div>
        </div>
      </div>
    </MotionExpandContext.Provider>
  )
}
