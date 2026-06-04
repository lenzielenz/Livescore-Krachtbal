'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { categoryConfig } from '@/lib/categories'
import type { MatchState } from '@/lib/match-engine'
import type { SimpleSide } from '@/lib/simple-score'
import { useLiveStream } from '@/lib/use-live-stream'
import './simple-scorekeeper.css'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// Voornaam = eerste woord van de naam (compact tonen naast het rugnummer).
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

interface RosterPlayer {
  id: number
  name: string
  shirtNumber: number
  teamId: number
}

// Simpele aantekenmodus (snelscoremodus): snel scoren met +1 (nekworp) / +2
// (rugworp), zoals aan de tornooitafel. Geen veldschema, geen worp-per-worp data.
// Anders dan bij tornooien moet hier wél de scorende speler gekozen worden.
export function SimpleScorekeeper({
  matchId,
  initialState,
  roster,
  reeks,
}: {
  matchId: number
  initialState: MatchState
  roster: RosterPlayer[]
  reeks?: string
}) {
  const [state, setState] = useState<MatchState>(initialState)
  const [error, setError] = useState<string | null>(null)
  // Openstaand doelpunt dat wacht op een spelerkeuze (snel-scoren vereist een scorer).
  const [pending, setPending] = useState<{ side: SimpleSide; points: 1 | 2 } | null>(null)
  const busy = useRef(false)

  const half = state.match.currentHalf
  const status = state.match.status
  const finished = status === 'finished'
  const live = status === 'live'
  const targetSec = categoryConfig(state.match.category).halfDurationSeconds

  // Lopende klok: reken vanaf clockUpdatedAt (server) zodat een refresh de tijd behoudt.
  const [clock, setClockVal] = useState(initialState.match.clockSeconds)
  useEffect(() => {
    const m = state.match
    const base = m.clockSeconds
    if (!m.clockRunning) {
      setClockVal(base)
      return
    }
    const at = m.clockUpdatedAt ? new Date(m.clockUpdatedAt).getTime() : Date.now()
    const update = () => setClockVal(base + Math.max(0, (Date.now() - at) / 1000))
    update()
    const t = setInterval(update, 250)
    return () => clearInterval(t)
  }, [state.match])

  // SSE: vang wijzigingen op die op een ander toestel gemaakt worden (met reconnect-backoff).
  // Negeer updates terwijl een eigen actie loopt, zodat we geen optimistische schrijf overschrijven.
  useLiveStream<{ state?: MatchState }>(`/api/match/${matchId}/stream`, (data) => {
    if (busy.current) return
    if (data.state) setState(data.state)
  })

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy.current) return
      busy.current = true
      setError(null)
      try {
        const res = await fetch(`/api/match/${matchId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await res.json()) as MatchState & { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Actie mislukt.')
        setState(data)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        busy.current = false
      }
    },
    [matchId],
  )

  const overtime = live && clock >= targetSec

  return (
    <div className="ssk">
      <header className="ssk-top">
        <Link href="/scorekeeper" className="ssk-home">
          <span className="brand">Krachtbal</span> · Aantekentafel
        </Link>
        <Link href={`/veld/${matchId}`} className="ssk-toplink">Veldscherm →</Link>
      </header>

      <div className="ssk-meta">
        <span className="ssk-mode">⚡ Snel scoren{reeks ? <> · <span className="ssk-reeks">{reeks}</span></> : null}</span>
        <span className={`ssk-status ${status}`}>
          {finished ? 'AFGELOPEN' : live ? `LIVE · H${half}` : 'NOG NIET GESTART'}
        </span>
      </div>

      <div className={`ssk-clock ${overtime ? 'over' : ''}`}>
        <span className="ssk-clock-time">{fmtClock(clock)}</span>
        <span className="ssk-clock-half">Helft {half} · doel {Math.round(targetSec / 60)} min</span>
      </div>

      <div className="ssk-board">
        {(['home', 'away'] as SimpleSide[]).map((side) => {
          const team = state.teams[side]
          return (
            <div key={side} className={`ssk-team side-${side}`}>
              <div className="ssk-team-head">
                <TeamLogo name={team.name} logoUrl={team.logoUrl} logoFit={team.logoFit} side={side} size="md" ringColor={team.colors?.primary ?? null} />
                <div className="ssk-team-name">{team.name}</div>
              </div>
              <div className="ssk-score">{state.score[side]}</div>
              {!finished && (
                <div className="ssk-goalbtns">
                  <button type="button" className="ssk-goal nek" onClick={() => setPending({ side, points: 1 })}>
                    +1 <small>nekworp</small>
                  </button>
                  <button type="button" className="ssk-goal rug" onClick={() => setPending({ side, points: 2 })}>
                    +2 <small>rugworp</small>
                  </button>
                </div>
              )}
              <div className="ssk-stats">
                <div className="ssk-stat">
                  <span className="ssk-stat-lbl">✖ Kruisjes</span>
                  <span className="ssk-stat-ctrl">
                    {!finished && <button type="button" className="ssk-stat-btn" disabled={state.crosses[side] <= 0} onClick={() => act({ action: 'simplecross', side, delta: -1 })} aria-label="Kruisje min">−</button>}
                    <span className="ssk-stat-n">{state.crosses[side]}</span>
                    {!finished && <button type="button" className="ssk-stat-btn" onClick={() => act({ action: 'simplecross', side, delta: 1 })} aria-label="Kruisje plus">+</button>}
                  </span>
                </div>
                <div className="ssk-stat">
                  <span className="ssk-stat-lbl">⏱ Time-outs <small>(max 2)</small></span>
                  <span className="ssk-stat-ctrl">
                    {!finished && <button type="button" className="ssk-stat-btn" disabled={state.timeouts[side] <= 0} onClick={() => act({ action: 'simpletimeout', side, delta: -1 })} aria-label="Time-out min">−</button>}
                    <span className="ssk-stat-n">{state.timeouts[side]}</span>
                    {!finished && <button type="button" className="ssk-stat-btn" disabled={state.timeouts[side] >= 2} onClick={() => act({ action: 'simpletimeout', side, delta: 1 })} aria-label="Time-out plus">+</button>}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!finished && (
        <div className="ssk-refmin">
          <span className="ssk-refmin-lbl">⏱ Scheidsrechter-minuut</span>
          <span className="ssk-stat-ctrl">
            <button type="button" className="ssk-stat-btn" disabled={state.refereeStops <= 0} onClick={() => act({ action: 'simplerefstop', delta: -1 })} aria-label="SR-minuut min">−</button>
            <span className="ssk-stat-n">{state.refereeStops}</span>
            <button type="button" className="ssk-stat-btn" onClick={() => act({ action: 'simplerefstop', delta: 1 })} aria-label="SR-minuut plus">+</button>
          </span>
        </div>
      )}

      {!finished && (
        <div className="ssk-controls">
          <button type="button" className="ssk-btn" onClick={() => act({ action: 'simpleundo' })}>↶ Undo doelpunt</button>
          {!live ? (
            <button type="button" className="ssk-btn primary" onClick={() => act({ action: 'simplestart' })}>▶ Start</button>
          ) : state.match.clockRunning ? (
            <button type="button" className="ssk-btn" onClick={() => act({ action: 'clock', running: false })}>⏸ Pauze</button>
          ) : (
            <button type="button" className="ssk-btn" onClick={() => act({ action: 'clock', running: true })}>▶ Klok</button>
          )}
          {live && half === 1 && (
            <button type="button" className="ssk-btn" onClick={() => act({ action: 'simplehalf' })}>⏭ 2e helft</button>
          )}
          {live && (
            <button
              type="button"
              className="ssk-btn danger"
              onClick={() => {
                if (window.confirm('Wedstrijd beëindigen? De eindstand wordt vastgelegd.')) act({ action: 'finish' })
              }}
            >
              ⏹ Einde
            </button>
          )}
        </div>
      )}

      {finished && (
        <div className="ssk-done">
          ✅ Afgelopen — eindstand <strong>{state.score.home} – {state.score.away}</strong>
          <div className="ssk-after">
            <Link href={`/match/${matchId}`} className="ssk-btn">Naar wedstrijdpagina</Link>
          </div>
        </div>
      )}

      {error && <p className="ssk-error">{error}</p>}

      {pending && (() => {
        const team = state.teams[pending.side]
        const teamPlayers = roster
          .filter((p) => p.teamId === team.id)
          .sort((a, b) => a.shirtNumber - b.shirtNumber)
        return (
          <div className="ssk-modal-overlay" onClick={() => setPending(null)}>
            <div className="ssk-modal" onClick={(e) => e.stopPropagation()}>
              <h3>
                Wie scoorde? <span className="ssk-modal-pts">+{pending.points} {pending.points === 2 ? 'rugworp' : 'nekworp'}</span>
              </h3>
              <div className="ssk-modal-team">
                <TeamLogo
                  name={team.name}
                  logoUrl={team.logoUrl}
                  logoFit={team.logoFit}
                  side={pending.side}
                  size="sm"
                  ringColor={team.colors?.primary ?? null}
                />
                <span>{team.name}</span>
              </div>
              {teamPlayers.length === 0 ? (
                <p className="ssk-dim">Geen spelers bekend voor deze ploeg — voeg ze toe in de opstelling.</p>
              ) : (
                <div className="ssk-pick-grid">
                  {teamPlayers.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="ssk-pick-player"
                      onClick={() => {
                        const { side, points } = pending
                        setPending(null)
                        void act({
                          action: 'simplegoal',
                          side,
                          points,
                          playerId: p.id,
                          shirtNumber: p.shirtNumber,
                          playerName: p.name,
                        })
                      }}
                    >
                      <span className="ssk-pick-num">{p.shirtNumber}</span>
                      <span className="ssk-pick-naam">{firstName(p.name)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="ssk-modal-btns">
                <button type="button" className="ssk-btn" onClick={() => setPending(null)}>Annuleren</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
