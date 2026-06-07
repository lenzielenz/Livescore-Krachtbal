'use client'

import { useMemo } from 'react'

// Viering in de clubkleuren: een confetti-regen (+ korte kleur-pop) in de twee tinten van de club.
// Veel kleine, scherpe stukjes i.p.v. zware vervaagde rookpluimen → vloeiend en festief, zonder
// strepen of gehakkel. `contained` = ingesloten variant (vult de positioned ouder, bv. een
// kantine-tegel) i.p.v. het volledige scherm. Respecteert prefers-reduced-motion (zie CSS).
export function ClubColorBlast({
  colors,
  teamName,
  contained = false,
}: {
  colors: { primary: string; secondary: string }
  teamName?: string
  contained?: boolean
}) {
  const c1 = colors.primary
  const c2 = colors.secondary || colors.primary
  const pieces = useMemo(() => {
    const palette = [c1, c2, '#ffffff', c1, c2]
    return Array.from({ length: contained ? 28 : 64 }).map((_, i) => {
      const round = Math.random() < 0.3
      return {
        x: Math.random() * 100,
        dx: (Math.random() * 2 - 1) * (contained ? 50 : 150),
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 760),
        dur: 1.7 + Math.random() * 1.6,
        delay: Math.random() * (contained ? 0.4 : 0.7),
        w: round ? 8 : 6 + Math.random() * 5,
        h: round ? 8 : 9 + Math.random() * 8,
        col: palette[i % palette.length],
        round,
      }
    })
  }, [c1, c2, contained])

  return (
    <div className={`ccb${contained ? ' ccb--in' : ''}`} style={{ ['--c1' as string]: c1, ['--c2' as string]: c2 }} aria-hidden>
      <div className="ccb-flash" />
      <div className="ccb-pop" />
      {pieces.map((p, i) => (
        <span
          key={i}
          className="ccb-conf"
          style={{
            left: `${p.x}%`,
            width: `${p.w}px`,
            height: `${p.h}px`,
            background: p.col,
            borderRadius: p.round ? '50%' : '1px',
            ['--dx' as string]: `${p.dx}px`,
            ['--spin' as string]: `${p.spin}deg`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      {teamName && <div className="ccb-banner">{teamName}</div>}
    </div>
  )
}
