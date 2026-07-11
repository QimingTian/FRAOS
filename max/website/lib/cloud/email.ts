/**
 * Transactional email via Resend REST API.
 *
 * Uses fetch directly — no SDK dependency required. Set RESEND_API_KEY and
 * optionally RESEND_FROM_ADDRESS (defaults to noreply@YOUR_DOMAIN).
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function fromAddress(): string {
  return process.env.RESEND_FROM_ADDRESS?.trim() || 'FRAOS <noreply@YOUR_DOMAIN>'
}

export type SendEmailResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string }

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not configured.' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: `Resend error (${res.status}): ${text.slice(0, 200)}` }
  }

  const body = (await res.json().catch(() => ({}))) as { id?: string }
  return { ok: true, messageId: body.id ?? null }
}

export async function sendBuildReadyEmail(input: {
  to: string
  displayName: string
  downloads: {
    controlWinUrl: string | null
    stationWinUrl: string | null
    controlMacUrl: string | null
  }
  accountUrl?: string
}): Promise<SendEmailResult> {
  const controlLinks: string[] = []
  if (input.downloads.controlMacUrl) {
    controlLinks.push(`<a href="${input.downloads.controlMacUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px;">Download for macOS</a>`)
  }
  if (input.downloads.controlWinUrl) {
    controlLinks.push(`<a href="${input.downloads.controlWinUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Download for Windows</a>`)
  }

  const stationLink = input.downloads.stationWinUrl
    ? `<a href="${input.downloads.stationWinUrl}" style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;text-decoration:none;border-radius:6px;">Download Station for Windows</a>`
    : '<p>Station installer will be available shortly.</p>'

  const accountLine = input.accountUrl
    ? `<p style="margin-top:24px;font-size:14px;color:#6b7280;">You can re-download your installers anytime from <a href="${input.accountUrl}" style="color:#2563eb;">your account page</a>.</p>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937;">
  <h1 style="font-size:24px;margin-bottom:8px;">Your FRAOS Standard download is ready</h1>
  <p style="color:#6b7280;margin-bottom:24px;">Hi ${input.displayName},</p>
  <p style="line-height:1.6;margin-bottom:24px;">Your custom installers are built and ready. Each installer connects directly to your private cloud hub — just install and sign in with your Borean Astro account to activate.</p>

  <h2 style="font-size:18px;margin-bottom:12px;">Borean Control</h2>
  <p style="margin-bottom:16px;">${controlLinks.length > 0 ? controlLinks.join('') : 'Installers not available yet.'}</p>

  <h2 style="font-size:18px;margin-bottom:12px;">Borean Station</h2>
  <p style="margin-bottom:16px;">${stationLink}</p>

  ${accountLine}

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="font-size:13px;color:#9ca3af;">Borean Astro — Fully Remote Automated Observatory System</p>
</body>
</html>`

  const text = `Your FRAOS Standard download is ready

Hi ${input.displayName},

Your custom installers are built and ready. Each installer connects directly to your private cloud hub — just install and sign in with your Borean Astro account to activate.

Borean Control:
${input.downloads.controlMacUrl ? `- macOS: ${input.downloads.controlMacUrl}\n` : ''}${input.downloads.controlWinUrl ? `- Windows: ${input.downloads.controlWinUrl}\n` : ''}

Borean Station:
${input.downloads.stationWinUrl ? `- Windows: ${input.downloads.stationWinUrl}\n` : ''}

You can re-download your installers anytime from your account page.

Borean Astro — Fully Remote Automated Observatory System`

  return sendEmail({
    to: input.to,
    subject: 'Your FRAOS Standard download is ready',
    html,
    text,
  })
}
