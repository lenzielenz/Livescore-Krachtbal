'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { deriveOutcome } from '@/lib/krachtbal-rules'
import type { AttackDir, Point } from '@/lib/field'
import type { MatchState } from '@/lib/match-engine'

interface RosterPlayer {
  id: number
  name: string
  shirtNumber: number
  teamId: number
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
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

  // Lokale klok die meeloopt wanneer hij draait.
  const [clock, setClock] = useState(initialState.match.clockSeconds)
  const baseRef = useRef({ seconds: initialState.match.clockSeconds, running: initialState.match.clockRunning, at: Date.now() })

  useEffect(() => {
    baseRef.current = {
      seconds: state.match.clockSeconds,
      running: state.match.clockRunning,
      at: Date.now(),
    }
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
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [matchId],
  )

  const poss = state.possession
  const possTeamId = poss?.teamId ?? null
  const possPlayers = roster.filter((p) => p.teamId === possTeamId)

  const onTap = useCallback(
    async (p: Point) => {
      if (state.match.status !== 'live' || !poss) {
        setError('Wedstrijd is niet live of geen lopend balbezit.')
        return
      }
      if (!selectedPlayer) {
        setError('Selecteer eerst een speler.')
        return
      }
      const dir = poss.dir as AttackDir
      const tapCount = tapMode === 'caught' ? 2 : 1
      const outcome = deriveOutcome({ tapCount, point: p, dir })

      let touchedBeforeOut = false
      if (outcome === 'out_back') {
        touchedBeforeOut = window.confirm('Werd de bal aangeraakt vóór hij buiten ging?\n\nOK = ja (geen kruisje) · Annuleren = nee (kruisje)')
      }

      setRecentTaps((prev) => [
        ...prev.slice(-4),
        { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)), color: outcome === 'goal' ? '#06d6a0' : '#ef476f', label: String(poss.nextThrowNumber) },
      ])

      await act({
        action: 'throw',
        playerId: selectedPlayer,
        type: throwType,
        x: p.x,
        y: p.y,
        tapCount,
        touchedBeforeOut,
        gameClock: Math.floor(clock),
      })
      setTapMode('ground')
      setThrowType('nek')
    },
    [state.match.status, poss, selectedPlayer, tapMode, throwType, clock, act],
  )

  const toggleClock = () => {
    if (state.match.clockRunning) {
      act({ action: 'clock', running: false, seconds: Math.floor(clock) })
    } else {
      act({ action: 'clock', running: true, seconds: Math.floor(clock) })
    }
  }

  const isScheduled = state.match.status === 'scheduled'
  const isLive = state.match.status === 'live'

  return (
    <div className="sk">
      <header className="sk-top">
        <div className="sk-team">
          <span className="sk-team-name">{state.teams.home.name}</span>
          <span className="sk-score">{state.score.home}</span>
        </div>
        <div className="sk-center">
          <div className="sk-clock">{fmtClock(clock)}</div>
          <div className="sk-half">Helft {state.match.currentHalf} · {state.match.status}</div>
        </div>
        <div className="sk-team">
          <span className="sk-score">{state.score.away}</span>
          <span className="sk-team-name">{state.teams.away.name}</span>
        </div>
      </header>

      <div className="sk-meta">
        <span>Kruisjes: {state.crosses.home} – {state.crosses.away}</span>
        <span>Time-outs (helft): {state.timeouts.home} – {state.timeouts.away}</span>
        {poss && (
          <span className="sk-poss">
            Balbezit: <b>{poss.side === 'home' ? state.teams.home.name : state.teams.away.name}</b> · worp {poss.nextThrowNumber}/{poss.throwsAllowed} · opzet {poss.setupSide === 'own' ? 'eigen helft' : 'tegenhelft'}
          </span>
        )}
      </div>

      {error && <div className="sk-error" onClick={() => setError(null)}>{error}</div>}

      <div className="sk-body">
        <div className="sk-field-wrap">
          <FieldSchema
            className="sk-field"
            onTap={onTap}
            markers={recentTaps}
            highlight={poss ? { dir: poss.dir, label: poss.side === 'home' ? state.teams.home.name : state.teams.away.name } : undefined}
          />
        </div>

        <aside className="sk-side">
          {isScheduled && (
            <div className="sk-panel">
              <h3>Start wedstrijd</h3>
              <p>Welke ploeg zet op?</p>
              <button className="sk-btn primary" disabled={busy} onClick={() => act({ action: 'start', startingTeamId: state.teams.home.id })}>
                {state.teams.home.name}
              </button>
              <button className="sk-btn primary" disabled={busy} onClick={() => act({ action: 'start', startingTeamId: state.teams.away.id })}>
                {state.teams.away.name}
              </button>
            </div>
          )}

          {isLive && (
            <>
              <div className="sk-panel">
                <h3>Worp-type</h3>
                <div className="sk-seg">
                  <button className={throwType === 'nek' ? 'on' : ''} onClick={() => setThrowType('nek')}>Nek (+1)</button>
                  <button className={throwType === 'rug' ? 'on' : ''} onClick={() => setThrowType('rug')}>Rug (+2)</button>
                </div>
                <h3>Tik</h3>
                <div className="sk-seg">
                  <button className={tapMode === 'ground' ? 'on' : ''} onClick={() => setTapMode('ground')}>Grond (1×)</button>
                  <button className={tapMode === 'caught' ? 'on' : ''} onClick={() => setTapMode('caught')}>Gevangen (2×)</button>
                </div>
              </div>

              <div className="sk-panel sk-players">
                <h3>Speler {possTeamId === state.teams.home.id ? state.teams.home.name : state.teams.away.name}</h3>
                <div className="sk-player-grid">
                  {possPlayers.length === 0 && <span className="sk-dim">Geen spelers voor deze ploeg.</span>}
                  {possPlayers.map((p) => (
                    <button
                      key={p.id}
                      className={`sk-num ${selectedPlayer === p.id ? 'on' : ''}`}
                      onClick={() => setSelectedPlayer(p.id)}
                      title={p.name}
                    >
                      {p.shirtNumber}
                    </button>
                  ))}
                </div>
                {selectedPlayer && (
                  <p className="sk-dim">Geselecteerd: {possPlayers.find((p) => p.id === selectedPlayer)?.name}. Tik nu het landingspunt op het veld.</p>
                )}
              </div>
            </>
          )}

          <div className="sk-panel">
            <h3>Wedstrijd</h3>
            <button className="sk-btn" disabled={busy || !isLive} onClick={toggleClock}>
              {state.match.clockRunning ? '⏸ Klok pauzeren' : '▶ Klok starten'}
            </button>
            <button className="sk-btn warn" disabled={busy} onClick={() => act({ action: 'undo' })}>↶ Undo laatste worp</button>
            <div className="sk-seg">
              <button disabled={busy || !isLive} onClick={() => act({ action: 'timeout', teamId: state.teams.home.id })}>TO {state.teams.home.name}</button>
              <button disabled={busy || !isLive} onClick={() => act({ action: 'timeout', teamId: state.teams.away.id })}>TO {state.teams.away.name}</button>
            </div>
            {isLive && state.match.currentHalf < 2 && (
              <button className="sk-btn" disabled={busy} onClick={() => act({ action: 'half' })}>⏭ Naar 2e helft</button>
            )}
            {isLive && (
              <button className="sk-btn warn" disabled={busy} onClick={() => { if (window.confirm('Wedstrijd beëindigen?')) act({ action: 'finish' }) }}>🏁 Beëindigen</button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
