import { NextRequest } from 'next/server'
import { contentJson, contentOptions } from '@/lib/content/cors'

export const runtime = 'nodejs'
export const maxDuration = 60

const NOVA_BASE = 'https://nova.astrometry.net/api'

type NovaSubmission = {
  jobs?: Array<number | null>
  processing_finished?: string | null
  error_message?: string | null
}

/** nova returns the literal string "None" while a submission is still queued. */
function novaProcessingFinished(value: unknown): boolean {
  if (value == null || value === false) return false
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'null') return false
    return true
  }
  return Boolean(value)
}

async function novaLogin(apiKey: string): Promise<string | null> {
  const body = new URLSearchParams({ 'request-json': JSON.stringify({ apikey: apiKey }) })
  try {
    const res = await fetch(`${NOVA_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    })
    const data = (await res.json()) as { status?: string; session?: string }
    return data.status === 'success' && data.session ? data.session : null
  } catch {
    return null
  }
}

export function OPTIONS() {
  return contentOptions()
}

/** Upload an image to astrometry.net nova and return the submission id for polling. */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ASTROMETRY_API_KEY
  if (!apiKey) {
    return contentJson(
      { error: 'Plate solving is not configured on the server (missing ASTROMETRY_API_KEY).' },
      503,
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return contentJson({ error: 'Expected a multipart form upload.' }, 400)
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return contentJson({ error: 'Missing image file.' }, 400)
  }
  if (file.size > 4 * 1024 * 1024) {
    return contentJson(
      {
        error: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum upload is 4 MB — use JPEG or let the app compress automatically.`,
      },
      413,
    )
  }

  const session = await novaLogin(apiKey)
  if (!session) {
    return contentJson({ error: 'astrometry.net authentication failed. Check the API key.' }, 502)
  }

  const upload = new FormData()
  upload.append(
    'request-json',
    JSON.stringify({
      session,
      publicly_visible: 'n',
      allow_modifications: 'n',
      allow_commercial_use: 'n',
    }),
  )
  const filename = file instanceof File && file.name ? file.name : 'upload.jpg'
  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = filename.toLowerCase().endsWith('.png')
    ? 'image/png'
    : filename.toLowerCase().match(/\.jpe?g$/)
      ? 'image/jpeg'
      : 'application/octet-stream'
  upload.append('file', new Blob([bytes], { type: mime }), filename)

  try {
    const res = await fetch(`${NOVA_BASE}/upload`, { method: 'POST', body: upload, cache: 'no-store' })
    const data = (await res.json()) as { status?: string; subid?: number }
    if (data.status !== 'success' || data.subid == null) {
      return contentJson({ error: 'astrometry.net upload was rejected.' }, 502)
    }
    return contentJson({ ok: true, subid: data.subid })
  } catch {
    return contentJson({ error: 'astrometry.net upload failed.' }, 502)
  }
}

/** Poll a submission: returns processing | solving | success (+calibration) | failure | no-job. */
export async function GET(request: NextRequest) {
  const subid = request.nextUrl.searchParams.get('subid')
  if (!subid) return contentJson({ error: 'Missing subid.' }, 400)

  let sub: NovaSubmission | null = null
  try {
    sub = await fetch(`${NOVA_BASE}/submissions/${subid}`, { cache: 'no-store' }).then((r) => r.json())
  } catch {
    return contentJson({ status: 'processing' })
  }

  const jobs = Array.isArray(sub?.jobs) ? sub!.jobs.filter((j): j is number => j != null) : []
  if (jobs.length === 0) {
    if (!novaProcessingFinished(sub?.processing_finished)) {
      return contentJson({ status: 'processing' })
    }
    const error =
      typeof sub?.error_message === 'string' && sub.error_message.trim()
        ? sub.error_message.trim()
        : null
    if (error) {
      return contentJson({ status: 'no-job', error })
    }
    // Nova may set processing_finished milliseconds before jobs[] is populated.
    return contentJson({ status: 'solving' })
  }

  const jobId = jobs[0]
  let job: { status?: string } | null = null
  try {
    job = await fetch(`${NOVA_BASE}/jobs/${jobId}`, { cache: 'no-store' }).then((r) => r.json())
  } catch {
    return contentJson({ status: 'solving' })
  }

  if (job?.status === 'failure') return contentJson({ status: 'failure' })
  if (job?.status !== 'success') return contentJson({ status: 'solving' })

  try {
    const cal = (await fetch(`${NOVA_BASE}/jobs/${jobId}/calibration/`, { cache: 'no-store' }).then((r) =>
      r.json(),
    )) as {
      pixscale?: number
      orientation?: number
      parity?: number
      radius?: number
      ra?: number
      dec?: number
    }
    return contentJson({
      status: 'success',
      calibration: {
        arcsecPerPixel: cal.pixscale ?? null,
        orientationDeg: cal.orientation ?? null,
        parity: cal.parity ?? null,
        radiusDeg: cal.radius ?? null,
        ra: cal.ra ?? null,
        dec: cal.dec ?? null,
      },
    })
  } catch {
    return contentJson({ status: 'solving' })
  }
}
