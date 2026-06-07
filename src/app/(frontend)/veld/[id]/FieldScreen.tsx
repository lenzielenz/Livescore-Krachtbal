'use client'

import { useEffect, useRef, useState } from 'react'

import { ClubColorBlast } from '@/components/ClubColorBlast'
import { TeamLogo } from '@/components/TeamLogo'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark } from '@/lib/club-colors'
import type { MatchState, TimelineItem } from '@/lib/match-engine'
import { goalPointsFromLabel, goalScorerFromLabel, useLiveStream } from '@/lib/use-live-stream'

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
              {kind === 'cross' ? '✖' : '⏱'}
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
  // Volledig scherm voor de zaal-tv: zet het veldscherm over het hele scherm (verbergt browser-UI).
  const rootRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const base = useRef({ seconds: initial.state.match.clockSeconds, at: Date.now() })
  const seenGoals = useRef<Set<string>>(new Set(initial.timeline.filter((i) => i.kind === 'goal').map((i) => i.id)))
  const goalSeq = useRef(0)
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viewers, setViewers] = useState(0)
  // Clubkleuren-viering die vanaf een supporter-scherm wordt afgevuurd, ook hier op de zaal-tv tonen.
  const [blast, setBlast] = useState<{ key: number; colors: { primary: string; secondary: string }; name: string } | null>(null)
  const blastSeq = useRef(0)
  const blastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBlast = useRef(0)
  const triggerBlast = (side: 'home' | 'away') => {
    const now = Date.now()
    if (now - lastBlast.current < 2500) return
    lastBlast.current = now
    const t = state.teams[side]
    const fallback = side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
    const colors = t.colors ?? { primary: fallback, secondary: fallback }
    const key = ++blastSeq.current
    setBlast({ key, colors, name: t.name })
    if (blastTimer.current) clearTimeout(blastTimer.current)
    blastTimer.current = setTimeout(() => setBlast((b) => (b && b.key === key ? null : b)), 2800)
  }

  // SSE-abonnement op dezelfde stream als het publieke scorebord (met reconnect-backoff).
  const { connected } = useLiveStream<{ state: MatchState; timeline: TimelineItem[] }>(
    `/api/match/${matchId}/stream`,
    (data) => {
      const fresh = data.timeline.filter((i) => i.kind === 'goal' && !seenGoals.current.has(i.id))
      fresh.forEach((i) => seenGoals.current.add(i.id))

      setState(data.state)

      const last = fresh[fresh.length - 1]
      if (last && last.side) {
        goalSeq.current += 1
        setGoal({
          key: goalSeq.current,
          side: last.side,
          team: data.state.teams[last.side].name,
          points: goalPointsFromLabel(last.label),
          scorer: goalScorerFromLabel(last.label),
        })
        if (goalTimer.current) clearTimeout(goalTimer.current)
        goalTimer.current = setTimeout(() => setGoal(null), 6000)
      }
    },
    {
      viewers: (d) => setViewers((d as { count?: number }).count ?? 0),
      blast: (d) => {
        const side = (d as { side?: string }).side
        if (side === 'home' || side === 'away') triggerBlast(side)
      },
    },
  )

  useEffect(() => {
    return () => {
      if (goalTimer.current) clearTimeout(goalTimer.current)
      if (blastTimer.current) clearTimeout(blastTimer.current)
    }
  }, [])

  // Houd de knop-status in sync, ook als de gebruiker met Esc/F11 het volledige scherm verlaat.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void rootRef.current?.requestFullscreen?.()
    }
  }

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
  // Op de zaal-tv worden deze kleuren als TEKST/cijfer/klok op een bijna-zwart paneel gebruikt.
  // Klem ze naar een leesbare variant zodat een donker crest de klok/score niet onzichtbaar maakt.
  const home1 = readableOnDark(state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR)
  const home2 = readableOnDark(state.teams.home.colors?.secondary ?? state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR)
  const away1 = readableOnDark(state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR)
  const away2 = readableOnDark(state.teams.away.colors?.secondary ?? state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR)
  const themeAway = goal?.side === 'away'
  const fsStyle = {
    '--home': home1,
    '--away': away1,
    '--theme-1': themeAway ? away1 : home1,
    '--theme-2': themeAway ? away2 : home2,
    // Inkt voor de doelpunt-pil (donkere of witte tekst, afhankelijk van de pil-achtergrond).
    '--goal-ink': inkOn(themeAway ? away1 : home1),
  } as React.CSSProperties

  return (
    <div className="fs" style={fsStyle} ref={rootRef}>
      {blast && <ClubColorBlast key={blast.key} colors={blast.colors} teamName={blast.name} />}
      <button
        type="button"
        className="fs-fsbtn"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}
        title={isFullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}
      >
        <svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {isFullscreen ? (
            <path d="M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5" />
          ) : (
            <path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" />
          )}
        </svg>
      </button>
      <div className="fs-top">
        <span className={`fs-status ${status}`}>{statusLabel}</span>
        {reeks && <span className="fs-reeks">{reeks}</span>}
        {status === 'live' && !connected && (
          <span className="fs-offline" title="Verbinding verbroken — opnieuw verbinden…">⚠ verbinden…</span>
        )}
        {viewers > 0 && <span className="fs-viewers" title="Kijkers nu">👁 {viewers}</span>}
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
