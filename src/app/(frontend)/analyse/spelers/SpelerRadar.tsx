'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { RadarPlayer } from '@/lib/radar-stats'

type Metric = {
  key: string
  label: string
  full: string
  fmt: (v: number) => string
  get: (p: RadarPlayer) => number
  /** Hogere waarde = beter (voor percentiel-kleuring/pijl). */
  perf?: boolean
}

// Radar-assen: pure prestatie-assen, getoond als percentiel binnen de reeks.
const RADAR: Metric[] = [
  { key: 'aanval', label: 'Aanval', full: 'Worpen per wedstrijd', fmt: (v) => v.toFixed(1), get: (p) => p.throwsPerMatch, perf: true },
  { key: 'doel', label: 'Doelpunten', full: 'Doelpunten per wedstrijd', fmt: (v) => v.toFixed(1), get: (p) => p.goalsPerMatch, perf: true },
  { key: 'succes', label: 'Succes', full: 'Conversie — doelpunten per poging', fmt: (v) => `${Math.round(v)}%`, get: (p) => p.conversion * 100, perf: true },
  { key: 'effic', label: 'Efficiëntie', full: 'Punten boven/onder verwachting (xG-model)', fmt: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)), get: (p) => p.diff, perf: true },
  { key: 'afstand', label: 'Afstand', full: 'Gemiddelde worpafstand (m)', fmt: (v) => `${v.toFixed(1)}m`, get: (p) => p.avgDistance, perf: true },
  { key: 'forceren', label: 'Forceren', full: 'Geforceerde worpen (> 12 m, niet de laatste) per wedstrijd', fmt: (v) => v.toFixed(1), get: (p) => p.forcedPerMatch, perf: true },
  { key: 'verded', label: 'Verdediging', full: 'Vangsten per wedstrijd', fmt: (v) => v.toFixed(1), get: (p) => p.catchesPerMatch, perf: true },
]

// Extra tabelrijen (naast de radar-assen).
const EXTRA: Metric[] = [
  { key: 'maxd', label: 'Verste worp', full: 'Verste worp (m)', fmt: (v) => `${v.toFixed(1)}m`, get: (p) => p.maxDistance, perf: true },
  { key: 'points', label: 'Punten', full: 'Werkelijk gescoorde punten', fmt: (v) => v.toFixed(0), get: (p) => p.points, perf: true },
  { key: 'xp', label: 'Verwacht (xP)', full: 'Verwachte punten (xG-model)', fmt: (v) => v.toFixed(1), get: (p) => p.xPoints },
  { key: 'links', label: 'Links', full: 'Aandeel worpen naar links', fmt: (v) => `${Math.round(v)}%`, get: (p) => p.linksShare * 100 },
  { key: 'midden', label: 'Midden', full: 'Aandeel worpen naar het midden', fmt: (v) => `${Math.round(v)}%`, get: (p) => p.middenShare * 100 },
  { key: 'rechts', label: 'Rechts', full: 'Aandeel worpen naar rechts', fmt: (v) => `${Math.round(v)}%`, get: (p) => p.rechtsShare * 100 },
  { key: 'matches', label: 'Wedstrijden', full: 'Aantal gespeelde wedstrijden', fmt: (v) => v.toFixed(0), get: (p) => p.matches },
]
const TABLE: Metric[] = [...RADAR, ...EXTRA]

const N = RADAR.length
const SIZE = 320
const CX = SIZE / 2
const CY = SIZE / 2
const R = 108

function angle(i: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / N
}
function point(i: number, frac: number): [number, number] {
  const a = angle(i)
  const r = Math.max(0, Math.min(1, frac)) * R
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}
function polygon(fracs: number[]): string {
  return fracs.map((f, i) => point(i, f).join(',')).join(' ')
}

// Percentiel-kleur: 0 = rood (zwak), 0.5 = amber, 1 = groen (top).
function pctColor(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [239, 71, 111]],
    [0.5, [255, 209, 102]],
    [1, [6, 214, 160]],
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const f = (t - lo[0]) / (hi[0] - lo[0] || 1)
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * f))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function tierOf(r: number): { label: string; color: string } {
  if (r >= 85) return { label: 'Elite', color: '#06d6a0' }
  if (r >= 68) return { label: 'Sterk', color: '#3ddc97' }
  if (r >= 50) return { label: 'Solide', color: '#ffd166' }
  if (r >= 32) return { label: 'In ontwikkeling', color: '#f9a826' }
  return { label: 'Beginnend', color: '#ef476f' }
}

