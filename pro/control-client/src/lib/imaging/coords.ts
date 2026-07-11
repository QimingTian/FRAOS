export function sexagesimalPartsFromRadec(raHours: number, decDeg: number) {
  const totalRaSec = raHours * 3600
  const raH = Math.floor(totalRaSec / 3600)
  const raM = Math.floor((totalRaSec - raH * 3600) / 60)
  const raS = totalRaSec - raH * 3600 - raM * 60
  const sign: '+' | '-' = decDeg < 0 ? '-' : '+'
  const absDec = Math.abs(decDeg)
  const decD = Math.floor(absDec)
  const decM = Math.floor((absDec - decD) * 60)
  const decS = (absDec - decD - decM / 60) * 3600
  return {
    raHourPart: String(raH),
    raMinutePart: String(raM),
    raSecondPart: String(Number(raS.toFixed(3))),
    decSign: sign,
    decDegreePart: String(decD),
    decMinutePart: String(decM),
    decSecondPart: String(Number(decS.toFixed(3))),
  }
}

export function applySexagesimalPartsFromRadec(
  raHours: number,
  decDeg: number,
  setRaHourPart: (v: string) => void,
  setRaMinutePart: (v: string) => void,
  setRaSecondPart: (v: string) => void,
  setDecSign: (v: string) => void,
  setDecDegreePart: (v: string) => void,
  setDecMinutePart: (v: string) => void,
  setDecSecondPart: (v: string) => void
) {
  const p = sexagesimalPartsFromRadec(raHours, decDeg)
  setRaHourPart(p.raHourPart)
  setRaMinutePart(p.raMinutePart)
  setRaSecondPart(p.raSecondPart)
  setDecSign(p.decSign)
  setDecDegreePart(p.decDegreePart)
  setDecMinutePart(p.decMinutePart)
  setDecSecondPart(p.decSecondPart)
}

export function parseCoordsFromFormParts(
  raHourPart: string,
  raMinutePart: string,
  raSecondPart: string,
  decSign: string,
  decDegreePart: string,
  decMinutePart: string,
  decSecondPart: string
): { ok: true; raHours: number; decDeg: number } | { ok: false; message: string } {
  const h = Number(raHourPart)
  const m = Number(raMinutePart)
  const s = Number(raSecondPart)
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) {
    return { ok: false, message: 'RA requires numeric Hour, Min, and Sec.' }
  }
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s >= 60) {
    return { ok: false, message: 'RA range: Hour 0-23, Min 0-59, Sec 0-59.999.' }
  }
  const raHours = h + m / 60 + s / 3600

  const dd = Number(decDegreePart)
  const dm = Number(decMinutePart)
  const ds = Number(decSecondPart)
  if (!Number.isFinite(dd) || !Number.isFinite(dm) || !Number.isFinite(ds)) {
    return { ok: false, message: 'Dec requires numeric Deg, Min, and Sec.' }
  }
  if (dd < 0 || dd > 90 || dm < 0 || dm > 59 || ds < 0 || ds >= 60) {
    return { ok: false, message: 'Dec range: Deg 0-90, Min 0-59, Sec 0-59.999.' }
  }
  let decDeg = dd + dm / 60 + ds / 3600
  if (decSign === '-') decDeg = -decDeg
  return {
    ok: true,
    raHours: Number(raHours.toFixed(8)),
    decDeg: Number(decDeg.toFixed(8)),
  }
}

export function formatTonightXAxisHour(ms: number): string {
  const d = new Date(ms)
  const h24 = d.getHours()
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  return `${h12}${ampm}`
}

export function formatDurationShort(totalSeconds: number | undefined): string {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return '--'
  const sec = Math.round(totalSeconds)
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
