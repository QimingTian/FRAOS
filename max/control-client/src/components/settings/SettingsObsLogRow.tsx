import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type SettingsObsLogRowProps = {
  observatory: ReactNode
  log: ReactNode
}

export function SettingsObsLogRow({ observatory, log }: SettingsObsLogRowProps) {
  const obsRef = useRef<HTMLElement>(null)
  const [logHeight, setLogHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = obsRef.current
    if (!el) return

    const sync = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      setLogHeight(h > 0 ? h : undefined)
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="settings-row-obs-log">
      <section
        ref={obsRef}
        className="remote-glass-pane settings-pane settings-pane-observatory"
      >
        {observatory}
      </section>
      <section
        className="remote-glass-pane settings-pane settings-pane-log"
        style={logHeight != null ? { height: logHeight, maxHeight: logHeight } : undefined}
      >
        {log}
      </section>
    </div>
  )
}
