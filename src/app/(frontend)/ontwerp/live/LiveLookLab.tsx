/* eslint-disable @next/next/no-img-element -- bewuste rauwe <img> voor logo-in-de-balk-effecten in deze ontwerp-speeltuin */
import type { CSSProperties, ReactNode } from 'react'

export type SampleTeam = { name: string; logoUrl: string | null; color: string | null }
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

const Badge = () => <span className="ll-livebadge">LIVE</span>
function Stats({ m }: { m: SampleMatch }) {
  return (
    <span className="ll-stats">
      <span>✖ {m.crosses?.home ?? 0}–{m.crosses?.away ?? 0}</span>
      <span className="ll-sep">·</span>
      <span>⏱ {m.timeouts?.home ?? 0}–{m.timeouts?.away ?? 0}</span>
    </span>
  )
}

// ── V1 — Kleurwaaier: clubkleur bloedt vanaf elke rand naar binnen + logo-bleed ──
function LookD1({ m }: { m: SampleMatch }) {
  return (
    <div className="d1-row" style={vars(m)}>
      {m.home.logoUrl && <img className="d1-bleed left" src={m.home.logoUrl} alt="" aria-hidden />}
      {m.away.logoUrl && <img className="d1-bleed right" src={m.away.logoUrl} alt="" aria-hidden />}
      <span className="d1-team home">{m.home.name}</span>
      <span className="d1-mid">
        <Badge />
        <span className="d1-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="d1-team away">{m.away.name}</span>
    </div>
  )
}

// ── V2 — Kleur-glow: het logo gloeit in de clubkleur aan elke kant ──────────────
function LookD2({ m }: { m: SampleMatch }) {
  return (
    <div className="d2-row" style={vars(m)}>
      {m.home.logoUrl && <img className="d2-logo left" src={m.home.logoUrl} alt="" aria-hidden />}
      {m.away.logoUrl && <img className="d2-logo right" src={m.away.logoUrl} alt="" aria-hidden />}
      <span className="d2-team home">{m.home.name}</span>
      <span className="d2-mid">
        <Badge />
        <span className="d2-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="d2-team away">{m.away.name}</span>
    </div>
  )
}

// ── V3 — Diagonale arena-banden in de clubkleuren ──────────────────────────────
function LookD3({ m }: { m: SampleMatch }) {
  return (
    <div className="d3-row" style={vars(m)}>
      <span className="d3-band left" aria-hidden />
      <span className="d3-band right" aria-hidden />
      {m.home.logoUrl && <img className="d3-logo left" src={m.home.logoUrl} alt="" aria-hidden />}
      {m.away.logoUrl && <img className="d3-logo right" src={m.away.logoUrl} alt="" aria-hidden />}
      <span className="d3-team home">{m.home.name}</span>
      <span className="d3-mid">
        <Badge />
        <span className="d3-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="d3-team away">{m.away.name}</span>
    </div>
  )
}

// ── V4 — Matchup-tegels: het logo in een gekleurd paneel ───────────────────────
function LookD4({ m }: { m: SampleMatch }) {
  const homeTile = { '--c': m.home.color ?? 'var(--accent)' } as CSSProperties
  const awayTile = { '--c': m.away.color ?? 'var(--accent)' } as CSSProperties
  return (
    <div className="d4-row" style={vars(m)}>
      <span className="d4-side home">
        <span className="d4-tile" style={homeTile}>
          {m.home.logoUrl ? <img src={m.home.logoUrl} alt="" aria-hidden /> : <b>{m.home.name.slice(0, 1)}</b>}
        </span>
        <span className="d4-name">{m.home.name}</span>
      </span>
      <span className="d4-mid">
        <Badge />
        <span className="d4-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="d4-side away">
        <span className="d4-name">{m.away.name}</span>
        <span className="d4-tile" style={awayTile}>
          {m.away.logoUrl ? <img src={m.away.logoUrl} alt="" aria-hidden /> : <b>{m.away.name.slice(0, 1)}</b>}
        </span>
      </span>
    </div>
  )
}

// ── V5 — Vol kleurverloop met groot logo-anker (poster-stijl) ───────────────────
function LookD5({ m }: { m: SampleMatch }) {
  return (
    <div className="d5-row" style={vars(m)}>
      <span className="d5-wash left" aria-hidden />
      <span className="d5-wash right" aria-hidden />
      {m.home.logoUrl && <img className="d5-logo left" src={m.home.logoUrl} alt="" aria-hidden />}
      {m.away.logoUrl && <img className="d5-logo right" src={m.away.logoUrl} alt="" aria-hidden />}
      <span className="d5-team home">{m.home.name}</span>
      <span className="d5-mid">
        <Badge />
        <span className="d5-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="d5-team away">{m.away.name}</span>
    </div>
  )
}

const VARIANTS: { key: string; title: string; desc: string; render: (m: SampleMatch, i: number) => ReactNode }[] = [
  { key: '1', title: 'Kleurwaaier', desc: 'Clubkleur bloedt vanaf beide randen naar binnen, met logo-bleed. Center blijft donker → score leesbaar.', render: (m, i) => <LookD1 key={i} m={m} /> },
  { key: '2', title: 'Kleur-glow', desc: 'Het logo gloeit in de clubkleur aan elke kant — vivid, maar rustig in het midden.', render: (m, i) => <LookD2 key={i} m={m} /> },
  { key: '3', title: 'Diagonale banden', desc: 'Schuine arena-banden in de clubkleuren, logo erop. Sportief poster-gevoel.', render: (m, i) => <LookD3 key={i} m={m} /> },
  { key: '4', title: 'Matchup-tegels', desc: 'Het logo in een gekleurd paneel met glow, namen ernaast. Strak en premium.', render: (m, i) => <LookD4 key={i} m={m} /> },
  { key: '5', title: 'Poster-wash', desc: 'Vol kleurverloop met een groot logo-anker dat uit de balk komt. Het meest uitgesproken.', render: (m, i) => <LookD5 key={i} m={m} /> },
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
