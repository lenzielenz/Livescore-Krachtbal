'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { RadarPlayer } from '@/lib/radar-stats'

// Zes match-gerelateerde assen. `get` levert de ruwe (niet-genormaliseerde) waarde per speler.
const METRICS: { key: string; label: string; full: string; fmt: (v: number) => string; get: (p: RadarPlayer) => number }[] = [
  { key: 'aanval', label: 'Aanval', full: 'Aanval — worpen per wedstrijd', fmt: (v) => v.toFixed(1), get: (p) => p.throwsPerMatch },
  { key: 'succes', label: 'Succes', full: 'Succesvolle aanvallen — conversie (doelpunten per poging)', fmt: (v) => `${Math.round(v)}%`, get: (p) => p.conversion * 100 },
  { key: 'afstand', label: 'Afstand', full: 'Worpafstand — gemiddelde afstand (m)', fmt: (v) => `${v.toFixed(1)}m`, get: (p) => p.avgDistance },
  { key: 'forceren', label: 'Forceren', full: 'Forceren — worpen > 12 m die niet de laatste zijn, per wedstrijd', fmt: (v) => v.toFixed(1), get: (p) => p.forcedPerMatch },
  { key: 'flank', label: 'Flankspel', full: 'Flankspel — aandeel worpen naar links of rechts', fmt: (v) => `${Math.round(v)}%`, get: (p) => p.flankShare * 100 },
  { key: 'verded', label: 'Verdediging', full: 'Verdediging — vangsten per wedstrijd', fmt: (v) => v.toFixed(1), get: (p) => p.catchesPerMatch },
]

const N = METRICS.length
const SIZE = 320
const CX = SIZE / 2
const CY = SIZE / 2
const R = 110

// Hoek per as (start bovenaan, met de klok mee).
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

  // Reeks-gemiddelde (de gemiddelde speler) + per-as-maximum voor de normalisatie.
  const { league, maxima } = useMemo(() => {
    const n = players.length || 1
    const league: Record<string, number> = {}
    const maxima: Record<string, number> = {}
    for (const m of METRICS) {
      let sum = 0
      let max = 0
      for (const p of players) {
        const v = m.get(p)
        sum += v
        if (v > max) max = v
      }
      league[m.key] = sum / n
      maxima[m.key] = max > 0 ? max : 1
    }
    return { league, maxima }
  }, [players])

  const playerA = players.find((p) => p.playerId === aId) ?? null
  const playerB = players.find((p) => p.playerId === bId) ?? null

  const fracsOf = (p: RadarPlayer | null) =>
    p ? METRICS.map((m) => m.get(p) / maxima[m.key]) : []
  const leagueFracs = METRICS.map((m) => league[m.key] / maxima[m.key])
  const aFracs = fracsOf(playerA)
  const bFracs = fracsOf(playerB)

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
          <span className="rad-dot rad-dot-a">●</span> Speler A
          <select className="rang-picker" value={aId ?? ''} onChange={(e) => setAId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>#{p.shirtNumber} {p.name} · {p.teamName}</option>
            ))}
          </select>
        </label>
        <label className="rad-field">
          <span className="rad-dot rad-dot-b">●</span> Speler B
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
        <div className="rad-grid">
          <div className="rad-chart-card">
            <svg className="rad-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Spelersradar">
              {/* Rasterringen */}
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <polygon key={f} points={polygon(METRICS.map(() => f))} className="rad-ring" />
              ))}
              {/* Assen + labels */}
              {METRICS.map((m, i) => {
                const [x, y] = point(i, 1)
                const [lx, ly] = point(i, 1.18)
                return (
                  <g key={m.key}>
                    <line x1={CX} y1={CY} x2={x} y2={y} className="rad-axis" />
                    <text x={lx} y={ly} className="rad-axis-lbl" textAnchor="middle" dominantBaseline="middle">{m.label}</text>
                  </g>
                )
              })}
              {/* Reeks-gemiddelde */}
              <polygon points={polygon(leagueFracs)} className="rad-league" />
              {/* Speler A & B */}
              {playerA && <polygon points={polygon(aFracs)} className="rad-poly rad-a" />}
              {playerB && <polygon points={polygon(bFracs)} className="rad-poly rad-b" />}
            </svg>
            <div className="rad-legend">
              <span className="rad-leg rad-leg-league">— — Reeks-gem.</span>
              {playerA && <span className="rad-leg rad-leg-a">{playerA.name}</span>}
              {playerB && <span className="rad-leg rad-leg-b">{playerB.name}</span>}
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
                {METRICS.map((m) => {
                  const av = playerA ? m.get(playerA) : null
                  const bv = playerB ? m.get(playerB) : null
                  const lg = league[m.key]
                  return (
                    <tr key={m.key}>
                      <td className="rad-stat" title={m.full}>{m.label}</td>
                      <td className={`rad-col-a ${av != null && av >= lg ? 'rad-good' : ''}`}>{av != null ? m.fmt(av) : '—'}</td>
                      <td className={`rad-col-b ${bv != null && bv >= lg ? 'rad-good' : ''}`}>{bv != null ? m.fmt(bv) : '—'}</td>
                      <td className="rad-lg">{m.fmt(lg)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
