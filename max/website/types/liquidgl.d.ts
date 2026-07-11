interface LiquidGLOptions {
  target?: string
  snapshot?: string
  resolution?: number
  refraction?: number
  bevelDepth?: number
  bevelWidth?: number
  frost?: number
  shadow?: boolean
  specular?: boolean
  reveal?: string
  tilt?: boolean
  tiltFactor?: number
  magnify?: number
  on?: { init?: (instance: unknown) => void }
}

interface LiquidGLRenderer {
  captureSnapshot?: () => Promise<boolean>
  __headerCapturePatched?: boolean
}

interface Window {
  liquidGL?: (options?: LiquidGLOptions) => unknown
  __liquidGLRenderer__?: LiquidGLRenderer
  __liquidGLHeaderInit__?: boolean
  html2canvas?: (...args: unknown[]) => Promise<HTMLCanvasElement>
}

declare const liquidGL: {
  (options?: LiquidGLOptions): unknown
  registerDynamic?: (elements: string | Element[]) => void
  syncWith?: () => { lenis?: unknown; locomotiveScroll?: unknown }
}
