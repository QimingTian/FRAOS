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
  headline?: string
  subhead?: string
  /** When true, shows a "building your custom installer" banner and disables download buttons. */
  buildInProgress?: boolean
  /** When true, the custom build failed — show fallback to generic installers. */
  buildFailed?: boolean
}

const downloadPillClass =
  'btn-secondary inline-flex items-center px-4 py-2 text-sm'

const downloadPillDisabledClass =
  'btn-secondary inline-flex cursor-not-allowed items-center px-4 py-2 text-sm opacity-60'

export function CheckoutSuccessView({
  payload,
  headline,
  subhead,
  buildInProgress,
  buildFailed,
}: CheckoutSuccessViewProps) {
  return (
    <section className="page-shell py-16 md:py-20">
      <Link href="/fraos" className="text-sm text-muted hover:text-fg">
        ← Back to FRAOS
      </Link>
      <h1 className="mt-8 font-display text-3xl font-bold text-fg">
        {headline ?? "You're ready to install"}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        {subhead ??
          'Install the apps below, then sign in with your Borean Astro account inside each app to activate your license automatically.'}
      </p>
      <p className="mt-4 text-sm text-muted">
        <span className="text-fg">{payload.displayName}</span>
        <span className="mx-2 text-muted/50">·</span>
        <span className="font-mono text-xs text-muted/80">{payload.tenantId}</span>
      </p>

      {buildInProgress ? (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <p className="text-sm text-amber-200">
            <span className="font-medium">Building your custom installers…</span>
            <br />
            <span className="text-amber-200/70">
              We&apos;re compiling Control Client and Station with your private cloud hub baked in.
              This takes a few minutes — this page will update automatically when ready.
            </span>
          </p>
        </div>
      ) : null}

      {buildFailed ? (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 px-5 py-4">
          <p className="text-sm text-red-200">
            <span className="font-medium">Custom build encountered an issue.</span>{' '}
            <span className="text-red-200/70">
              You can download the standard installers below — they work the same way; just sign in
              with your Borean Astro account to activate your license.
            </span>
          </p>
        </div>
      ) : null}

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <div className="glass-card flex flex-col p-6 md:p-8">
          <h2 className="font-display text-lg font-semibold text-fg">Borean Control</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {payload.downloads.controlMac ? (
              <a
                href={buildInProgress ? undefined : payload.downloads.controlMac}
                className={buildInProgress ? downloadPillDisabledClass : downloadPillClass}
                aria-disabled={buildInProgress || undefined}
              >
                macOS
              </a>
            ) : null}
            {payload.downloads.controlWindows ? (
              <a
                href={buildInProgress ? undefined : payload.downloads.controlWindows}
                className={buildInProgress ? downloadPillDisabledClass : downloadPillClass}
                aria-disabled={buildInProgress || undefined}
              >
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
              <a
                href={buildInProgress ? undefined : payload.downloads.stationWindows}
                className={buildInProgress ? downloadPillDisabledClass : downloadPillClass}
                aria-disabled={buildInProgress || undefined}
              >
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
