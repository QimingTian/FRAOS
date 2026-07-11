import { invoke } from '@tauri-apps/api/core'
import { contentApiPath } from './content-base'
import {
  astrometryApiOrientationToImageTopPA,
  astrometryOrientationToPositionAngle,
} from './imaging/plate-solve-orientation'

export type PlateSolveResult = {
  arcsecPerPixel: number
  /** NINA rotator position angle (Settings field). */
  orientationDeg: number | null
  /** Image top edge on sky — use for Atlas camera-frame overlay. */
  fieldRotationDeg: number | null
  rawImageOrientationDeg: number | null
  parity: number | null
  sensorWidthPx: number
  sensorHeightPx: number
  fovWidthDeg: number
  fovHeightDeg: number
}

export type PlateSolveStatus = 'reading' | 'solving' | 'success' | 'failure'

type PlateSolvePollResult = {
  status: string
  error?: string | null
  arcsecPerPixel?: number | null
  orientationDeg?: number | null
  parity?: number | null
  calibration?: {
    arcsecPerPixel?: number | null
    orientationDeg?: number | null
    parity?: number | null
  }
}

/** Vercel serverless body limit is ~4.5 MB — stay under this for the proxy upload. */
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the image.'))
    }
    img.src = url
  })
}

function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  return loadImageFromFile(file).then((img) => ({
    width: img.naturalWidth,
    height: img.naturalHeight,
  }))
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image for upload.'))),
      type,
      quality,
    )
  })
}

/**
 * astrometry.net accepts JPEG/FITS; large PNGs exceed the server proxy limit.
 * Re-encode as JPEG at full resolution when needed (keeps plate scale valid).
 */
async function prepareUploadBlob(file: File): Promise<{ blob: Blob; fileName: string }> {
  if (file.size <= MAX_UPLOAD_BYTES) {
    return { blob: file, fileName: file.name || 'upload.jpg' }
  }

  const img = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the image for upload.')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)

  const baseName = (file.name || 'upload').replace(/\.[^.]+$/, '')
  for (const quality of [0.92, 0.85, 0.75, 0.65, 0.55]) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return { blob, fileName: `${baseName}.jpg` }
    }
  }

  throw new Error(
    `Image is too large to upload (${(file.size / 1024 / 1024).toFixed(1)} MB). Try a smaller export or crop.`,
  )
}

function friendlyFetchError(ex: unknown): string {
  const msg = ex instanceof Error ? ex.message : String(ex)
  if (/413|payload too large|too large/i.test(msg)) {
    return 'Image file is too large for plate solving. The app will compress automatically on retry — if this persists, use a smaller JPEG.'
  }
  if (/load failed|failed to fetch|networkerror|network error/i.test(msg)) {
    return 'Could not reach the plate-solve service. Check your internet connection and try again.'
  }
  return msg || 'Plate solving failed.'
}

async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (ex) {
    throw new Error(friendlyFetchError(ex))
  }
}

const POLL_INTERVAL_MS = 4000
const MAX_WAIT_MS = 4 * 60 * 1000

function pollCalibration(data: PlateSolvePollResult): {
  arcsecPerPixel: number | null
  orientationDeg: number | null
  parity: number | null
} {
  const arcsecPerPixel =
    data.arcsecPerPixel ?? data.calibration?.arcsecPerPixel ?? null
  const orientationDeg =
    data.orientationDeg ?? data.calibration?.orientationDeg ?? null
  const parity = data.parity ?? data.calibration?.parity ?? null
  return { arcsecPerPixel, orientationDeg, parity }
}

async function uploadPhoto(blob: Blob, fileName: string): Promise<number> {
  if (isTauri()) {
    const fileBytes = new Uint8Array(await blob.arrayBuffer())
    return tauriInvoke<number>('control_plate_solve_upload', { fileBytes, fileName })
  }

  const form = new FormData()
  form.append('file', blob, fileName)
  let res: Response
  try {
    res = await fetch(contentApiPath('/api/astrometry/solve'), { method: 'POST', body: form })
  } catch (ex) {
    throw new Error(friendlyFetchError(ex))
  }
  const data = (await res.json().catch(() => null)) as { subid?: number; error?: string } | null
  if (res.status === 413) {
    throw new Error('Image file is too large for upload. Try a smaller JPEG.')
  }
  if (!res.ok || !data?.subid) {
    throw new Error(data?.error || `Upload failed (HTTP ${res.status}).`)
  }
  return data.subid
}

async function pollSubmission(subid: number): Promise<PlateSolvePollResult> {
  if (isTauri()) {
    return tauriInvoke<PlateSolvePollResult>('control_plate_solve_poll', { subid })
  }

  let res: Response
  try {
    res = await fetch(contentApiPath(`/api/astrometry/solve?subid=${subid}`), { cache: 'no-store' })
  } catch (ex) {
    throw new Error(friendlyFetchError(ex))
  }
  return (await res.json()) as PlateSolvePollResult
}

/** Upload a photo to the astrometry.net proxy and poll until it solves. */
export async function solvePhoto(
  file: File,
  onStatus?: (status: PlateSolveStatus) => void,
): Promise<PlateSolveResult> {
  onStatus?.('reading')
  const { width, height } = await readImageSize(file)
  if (!(width > 0) || !(height > 0)) throw new Error('Image has no pixel dimensions.')

  const { blob, fileName } = await prepareUploadBlob(file)

  onStatus?.('solving')
  const subid = await uploadPhoto(blob, fileName)

  const deadline = Date.now() + MAX_WAIT_MS
  let bareNoJobPolls = 0
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const data = await pollSubmission(subid)
    if (data.status === 'failure') {
      const detail = typeof data.error === 'string' ? data.error.trim() : ''
      throw new Error(detail || 'Plate solving could not find a match for this image.')
    }
    if (data.status === 'no-job') {
      const detail = typeof data.error === 'string' ? data.error.trim() : ''
      if (detail) {
        throw new Error(detail)
      }
      bareNoJobPolls += 1
      if (bareNoJobPolls >= 3) {
        throw new Error('Plate solving could not find a match for this image.')
      }
      continue
    }
    bareNoJobPolls = 0
    const cal = pollCalibration(data)
    if (data.status === 'success' && cal.arcsecPerPixel) {
      const arcsecPerPixel = cal.arcsecPerPixel
      onStatus?.('success')
      const rawOrientation = cal.orientationDeg
      const parity = cal.parity ?? null
      return {
        arcsecPerPixel,
        orientationDeg:
          rawOrientation != null
            ? astrometryOrientationToPositionAngle(rawOrientation)
            : null,
        fieldRotationDeg:
          rawOrientation != null
            ? astrometryApiOrientationToImageTopPA(rawOrientation, 'jpeg')
            : null,
        rawImageOrientationDeg: rawOrientation,
        parity,
        sensorWidthPx: width,
        sensorHeightPx: height,
        fovWidthDeg: (arcsecPerPixel * width) / 3600,
        fovHeightDeg: (arcsecPerPixel * height) / 3600,
      }
    }
  }
  throw new Error('Plate solving timed out. Try a smaller / clearer image.')
}
