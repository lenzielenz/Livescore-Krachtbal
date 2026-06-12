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
const clr = (t: SampleTeam): CSSProperties => ({ '--c': t.color ?? 'var(--accent)' }) as CSSProperties

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

// ── 1 — Gestapeld: elk team een eigen regel → volledige naam, score rechts ──────
function Look1({ m }: { m: SampleMatch }) {
  const hw = m.score.home > m.score.away
  const aw = m.score.away > m.score.home
  return (
    <div className="g1-card">
      <div className="g1-top"><Live /><Stats m={m} /></div>
      <div className="g1-line">
        <Badge team={m.home} side="home" size={32} />
        <span className="g1-name">{m.home.name}</span>
        <span className={`g1-score ${hw ? 'win' : ''}`}>{m.score.home}</span>
      </div>
      <div className="g1-line">
        <Badge team={m.away} side="away" size={32} />
        <span className="g1-name">{m.away.name}</span>
        <span className={`g1-score ${aw ? 'win' : ''}`}>{m.score.away}</span>
      </div>
    </div>
  )
}

// ── 2 — Gestapeld met clubkleur-accent (kleurbalk + winnaar in clubkleur) ───────
function Look2({ m }: { m: SampleMatch }) {
  const hw = m.score.home > m.score.away
  const aw = m.score.away > m.score.home
  return (
    <div className="g2-card">
      <div className="g2-top"><Live /><Stats m={m} /></div>
      <div className="g2-line" style={clr(m.home)}>
        <Badge team={m.home} side="home" size={32} />
        <span className="g2-name">{m.home.name}</span>
        <span className={`g2-score ${hw ? 'win' : ''}`}>{m.score.home}</span>
      </div>
      <div className="g2-line" style={clr(m.away)}>
        <Badge team={m.away} side="away" size={32} />
        <span className="g2-name">{m.away.name}</span>
        <span className={`g2-score ${aw ? 'win' : ''}`}>{m.score.away}</span>
      </div>
    </div>
  )
}

// ── 3 — Poster-kop (logo's + score in kleur) met de volledige namen eronder ─────
function Look3({ m }: { m: SampleMatch }) {
  return (
    <div className="g3-card" style={vars(m)}>
      <div className="g3-head">
        <span className="g3-logo"><Badge team={m.home} side="home" size={40} /></span>
        <span className="g3-center"><Live /><span className="g3-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
        <span className="g3-logo"><Badge team={m.away} side="away" size={40} /></span>
      </div>
      <div className="g3-names">
        <span className="g3-name home">{m.home.name}</span>
        <span className="g3-name away">{m.away.name}</span>
      </div>
    </div>
  )
}

// ── 4 — Tweekleurige panelen: per team een eigen gekleurde regel ────────────────
function Look4({ m }: { m: SampleMatch }) {
  const hw = m.score.home > m.score.away
  const aw = m.score.away > m.score.home
  return (
    <div className="g4-card">
      <div className="g4-row" style={clr(m.home)}>
        <Badge team={m.home} side="home" size={34} />
        <span className="g4-name">{m.home.name}</span>
        <span className={`g4-score ${hw ? 'win' : ''}`}>{m.score.home}</span>
      </div>
      <div className="g4-row" style={clr(m.away)}>
        <Badge team={m.away} side="away" size={34} />
        <span className="g4-name">{m.away.name}</span>
        <span className={`g4-score ${aw ? 'win' : ''}`}>{m.score.away}</span>
      </div>
      <div className="g4-foot"><Live /><Stats m={m} /></div>
    </div>
  )
}

// ── 5 — Groot logo met de naam eronder (mag op twee regels), score in het midden ─
function Look5({ m }: { m: SampleMatch }) {
  return (
    <div className="g5-card" style={vars(m)}>
      <span className="g5-wash left" aria-hidden />
      <span className="g5-wash right" aria-hidden />
      <span className="g5-side">
        <Badge team={m.home} side="home" size={46} />
        <span className="g5-name">{m.home.name}</span>
      </span>
      <span className="g5-mid"><Live /><span className="g5-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
      <span className="g5-side">
        <Badge team={m.away} side="away" size={46} />
        <span className="g5-name">{m.away.name}</span>
      </span>
    </div>
  )
}

const VARIANTS: { key: string; title: string; desc: string; render: (m: SampleMatch, i: number) => ReactNode }[] = [
  { key: '1', title: 'Gestapeld', desc: 'Elk team op een eigen regel → de volledige naam past, score rechts. Het meest leesbaar.', render: (m, i) => <Look1 key={i} m={m} /> },
  { key: '2', title: 'Gestapeld · clubkleur', desc: 'Zelfde, met een clubkleur-balk per regel en de winnende score in de clubkleur.', render: (m, i) => <Look2 key={i} m={m} /> },
  { key: '3', title: 'Poster-kop + namen', desc: 'Kleurrijke kop met de logo’s en de score; de volledige namen staan rustig eronder.', render: (m, i) => <Look3 key={i} m={m} /> },
  { key: '4', title: 'Tweekleurige panelen', desc: 'Per team een eigen gekleurd paneel met groot logo en volledige naam.', render: (m, i) => <Look4 key={i} m={m} /> },
  { key: '5', title: 'Groot logo + naam eronder', desc: 'Prominente logo’s met de naam eronder (mag op twee regels), score groot in het midden.', render: (m, i) => <Look5 key={i} m={m} /> },
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
