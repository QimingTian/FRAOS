import { type ReactNode } from 'react'
import { useMotionExpandOpen } from './MotionExpand'

type MotionStaggerProps = {
  active: boolean
  children: ReactNode
  className?: string
}

export function MotionStagger({ active, children, className = '' }: MotionStaggerProps) {
  const expandOpen = useMotionExpandOpen()
  const visible = active && expandOpen

  return (
    <div className={`motion-stagger${visible ? ' is-active' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
