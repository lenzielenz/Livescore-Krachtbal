'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { attackDirForSide, deriveOutcome } from '@/lib/krachtbal-rules'
import type { AttackDir, Point } from '@/lib/field'
import type { MatchState } from '@/lib/match-engine'

interface RosterPlayer {
  id: number
  name: string
  shirtNumber: number
  teamId: number
}

const HOME_COLOR = '#06d6a0'
const AWAY_COLOR = '#4cc9f0'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Scorekeeper({
  matchId,
  initialState,
  roster,
}: {
  matchId: number
  initialState: MatchState
  roster: RosterPlayer[]
}) {
  const [state, setState] = useState<MatchState>(initialState)
  const [throwType, setThrowType] = useState<'nek' | 'rug'>('nek')
  const [tapMode, setTapMode] = useState<'ground' | 'caught'>('ground')
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)
  const [recentTaps, setRecentTaps] = useState<FieldMarker[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [goalFlash, setGoalFlash] = useState<{ points: number; color: string; team: string } | null>(null)

  const [clock, setClock] = useState(initialState.match.clockSeconds)
  const baseRef = useRef({ seconds: initialState.match.clockSeconds, running: initialState.match.clockRunning, at: Date.now() })

  useEffect(() => {
    baseRef.current = { seconds: state.match.clockSeconds, running: state.match.clockRunning, at: Date.now() }
    setClock(state.match.clockSeconds)
  }, [state.match.clockSeconds, state.match.clockRunning])

  useEffect(() => {
    if (!state.match.clockRunning) return
    const t = setInterval(() => {
      const b = baseRef.current
      setClock(b.seconds + (Date.now() - b.at) / 1000)
    }, 250)
    return () => clearInterval(t)
  }, [state.match.clockRunning])

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/match/${matchId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Actie mislukt')
        setState((data.state as MatchState) ?? (data as MatchState))
        return data as { outcome?: string; state?: MatchState }
      } catch (e) {
        setError((e as Error).message)
        return null
      } finally {
        setBusy(false)
      }
    },
    [matchId],
  )

  const poss = state.possession
  const possSide = poss?.side ?? null
  const homePlayers = roster.filter((p) => p.teamId === state.teams.home.id)
  const awayPlayers = roster.filter((p) => p.teamId === state.teams.away.id)

  // Geselecteerde speler wissen als die niet (meer) bij de ploeg-aan-zet hoort.
  useEffect(() => {
    if (!selectedPlayer) return
    const pl = roster.find((p) => p.id === selectedPlayer)
    const activeTeamId = possSide === 'home' ? state.teams.home.id : possSide === 'away' ? state.teams.away.id : null
    if (!pl || pl.teamId !== activeTeamId) setSelectedPlayer(null)
  }, [possSide, selectedPlayer, roster, state.teams.home.id, state.teams.away.id])

  const onTap = useCallback(
    async (p: Point) => {
      if (state.match.status !== 'live' || !poss) {
        setError('Wedstrijd is niet live of geen lopend balbezit.')
        return
      }
      if (!selectedPlayer) {
        setError('Selecteer eerst een speler (rugnummer).')
        return
      }
      const dir = poss.dir as AttackDir
      const tapCount = tapMode === 'caught' ? 2 : 1
      const outcome = deriveOutcome({ tapCount, point: p, dir })

      let touchedBeforeOut = false
      if (outcome === 'out_back') {
        touchedBeforeOut = window.confirm('Werd de bal aangeraakt vóór hij buiten ging?\n\nOK = ja (geen kruisje) · Annuleren = nee (kruisje)')
      }

      const teamColor = poss.side === 'home' ? HOME_COLOR : AWAY_COLOR
      setRecentTaps((prev) => [
        ...prev.slice(-5),
        {
          x: Math.max(0, Math.min(1, p.x)),
          y: Math.max(0, Math.min(1, p.y)),
          color: teamColor,
          r: outcome === 'goal' ? 8 : 6,
          label: String(poss.nextThrowNumber),
        },
      ])

      const scoringSide = poss.side
      const result = await act({
        action: 'throw',
        playerId: selectedPlayer,
        type: throwType,
        x: p.x,
        y: p.y,
        tapCount,
        touchedBeforeOut,
        gameClock: Math.floor(clock),
      })
      if (result?.outcome === 'goal') {
        setGoalFlash({
          points: throwType === 'rug' ? 2 : 1,
          color: scoringSide === 'home' ? HOME_COLOR : AWAY_COLOR,
          team: scoringSide === 'home' ? state.teams.home.name : state.teams.away.name,
        })
        window.setTimeout(() => setGoalFlash(null), 1800)
      }
      setTapMode('ground')
      setThrowType('nek')
      setSelectedPlayer(null)
    },
    [state.match.status, poss, selectedPlayer, tapMode, throwType, clock, act, state.teams],
  )

  const toggleClock = () =>
    act({ action: 'clock', running: !state.match.clockRunning, seconds: Math.floor(clock) })

  const isScheduled = state.match.status === 'scheduled'
  const isLive = state.match.status === 'live'

  // Vaste richtingslabels: ploeg die 'up' (naar y=1) speelt staat onderaan met ↓,
  // de andere bovenaan met ↑. Draait automatisch om in de 2e helft.
  const homeDirUp = attackDirForSide('home', state.match.currentHalf) === 'up'
  const fieldEnds = {
    top: homeDirUp
      ? { text: state.teams.away.name, color: AWAY_COLOR }
      : { text: state.teams.home.name, color: HOME_COLOR },
    bottom: homeDirUp
      ? { text: state.teams.home.name, color: HOME_COLOR }
      : { text: state.teams.away.name, color: AWAY_COLOR },
  }

  const PlayerColumn = ({ side, players }: { side: 'home' | 'away'; players: RosterPlayer[] }) => {
    const active = possSide === side
    return (
      <div className={`sk-col sk-col-${side} ${active ? 'active' : 'dim'}`}>
        {players.map((p) => {
          const justThrew = active && poss?.lastPlayerId === p.id
          return (
            <button
              type="button"
              key={p.id}
              className={`sk-num ${selectedPlayer === p.id ? 'on' : ''}`}
              disabled={!active || !isLive || justThrew}
              onClick={() => setSelectedPlayer(p.id)}
              title={justThrew ? `${p.name} — net geworpen, niet 2× na elkaar` : p.name}
            >
              {p.shirtNumber}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="sk">
      {goalFlash && (
        <div className="sk-goal-flash" style={{ ['--flash' as string]: goalFlash.color }}>
          <div className="sk-goal-big">DOELPUNT</div>
          <div className="sk-goal-pts">+{goalFlash.points}</div>
          <div className="sk-goal-team">{goalFlash.team}</div>
        </div>
      )}
      <header className="sk-top">
        <button className="sk-to home" disabled={busy || !isLive} onClick={() => act({ action: 'timeout', teamId: state.teams.home.id })}>
          <span className="sk-to-lbl">time-out</span>
          <span className="sk-to-dots">{'●'.repeat(state.timeouts.home)}{'○'.repeat(Math.max(0, 2 - state.timeouts.home))}</span>
        </button>

        <div className="sk-center">
          <div className="sk-scores">
            <span className="sk-tn home">{state.teams.home.name}</span>
            <span className="sk-sc">{state.score.home}</span>
            <button className={`sk-clock ${state.match.clockRunning ? 'running' : ''}`} disabled={busy || !isLive} onClick={toggleClock} title="Tik om te starten/pauzeren">
              {fmtClock(clock)}
              <span className="sk-clock-ico">{state.match.clockRunning ? '⏸' : '▶'}</span>
            </button>
            <span className="sk-sc">{state.score.away}</span>
            <span className="sk-tn away">{state.teams.away.name}</span>
          </div>
          <div className="sk-sub">Helft {state.match.currentHalf} · {state.match.status} · Kruisjes {state.crosses.home}–{state.crosses.away}</div>
        </div>

        <button className="sk-to away" disabled={busy || !isLive} onClick={() => act({ action: 'timeout', teamId: state.teams.away.id })}>
          <span className="sk-to-lbl">time-out</span>
          <span className="sk-to-dots">{'●'.repeat(state.timeouts.away)}{'○'.repeat(Math.max(0, 2 - state.timeouts.away))}</span>
        </button>
      </header>

      {poss && (
        <div className="sk-poss">
          Balbezit: <b style={{ color: possSide === 'home' ? HOME_COLOR : AWAY_COLOR }}>{possSide === 'home' ? state.teams.home.name : state.teams.away.name}</b>
          {' · '}worp {poss.nextThrowNumber}/{poss.throwsAllowed} · opzet {poss.setupSide === 'own' ? 'eigen helft' : 'tegenhelft'}
        </div>
      )}

      {error && <div className="sk-error" onClick={() => setError(null)}>{error}</div>}

      {isScheduled ? (
        <div className="sk-start">
          <h3>Start wedstrijd — welke ploeg zet op?</h3>
          <div className="sk-start-btns">
            <button className="sk-btn home" disabled={busy} onClick={() => act({ action: 'start', startingTeamId: state.teams.home.id })}>{state.teams.home.name}</button>
            <button className="sk-btn away" disabled={busy} onClick={() => act({ action: 'start', startingTeamId: state.teams.away.id })}>{state.teams.away.name}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="sk-arena">
            <PlayerColumn side="home" players={homePlayers} />
            <div className="sk-field-wrap">
              <FieldSchema className="sk-field" onTap={onTap} markers={recentTaps} ends={fieldEnds} />
            </div>
            <PlayerColumn side="away" players={awayPlayers} />
          </div>

          <div className="sk-controls">
            <div className="sk-pills">
              <button type="button" className={`pill ${throwType === 'nek' ? 'on' : ''}`} onClick={() => setThrowType('nek')}>Nek +1</button>
              <button type="button" className={`pill ${throwType === 'rug' ? 'on' : ''}`} onClick={() => setThrowType('rug')}>Rug +2</button>
              <span className="pill-sep" />
              <button type="button" className={`pill ${tapMode === 'ground' ? 'on' : ''}`} onClick={() => setTapMode('ground')}>Grond</button>
              <button type="button" className={`pill ${tapMode === 'caught' ? 'on' : ''}`} onClick={() => setTapMode('caught')}>Gevangen</button>
            </div>
            <div className="sk-actions">
              <button type="button" className="act warn" disabled={busy} onClick={() => act({ action: 'undo' })}>↶ Undo</button>
              {isLive && state.match.currentHalf < 2 && (
                <button type="button" className="act" disabled={busy} onClick={() => act({ action: 'half' })}>⏭ 2e helft</button>
              )}
              {isLive && (
                <button type="button" className="act danger" disabled={busy} onClick={() => { if (window.confirm('Wedstrijd beëindigen?')) act({ action: 'finish' }) }}>🏁 Einde</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
