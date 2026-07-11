import { useCallback, useEffect, useState } from 'react'
import { ACTIVE_MAX_SITE_CHANGED } from './active-max-site'
import { EQUIPMENT_CHANGED, getEquipment, type ImagingEquipment } from './equipment'

export function useEquipment(): ImagingEquipment | null {
  const [equipment, setEquipment] = useState<ImagingEquipment | null>(() => getEquipment())

  const refresh = useCallback(() => {
    setEquipment(getEquipment())
  }, [])

  useEffect(() => {
    const onChange = () => refresh()
    window.addEventListener(EQUIPMENT_CHANGED, onChange)
    window.addEventListener(ACTIVE_MAX_SITE_CHANGED, onChange)
    return () => {
      window.removeEventListener(EQUIPMENT_CHANGED, onChange)
      window.removeEventListener(ACTIVE_MAX_SITE_CHANGED, onChange)
    }
  }, [refresh])

  return equipment
}
