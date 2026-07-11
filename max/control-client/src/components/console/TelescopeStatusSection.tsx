import { TelescopeStatusPanel } from './TelescopeStatusPanel'

export function TelescopeStatusSection() {
  return (
    <section className="remote-glass-pane telescope-panel">
      <div className="remote-pane-head">
        <h2>Telescope Status</h2>
      </div>
      <TelescopeStatusPanel />
    </section>
  )
}
