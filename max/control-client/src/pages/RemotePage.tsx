import { ControlConsole } from './ControlConsole'
import type { RemotePrefill } from './AtlasPage'

type RemotePageProps = {
  prefill?: RemotePrefill | null
  onPrefillConsumed?: () => void
}

export function RemotePage({ prefill, onPrefillConsumed }: RemotePageProps) {
  return (
    <ControlConsole embedded prefill={prefill} onPrefillConsumed={onPrefillConsumed} />
  )
}
