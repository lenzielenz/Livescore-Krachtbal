'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { TeamRadar } from '@/lib/team-radar'

type Metric = { key: string; label: string; full: string; fmt: (v: number) => string; get: (t: TeamRadar) => number; perf?: boolean }

const RADAR: Metric[] = [
  { key: 'aanval', label: 'Aanval', full: 'Worpen per wedstrijd', fmt: (v) => v.toFixed(1), get: (t) => t.throwsPerMatch, perf: true },
  { key: 'doel', label: 'Doelpunten', full: 'Doelpunten per wedstrijd', fmt: (v) => v.toFixed(1), get: (t) => t.goalsPerMatch, perf: true },
  { key: 'punten', label: 'Punten', full: 'Punten per wedstrijd', fmt: (v) => v.toFixed(1), get: (t) => t.pointsPerMatch, perf: true },
  { key: 'succes', label: 'Conversie', full: 'Conversie — doelpunten per poging', fmt: (v) => `${Math.round(v)}%`, get: (t) => t.conversion * 100, perf: true },
  { key: 'afstand', label: 'Afstand', full: 'Gemiddelde worpafstand (m)', fmt: (v) => `${v.toFixed(1)}m`, get: (t) => t.avgDistance, perf: true },
  { key: 'verded', label: 'Verdediging', full: 'Vangsten per wedstrijd', fmt: (v) => v.toFixed(1), get: (t) => t.catchesPerMatch, perf: true },
]
const EXTRA: Metric[] = [
  { key: 'matches', label: 'Wedstrijden', full: 'Gespeelde wedstrijden', fmt: (v) => v.toFixed(0), get: (t) => t.matches },
  { key: 'gtot', label: 'Doelpunten (tot.)', full: 'Totaal doelpunten', fmt: (v) => v.toFixed(0), get: (t) => t.goals },
  { key: 'ptot', label: 'Punten (tot.)', full: 'Totaal punten', fmt: (v) => v.toFixed(0), get: (t) => t.points },
]
const TABLE = [...RADAR, ...EXTRA]

const N = RADAR.length
const SIZE = 320
const CX = SIZE / 2
const CY = SIZE / 2
const R = 108

const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N
function point(i: number, frac: number): [number, number] {
  const a = angle(i)
  const r = Math.max(0, Math.min(1, frac)) * R
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}
const polygon = (fracs: number[]) => fracs.map((f, i) => point(i, f).join(',')).join(' ')

