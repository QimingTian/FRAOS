import { useCallback, useEffect, useState } from 'react'
import { ACTIVE_MAX_SITE_CHANGED } from './active-max-site'
import {
  getObservatoryLocation,
  OBSERVATORY_LOCATION_CHANGED,
  type ObservatoryLocation,
} from './settings'

export function useObservatoryLocation(): ObservatoryLocation {
  const [location, setLocation] = useState<ObservatoryLocation>(() => getObservatoryLocation())

  const refresh = useCallback(() => {
    setLocation(getObservatoryLocation())
  }, [])

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener(OBSERVATORY_LOCATION_CHANGED, onChange)
    window.addEventListener(ACTIVE_MAX_SITE_CHANGED, onChange)
    return () => {
      window.removeEventListener(OBSERVATORY_LOCATION_CHANGED, onChange)
      window.removeEventListener(ACTIVE_MAX_SITE_CHANGED, onChange)
    }
  }, [refresh])

  return location
}
