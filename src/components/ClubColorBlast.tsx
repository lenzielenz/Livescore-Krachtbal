'use client'

// Viering in de clubkleuren: opstijgende rook + vuurwerk in de twee tinten van de club.
// `contained` = ingesloten variant (vult de positioned ouder i.p.v. het volledige scherm),
// bv. voor één wedstrijdvak op het kantinescherm. Alles is CSS-gedreven (zie scoreboard.css →
// .ccb*) en respecteert prefers-reduced-motion.
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
  return (
    <div className={`ccb${contained ? ' ccb--in' : ''}`} style={{ ['--c1' as string]: c1, ['--c2' as string]: c2 }} aria-hidden>
      <div className="ccb-flash" />
      <div className="ccb-smoke">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className={`ccb-plume p${i}`} />
        ))}
      </div>
      <div className="ccb-fireworks">
        {Array.from({ length: 22 }).map((_, i) => (
          <span key={i} className={`ccb-spark s${i % 11}`} />
        ))}
      </div>
      {teamName && <div className="ccb-banner">🎆 {teamName}</div>}
    </div>
  )
}
