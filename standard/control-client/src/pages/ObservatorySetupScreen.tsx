import { useState } from 'react'
import {
  markObservatoryConfigured,
  setObservatoryLocation,
  validateObservatoryInput,
} from '../lib/settings'

type Props = {
  onComplete: () => void
}

export function ObservatorySetupScreen({ onComplete }: Props) {
  const [label, setLabel] = useState('My Observatory')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [elevationM, setElevationM] = useState('150')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = validateObservatoryInput({ label, lat, lon, elevationM })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setObservatoryLocation(result.location)
    markObservatoryConfigured()
    onComplete()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08090a] px-6 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#151616] p-8 shadow-xl"
      >
        <h1 className="font-display text-2xl font-semibold text-white">Observatory location</h1>
        <p className="mt-3 text-sm text-white/60">
          Weather, Atlas, and radar maps use these coordinates. You can change them later in Settings.
        </p>

        <div className="mt-6 space-y-4">
          <label className="block text-sm text-white/70">
            Name
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            Latitude (°)
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="e.g. 35.6762"
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            Longitude (°)
            <input
              type="text"
              inputMode="decimal"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="e.g. 139.6503"
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
            />
          </label>
          <label className="block text-sm text-white/70">
            Elevation (m, optional)
            <input
              type="text"
              inputMode="decimal"
              value={elevationM}
              onChange={(e) => setElevationM(e.target.value)}
              placeholder="150"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white"
            />
          </label>
          <button type="submit" className="btn w-full py-2.5">
            Continue
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </form>
    </div>
  )
}
