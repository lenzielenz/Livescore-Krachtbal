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

const vars = (m: SampleMatch): CSSProperties =>
  ({ '--hc': m.home.color ?? 'var(--accent)', '--ac': m.away.color ?? 'var(--accent)' }) as CSSProperties

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

// Look B (Glas) — gekozen — met bewegende achtergrond (driftende kleur + zwevende glow-blobs) en
// een glans-veeg die periodiek over de kop sweept. Alle beweging is reduce-motion-veilig (CSS).
function LookB({ m }: { m: SampleMatch }) {
  return (
    <div className="pb-card" style={vars(m)}>
      <div className="pb-head">
        <span className="pb-blobs" aria-hidden />
        <span className="pb-gl" aria-hidden />
        <span className="pb-badge"><Badge team={m.home} side="home" size={58} /></span>
        <span className="pb-center"><Live /><span className="pb-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
        <span className="pb-badge"><Badge team={m.away} side="away" size={58} /></span>
      </div>
      <div className="pb-names">
        <span className="pb-name home">{m.home.name}</span>
        <span className="pb-name away">{m.away.name}</span>
      </div>
    </div>
  )
}

const VARIANTS: { key: string; title: string; desc: string; render: (m: SampleMatch, i: number) => ReactNode }[] = [
  { key: 'B', title: 'Glas · met beweging & glans', desc: 'De gekozen look, nu met een rustig driftende kleur-achtergrond, zwevende glow-blobs en een glans-veeg over de kop. Beweging valt weg bij “reduce motion”.', render: (m, i) => <LookB key={i} m={m} /> },
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
