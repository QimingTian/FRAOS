type StationHeaderProps = {
  edition: string
  running: boolean
  busy: boolean
  onStart: () => void
  onStop: () => void
}

export function StationHeader({ edition, running, busy, onStart, onStop }: StationHeaderProps) {
  return (
    <header className="client-header">
      <div className="client-brand">
        <img src="/brand/borean-logo-light.png" alt="Borean Astro" className="client-logo" />
        <span className="client-edition">{edition}</span>
      </div>

      <div className="client-header-actions">
        <span className={`run-pill ${running ? 'run-on' : 'run-off'}`}>
          {running ? 'Agent Running' : 'Agent Stopped'}
        </span>
        <button type="button" className="btn" disabled={busy || running} onClick={onStart}>
          Start
        </button>
        <button type="button" className="btn btn-muted" disabled={busy || !running} onClick={onStop}>
          Stop
        </button>
      </div>
    </header>
  )
}
