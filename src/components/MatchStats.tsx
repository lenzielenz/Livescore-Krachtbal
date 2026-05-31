'use client'

import { useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import type { ShotPoint } from '@/lib/match-engine'
import type { MatchStats as Stats } from '@/lib/stats'
import './match-stats.css'

const OUTCOME_COLOR: Record<string, string> = {
  goal: '#06d6a0',
  caught: '#4cc9f0',
  out_side: '#ef476f',
  out_back: '#f78c6b',
  in_field: '#8fb3a1',
}

function CompareBar({ label, home, away, fmt }: { label: string; home: number; away: number; fmt?: (n: number) => string }) {
  const total = home + away
  const hPct = total ? (home / total) * 100 : 50
  const f = fmt ?? ((n: number) => String(n))
  return (
    <div className="cmp-row">
      <span className="cmp-val">{f(home)}</span>
      <div className="cmp-bar">
        <div className="cmp-bar-home" style={{ width: `${hPct}%` }} />
        <div className="cmp-bar-away" style={{ width: `${100 - hPct}%` }} />
      </div>
      <span className="cmp-val">{f(away)}</span>
      <span className="cmp-label">{label}</span>
    </div>
  )
}

export function MatchStats({
  stats,
  shots,
  teams,
  goalAreaDepth = 10,
}: {
  stats: Stats
  shots: ShotPoint[]
  teams: { home: string; away: string }
  goalAreaDepth?: number
}) {
  const [playerFilter, setPlayerFilter] = useState<number | 'all'>('all')
  const [goalsOnly, setGoalsOnly] = useState(false)
  const [view, setView] = useState<'dots' | 'heat'>('dots')
  const [orderFilter, setOrderFilter] = useState<'all' | 'first' | 'second' | 'last'>('all')

  const matchesOrder = (s: ShotPoint) =>
    orderFilter === 'all' ||
    (orderFilter === 'first' && s.throwNumber === 1) ||
    (orderFilter === 'second' && s.throwNumber === 2) ||
    (orderFilter === 'last' && s.isLastThrow)

  const filteredShots = shots.filter(
    (s) =>
      (playerFilter === 'all' || s.playerId === playerFilter) &&
      (!goalsOnly || s.outcome === 'goal') &&
      matchesOrder(s),
  )
  const markers: FieldMarker[] = filteredShots.map((s) => ({
    x: s.x,
    y: s.y,
    color: OUTCOME_COLOR[s.outcome] ?? '#ffd166',
    r: s.outcome === 'goal' ? 8 : 6,
    label: String(s.throwNumber),
  }))
  const heatPoints = filteredShots.map((s) => ({ x: s.x, y: s.y }))

  return (
    <div className="stats">
      <h2 className="section-title">Statistieken</h2>

      <div className="cmp">
        <div className="cmp-head">
          <span>{teams.home}</span>
          <span>{teams.away}</span>
        </div>
        <CompareBar label="Worpen" home={stats.teams.home.throws} away={stats.teams.away.throws} />
        <CompareBar label="Doelpunten" home={stats.teams.home.goals} away={stats.teams.away.goals} />
        <CompareBar label="Punten" home={stats.teams.home.points} away={stats.teams.away.points} />
        <CompareBar label="Gem. afstand (m)" home={stats.teams.home.avgDistance} away={stats.teams.away.avgDistance} fmt={(n) => n.toFixed(1)} />
        <CompareBar label="Max afstand (m)" home={stats.teams.home.maxDistance} away={stats.teams.away.maxDistance} fmt={(n) => n.toFixed(1)} />
      </div>

      <div className="stats-grid">
        <div className="shotmap">
          <div className="shotmap-controls">
            <button type="button" className={view === 'dots' ? 'on' : ''} onClick={() => setView('dots')}>Punten</button>
            <button type="button" className={view === 'heat' ? 'on' : ''} onClick={() => setView('heat')}>Heatmap</button>
          </div>
          <div className="shotmap-controls">
            <button type="button" className={!goalsOnly ? 'on' : ''} onClick={() => setGoalsOnly(false)}>Alle worpen</button>
            <button type="button" className={goalsOnly ? 'on' : ''} onClick={() => setGoalsOnly(true)}>Enkel doelpunten</button>
          </div>
          <div className="shotmap-controls">
            <button type="button" className={orderFilter === 'all' ? 'on' : ''} onClick={() => setOrderFilter('all')}>Alle</button>
            <button type="button" className={orderFilter === 'first' ? 'on' : ''} onClick={() => setOrderFilter('first')}>1e worp</button>
            <button type="button" className={orderFilter === 'second' ? 'on' : ''} onClick={() => setOrderFilter('second')}>2e worp</button>
            <button type="button" className={orderFilter === 'last' ? 'on' : ''} onClick={() => setOrderFilter('last')}>Laatste</button>
          </div>
          <FieldSchema
            className="shotmap-field"
            markers={view === 'dots' ? markers : []}
            heatPoints={view === 'heat' ? heatPoints : undefined}
            goalAreaDepthM={goalAreaDepth}
          />
          {view === 'dots' ? (
            <div className="shotmap-legend">
              <span><i style={{ background: OUTCOME_COLOR.goal }} /> doelpunt</span>
              <span><i style={{ background: OUTCOME_COLOR.caught }} /> gevangen</span>
              <span><i style={{ background: OUTCOME_COLOR.out_side }} /> buiten</span>
              <span><i style={{ background: OUTCOME_COLOR.in_field }} /> in veld</span>
              <span className="shotmap-note">cijfer = worpnummer</span>
            </div>
          ) : (
            <div className="shotmap-legend">
              <span className="heat-scale" /> <span>weinig → veel worpen</span>
              <span className="shotmap-note">{filteredShots.length} worpen</span>
            </div>
          )}
        </div>

        <div className="player-table-wrap">
          <div className="pt-filter">
            <button className={playerFilter === 'all' ? 'on' : ''} onClick={() => setPlayerFilter('all')}>Alle spelers</button>
            {stats.players.map((p) => (
              <button key={p.playerId} className={playerFilter === p.playerId ? 'on' : ''} onClick={() => setPlayerFilter(p.playerId)}>
                #{p.shirtNumber}
              </button>
            ))}
          </div>
          <table className="player-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Speler</th>
                <th title="Worpen">W</th>
                <th title="Doelpunten (nek/rug)">D</th>
                <th title="Punten">P</th>
                <th title="Grond/Gevangen">G/V</th>
                <th title="Gem. / Max afstand">Afst.</th>
                <th title="Zones L/M/R">L/M/R</th>
                <th title="1e/2e/laatste worp">1/2/L</th>
              </tr>
            </thead>
            <tbody>
              {stats.players.length === 0 && (
                <tr><td colSpan={9} className="empty">Nog geen worpen geregistreerd.</td></tr>
              )}
              {stats.players.map((p) => (
                <tr key={p.playerId} className={`side-${p.teamSide}`}>
                  <td>{p.shirtNumber}</td>
                  <td>{p.playerName}</td>
                  <td>{p.throws}</td>
                  <td>{p.goals.total} ({p.goals.nek}/{p.goals.rug})</td>
                  <td>{p.goals.points}</td>
                  <td>{p.ground}/{p.caught}</td>
                  <td>{p.distance.avg.toFixed(1)} / {p.distance.max.toFixed(1)}</td>
                  <td>{p.zones.links}/{p.zones.midden}/{p.zones.rechts}</td>
                  <td>{p.order.first}/{p.order.second}/{p.order.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
