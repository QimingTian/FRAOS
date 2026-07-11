import { useEffect, useState } from 'react'
import { hasUserLicense } from './lib/station-api'
import { ActivationScreen } from './pages/ActivationScreen'
import { StationDashboard } from './pages/StationDashboard'
import './globals.css'

function App() {
  const [licensed, setLicensed] = useState(import.meta.env.DEV)

  useEffect(() => {
    if (import.meta.env.DEV) return
    void hasUserLicense().then((ok) => {
      if (ok) setLicensed(true)
    })
  }, [])

  if (!licensed) {
    return <ActivationScreen onActivated={() => setLicensed(true)} />
  }

  return <StationDashboard />
}

export default App
