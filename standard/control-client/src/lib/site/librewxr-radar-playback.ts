import type { TileLayer } from 'leaflet'
import type { LibrewxrFrame } from './librewxr'
import { contentApiPath } from '../content-base'

export const RADAR_OPACITY = 0.78
const CROSSFADE_MS = 320
const PRELOAD_TIMEOUT_MS = 1200

export function radarTileTemplate(framePath: string): string {
  return contentApiPath(`/api/librewxr/tiles${framePath}/256/{z}/{x}/{y}/7/1_1.png`)
}

export type RadarLayerPair = {
  a: TileLayer
  b: TileLayer
  active: 'a' | 'b'
}

export type RadarPlayback = {
  swap: RadarLayerPair
  frames: LibrewxrFrame[]
  currentUrl: string | null
  readyUrl: string | null
  readyPath: string | null
  loadingGen: number
  crossfadeGen: number
  transitioning: boolean
}

function pair(swap: RadarLayerPair): { active: TileLayer; inactive: TileLayer } {
  const active = swap.active === 'a' ? swap.a : swap.b
  const inactive = swap.active === 'a' ? swap.b : swap.a
  return { active, inactive }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

export function createRadarPlayback(swap: RadarLayerPair, frames: LibrewxrFrame[]): RadarPlayback {
  const initial = frames[frames.length - 1]
  const currentUrl = initial ? radarTileTemplate(initial.path) : null
  return {
    swap,
    frames,
    currentUrl,
    readyUrl: null,
    readyPath: null,
    loadingGen: 0,
    crossfadeGen: 0,
    transitioning: false,
  }
}

function preloadPath(playback: RadarPlayback, path: string, onReady?: () => void): void {
  const url = radarTileTemplate(path)
  if (playback.readyUrl === url) {
    onReady?.()
    return
  }

  const { inactive } = pair(playback.swap)
  const gen = ++playback.loadingGen

  inactive.setOpacity(0)
  inactive.setUrl(url)

  let done = false
  const finish = () => {
    if (done || gen !== playback.loadingGen) return
    done = true
    inactive.off('load', finish)
    window.clearTimeout(timer)
    playback.readyUrl = url
    playback.readyPath = path
    onReady?.()
  }

  const timer = window.setTimeout(finish, PRELOAD_TIMEOUT_MS)
  inactive.on('load', finish)
}

function crossfade(playback: RadarPlayback, onDone: () => void): void {
  const { active, inactive } = pair(playback.swap)
  playback.transitioning = true
  const gen = ++playback.crossfadeGen
  const start = performance.now()

  const tick = (now: number) => {
    if (gen !== playback.crossfadeGen) return
    const t = easeInOut(Math.min(1, (now - start) / CROSSFADE_MS))
    active.setOpacity(RADAR_OPACITY * (1 - t))
    inactive.setOpacity(RADAR_OPACITY * t)
    if (t < 1) {
      requestAnimationFrame(tick)
      return
    }
    active.setOpacity(0)
    inactive.setOpacity(RADAR_OPACITY)
    playback.swap.active = playback.swap.active === 'a' ? 'b' : 'a'
    playback.readyUrl = null
    playback.readyPath = null
    playback.transitioning = false
    onDone()
  }

  requestAnimationFrame(tick)
}

export function preloadNextFrame(playback: RadarPlayback, afterIndex: number): void {
  if (playback.frames.length < 2) return
  const next = (afterIndex + 1) % playback.frames.length
  const nextPath = playback.frames[next]!.path
  const nextUrl = radarTileTemplate(nextPath)
  if (nextUrl === playback.currentUrl || nextUrl === playback.readyUrl) return
  preloadPath(playback, nextPath)
}

export function goToFrameIndex(playback: RadarPlayback, index: number): void {
  const frame = playback.frames[index]
  if (!frame) return

  const path = frame.path
  const url = radarTileTemplate(path)

  if (url === playback.currentUrl) {
    preloadNextFrame(playback, index)
    return
  }

  playback.loadingGen++
  playback.crossfadeGen++
  const { active, inactive } = pair(playback.swap)
  active.setOpacity(RADAR_OPACITY)
  inactive.setOpacity(0)
  playback.transitioning = false

  const afterShow = () => {
    playback.currentUrl = url
    preloadNextFrame(playback, index)
  }

  const reveal = () => {
    if (playback.readyUrl !== url) return
    crossfade(playback, afterShow)
  }

  if (playback.readyUrl === url) {
    reveal()
    return
  }

  preloadPath(playback, path, reveal)
}
