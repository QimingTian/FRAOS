export type PreviewEntry = {
  imageId: string
  queueId: string
  updatedAt: string
  contentType: string
  dataBase64: string
  frameNumber?: number
}

const memory = new Map<string, PreviewEntry>()
const frameCounts = new Map<string, number>()

export function upsertPreviewImage(
  queueId: string,
  imageId: string,
  contentType: string,
  dataBase64: string
): number {
  const prev = frameCounts.get(queueId) ?? 0
  const frameNumber = prev + 1
  frameCounts.set(queueId, frameNumber)
  const entry: PreviewEntry = {
    imageId,
    queueId,
    updatedAt: new Date().toISOString(),
    contentType,
    dataBase64,
    frameNumber,
  }
  memory.set(queueId, entry)
  return frameNumber
}

export function getPreviewImage(queueId: string): PreviewEntry | null {
  const entry = memory.get(queueId)
  return entry?.dataBase64 ? entry : null
}

export function removePreviewImage(queueId: string): void {
  memory.delete(queueId)
  frameCounts.delete(queueId)
}