function pctColor(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [239, 71, 111]],
    [0.5, [255, 209, 102]],
    [1, [6, 214, 160]],
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break }
  }
  const f = (t - lo[0]) / (hi[0] - lo[0] || 1)
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * f))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export function TeamRadarView({ reeks, options, teams }: { reeks: string; options: { value: string; label: string }[]; teams: TeamRadar[] }) {
  const router = useRouter()
  const [aId, setAId] = useState<number | null>(teams[0]?.teamId ?? null)
  const [bId, setBId] = useState<number | null>(teams[1]?.teamId ?? null)

  const { league, sorted } = useMemo(() => {
    const n = teams.length || 1
    const league: Record<string, number> = {}
    const sorted: Record<string, number[]> = {}
    for (const m of TABLE) {
      const vals = teams.map((t) => m.get(t))
      league[m.key] = vals.reduce((s, v) => s + v, 0) / n
      sorted[m.key] = [...vals].sort((a, b) => a - b)
    }
    return { league, sorted }
  }, [teams])

  const pct = (key: string, v: number): number => {
    const arr = sorted[key]
    if (!arr || arr.length === 0) return 0
    let le = 0
    for (const x of arr) if (x <= v) le++
    return le / arr.length
  }

  const teamA = teams.find((t) => t.teamId === aId) ?? null
  const teamB = teams.find((t) => t.teamId === bId) ?? null
  const fracs = (t: TeamRadar | null) => (t ? RADAR.map((m) => pct(m.key, m.get(t))) : [])
  const aFracs = fracs(teamA)
  const bFracs = fracs(teamB)
  const leagueFracs = RADAR.map((m) => pct(m.key, league[m.key]))

  const HERO = [RADAR[2], RADAR[1], RADAR[3]] // Punten/wd, Doelpunten/wd, Conversie

  return (
    <div className="rad-wrap">
      <div className="rad-controls">
        <label className="rad-field">
          <span>Reeks</span>
          <select className="rang-picker" value={reeks} onChange={(e) => router.push(`/analyse/ploegen?reeks=${e.target.value}`)}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="rad-field">
          <span><span className="rad-dot rad-dot-a">●</span> Ploeg A</span>
          <select className="rang-picker" value={aId ?? ''} onChange={(e) => setAId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}
          </select>
        </label>
        <label className="rad-field">
          <span><span className="rad-dot rad-dot-b">●</span> Ploeg B</span>
          <select className="rang-picker" value={bId ?? ''} onChange={(e) => setBId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— (geen)</option>
            {teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}
          </select>
        </label>
      </div>

      {teams.length === 0 ? (
        <p className="empty">Nog geen ploegdata in deze reeks.</p>
      ) : (
        <>
          {teamA && (
            <div className="rad-cards">
              {HERO.map((m) => {
                const av = m.get(teamA)
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
                    {teamB && <span className="rad-card-b">{teamB.teamName}: {m.fmt(m.get(teamB))}</span>}
                  </div>
                )
              })}
            </div>
          )}

          <div className="rad-grid">
            <div className="rad-chart-card">
              <svg className="rad-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Ploegradar">
                <defs>
                  <radialGradient id="trGradA" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.12" />
                  </radialGradient>
                  <radialGradient id="trGradB" cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor="var(--away)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="var(--away)" stopOpacity="0.1" />
                  </radialGradient>
                  <filter id="trGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.4" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <polygon key={f} points={polygon(RADAR.map(() => f))} className="rad-ring" />
                ))}
                {[0.5, 1].map((f) => (
                  <text key={`l${f}`} x={CX + 4} y={CY - f * R + 3} className="rad-ring-lbl">{f * 100}</text>
                ))}
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
                <polygon points={polygon(leagueFracs)} className="rad-league" />
                {teamB && (
                  <g className="rad-anim" key={`b${bId}`}>
                    <polygon points={polygon(bFracs)} className="rad-poly rad-b" fill="url(#trGradB)" filter="url(#trGlow)" />
                    {bFracs.map((f, i) => { const [x, y] = point(i, f); return <circle key={i} cx={x} cy={y} r={2.6} className="rad-vertex-b" /> })}
                  </g>
                )}
                {teamA && (
                  <g className="rad-anim" key={`a${aId}`}>
                    <polygon points={polygon(aFracs)} className="rad-poly rad-a" fill="url(#trGradA)" filter="url(#trGlow)" />
                    {aFracs.map((f, i) => { const [x, y] = point(i, f); return <circle key={i} cx={x} cy={y} r={2.8} className="rad-vertex-a" /> })}
                  </g>
                )}
              </svg>
              <div className="rad-legend">
                <span className="rad-leg rad-leg-league">— — Reeks-gem.</span>
                {teamA && <span className="rad-leg rad-leg-a">● {teamA.teamName}</span>}
                {teamB && <span className="rad-leg rad-leg-b">● {teamB.teamName}</span>}
              </div>
            </div>

            <div className="rad-table-card">
              <table className="rad-table">
                <thead>
                  <tr>
                    <th>Statistiek</th>
                    <th className="rad-col-a">{teamA ? teamA.teamName : 'A'}</th>
                    <th className="rad-col-b">{teamB ? teamB.teamName : 'B'}</th>
                    <th>Reeks</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE.map((m) => {
                    const av = teamA ? m.get(teamA) : null
                    const bv = teamB ? m.get(teamB) : null
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
