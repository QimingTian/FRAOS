import { useEffect, useState, type ReactNode } from 'react'
import { loadAppTenant } from '../lib/control-app-api'
import { planDisplayLabel } from '../lib/plan-label'
import { useNightMode } from '../lib/useNightMode'

export type DashboardTab = 'weather' | 'atlas' | 'remote' | 'settings'

type DashboardLayoutProps = {
  tab: DashboardTab
  onNavigate: (tab: DashboardTab) => void
  children: ReactNode
}

const NAV: { id: DashboardTab; label: string }[] = [
  { id: 'weather', label: 'Weather' },
  { id: 'atlas', label: 'Atlas' },
  { id: 'remote', label: 'Remote' },
  { id: 'settings', label: 'Settings' },
]

function NavPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn ${active ? '' : 'btn-muted'}`.trim()}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </button>
  )
}

function mainClassForTab(tab: DashboardTab): string {
  switch (tab) {
    case 'remote':
      return 'client-main client-main-flush'
    case 'weather':
      return 'client-main client-main-weather'
    case 'atlas':
      return 'client-main client-main-atlas'
    case 'settings':
      return 'client-main client-main-settings'
    default:
      return 'client-main'
  }
}

export function DashboardLayout({ tab, onNavigate, children }: DashboardLayoutProps) {
  const [edition, setEdition] = useState('…')
  const { nightMode, toggle: toggleNightMode } = useNightMode()

  useEffect(() => {
    void loadAppTenant().then((tenant) => {
      setEdition(planDisplayLabel(tenant?.plan))
    })
  }, [])

  return (
    <div className="client-shell">
      <header className="client-header">
        <div className="client-brand">
          <img
            src="/brand/borean-logo-light.png"
            alt="Borean Astro"
            className="client-logo"
          />
          <span className="client-edition">{edition}</span>
        </div>

        <div className="client-header-actions">
          <button
            type="button"
            onClick={toggleNightMode}
            aria-pressed={nightMode}
            title="Night vision (red tint, whole app)"
            className={`btn ${nightMode ? '' : 'btn-muted'}`.trim()}
          >
            Night
          </button>
          <nav className="client-tabs" aria-label="Main">
            {NAV.map((item) => (
              <NavPill
                key={item.id}
                label={item.label}
                active={tab === item.id}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </nav>
        </div>
      </header>

      <main className={mainClassForTab(tab)}>{children}</main>

      {nightMode ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[2000]"
          style={{ background: '#ff2200', mixBlendMode: 'multiply' }}
        />
      ) : null}
    </div>
  )
}
