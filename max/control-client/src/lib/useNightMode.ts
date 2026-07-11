import { useCallback, useEffect, useState } from 'react'

const NIGHT_MODE_KEY = 'borean.personal.nightMode'
const NIGHT_MODE_CHANGED = 'borean:night-mode-changed'

function read(): boolean {
  try {
    return localStorage.getItem(NIGHT_MODE_KEY) === '1'
  } catch {
    return false
  }
}

/** App-wide red night-vision tint. Persisted so it survives tab changes and restarts. */
export function useNightMode(): { nightMode: boolean; setNightMode: (on: boolean) => void; toggle: () => void } {
  const [nightMode, setState] = useState<boolean>(() => read())

  useEffect(() => {
    const onChange = () => setState(read())
    window.addEventListener(NIGHT_MODE_CHANGED, onChange)
    return () => window.removeEventListener(NIGHT_MODE_CHANGED, onChange)
  }, [])

  const setNightMode = useCallback((on: boolean) => {
    try {
      localStorage.setItem(NIGHT_MODE_KEY, on ? '1' : '0')
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(NIGHT_MODE_CHANGED))
    setState(on)
  }, [])

  const toggle = useCallback(() => setNightMode(!read()), [setNightMode])

  return { nightMode, setNightMode, toggle }
}
