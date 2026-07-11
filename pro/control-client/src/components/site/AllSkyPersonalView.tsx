import { useEffect, useState } from 'react'
import { observatoryStatusLabel, probeHub } from '../../lib/hub-client'

const streamAreaClass = 'relative w-full overflow-hidden rounded-lg bg-black'

export default function AllSkyPersonalView() {
  const [obsStatus, setObsStatus] = useState<string>('loading')
  const [streamError, setStreamError] = useState(false)
  const streamUrl = 'https://cam.www.boreanastro.com/stream'

  useEffect(() => {
    void probeHub().then((p) => {
      setObsStatus(p.observatory?.status ?? (p.hubReachable ? 'unknown' : 'disconnected'))
    })
    const id = window.setInterval(() => {
      void probeHub().then((p) => {
        setObsStatus(p.observatory?.status ?? (p.hubReachable ? 'unknown' : 'disconnected'))
      })
    }, 15_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-apple-dark dark:text-white mb-4">All Sky Camera</h1>
      <div className={`${streamAreaClass} aspect-[16/9] max-h-[420px]`}>
        {!streamError ? (
          <img
            src={streamUrl}
            alt="All-sky camera"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setStreamError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-400">
            <p>All-sky stream unavailable.</p>
            <p className="text-xs">Connect Personal Station or use Borean cloud network.</p>
          </div>
        )}
        <div className="pointer-events-none absolute left-0 top-0 z-10 px-3 py-2 text-sm">
          <p className="text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>
            Observatory:{' '}
            <span className={obsStatus === 'ready' ? 'text-emerald-400' : 'text-red-400'}>
              {obsStatus === 'loading' ? '…' : observatoryStatusLabel(obsStatus)}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
