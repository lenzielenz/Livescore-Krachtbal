'use client'

import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { Side } from '@/lib/tournament'
import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { useLiveStream } from '@/lib/use-live-stream'
import { fmtClock, useTicking } from '../../../useTournament'

function findMatch(state: TournamentState, matchId: number): TMatchState | null {
  for (const r of state.rounds) {
    const hit = r.matches.find((m) => m.id === matchId)
    if (hit) return hit
  }
  return state.thirdPlace?.id === matchId ? state.thirdPlace : null
}

export function TournamentScoresheet({
  id,
  matchId,
  initial,
  halfDurationSeconds,
}: {
  id: number
  matchId: number
  initial: TournamentState
  halfDurationSeconds: number
}) {
  const [state, setState] = useState<TournamentState>(initial)
  const [error, setError] = useState<string | null>(null)
  const [askWinner, setAskWinner] = useState(false)
  const busy = useRef(false)

  // SSE: vang wijzigingen op die elders gemaakt worden (negeer terwijl een eigen actie loopt).
  useLiveStream<TournamentState>(`/api/tournament/${id}/stream`, (data) => {
    if (busy.current) return
    setState(data)
  })

  const m = findMatch(state, matchId)
  const clock = useTicking(m?.clockSeconds ?? 0, m?.clockRunning ?? false)

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy.current) return
      busy.current = true
      setError(null)
      try {
        const res = await fetch(`/api/tournament/${id}/match/${matchId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await res.json()) as { state?: TournamentState; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Actie mislukt.')
        if (data.state) setState(data.state)
        if (body.action === 'finish') setAskWinner(false)
        return true
      } catch (e) {
        const msg = (e as Error).message
        if (body.action === 'finish' && /gelijkspel/i.test(msg)) setAskWinner(true)
        else setError(msg)
        return false
      } finally {
        busy.current = false
      }
    },
    [id, matchId],
  )

  const half = m?.currentHalf ?? 1
  const overtime = useMemo(() => clock >= halfDurationSeconds, [clock, halfDurationSeconds])

  if (!m) return <p className="trn-error">Wedstrijd niet gevonden.</p>

  const ready = Boolean(m.home && m.away)
  const finished = m.status === 'finished'

  return (
    <div className="trn-page sheet">
      <header className="trn-top">
        <Link href={`/tornooi/${id}`} className="trn-home">
          <span className="brand">Krachtbal</span> · Aantekentafel
        </Link>
        <Link href={`/tornooi/${id}/veld/${matchId}`} className="trn-toplink">Veldscherm →</Link>
      </header>

      <div className="ts-meta">
        <span className="ts-round">{m.label}</span>
        <span className={`ts-status ${m.status}`}>
          {finished ? 'AFGELOPEN' : m.status === 'live' ? `LIVE · H${half}` : 'NOG NIET GESTART'}
        </span>
      </div>

      <div className={`ts-clock ${overtime ? 'over' : ''}`}>
        <span className="ts-clock-time">{fmtClock(clock)}</span>
        <span className="ts-clock-half">Helft {half} · doel {Math.round(halfDurationSeconds / 60)} min</span>
      </div>

      {!ready ? (
        <p className="trn-empty">Wacht tot beide ploegen gekend zijn (winnaars van de vorige ronde).</p>
      ) : (
        <>
          <div className="ts-board">
            {(['home', 'away'] as Side[]).map((side) => (
              <div key={side} className={`ts-team ${m.winner === side ? 'won' : ''}`}>
                <div className="ts-team-name">{side === 'home' ? m.home : m.away}</div>
                {/* key op de stand: elke wijziging triggert de flits opnieuw — zo VOELT een tik
                    meteen geregistreerd, ook op een traag netwerk aan het veld. */}
                <div key={`${side}-${m.score[side]}`} className="ts-score flash">{m.score[side]}</div>
                {!finished && (
                  <div className="ts-goalbtns">
                    <button type="button" className="ts-goal nek" onClick={() => act({ action: 'goal', side, points: 1 })}>
                      +1 <small>nekworp</small>
                    </button>
                    <button type="button" className="ts-goal rug" onClick={() => act({ action: 'goal', side, points: 2 })}>
                      +2 <small>rugworp</small>
                    </button>
                  </div>
                )}
                <div className="ts-stats">
                  <div className="ts-stat">
                    <span className="ts-stat-lbl">✖ Kruisjes</span>
                    <span className="ts-stat-ctrl">
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'cross', side, delta: -1 })} aria-label="Kruisje min">−</button>}
                      <span className="ts-stat-n">{m.crosses[side]}</span>
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'cross', side, delta: 1 })} aria-label="Kruisje plus">+</button>}
                    </span>
                  </div>
                  <div className="ts-stat">
                    <span className="ts-stat-lbl">⏱ Minuten</span>
                    <span className="ts-stat-ctrl">
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'timeout', side, delta: -1 })} aria-label="Minuut min">−</button>}
                      <span className="ts-stat-n">{m.timeouts[side]}</span>
                      {!finished && <button type="button" className="ts-stat-btn" onClick={() => act({ action: 'timeout', side, delta: 1 })} aria-label="Minuut plus">+</button>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!finished && (
            <div className="ts-controls">
              {/* De undo zegt wát ze wegneemt — geen blinde gok meer of je de juiste tik terugdraait. */}
              <button type="button" className="trn-btn" disabled={!m.lastGoal} onClick={() => act({ action: 'undo' })}>
                {m.lastGoal
                  ? `↶ Ondoen: +${m.lastGoal.points} ${m.lastGoal.side === 'home' ? m.home : m.away}`
                  : '↶ Niets te ondoen'}
              </button>
              {m.status === 'pending' ? (
                <button type="button" className="trn-btn primary" onClick={() => act({ action: 'start' })}>▶ Start</button>
              ) : m.clockRunning ? (
                <button type="button" className="trn-btn" onClick={() => act({ action: 'clock', running: false })}>⏸ Pauze</button>
              ) : (
                <button type="button" className="trn-btn" onClick={() => act({ action: 'clock', running: true })}>▶ Klok</button>
              )}
              {half === 1 && (
                <button type="button" className="trn-btn" onClick={() => act({ action: 'half' })}>⏭ 2e helft</button>
              )}
              {/* Bevestiging tegen een verdwaalde tik: einde legt de uitslag vast en schuift de
                  winnaar door in het schema. */}
              <button
                type="button"
                className="trn-btn danger"
                onClick={() => { if (window.confirm('Wedstrijd beëindigen? De eindstand wordt vastgelegd.')) void act({ action: 'finish' }) }}
              >
                ⏹ Einde
              </button>
            </div>
          )}

          {askWinner && (
            <div className="ts-tie">
              <p>Gelijkspel — wie gaat door?</p>
              <div className="ts-tie-btns">
                <button type="button" className="trn-btn primary" onClick={() => act({ action: 'finish', winner: 'home' })}>
                  {m.home}
                </button>
                <button type="button" className="trn-btn primary" onClick={() => act({ action: 'finish', winner: 'away' })}>
                  {m.away}
                </button>
              </div>
            </div>
          )}

          {finished && (
            <div className="trn-champion small">
              ✅ Afgelopen — winnaar: <strong>{m.winner === 'home' ? m.home : m.away}</strong>
              <div className="ts-after">
                <Link href={`/tornooi/${id}`} className="trn-btn">Terug naar schema</Link>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="trn-error">{error}</p>}
    </div>
  )
}
