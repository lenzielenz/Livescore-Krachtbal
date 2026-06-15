import type { Ad } from '@/lib/ads'

export type { Ad }

// Scrollende reclamebalk (boven- of onderaan het veldscherm). De lijst wordt verdubbeld zodat de
// animatie naadloos doorloopt; de snelheid schaalt mee met het aantal reclames.
export function AdMarquee({ ads, position }: { ads: Ad[]; position: 'top' | 'bottom' }) {
  if (ads.length === 0) return null
  const duration = Math.max(24, ads.length * 9)
  const loop = [...ads, ...ads]
  return (
    <div className={`fs-ad fs-ad-${position}`} aria-hidden>
      <div className="fs-ad-track" style={{ animationDuration: `${duration}s` }}>
        {loop.map((a, i) => (
          <span className="fs-ad-item" key={`${a.id}-${i}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.naam} draggable={false} />
          </span>
        ))}
      </div>
    </div>
  )
}
