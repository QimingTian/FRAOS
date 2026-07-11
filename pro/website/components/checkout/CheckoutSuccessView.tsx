import Link from 'next/link'

export type CheckoutSuccessPayload = {
  displayName: string
  tenantId: string
  tenantConfigUrl: string
  downloads: {
    controlWindows: string | null
    controlMac: string | null
    stationWindows: string | null
  }
}

type CheckoutSuccessViewProps = {
  payload: CheckoutSuccessPayload
}

const downloadPillClass =
  'inline-flex items-center rounded-full border border-white/25 bg-surface px-4 py-2 text-sm font-medium text-fg transition hover:bg-[#1b1c1c]'

export function CheckoutSuccessView({ payload }: CheckoutSuccessViewProps) {
  return (
    <section className="page-shell py-16 md:py-20">
      <Link href="/fraos" className="text-sm text-muted hover:text-fg">
        ← Back to FRAOS
      </Link>
      <h1 className="mt-8 font-display text-3xl font-bold text-fg">You&apos;re ready to install</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Install the apps below, then sign in with your Borean Astro account inside each app to activate
        your license automatically.
      </p>
      <p className="mt-4 text-sm text-muted">
        <span className="text-fg">{payload.displayName}</span>
        <span className="mx-2 text-muted/50">·</span>
        <span className="font-mono text-xs text-muted/80">{payload.tenantId}</span>
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <div className="glass-card flex flex-col p-6 md:p-8">
          <h2 className="font-display text-lg font-semibold text-fg">Borean Control</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {payload.downloads.controlMac ? (
              <a href={payload.downloads.controlMac} className={downloadPillClass}>
                macOS
              </a>
            ) : null}
            {payload.downloads.controlWindows ? (
              <a href={payload.downloads.controlWindows} className={downloadPillClass}>
                Windows
              </a>
            ) : null}
            {!payload.downloads.controlMac && !payload.downloads.controlWindows ? (
              <p className="text-sm text-muted">Installers not available yet.</p>
            ) : null}
          </div>
        </div>

        <div className="glass-card flex flex-col p-6 md:p-8">
          <h2 className="font-display text-lg font-semibold text-fg">Borean Station</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {payload.downloads.stationWindows ? (
              <a href={payload.downloads.stationWindows} className={downloadPillClass}>
                Windows
              </a>
            ) : (
              <p className="text-sm text-muted">Installer not available yet.</p>
            )}
          </div>
        </div>

        <div className="glass-card flex flex-col p-6 md:p-8">
          <h2 className="font-display text-lg font-semibold text-fg">OTA updates</h2>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            After install, use <span className="text-fg">Update</span> in Station and{' '}
            <span className="text-fg">Settings → Updates</span> in Control Client. The apps poll your
            cloud hub for the latest version and download URL automatically.
          </p>
        </div>
      </div>

      <p className="mt-8 text-sm text-muted">
        You can also re-download installers anytime from{' '}
        <Link href="/account" className="text-fg underline-offset-4 hover:underline">
          your account page
        </Link>
        .
      </p>
    </section>
  )
}
