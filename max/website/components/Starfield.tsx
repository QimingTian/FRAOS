'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const STAR_COUNT = 3000
const FORWARD_SPEED = 70
const WORD_SPACING = 155
const WORD_LATERAL = 138
const WORD_AHEAD = 520
const WORD_VERTICAL = 14
const STAR_DEPTH_SPAN = 2100
const STAR_RECYCLE_SHIFT = 1400
const STAR_RECYCLE_Z = 40
const WORD_RECYCLE_Z = 40

const SPACE_WORDS = [
  'Intelligent',
  'Autonomous',
  'Adaptive',
  'Robust',
  'Fail-Safe',
  'Production-Ready',
  'Seamless',
  'Cloud-Native',
  'Intuitive',
  'Orchestrator',
  'Ecosystem',
  'Precision',
  'Efficiency',
  'Turnkey Solution',
] as const

type WordSlot = {
  mesh: THREE.Mesh
  track: number
  side: 1 | -1
}

function seededUnit(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function wordZ(track: number): number {
  return -WORD_AHEAD - track * WORD_SPACING
}

function createWordMesh(text: string, opacity: number): THREE.Mesh {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')

  const fontSize = text.length > 14 ? 20 : 24
  const font = `500 ${fontSize}px "SF Pro", "SF Pro Text", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif`
  ctx.font = font
  const width = Math.ceil(ctx.measureText(text).width) + 28
  const height = 56
  canvas.width = width
  canvas.height = height

  ctx.font = font
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const heightWorld = text.length > 14 ? 36 : 42
  const widthWorld = (width / height) * heightWorld
  const geometry = new THREE.PlaneGeometry(widthWorld, heightWorld)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.FrontSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData = { texture, material, geometry }

  return mesh
}

function layoutWord(slot: WordSlot): void {
  const y = (seededUnit(slot.track, 6) - 0.5) * WORD_VERTICAL * 2
  slot.mesh.position.set(slot.side * WORD_LATERAL, y, wordZ(slot.track))
}

function buildWordSlots(): WordSlot[] {
  return SPACE_WORDS.map((word, index) => {
    const side: 1 | -1 = index % 2 === 0 ? 1 : -1
    const opacity = 0.22 + seededUnit(index, 4) * 0.14
    const mesh = createWordMesh(word, opacity)
    const slot: WordSlot = { mesh, track: index, side }
    layoutWord(slot)
    return slot
  })
}

function advanceWords(slots: WordSlot[], delta: number): void {
  let maxTrack = slots.reduce((max, slot) => Math.max(max, slot.track), 0)

  slots.forEach((slot) => {
    slot.mesh.position.z += FORWARD_SPEED * delta
    if (slot.mesh.position.z <= WORD_RECYCLE_Z) return
    maxTrack += 1
    slot.track = maxTrack
    layoutWord(slot)
  })
}

function disposeWordSlots(slots: WordSlot[]): void {
  slots.forEach(({ mesh }) => {
    const { texture, material, geometry } = mesh.userData as {
      texture?: THREE.CanvasTexture
      material?: THREE.MeshBasicMaterial
      geometry?: THREE.PlaneGeometry
    }
    texture?.dispose()
    material?.dispose()
    geometry?.dispose()
  })
}

function sampleStarXY(): [number, number] {
  while (true) {
    const x = (Math.random() - 0.5) * 1400
    const y = (Math.random() - 0.5) * 900
    const nr = Math.hypot(x / 700, y / 450)
    const keepChance = 0.52 + 0.48 * Math.min(nr, 1)
    if (Math.random() < keepChance) return [x, y]
  }
}

function buildStars(): THREE.BufferGeometry {
  const positions = new Float32Array(STAR_COUNT * 3)
  const sizes = new Float32Array(STAR_COUNT)

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const i3 = i * 3
    const [x, y] = sampleStarXY()
    positions[i3] = x
    positions[i3 + 1] = y
    positions[i3 + 2] = -120 - Math.random() * STAR_DEPTH_SPAN
    sizes[i] = 2.35
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  return geometry
}

function advanceStars(geometry: THREE.BufferGeometry, delta: number): void {
  const positions = geometry.attributes.position.array as Float32Array
  const step = FORWARD_SPEED * delta

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const zi = i * 3 + 2
    positions[zi] += step
    const recycleAt = STAR_RECYCLE_Z + (i % 14) * 12
    if (positions[zi] > recycleAt) {
      positions[zi] -= STAR_RECYCLE_SHIFT
    }
  }

  geometry.attributes.position.needsUpdate = true
}

function setupCamera(camera: THREE.PerspectiveCamera): void {
  camera.position.set(0, 0, 0)
  camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, -1)
}

export function Starfield() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#08090a')
    scene.fog = new THREE.FogExp2('#08090a', 0.00078)

    const camera = new THREE.PerspectiveCamera(58, 1, 1, 2200)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#08090a')

    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    mount.appendChild(canvas)

    const geometry = buildStars()
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#eee9dc') },
      },
      vertexShader: `
        attribute float size;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = max(-mvPosition.z, 140.0);
          gl_PointSize = clamp(size * (240.0 / dist), 1.6, 3.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float d = length(p);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.22, d);
          gl_FragColor = vec4(uColor, alpha * 0.92);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })

    const stars = new THREE.Points(geometry, material)
    scene.add(stars)

    const wordSlots = buildWordSlots()
    const words = new THREE.Group()
    wordSlots.forEach(({ mesh }) => words.add(mesh))
    scene.add(words)

    setupCamera(camera)

    let raf = 0
    let last = performance.now()

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)

      const delta = Math.min((now - last) * 0.001, 0.05)
      last = now

      if (!reducedMotion) {
        advanceStars(geometry, delta)
        advanceWords(wordSlots, delta)
      }

      setupCamera(camera)
      renderer.render(scene, camera)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      geometry.dispose()
      material.dispose()
      disposeWordSlots(wordSlots)
      renderer.dispose()
      mount.removeChild(canvas)
    }
  }, [])

  return (
    <div ref={mountRef} className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden />
  )
}
