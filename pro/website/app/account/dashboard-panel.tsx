import type { ReactNode } from 'react'

export function DashboardPanel({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <section className={`glass-card flex min-w-0 flex-col gap-4 p-6 md:p-8 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-fg">{title}</h3>
        {action}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
