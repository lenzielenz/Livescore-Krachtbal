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

// Verzorgde ronde clublogo-badge (zoals overal in de app): rond geknipt, clubkleur-ring, glans en
// met de juiste in-/uitzoom (logoFit) zodat een wapenschild de badge mooi vult — geen vierkant blok.
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

// ── V1 — Kleurwaaier: clubkleur bloedt vanaf beide randen ───────────────────────
function LookD1({ m }: { m: SampleMatch }) {
  return (
    <div className="d1-row" style={vars(m)}>
      <span className="d1-badge"><Badge team={m.home} side="home" size={42} /></span>
      <span className="d1-name home">{m.home.name}</span>
      <span className="d1-mid"><Live /><span className="d1-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
      <span className="d1-name away">{m.away.name}</span>
      <span className="d1-badge"><Badge team={m.away} side="away" size={42} /></span>
    </div>
  )
}

// ── V2 — Kleur-glow: de badge gloeit in de clubkleur ───────────────────────────
function LookD2({ m }: { m: SampleMatch }) {
  return (
    <div className="d2-row" style={vars(m)}>
      <span className="d2-badge home"><Badge team={m.home} side="home" size={44} /></span>
      <span className="d2-name home">{m.home.name}</span>
      <span className="d2-mid"><Live /><span className="d2-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
      <span className="d2-name away">{m.away.name}</span>
      <span className="d2-badge away"><Badge team={m.away} side="away" size={44} /></span>
    </div>
  )
}

// ── V3 — Diagonale arena-banden in de clubkleuren ──────────────────────────────
function LookD3({ m }: { m: SampleMatch }) {
  return (
    <div className="d3-row" style={vars(m)}>
      <span className="d3-band left" aria-hidden />
      <span className="d3-band right" aria-hidden />
      <span className="d3-badge"><Badge team={m.home} side="home" size={42} /></span>
      <span className="d3-name home">{m.home.name}</span>
      <span className="d3-mid"><Live /><span className="d3-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
      <span className="d3-name away">{m.away.name}</span>
      <span className="d3-badge"><Badge team={m.away} side="away" size={42} /></span>
    </div>
  )
}

// ── V4 — Clean matchup: clubkleur-ring, ploegnaam in clubkleur, zachte waas ─────
function LookD4({ m }: { m: SampleMatch }) {
  return (
    <div className="d4-row" style={vars(m)}>
      <span className="d4-badge"><Badge team={m.home} side="home" size={44} /></span>
      <span className="d4-name home" style={{ '--c': m.home.color ?? 'var(--txt)' } as CSSProperties}>{m.home.name}</span>
      <span className="d4-mid"><Live /><span className="d4-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
      <span className="d4-name away" style={{ '--c': m.away.color ?? 'var(--txt)' } as CSSProperties}>{m.away.name}</span>
      <span className="d4-badge"><Badge team={m.away} side="away" size={44} /></span>
    </div>
  )
}

// ── V5 — Poster-wash: vol kleurverloop met een grotere badge-anker ─────────────
function LookD5({ m }: { m: SampleMatch }) {
  return (
    <div className="d5-row" style={vars(m)}>
      <span className="d5-wash left" aria-hidden />
      <span className="d5-wash right" aria-hidden />
      <span className="d5-badge"><Badge team={m.home} side="home" size={52} /></span>
      <span className="d5-name home">{m.home.name}</span>
      <span className="d5-mid"><Live /><span className="d5-score">{m.score.home} – {m.score.away}</span><Stats m={m} /></span>
      <span className="d5-name away">{m.away.name}</span>
      <span className="d5-badge"><Badge team={m.away} side="away" size={52} /></span>
    </div>
  )
}

const VARIANTS: { key: string; title: string; desc: string; render: (m: SampleMatch, i: number) => ReactNode }[] = [
  { key: '1', title: 'Kleurwaaier', desc: 'Clubkleur bloedt vanaf beide randen naar binnen; verzorgde ronde badges aan de zijkanten.', render: (m, i) => <LookD1 key={i} m={m} /> },
  { key: '2', title: 'Kleur-glow', desc: 'De ronde badge gloeit in de clubkleur — vivid, maar rustig in het midden.', render: (m, i) => <LookD2 key={i} m={m} /> },
  { key: '3', title: 'Diagonale banden', desc: 'Schuine arena-banden in de clubkleuren, met de badge erop. Sportief poster-gevoel.', render: (m, i) => <LookD3 key={i} m={m} /> },
  { key: '4', title: 'Clean matchup', desc: 'Clubkleur-ring rond de badge, ploegnaam in de clubkleur, zachte tweekleurige waas. Strak & premium.', render: (m, i) => <LookD4 key={i} m={m} /> },
  { key: '5', title: 'Poster-wash', desc: 'Vol kleurverloop met een grotere badge als anker. Het meest uitgesproken.', render: (m, i) => <LookD5 key={i} m={m} /> },
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
