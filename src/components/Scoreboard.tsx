'use client'

import { useEffect, useRef, useState } from 'react'

import type { MatchState, TimelineItem } from '@/lib/match-engine'
import { type LogoFit, logoFitStyle } from '@/lib/logo-fit'
import './scoreboard.css'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function TeamBadge({
  name,
  logoUrl,
  logoFit,
  side,
}: {
  name: string
  logoUrl: string | null
  logoFit?: LogoFit | null
  side: 'home' | 'away'
}) {
  const [failed, setFailed] = useState(false)
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
  return (
    <span className={`sb-logo sb-logo-${side}`}>
      {logoUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${name} logo`} style={logoFitStyle(logoFit)} onError={() => setFailed(true)} />
      ) : (
        <span className="sb-logo-initials">{initials}</span>
      )}
    </span>
  )
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
  const base = useRef({ seconds: initial.state.match.clockSeconds, running: initial.state.match.clockRunning, at: Date.now() })

  // SSE-abonnement.
  useEffect(() => {
    const es = new EventSource(`/api/match/${matchId}/stream`)
    es.addEventListener('update', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { state: MatchState; timeline: TimelineItem[] }
      setState(data.state)
      setTimeline(data.timeline)
      setLive(true)
    })
    es.onerror = () => setLive(false)
    return () => es.close()
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
        <div className="sb-side-team">
          <TeamBadge name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" />
          <div className="sb-name">{state.teams.home.name}</div>
          <div className="sb-min" title="Aangevraagde minuten (time-outs)">
            <span className="sb-min-lbl">min.</span>
            <Dots filled={state.timeouts.home} total={2} className="to" />
          </div>
        </div>
        <div className="sb-scorebox">
          <div className="sb-score">
            <span>{state.score.home}</span>
            <span className="sb-dash">–</span>
            <span>{state.score.away}</span>
          </div>
          <div className="sb-clock">{fmtClock(clock)}</div>
          <div className="sb-half">Helft {state.match.currentHalf}</div>
        </div>
        <div className="sb-side-team">
          <TeamBadge name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" />
          <div className="sb-name">{state.teams.away.name}</div>
          <div className="sb-min" title="Aangevraagde minuten (time-outs)">
            <span className="sb-min-lbl">min.</span>
            <Dots filled={state.timeouts.away} total={2} className="to" />
          </div>
        </div>
      </div>

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
