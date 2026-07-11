import { useEffect, useRef, useState } from 'react'
import { useActiveMaxSite } from '../lib/useActiveMaxSite'

export function MaxSiteSwitcher() {
  const { multiSite, sites, activeSiteTenantId, setActiveSiteTenantId, activeSiteLabel, loading } =
    useActiveMaxSite()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!multiSite) return null

  return (
    <div className="max-site-switcher" ref={rootRef}>
      <button
        type="button"
        className={`btn max-site-switcher-btn ${open ? '' : 'btn-muted'}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading || sites.length === 0}
        onClick={() => setOpen((prev) => !prev)}
        title="Switch observatory site"
      >
        <span className="max-site-switcher-kicker">Switch Site</span>
        <span className="max-site-switcher-value">{loading ? '…' : activeSiteLabel}</span>
        <span className="max-site-switcher-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <ul className="max-site-switcher-menu" role="listbox" aria-label="Observatory sites">
          {sites.map((site) => {
            const label = site.displayName?.trim() || site.tenantId
            const active = site.tenantId === activeSiteTenantId
            return (
              <li key={site.tenantId} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`max-site-switcher-option ${active ? 'is-active' : ''}`.trim()}
                  onClick={() => {
                    setActiveSiteTenantId(site.tenantId)
                    setOpen(false)
                  }}
                >
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
