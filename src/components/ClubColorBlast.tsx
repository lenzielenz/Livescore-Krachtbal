'use client'

// Fullscreen-viering in de clubkleuren: opstijgende rook + vuurwerk in de twee tinten van de club.
// Bewust een aparte component zodat het scorebord licht blijft; alles is CSS-gedreven (zie
// scoreboard.css → .ccb*) en respecteert prefers-reduced-motion.
export function ClubColorBlast({ colors, teamName }: { colors: { primary: string; secondary: string }; teamName?: string }) {
  const c1 = colors.primary
  const c2 = colors.secondary || colors.primary
  return (
    <div className="ccb" style={{ ['--c1' as string]: c1, ['--c2' as string]: c2 }} aria-hidden>
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
