import type { CSSProperties, ReactNode } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { LogoFit } from '@/lib/logo-fit'

export type SampleTeam = { name: string; logoUrl: string | null; logoFit: LogoFit | null; color: string | null }
export type SampleMatch = {
  reeks: string
  home: SampleTeam
  away: SampleTeam
  score: { home: number; away: number }
  crosses?: { home: number; away: number }
  timeouts?: { home: number; away: number }
}

// Clubkleuren als CSS-variabelen op de rij (val terug op het accent-blauw zonder kleur).
const vars = (m: SampleMatch): CSSProperties =>
  ({ '--hc': m.home.color ?? 'var(--accent)', '--ac': m.away.color ?? 'var(--accent)' }) as CSSProperties

// Verzorgde ronde clublogo-badge (rond, clubkleur-ring, glans, juiste in-/uitzoom).
function Badge({ team, side, size }: { team: SampleTeam; side: 'home' | 'away'; size: number }) {
  return <TeamLogo name={team.name} logoUrl={team.logoUrl} logoFit={team.logoFit} ringColor={team.color} side={side} size={size} />
}

const Live = () => <span className="ll-livebadge">LIVE</span>
function Stats({ m }: { m: SampleMatch }) {
  return (
    <span className="ll-stats">
      <span>✖ {m.crosses?.home ?? 0}–{m.crosses?.away ?? 0}</span>
      <span className="ll-sep">·</span>
      <span>⏱ {m.timeouts?.home ?? 0}–{m.timeouts?.away ?? 0}</span>
    </span>
  )
}

// Vier variaties op de poster-look (variant 5), telkens met een beter leesbare clubnaam.
// a = donkere leesband · b = glasplaat · c = contourtekst · d = kleur enkel aan de randen.
function Poster({ m, v }: { m: SampleMatch; v: 'a' | 'b' | 'c' | 'd' }) {
  return (
    <div className={`pw-row pw-${v}`} style={vars(m)}>
      <span className="pw-wash left" aria-hidden />
      <span className="pw-wash right" aria-hidden />
      <span className="pw-badge"><Badge team={m.home} side="home" size={52} /></span>
      <span className="pw-name home"><span className="pw-name-in">{m.home.name}</span></span>
      <span className="pw-mid"><Live /><span className="pw-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
      <span className="pw-name away"><span className="pw-name-in">{m.away.name}</span></span>
      <span className="pw-badge"><Badge team={m.away} side="away" size={52} /></span>
    </div>
  )
}

const VARIANTS: { key: string; title: string; desc: string; render: (m: SampleMatch, i: number) => ReactNode }[] = [
  { key: 'A', title: 'Poster · leesband', desc: 'Een subtiele donkere band achter de naam — de kleur blijft, maar de tekst staat altijd op een rustige basis.', render: (m, i) => <Poster key={i} m={m} v="a" /> },
  { key: 'B', title: 'Poster · glasplaat', desc: 'De naam op een matglazen plaatje (frosted) — premium en zeer leesbaar.', render: (m, i) => <Poster key={i} m={m} v="b" /> },
  { key: 'C', title: 'Poster · contourtekst', desc: 'Witte naam met een fijne donkere contour — knalt op elke clubkleur, geen plaatje nodig.', render: (m, i) => <Poster key={i} m={m} v="c" /> },
  { key: 'D', title: 'Poster · kleur aan de randen', desc: 'De kleur en logo’s zitten aan de randen; het naam-gebied blijft donker → maximale leesbaarheid.', render: (m, i) => <Poster key={i} m={m} v="d" /> },
]

export function LiveLookLab({ samples }: { samples: SampleMatch[] }) {
  return (
    <div className="ll-lab">
      {VARIANTS.map((v) => (
        <section key={v.key} className="ll-variant">
          <h2 className="ll-vh">
            <span className="ll-vbadge">{v.key}</span>
            {v.title}
            <span className="ll-vdesc">{v.desc}</span>
          </h2>
          <div className="ll-cards">
            {samples.map((m, i) => (
              <div className="ll-card" key={i}>
                {v.render(m, i)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
