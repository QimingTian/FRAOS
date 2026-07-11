import { useEffect, useState } from 'react'
import { DashboardLayout, type DashboardTab } from './components/DashboardLayout'
import {
  resolveLicenseEntitlement,
  entitlementAllowsAppUse,
  type LicenseEntitlement,
} from './lib/license-entitlement'
import { isObservatoryConfigured } from './lib/settings'
import { ActivationScreen } from './pages/ActivationScreen'
import { AtlasPage, type RemotePrefill } from './pages/AtlasPage'
import { ObservatorySetupScreen } from './pages/ObservatorySetupScreen'
import { RemotePage } from './pages/RemotePage'
import { SettingsPage } from './pages/SettingsPage'
import { WeatherPage } from './pages/WeatherPage'

function MainApp() {
  const [tab, setTab] = useState<DashboardTab>('weather')
  const [remotePrefill, setRemotePrefill] = useState<RemotePrefill | null>(null)

  return (
    <DashboardLayout tab={tab} onNavigate={setTab}>
      {tab === 'weather' && <WeatherPage />}
      {tab === 'atlas' && (
        <AtlasPage
          onSendToRemote={(prefill) => {
            setRemotePrefill(prefill)
            setTab('remote')
          }}
        />
      )}
      {tab === 'remote' && (
        <RemotePage
          prefill={remotePrefill}
          onPrefillConsumed={() => setRemotePrefill(null)}
        />
      )}
      {tab === 'settings' && <SettingsPage />}
    </DashboardLayout>
  )
}

function App() {
  const [boot, setBoot] = useState<'loading' | 'ready'>('loading')
  const [entitlement, setEntitlement] = useState<LicenseEntitlement | null>(null)
  const [observatoryReady, setObservatoryReady] = useState(() => isObservatoryConfigured())

  useEffect(() => {
    let cancelled = false
    void resolveLicenseEntitlement().then((result) => {
      if (cancelled) return
      setEntitlement(result)
      setBoot('ready')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (boot === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090a] text-sm text-white/50">
        Loading…
      </div>
    )
  }

  if (!entitlement || !entitlementAllowsAppUse(entitlement)) {
    const notice =
      entitlement?.status === 'expired'
        ? entitlement.message
        : null
    return (
      <ActivationScreen
        notice={notice}
        onActivated={() => {
          void resolveLicenseEntitlement().then(setEntitlement)
        }}
      />
    )
  }

  if (!observatoryReady) {
    return <ObservatorySetupScreen onComplete={() => setObservatoryReady(true)} />
  }

  return <MainApp />
}

export default App
