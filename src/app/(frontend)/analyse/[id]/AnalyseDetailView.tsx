'use client'

import { useState } from 'react'

import { MatchStats } from '@/components/MatchStats'
import type { ShotPoint } from '@/lib/match-engine'
import type { MatchStats as Stats } from '@/lib/stats'
import { AnalyseCharts } from './AnalyseCharts'
import { MatchRecap } from './MatchRecap'
import { MomentumChart } from './MomentumChart'

type Goal = { side: 'home' | 'away'; points: number; half: number }
type Player = Stats['players'][number]

const first = (n: string) => n.split(/\s+/)[0]

// Compacte spelerfocus: de kerncijfers van één speler, in dezelfde kaartstijl als de samenvatting.
function PlayerFocus({ p, team }: { p: Player; team: string }) {
  const cards: { icon: string; label: string; value: string }[] = [
    { icon: '🎯', label: 'Punten', value: `${p.goals.points}` },
    { icon: '🥅', label: 'Doelpunten', value: `${p.goals.total} (${p.goals.nek}/${p.goals.rug})` },
    { icon: '✅', label: 'Conversie', value: p.goalAttempts > 0 ? `${Math.round(p.conversion * 100)}%` : '—' },
    { icon: '🚀', label: 'Verste worp', value: p.distance.max > 0 ? `${p.distance.max.toFixed(1)} m` : '—' },
    { icon: '🏐', label: 'Worpen', value: `${p.throws} (${p.byType.nek}/${p.byType.rug})` },
    { icon: '⚠️', label: 'Geforceerd', value: `${p.lost} (${p.caught}g/${p.out}b)` },
  ]
  return (
    <section className="an-recap">
      <div className={`an-mvp side-${p.teamSide}`}>
        <span className="an-mvp-badge">Spelerfocus</span>
        <span className="an-mvp-name">#{p.shirtNumber} {p.playerName}</span>
        <span className="an-mvp-why">{team} · score {p.score > 0 ? `+${p.score}` : p.score}</span>
      </div>
      <div className="an-recap-cards">
        {cards.map((c) => (
          <div key={c.label} className={`an-recap-card side-${p.teamSide}`}>
            <span className="an-recap-ico" aria-hidden>{c.icon}</span>
            <span className="an-recap-body">
              <span className="an-recap-lbl">{c.label}</span>
              <span className="an-recap-val">{c.value}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// Detail-analyse met een snelwissel-balk: bekijk alles voor de héle wedstrijd, of focus
// razendsnel op één speler (de kaarten en het veld scopen mee).
export function AnalyseDetailView({
  stats,
  shots,
  teams,
  goalAreaDepth,
  momentumGoals,
}: {
  stats: Stats
  shots: ShotPoint[]
  teams: { home: string; away: string }
  goalAreaDepth: number
  momentumGoals: Goal[]
}) {
  const players = stats.players
  const [scope, setScope] = useState<'match' | number>('match')
  const focus = typeof scope === 'number' ? players.find((p) => p.playerId === scope) ?? null : null

  return (
    <>
      {players.length > 0 && (
        <div className="an-switch" role="tablist" aria-label="Wissel tussen wedstrijd en speler">
          <button type="button" className={`an-switch-btn${scope === 'match' ? ' on' : ''}`} onClick={() => setScope('match')}>
            🏟️ Hele wedstrijd
          </button>
          {players.map((p) => (
            <button
              key={p.playerId}
              type="button"
              className={`an-switch-btn side-${p.teamSide}${scope === p.playerId ? ' on' : ''}`}
              onClick={() => setScope(p.playerId)}
            >
              #{p.shirtNumber} {first(p.playerName)}
            </button>
          ))}
        </div>
      )}

      {momentumGoals.length > 0 && <MomentumChart goals={momentumGoals} teams={teams} />}

      {players.length === 0 ? (
        <p className="empty">Deze wedstrijd heeft geen gedetailleerde worpdata (in snelscoremodus gespeeld).</p>
      ) : focus ? (
        <>
          <PlayerFocus p={focus} team={focus.teamSide === 'home' ? teams.home : teams.away} />
          <MatchStats key={`p${focus.playerId}`} stats={stats} shots={shots} teams={teams} goalAreaDepth={goalAreaDepth} focusPlayerId={focus.playerId} />
        </>
      ) : (
        <>
          <MatchRecap stats={stats} teams={teams} />
          <AnalyseCharts stats={stats} teams={teams} />
          <MatchStats key="match" stats={stats} shots={shots} teams={teams} goalAreaDepth={goalAreaDepth} />
        </>
      )}
    </>
  )
}
