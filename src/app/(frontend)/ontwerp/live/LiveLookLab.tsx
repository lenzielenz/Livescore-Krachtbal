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

// ── A — Spotlight: groot logo met een kleur-spotlight erachter + slagschaduw ────
function LookA({ m }: { m: SampleMatch }) {
  return (
    <div className="pa-card" style={vars(m)}>
      <div className="pa-head">
        <span className="pa-spot left" aria-hidden />
        <span className="pa-spot right" aria-hidden />
        <span className="pa-badge"><Badge team={m.home} side="home" size={60} /></span>
        <span className="pa-center"><Live /><span className="pa-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
        <span className="pa-badge"><Badge team={m.away} side="away" size={60} /></span>
      </div>
      <div className="pa-names">
        <span className="pa-name home">{m.home.name}</span>
        <span className="pa-name away">{m.away.name}</span>
      </div>
    </div>
  )
}

// ── B — Glas: reflecterende glaskop, frosted namenstrook, zwevend logo ─────────
function LookB({ m }: { m: SampleMatch }) {
  return (
    <div className="pb-card" style={vars(m)}>
      <div className="pb-head">
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

// ── C — Gelaagd 3D: een opgetild gekleurd paneel, logo springt eruit ───────────
function LookC({ m }: { m: SampleMatch }) {
  return (
    <div className="pc-card" style={vars(m)}>
      <div className="pc-head">
        <span className="pc-badge"><Badge team={m.home} side="home" size={62} /></span>
        <span className="pc-center"><Live /><span className="pc-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
        <span className="pc-badge"><Badge team={m.away} side="away" size={62} /></span>
      </div>
      <div className="pc-names">
        <span className="pc-name home">{m.home.name}</span>
        <span className="pc-name away">{m.away.name}</span>
      </div>
    </div>
  )
}

const VARIANTS: { key: string; title: string; desc: string; render: (m: SampleMatch, i: number) => ReactNode }[] = [
  { key: 'A', title: 'Spotlight', desc: 'Groot logo met een kleur-spotlight erachter en een zachte slagschaduw — dramatisch en diep.', render: (m, i) => <LookA key={i} m={m} /> },
  { key: 'B', title: 'Glas', desc: 'Reflecterende glaskop met een matglazen namenstrook; het logo zweeft erboven. Heel premium.', render: (m, i) => <LookB key={i} m={m} /> },
  { key: 'C', title: 'Gelaagd 3D', desc: 'Een opgetild, gekleurd paneel met diepteschaduwen; het grote logo springt eruit.', render: (m, i) => <LookC key={i} m={m} /> },
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
