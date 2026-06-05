'use client'

import { useMemo, useState } from 'react'

import { FieldSchema, type ConvPoint, type FieldMarker } from '@/components/FieldSchema'
import type { DangerShot } from '@/lib/expected-points'

interface TeamOpt {
  id: number
  name: string
}
interface PlayerOpt {
  id: number
  name: string
  shirtNumber: number
  teamId: number
  teamName: string
}

// Halfveld-gevaarkaart op de verwachte-puntenpagina: van waar op het veld scoort men het
// makkelijkst? Elke zone kleurt van groen (weinig kans) naar rood (gevaarlijk) volgens de
// scoringskans, met onderscheid links/midden/rechts. Beide helften zijn naar één doel
// (onderaan) gespiegeld. Met een keuzelijst filter je op de hele reeks, één ploeg
// (optelling) of één speler (zijn worpen).
export function ScoringField({ shots, teams, players }: { shots: DangerShot[]; teams: TeamOpt[]; players: PlayerOpt[] }) {
  const [view, setView] = useState<'heat' | 'dots'>('heat')
  // sel: 'all' | 'team:<id>' | 'player:<id>'
  const [sel, setSel] = useState('all')

  const filtered = useMemo(() => {
    if (sel.startsWith('team:')) {
      const id = Number(sel.slice(5))
      return shots.filter((s) => s.teamId === id)
    }
    if (sel.startsWith('player:')) {
      const id = Number(sel.slice(7))
      return shots.filter((s) => s.playerId === id)
    }
    return shots
  }, [sel, shots])

  const convPoints: ConvPoint[] = filtered.map((s) => ({ x: s.x, y: s.y, goal: s.goal }))
  const markers: FieldMarker[] = filtered.map((s) => ({
    x: s.x,
    y: s.y,
    color: s.goal ? '#06d6a0' : '#ef476f',
    r: s.goal ? 4 : 2.5,
  }))

  const selLabel =
    sel === 'all'
      ? 'hele reeks'
      : sel.startsWith('team:')
        ? (teams.find((t) => `team:${t.id}` === sel)?.name ?? 'ploeg')
        : (() => {
            const p = players.find((pl) => `player:${pl.id}` === sel)
            return p ? `#${p.shirtNumber} ${p.name}` : 'speler'
          })()

  // Per ploeg gegroepeerde spelers voor de keuzelijst.
  const playersByTeam = teams.map((t) => ({
    team: t,
    members: players
      .filter((p) => p.teamId === t.id)
      .sort((a, b) => a.shirtNumber - b.shirtNumber),
  }))

  return (
    <div className="gev-map">
      <div className="gev-pickrow">
        <select className="gev-select" value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Filter">
          <option value="all">Hele reeks (alle ploegen)</option>
          {teams.length > 0 && (
            <optgroup label="Ploeg-optelling">
              {teams.map((t) => (
                <option key={`team:${t.id}`} value={`team:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          {playersByTeam.map(({ team, members }) =>
            members.length > 0 ? (
              <optgroup key={team.id} label={`Speler — ${team.name}`}>
                {members.map((p) => (
                  <option key={`player:${p.id}`} value={`player:${p.id}`}>
                    #{p.shirtNumber} {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
        <div className="gev-controls">
          <button type="button" className={view === 'heat' ? 'on' : ''} onClick={() => setView('heat')}>Scoringsgraad</button>
          <button type="button" className={view === 'dots' ? 'on' : ''} onClick={() => setView('dots')}>Pogingen</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="empty">Geen doelpogingen voor deze selectie.</p>
      ) : (
        <>
          <FieldSchema
            className="gev-field"
            half="bottom"
            convMinAttempts={1}
            convPoints={view === 'heat' ? convPoints : undefined}
            markers={view === 'dots' ? markers : []}
            ends={{ bottom: { text: '▼ Doel', color: '#06d6a0' } }}
          />
          {view === 'heat' ? (
            <div className="gev-legend">
              <span className="gev-scale" /> <span>weinig kans → gevaarlijk (scoringskans)</span>
              <span className="gev-note">{selLabel} · {filtered.length} pogingen</span>
            </div>
          ) : (
            <div className="gev-legend">
              <span><i style={{ background: '#06d6a0' }} /> doelpunt</span>
              <span><i style={{ background: '#ef476f' }} /> gemist</span>
              <span className="gev-note">{selLabel} · {filtered.length} pogingen</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
