'use client'

import Image from 'next/image'
import type { ClientMark } from '@/lib/clients'

type ClientLogoMarqueeProps = {
  clients: ClientMark[]
}

export function ClientLogoMarquee({ clients }: ClientLogoMarqueeProps) {
  const track = [...clients, ...clients]

  return (
    <div className="relative mt-12 overflow-hidden">
      <div className="client-marquee-track flex w-max gap-6 px-6 md:gap-8 md:px-8">
        {track.map((client, index) => (
          <article
            key={`${client.name}-${index}`}
            className="glass-panel flex w-[min(72vw,280px)] shrink-0 flex-col items-center px-8 pt-7 pb-7 md:w-[320px]"
          >
            <div className="flex h-24 w-full shrink-0 items-center justify-center">
              <Image
                src={client.logoSrc}
                alt={client.name}
                width={839}
                height={647}
                className="h-24 w-auto max-w-full object-contain opacity-90"
              />
            </div>
            <p className="mt-7 shrink-0 text-center text-sm font-medium leading-snug text-fg/90">{client.name}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
