import gsap from 'gsap'
import { Flip } from 'gsap/Flip'

gsap.registerPlugin(Flip)

export function flipLayout(selector: string, mutate: () => void): void {
  const state = Flip.getState(selector)
  mutate()
  window.requestAnimationFrame(() => {
    Flip.from(state, {
      duration: 0.42,
      ease: 'power3.out',
      nested: true,
      absolute: true,
    })
  })
}
