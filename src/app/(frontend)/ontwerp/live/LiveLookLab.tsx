/* eslint-disable @next/next/no-img-element -- bewuste rauwe <img> voor watermerk/bleed-effecten in deze ontwerp-speeltuin */
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

// Klein logo of, zonder logo, een gekleurd initialen-schijfje. Eén bouwsteen voor alle looks.
function Logo({ team, size = 34, className }: { team: SampleTeam; size?: number; className?: string }) {
  const initials = team.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  if (team.logoUrl) {
    return <img src={team.logoUrl} alt="" width={size} height={size} className={className} style={{ width: size, height: size, objectFit: 'contain' }} />
  }
  return (
    <span
      className={className}
      style={{ width: size, height: size, background: team.color ?? 'var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: size * 0.38, fontWeight: 800, color: '#fff' }}
    >
      {initials}
    </span>
  )
}

function Stats({ m }: { m: SampleMatch }) {
  return (
    <span className="ll-stats">
      <span>✖ {m.crosses?.home ?? 0}–{m.crosses?.away ?? 0}</span>
      <span className="ll-sep">·</span>
      <span>⏱ {m.timeouts?.home ?? 0}–{m.timeouts?.away ?? 0}</span>
    </span>
  )
}

const Badge = () => <span className="ll-livebadge">LIVE</span>

// ── Variant A — Huidig (referentie) ──────────────────────────────────────────
function LookA({ m }: { m: SampleMatch }) {
  return (
    <div className="la-row">
      <span className="la-team home">
        <Logo team={m.home} size={34} className="la-logo" />
        <span className="la-name">{m.home.name}</span>
      </span>
      <span className="la-mid">
        <Badge />
        <span className="la-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="la-team away">
        <span className="la-name">{m.away.name}</span>
        <Logo team={m.away} size={34} className="la-logo" />
      </span>
    </div>
  )
}

// ── Variant B — Gestapeld (volledige namen, score rechts) ────────────────────
function LookB({ m }: { m: SampleMatch }) {
  const homeWin = m.score.home > m.score.away
  const awayWin = m.score.away > m.score.home
  return (
    <div className="lb2-row">
      <div className="lb2-status"><Badge /><Stats m={m} /></div>
      <div className="lb2-teams">
        <div className="lb2-line">
          <Logo team={m.home} size={26} className="lb2-logo" />
          <span className="lb2-name">{m.home.name}</span>
          <span className={`lb2-score ${homeWin ? 'win' : ''}`}>{m.score.home}</span>
        </div>
        <div className="lb2-line">
          <Logo team={m.away} size={26} className="lb2-logo" />
          <span className="lb2-name">{m.away.name}</span>
          <span className={`lb2-score ${awayWin ? 'win' : ''}`}>{m.score.away}</span>
        </div>
      </div>
    </div>
  )
}

// ── Variant C — Logo-watermerk achter de naam ────────────────────────────────
function LookC({ m }: { m: SampleMatch }) {
  return (
    <div className="lc-row">
      <span className="lc-team home">
        {m.home.logoUrl && <img className="lc-wm" src={m.home.logoUrl} alt="" aria-hidden />}
        <span className="lc-name">{m.home.name}</span>
      </span>
      <span className="lc-mid">
        <Badge />
        <span className="lc-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="lc-team away">
        {m.away.logoUrl && <img className="lc-wm" src={m.away.logoUrl} alt="" aria-hidden />}
        <span className="lc-name">{m.away.name}</span>
      </span>
    </div>
  )
}

// ── Variant D — Logo in de balk (bloedt uit de randen) ───────────────────────
function LookD({ m }: { m: SampleMatch }) {
  const homeStyle = { '--club': m.home.color ?? 'var(--accent)' } as CSSProperties
  const awayStyle = { '--club': m.away.color ?? 'var(--accent)' } as CSSProperties
  return (
    <div className="ld-row">
      {m.home.logoUrl && <img className="ld-bleed left" src={m.home.logoUrl} alt="" aria-hidden />}
      {m.away.logoUrl && <img className="ld-bleed right" src={m.away.logoUrl} alt="" aria-hidden />}
      <span className="ld-team home" style={homeStyle}>{m.home.name}</span>
      <span className="ld-mid">
        <Badge />
        <span className="ld-score">{m.score.home} – {m.score.away}</span>
        <Stats m={m} />
      </span>
      <span className="ld-team away" style={awayStyle}>{m.away.name}</span>
    </div>
  )
}

// ── Variant E — Compact met clubkleur-accent ─────────────────────────────────
function LookE({ m }: { m: SampleMatch }) {
  const homeStyle = { color: m.home.color ?? 'var(--txt)' } as CSSProperties
  const awayStyle = { color: m.away.color ?? 'var(--txt)' } as CSSProperties
  return (
    <div className="le-row">
      <span className="le-team home">
        <Logo team={m.home} size={28} className="le-logo" />
        <span className="le-name" style={homeStyle}>{m.home.name}</span>
      </span>
      <span className="le-mid">
        <span className="le-top"><Badge /><span className="le-score">{m.score.home}–{m.score.away}</span></span>
        <Stats m={m} />
      </span>
      <span className="le-team away">
        <span className="le-name" style={awayStyle}>{m.away.name}</span>
        <Logo team={m.away} size={28} className="le-logo" />
      </span>
    </div>
  )
}

const VARIANTS: { key: string; title: string; desc: string; render: (m: SampleMatch, i: number) => ReactNode }[] = [
  { key: 'A', title: 'Huidig', desc: 'De rij zoals ze nu is — namen kappen af bij weinig plaats.', render: (m, i) => <LookA key={i} m={m} /> },
  { key: 'B', title: 'Gestapeld', desc: 'Twee regels, score rechts. Volledige namen, nooit afgekapt.', render: (m, i) => <LookB key={i} m={m} /> },
  { key: 'C', title: 'Logo-watermerk', desc: 'Het clublogo groot en vervaagd achter de naam; meer ruimte voor tekst.', render: (m, i) => <LookC key={i} m={m} /> },
  { key: 'D', title: 'Logo in de balk', desc: 'Het logo bloedt subtiel uit de zijranden; namen liggen erbovenop.', render: (m, i) => <LookD key={i} m={m} /> },
  { key: 'E', title: 'Clubkleur-accent', desc: 'Kleinere logo’s, ploegnaam in de clubkleur, smaller scoreblok → bredere namen.', render: (m, i) => <LookE key={i} m={m} /> },
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
