import type { MosaicPanel } from '../lib/mosaic/framing-rectangle'

const FRAME_BORDER_CLASS = 'border-yellow-400/90'

type OverlayProps = {
  panels: MosaicPanel[]
  overlayRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
  showSingle: boolean
  singleRef: React.Ref<HTMLDivElement>
}

const frameSurfaceClass = (colorClass: string) =>
  `absolute left-1/2 top-1/2 z-[6] box-border border-2 ${colorClass} pointer-events-none bg-transparent`

export function PlanFrameOverlays({
  panels,
  overlayRefs,
  showSingle,
  singleRef,
}: OverlayProps) {
  if (showSingle) {
    return (
      <div
        ref={singleRef}
        aria-hidden
        className={frameSurfaceClass(FRAME_BORDER_CLASS)}
        style={{
          transform: 'translate(-50%, -50%) rotate(0deg)',
          transformOrigin: 'center center',
          width: '1px',
          height: '1px',
        }}
      />
    )
  }

  return (
    <>
      {panels.map((p) => (
        <div
          key={p.id}
          ref={(el) => {
            if (el) overlayRefs.current.set(p.id, el)
            else overlayRefs.current.delete(p.id)
          }}
          aria-hidden
          className={frameSurfaceClass(FRAME_BORDER_CLASS)}
          style={{
            transform: 'translate(-50%, -50%)',
            transformOrigin: 'center center',
            width: '1px',
            height: '1px',
          }}
        >
          <span
            className="pointer-events-none absolute -top-5 left-0 text-[10px] font-bold text-white drop-shadow"
            style={{
              transform: 'rotate(calc(-1 * var(--panel-rot, 0deg)))',
              transformOrigin: 'left center',
            }}
          >
            {p.id}
          </span>
        </div>
      ))}
    </>
  )
}
