import Image from 'next/image'

type Aspect = 'wide' | 'hero' | 'station' | 'tall' | 'square' | 'auto'

type ProductMediaFrameProps = {
  src?: string
  alt: string
  /** Fallback descriptive label shown when no src is provided. */
  placeholderLabel?: string
  aspect?: Aspect
  priority?: boolean
  glow?: boolean
  className?: string
  sizes?: string
}

const ASPECT: Record<Exclude<Aspect, 'auto'>, string> = {
  wide: 'aspect-[16/10]',
  hero: 'aspect-[1024/639]',
  /** Station UI capture — 3024×1620, wider than Control hero frames. */
  station: 'aspect-[28/15]',
  tall: 'aspect-[3/4]',
  square: 'aspect-square',
}

export function ProductMediaFrame({
  src,
  alt,
  placeholderLabel,
  aspect = 'hero',
  priority = false,
  glow = false,
  className = '',
  sizes = '(min-width: 1280px) 1100px, 100vw',
}: ProductMediaFrameProps) {
  const aspectClass = aspect === 'auto' ? '' : ASPECT[aspect]

  return (
    <div className={`product-frame-wrap ${className}`.trim()}>
      {glow ? <div aria-hidden className="product-frame-glow" /> : null}
      <div className={`product-frame ${aspectClass}`.trim()}>
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            className="object-cover"
          />
        ) : (
          <div className="product-frame-placeholder" role="img" aria-label={placeholderLabel ?? alt}>
            <span className="product-frame-placeholder-label">{placeholderLabel ?? alt}</span>
          </div>
        )}
      </div>
    </div>
  )
}
