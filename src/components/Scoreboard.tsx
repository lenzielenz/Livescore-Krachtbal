'use client'

import { useEffect, useRef, useState } from 'react'

import type { MatchState, TimelineItem } from '@/lib/match-engine'
import { TeamLogo } from '@/components/TeamLogo'
import './scoreboard.css'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Side = 'home' | 'away'

type Goal = { key: number; side: Side; team: string; points: number; scorer: string | null }

// Naam van de doelpuntenmaker uit de laatste doelpunt-gebeurtenis van een ploeg halen.
function lastGoalScorer(timeline: TimelineItem[], side: Side): string | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]
    if (item.kind === 'goal' && item.side === side) {
      return item.label.replace(/^Doelpunt\s*\+\d+\s*/, '').trim() || null
    }
  }
  return null
}

function Dots({ filled, total, className }: { filled: number; total: number; className?: string }) {
  return (
    <span className={`sb-dots ${className ?? ''}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`sb-dot ${i < filled ? 'on' : ''}`} />
      ))}
    </span>
  )
}

export function Scoreboard({
  matchId,
  initial,
}: {
  matchId: number
  initial: { state: MatchState; timeline: TimelineItem[] }
}) {
  const [state, setState] = useState<MatchState>(initial.state)
  const [timeline, setTimeline] = useState<TimelineItem[]>(initial.timeline)
  const [live, setLive] = useState(false)
  const [clock, setClock] = useState(initial.state.match.clockSeconds)
  const [goal, setGoal] = useState<Goal | null>(null)
  const base = useRef({ seconds: initial.state.match.clockSeconds, running: initial.state.match.clockRunning, at: Date.now() })
  const prevScore = useRef(initial.state.score)
  const goalSeq = useRef(0)
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // SSE-abonnement.
  useEffect(() => {
    const es = new EventSource(`/api/match/${matchId}/stream`)
    es.addEventListener('update', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { state: MatchState; timeline: TimelineItem[] }

      // Doelpunt-detectie: stand omhoog → viering afspelen voor de scorende ploeg.
      const prev = prevScore.current
      const next = data.state.score
      const dHome = next.home - prev.home
      const dAway = next.away - prev.away
      const scored: { side: Side; points: number } | null =
        dHome > 0 ? { side: 'home', points: dHome } : dAway > 0 ? { side: 'away', points: dAway } : null
      prevScore.current = next

      setState(data.state)
      setTimeline(data.timeline)
      setLive(true)

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
        goalTimer.current = setTimeout(() => setGoal(null), 5000)
      }
    })
    es.onerror = () => setLive(false)
    return () => {
      es.close()
      if (goalTimer.current) clearTimeout(goalTimer.current)
    }
  }, [matchId])

  // Klok-basis bijwerken bij elke state-update.
  useEffect(() => {
    base.current = { seconds: state.match.clockSeconds, running: state.match.clockRunning, at: Date.now() }
    setClock(state.match.clockSeconds)
  }, [state.match.clockSeconds, state.match.clockRunning])

  useEffect(() => {
    if (!state.match.clockRunning) return
    const t = setInterval(() => {
      const b = base.current
      setClock(b.seconds + (Date.now() - b.at) / 1000)
    }, 250)
    return () => clearInterval(t)
  }, [state.match.clockRunning])

  const statusLabel =
    state.match.status === 'live' ? 'LIVE' : state.match.status === 'finished' ? 'AFGELOPEN' : 'GEPLAND'

  return (
    <div className="sb">
      <div className="sb-status">
        <span className={`sb-badge ${state.match.status}`}>{statusLabel}</span>
        {state.match.status === 'live' && <span className={`sb-conn ${live ? 'on' : ''}`}>● live</span>}
      </div>

      <div className="sb-main">
        <div className={`sb-side-team ${goal?.side === 'home' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" size="lg" float />
          <div className="sb-name">{state.teams.home.name}</div>
          <div className="sb-min" title="Aangevraagde minuten (time-outs)">
            <span className="sb-min-lbl">min.</span>
            <Dots filled={state.timeouts.home} total={2} className="to" />
          </div>
        </div>
        <div className="sb-scorebox">
          <div className="sb-score">
            <span className={goal?.side === 'home' ? 'sb-pulse' : ''}>{state.score.home}</span>
            <span className="sb-dash">–</span>
            <span className={goal?.side === 'away' ? 'sb-pulse' : ''}>{state.score.away}</span>
          </div>
          <div className="sb-clock">{fmtClock(clock)}</div>
          <div className="sb-half">Helft {state.match.currentHalf}</div>
        </div>
        <div className={`sb-side-team ${goal?.side === 'away' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" size="lg" float />
          <div className="sb-name">{state.teams.away.name}</div>
          <div className="sb-min" title="Aangevraagde minuten (time-outs)">
            <span className="sb-min-lbl">min.</span>
            <Dots filled={state.timeouts.away} total={2} className="to" />
          </div>
        </div>
      </div>

      {goal && (
        <div key={goal.key} className={`sb-goal side-${goal.side}`}>
          <div className="sb-goal-card">
            <div className="sb-goal-title">DOELPUNT!</div>
            <div className="sb-goal-team">{goal.team}</div>
            {goal.scorer && <div className="sb-goal-scorer">{goal.scorer}</div>}
            <div className="sb-goal-pts">{goal.points === 2 ? 'Rugworp +2' : 'Nekworp +1'}</div>
          </div>
        </div>
      )}

      <div className="sb-crosses">
        <span>Kruisjes</span>
        <span className="sb-cross-val">{state.crosses.home}</span>
        <span className="sb-cross-sep">·</span>
        <span className="sb-cross-val">{state.crosses.away}</span>
        {state.refereeStops > 0 && (
          <span className="sb-refmin" title="Minuten gevraagd door de scheidsrechter">
            ⏱ SR-minuut: {state.refereeStops}
          </span>
        )}
      </div>

      <div className="sb-timeline">
        <h3>Tijdlijn</h3>
        {timeline.length === 0 && <p className="sb-dim">Nog geen gebeurtenissen.</p>}
        <ul>
          {[...timeline].reverse().map((item) => (
            <li key={item.id} className={`sb-tl sb-tl-${item.kind} ${item.side ? `side-${item.side}` : ''}`}>
              <span className="sb-tl-time">{item.half}H {fmtClock(item.gameClock)}</span>
              <span className="sb-tl-team">
                {item.side === 'home' ? state.teams.home.name : item.side === 'away' ? state.teams.away.name : ''}
              </span>
              <span className="sb-tl-label">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