function RatingGauge({ rating, color, label, name, sub }: { rating: number; color: string; label: string; name: string; sub?: string }) {
  const r = 46
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, rating)) / 100) * c
  return (
    <div className="rad-gauge">
      <svg viewBox="0 0 120 120" className="rad-gauge-svg" role="img" aria-label={`Rating ${rating}`}>
        <circle cx="60" cy="60" r={r} className="rad-gauge-bg" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="rad-gauge-arc"
          stroke={color}
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="56" className="rad-gauge-num" textAnchor="middle">{rating}</text>
        <text x="60" y="78" className="rad-gauge-tier" fill={color} textAnchor="middle">{label}</text>
      </svg>
      <span className="rad-gauge-name">{name}</span>
      {sub && <span className="rad-gauge-sub">{sub}</span>}
    </div>
  )
}

export function SpelerRadar({
  reeks,
  options,
  players,
}: {
  reeks: string
  options: { value: string; label: string }[]
  players: RadarPlayer[]
}) {
  const router = useRouter()
  const [aId, setAId] = useState<number | null>(players[0]?.playerId ?? null)
  const [bId, setBId] = useState<number | null>(null)

  // Reeks-gemiddelde per metriek + gesorteerde waarden voor percentielen.
  const { league, sorted } = useMemo(() => {
    const n = players.length || 1
    const league: Record<string, number> = {}
    const sorted: Record<string, number[]> = {}
    for (const m of TABLE) {
      const vals = players.map((p) => m.get(p))
      league[m.key] = vals.reduce((s, v) => s + v, 0) / n
      sorted[m.key] = [...vals].sort((a, b) => a - b)
    }
    return { league, sorted }
  }, [players])

  const pct = (key: string, v: number): number => {
    const arr = sorted[key]
    if (!arr || arr.length === 0) return 0
    let le = 0
    for (const x of arr) if (x <= v) le++
    return le / arr.length
  }
  const ratingOf = (p: RadarPlayer): number => Math.round((RADAR.reduce((s, m) => s + pct(m.key, m.get(p)), 0) / N) * 100)

  const playerA = players.find((p) => p.playerId === aId) ?? null
  const playerB = players.find((p) => p.playerId === bId) ?? null

  const radarFracs = (p: RadarPlayer | null) => (p ? RADAR.map((m) => pct(m.key, m.get(p))) : [])
  const leagueFracs = RADAR.map((m) => pct(m.key, league[m.key]))
  const aFracs = radarFracs(playerA)
  const bFracs = radarFracs(playerB)

  const aRating = playerA ? ratingOf(playerA) : 0
  const bRating = playerB ? ratingOf(playerB) : 0
  const aTier = tierOf(aRating)

  // Hero-kaarten: de meest sprekende prestatie-assen.
  const HERO = [RADAR[1], RADAR[2], RADAR[3]] // Doelpunten, Succes, Efficiëntie

  return (
    <div className="rad-wrap">
      <div className="rad-controls">
        <label className="rad-field">
          <span>Reeks</span>
          <select className="rang-picker" value={reeks} onChange={(e) => router.push(`/analyse/spelers?reeks=${e.target.value}`)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="rad-field">
          <span><span className="rad-dot rad-dot-a">●</span> Speler A</span>
          <select className="rang-picker" value={aId ?? ''} onChange={(e) => setAId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>#{p.shirtNumber} {p.name} · {p.teamName}</option>
            ))}
          </select>
        </label>
        <label className="rad-field">
          <span><span className="rad-dot rad-dot-b">●</span> Speler B</span>
          <select className="rang-picker" value={bId ?? ''} onChange={(e) => setBId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— (geen)</option>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>#{p.shirtNumber} {p.name} · {p.teamName}</option>
            ))}
          </select>
        </label>
      </div>

      {players.length === 0 ? (
        <p className="empty">Nog geen worpdata in deze reeks.</p>
      ) : (
        <>
          {/* Hero: rating-gauge + sprekende statistieken */}
          {playerA && (
            <div className="rad-hero">
              <div className="rad-gauge-card">
                <RatingGauge rating={aRating} color={aTier.color} label={aTier.label} name={playerA.name} sub={`#${playerA.shirtNumber} · ${playerA.teamName}`} />
                {playerB && (
                  <RatingGauge rating={bRating} color={tierOf(bRating).color} label={tierOf(bRating).label} name={playerB.name} sub={`#${playerB.shirtNumber} · ${playerB.teamName}`} />
                )}
                <span className="rad-gauge-cap">Rating = gemiddeld percentiel over alle prestatie-assen.</span>
              </div>
              <div className="rad-cards">
                {HERO.map((m) => {
                  const av = m.get(playerA)
                  const p = pct(m.key, av)
                  const lg = league[m.key]
                  const delta = av - lg
                  return (
                    <div className="rad-card" key={m.key}>
                      <span className="rad-card-lbl" title={m.full}>{m.label}</span>
                      <span className="rad-card-val" style={{ color: pctColor(p) }}>{m.fmt(av)}</span>
                      <span className="rad-card-bar"><span className="rad-card-bar-fill" style={{ width: `${Math.round(p * 100)}%`, background: pctColor(p) }} /></span>
                      <span className="rad-card-sub">
                        reeks {m.fmt(lg)}
                        <span className={`rad-delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {m.fmt(Math.abs(delta))}</span>
                      </span>
                      {playerB && <span className="rad-card-b">{playerB.name.split(' ')[0]}: {m.fmt(m.get(playerB))}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rad-grid">
            <div className="rad-chart-card">
              <svg className="rad-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Spelersradar">
                <defs>
                  <radialGradient id="radGradA" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.12" />
                  </radialGradient>
                  <radialGradient id="radGradB" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor="var(--away)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="var(--away)" stopOpacity="0.1" />
                  </radialGradient>
                  <filter id="radGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.4" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {/* Rasterringen */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <polygon key={f} points={polygon(RADAR.map(() => f))} className="rad-ring" />
                ))}
                {/* Percentiel-labels langs de bovenas */}
                {[0.5, 1].map((f) => (
                  <text key={`l${f}`} x={CX + 4} y={CY - f * R + 3} className="rad-ring-lbl">{f * 100}</text>
                ))}
                {/* Assen + labels */}
                {RADAR.map((m, i) => {
                  const [x, y] = point(i, 1)
                  const [lx, ly] = point(i, 1.2)
                  return (
                    <g key={m.key}>
                      <line x1={CX} y1={CY} x2={x} y2={y} className="rad-axis" />
                      <text x={lx} y={ly} className="rad-axis-lbl" textAnchor="middle" dominantBaseline="middle">{m.label}</text>
                    </g>
                  )
                })}
                {/* Reeks-gemiddelde */}
                <polygon points={polygon(leagueFracs)} className="rad-league" />
                {/* Speler B (achter A) */}
                {playerB && (
                  <g className="rad-anim" key={`b${bId}`}>
                    <polygon points={polygon(bFracs)} className="rad-poly rad-b" fill="url(#radGradB)" filter="url(#radGlow)" />
                    {bFracs.map((f, i) => { const [x, y] = point(i, f); return <circle key={i} cx={x} cy={y} r={2.6} className="rad-vertex-b" /> })}
                  </g>
                )}
                {/* Speler A */}
                {playerA && (
                  <g className="rad-anim" key={`a${aId}`}>
                    <polygon points={polygon(aFracs)} className="rad-poly rad-a" fill="url(#radGradA)" filter="url(#radGlow)" />
                    {aFracs.map((f, i) => { const [x, y] = point(i, f); return <circle key={i} cx={x} cy={y} r={2.8} className="rad-vertex-a" /> })}
                  </g>
                )}
              </svg>
              <div className="rad-legend">
                <span className="rad-leg rad-leg-league">— — Reeks-gem.</span>
                {playerA && <span className="rad-leg rad-leg-a">● {playerA.name}</span>}
                {playerB && <span className="rad-leg rad-leg-b">● {playerB.name}</span>}
              </div>
            </div>

            <div className="rad-table-card">
              <table className="rad-table">
                <thead>
                  <tr>
                    <th>Statistiek</th>
                    <th className="rad-col-a">{playerA ? playerA.name : 'A'}</th>
                    <th className="rad-col-b">{playerB ? playerB.name : 'B'}</th>
                    <th>Reeks</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE.map((m) => {
                    const av = playerA ? m.get(playerA) : null
                    const bv = playerB ? m.get(playerB) : null
                    const lg = league[m.key]
                    const aColor = m.perf && av != null ? pctColor(pct(m.key, av)) : undefined
                    const bColor = m.perf && bv != null ? pctColor(pct(m.key, bv)) : undefined
                    return (
                      <tr key={m.key} className={m.perf ? '' : 'rad-row-style'}>
                        <td className="rad-stat" title={m.full}>{m.label}</td>
                        <td className="rad-col-a" style={aColor ? { color: aColor, fontWeight: 800 } : undefined}>{av != null ? m.fmt(av) : '—'}</td>
                        <td className="rad-col-b" style={bColor ? { color: bColor, fontWeight: 800 } : undefined}>{bv != null ? m.fmt(bv) : '—'}</td>
                        <td className="rad-lg">{m.fmt(lg)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
