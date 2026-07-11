import type { ReactNode } from 'react'

export type NavPage = 'dashboard' | 'sessions' | 'submit' | 'settings'

type LayoutProps = {
  page: NavPage
  onNavigate: (page: NavPage) => void
  children: ReactNode
}

const NAV: { id: NavPage; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'submit', label: 'Submit' },
  { id: 'settings', label: 'Settings' },
]

export function Layout({ page, onNavigate, children }: LayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-title">Borean Astro</span>
          <span className="brand-sub">Personal Control</span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
