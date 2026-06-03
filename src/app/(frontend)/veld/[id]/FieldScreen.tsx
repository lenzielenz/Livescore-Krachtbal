'use client'

import { useEffect, useRef, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR } from '@/lib/club-colors'
import type { MatchState, TimelineItem } from '@/lib/match-engine'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Side = 'home' | 'away'

type Goal = {
  key: number
  side: Side
  team: string
  points: number
  scorer: string | null
}

// Responsieve logomaat voor het grote veldscherm.
const FS_LOGO_SIZE = 'clamp(84px, 14vw, 200px)'

// Telmarkeringen onder de ploegnaam: invul-vakjes gegroepeerd per set.
// Kruisjes per 3 (3e kruisje → vrije worp, §6.7); time-outs per 2 (max. 2 per helft, §8.1).
function Marks({ count, group, kind }: { count: number; group: number; kind: 'cross' | 'timeout' }) {
  const total = Math.max(group, Math.ceil(count / group) * group)
  const groups: boolean[][] = []
  for (let i = 0; i < total; i += group) {
    groups.push(Array.from({ length: group }, (_, j) => i + j < count))
  }
  return (
    <span className={`fs-marks fs-marks-${kind}`}>
      {groups.map((g, gi) => (
        <span className="fs-mark-group" key={gi}>
          {g.map((on, j) => (
            <span key={j} className={`fs-mark ${on ? 'on' : ''}`} aria-hidden>
              {kind === 'cross' ? '✚' : '⏱'}
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}

// Statblok (kruisjes + time-outs) onder een ploegnaam.
function TeamStats({ crosses, timeouts }: { crosses: number; timeouts: number }) {
  return (
    <div className="fs-stats">
      <div className="fs-stat" title="Kruisjes (rechtstreeks buiten)">
        <span className="fs-stat-cap">Kruisjes</span>
        <Marks count={crosses} group={3} kind="cross" />
      </div>
      <div className="fs-stat" title="Time-outs (max. 2 per helft)">
        <span className="fs-stat-cap">Time-outs</span>
        <Marks count={timeouts} group={2} kind="timeout" />
      </div>
    </div>
  )
}

// Laatste doelpunt voor een ploeg uit de tijdlijn halen, voor de naam van de doelpuntenmaker.
function lastGoalScorer(timeline: TimelineItem[], side: Side): string | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]
    if (item.kind === 'goal' && item.side === side) {
      // Label is "Doelpunt +N #7 Naam" — prefix wegstrippen.
      const scorer = item.label.replace(/^Doelpunt\s*\+\d+\s*/, '').trim()
      return scorer || null
    }
  }
  return null
}

export function FieldScreen({
  matchId,
  reeks,
  initial,
}: {
  matchId: number
  reeks: string | null
  initial: { state: MatchState; timeline: TimelineItem[] }
}) {
  const [state, setState] = useState<MatchState>(initial.state)
  const [clock, setClock] = useState(initial.state.match.clockSeconds)
  const [goal, setGoal] = useState<Goal | null>(null)
  const base = useRef({ seconds: initial.state.match.clockSeconds, at: Date.now() })
  const prevScore = useRef(initial.state.score)
  const goalSeq = useRef(0)
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // SSE-abonnement op dezelfde stream als het publieke scorebord.
  useEffect(() => {
    const es = new EventSource(`/api/match/${matchId}/stream`)
    es.addEventListener('update', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { state: MatchState; timeline: TimelineItem[] }

      // Doelpunt-detectie: stand omhoog → animatie afspelen voor de scorende ploeg.
      const prev = prevScore.current
      const next = data.state.score
      const dHome = next.home - prev.home
      const dAway = next.away - prev.away
      const scored: { side: Side; points: number } | null =
        dHome > 0 ? { side: 'home', points: dHome } : dAway > 0 ? { side: 'away', points: dAway } : null
      prevScore.current = next

      setState(data.state)

      if (scored) {
        goalSeq.current += 1
        setGoal({
          key: goalSeq.current,
          side: scored.side,
          team: data.state.teams[scored.side].name,
          points: scored.points,
          scorer: lastGoalScorer(data.timeline, scored.side),
        })
        if (goalTimer.current) clearTimeout(goalTimer.current)
        goalTimer.current = setTimeout(() => setGoal(null), 6000)
      }
    })
    return () => {
      es.close()
      if (goalTimer.current) clearTimeout(goalTimer.current)
    }
  }, [matchId])

  // Klok-basis bijwerken bij elke state-update.
  useEffect(() => {
    base.current = { seconds: state.match.clockSeconds, at: Date.now() }
    setClock(state.match.clockSeconds)
  }, [state.match.clockSeconds, state.match.clockRunning])

  useEffect(() => {
    if (!state.match.clockRunning) return
    const t = setInterval(() => {
      setClock(base.current.seconds + (Date.now() - base.current.at) / 1000)
    }, 250)
    return () => clearInterval(t)
  }, [state.match.clockRunning])

  const status = state.match.status
  const statusLabel =
    status === 'live' ? (state.atHalfTime ? 'RUST' : 'LIVE') : status === 'finished' ? 'AFGELOPEN' : 'GEPLAND'

  // Dynamische stijl op basis van de clubkleuren. De thuisploeg geeft de toon aan;
  // scoort de tegenpartij, dan komen tijdens de viering hún kleuren naar boven.
  const home1 = state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR
  const home2 = state.teams.home.colors?.secondary ?? home1
  const away1 = state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR
  const away2 = state.teams.away.colors?.secondary ?? away1
  const themeAway = goal?.side === 'away'
  const fsStyle = {
    '--home': home1,
    '--away': away1,
    '--theme-1': themeAway ? away1 : home1,
    '--theme-2': themeAway ? away2 : home2,
  } as React.CSSProperties

  return (
    <div className="fs" style={fsStyle}>
      <div className="fs-top">
        <span className={`fs-status ${status}`}>{statusLabel}</span>
        {reeks && <span className="fs-reeks">{reeks}</span>}
      </div>

      <div className="fs-main">
        <div className={`fs-team ${goal?.side === 'home' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" size={FS_LOGO_SIZE} float ringColor={state.teams.home.colors?.primary} />
          <div className="fs-name">{state.teams.home.name}</div>
          <TeamStats crosses={state.crosses.home} timeouts={state.timeouts.home} />
        </div>

        <div className="fs-center">
          <div className="fs-score">
            <span className={goal?.side === 'home' ? 'fs-pulse' : ''}>{state.score.home}</span>
            <span className="fs-dash">–</span>
            <span className={goal?.side === 'away' ? 'fs-pulse' : ''}>{state.score.away}</span>
          </div>
          <div className="fs-clock">{fmtClock(clock)}</div>
          <div className="fs-half">{status === 'finished' ? 'Einde' : `Helft ${state.match.currentHalf}`}</div>
        </div>

        <div className={`fs-team ${goal?.side === 'away' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" size={FS_LOGO_SIZE} float ringColor={state.teams.away.colors?.primary} />
          <div className="fs-name">{state.teams.away.name}</div>
          <TeamStats crosses={state.crosses.away} timeouts={state.timeouts.away} />
        </div>
      </div>

      {goal && (
        <div key={goal.key} className={`fs-goal side-${goal.side}`}>
          <div className="fs-goal-burst" aria-hidden />
          <div className="fs-goal-card">
            <div className="fs-goal-title">DOELPUNT!</div>
            <div className="fs-goal-team">{goal.team}</div>
            {goal.scorer && <div className="fs-goal-scorer">{goal.scorer}</div>}
            <div className="fs-goal-pts">{goal.points === 2 ? 'RUGWORP +2' : 'NEKWORP +1'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
