'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { categoryConfig } from '@/lib/categories'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import type { MatchState } from '@/lib/match-engine'
import { genOpId } from '@/lib/op-id'
import type { SimpleSide } from '@/lib/simple-score'
import { useActionQueue } from '@/lib/use-action-queue'
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
  exitHref = '/scorekeeper',
  supportersMode = false,
}: {
  matchId: number
  initialState: MatchState
  roster: RosterPlayer[]
  reeks?: string
  /** Waarheen "eruit gaan" leidt: voor clubwedstrijden Mijn club (daar start je de tijdopname). */
  exitHref?: string
  /** Supporters-modus (vrije livescore): doel is doel — geen scorer kiezen, geen wissel. */
  supportersMode?: boolean
}) {
  const [state, setState] = useState<MatchState>(initialState)
  const [error, setError] = useState<string | null>(null)
  // Openstaand doelpunt dat wacht op een spelerkeuze (snel-scoren vereist een scorer).
  const [pending, setPending] = useState<{ side: SimpleSide; points: 1 | 2 } | null>(null)
  // Veldspelers (max. 4 per ploeg) — enkel zij verschijnen in de scorerkeuze. Begint bij de
  // voorbereide opstelling (of de eerste 4) en kan tijdens de match gewisseld worden.
  const teamRosterOf = (side: SimpleSide) =>
    roster.filter((p) => p.teamId === state.teams[side].id).sort((a, b) => a.shirtNumber - b.shirtNumber)
  const initField = (side: SimpleSide): number[] => {
    const tr = teamRosterOf(side)
    const fromState = (state.lineup[side] ?? []).filter((id) => tr.some((p) => p.id === id))
    return (fromState.length ? fromState : tr.slice(0, 4).map((p) => p.id)).slice(0, 4)
  }
  const [field, setField] = useState<{ home: number[]; away: number[] }>(() => ({ home: initField('home'), away: initField('away') }))
  const fieldPlayersOf = (side: SimpleSide) => {
    const tr = teamRosterOf(side)
    return field[side].map((id) => tr.find((p) => p.id === id)).filter((p): p is RosterPlayer => !!p)
  }
  // Wisselscherm: kies wie eruit gaat, dan wie erin komt.
  const [subSide, setSubSide] = useState<SimpleSide | null>(null)
  const [subOut, setSubOut] = useState<number | null>(null)
  // Na het wisselen van de kapitein: dwingt het kiezen van een nieuwe kapitein af.
  const [needCaptain, setNeedCaptain] = useState<SimpleSide | null>(null)
  // Scheidsrechter bevestigt de stand vóór de overgang naar de 2e helft.
  const [confirmHalfEnd, setConfirmHalfEnd] = useState(false)

  // Offline-bestendigheid: gedeelde wachtrij-hook (localStorage + auto-nasturen + opId-idempotentie,
  // zie use-action-queue.ts). `busy` = er loopt een eigen actie → SSE-updates even negeren.
  const { send, pendingCount, offline, busyRef: busy } = useActionQueue(matchId, (data) => setState(data as MatchState))

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
  // display=1: de aantekentafel is geen kijker — anders staat het oogje nooit op nul.
  useLiveStream<{ state?: MatchState }>(`/api/match/${matchId}/stream?display=1`, (data) => {
    if (busy.current) return
    if (data.state) setState(data.state)
  })

  const act = useCallback(
    async (body: Record<string, unknown>, optimistic?: (s: MatchState) => MatchState) => {
      setError(null)
      if (optimistic) setState((prev) => optimistic(prev))
      // Eén opId per actie (hergebruikt bij retry) → de server telt een heruitgezonden actie niet
      // dubbel. Blijft in de wachtrij staan zodat een retry exact dezelfde id meestuurt.
      const op = typeof body.opId === 'string' ? body : { ...body, opId: genOpId() }
      const r = await send(op)
      // Gequeued (offline) is géén fout: de optimistische stand blijft staan en de banner meldt
      // dat er nagestuurd wordt. Enkel een echte server-weigering tonen we.
      if (r.status === 'error') setError(r.message)
    },
    [send],
  )

  // Supporters-modus: doel is doel — noteer het doelpunt meteen, zonder een scorer te kiezen.
  const scoreAnon = (side: SimpleSide, points: 1 | 2) =>
    void act(
      { action: 'simplegoal', side, points },
      (s) => ({ ...s, score: { ...s.score, [side]: s.score[side] + points } }),
    )

  const overtime = live && clock >= targetSec

  // Volledig scherm (handig op een tablet bij het veld).
  const rootRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen().catch(() => {})
  }

  const homeC = state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR
  const awayC = state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR

  return (
    <div
      className="ssk"
      ref={rootRef}
      style={{ ['--home-c' as string]: homeC, ['--away-c' as string]: awayC }}
    >
      <header className="ssk-top">
        <Link
          href={exitHref}
          className="ssk-home"
          title={`Terug naar ${exitHref === '/club' ? 'Mijn club' : 'het overzicht'} — de wedstrijd blijft gewoon live`}
        >
          <span className="brand">Krachtbal</span> · Aantekentafel
        </Link>
        <span className="ssk-toplinks">
          <button type="button" className="ssk-toplink" onClick={toggleFullscreen}>
            {isFullscreen ? '⛶ Verlaten' : '⛶ Volledig scherm'}
          </button>
          <Link href={`/veld/${matchId}`} className="ssk-toplink">Veldscherm →</Link>
        </span>
      </header>

      {(offline || pendingCount > 0) && (
        <div className="ssk-offline" role="status">
          📴 Offline — je blijft aantekenen; {pendingCount > 0 ? `${pendingCount} wijziging${pendingCount === 1 ? '' : 'en'} word${pendingCount === 1 ? 't' : 'en'} bewaard` : 'wijzigingen worden bewaard'} en automatisch gesynct zodra je weer verbinding hebt.
        </div>
      )}

      <div className="ssk-meta">
        <span className="ssk-mode">{reeks ? <>⚡ <span className="ssk-reeks">{reeks}</span></> : '⚡ Aantekenen'}</span>
        <span className={`ssk-status ${status}`}>
          {finished ? 'AFGELOPEN' : live ? `LIVE · H${half}` : 'NOG NIET GESTART'}
        </span>
      </div>

      <div className="ssk-clockrow">
        <span className="ssk-cl-logo home">
          <TeamLogo name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" size="clamp(60px, 15vw, 104px)" ringColor={state.teams.home.colors?.primary ?? null} />
        </span>
        <button
          type="button"
          className={`ssk-clock ${overtime ? 'over' : ''} ${state.match.clockRunning ? 'running' : ''} ${!finished && (!live || (!state.match.clockRunning && clock < 1)) ? 'tostart' : ''}`}
          disabled={finished}
          onClick={() => {
            if (finished) return
            if (!live) {
              act({ action: 'simplestart' })
            } else if (state.match.clockRunning) {
              // Beveiliging: een per ongeluk tikken op de lopende klok mag hem niet pauzeren.
              if (window.confirm('Klok pauzeren? De tijd stopt.')) act({ action: 'clock', running: false })
            } else {
              act({ action: 'clock', running: true })
            }
          }}
        >
          <span className="ssk-clock-time">{fmtClock(clock)}</span>
          <span className="ssk-clock-half">Helft {half} · doel {Math.round(targetSec / 60)} min</span>
          {!finished && (
            <span className="ssk-clock-action">
              {!live || (!state.match.clockRunning && clock < 1)
                ? '▶ Tik om te starten'
                : state.match.clockRunning
                  ? '⏸ Tik om te pauzeren'
                  : '▶ Tik om verder te gaan'}
            </span>
          )}
        </button>
        <span className="ssk-cl-logo away">
          <TeamLogo name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" size="clamp(60px, 15vw, 104px)" ringColor={state.teams.away.colors?.primary ?? null} />
        </span>
      </div>

      <div className="ssk-board">
        {(['home', 'away'] as SimpleSide[]).map((side) => {
          const team = state.teams[side]
          const teamColor = team.colors?.primary ?? (side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR)
          const teamInk = readableOnDark(teamColor)
          return (
            <div
              key={side}
              className={`ssk-team side-${side}`}
              style={{ ['--team-color' as string]: teamColor, ['--team-ink' as string]: teamInk }}
            >
              <div className="ssk-team-name">{team.name}</div>
              <div className="ssk-score">{state.score[side]}</div>
              {!finished && (
                <div className="ssk-goalbtns">
                  <button
                    type="button"
                    className="ssk-goal nek"
                    onClick={() => (supportersMode ? scoreAnon(side, 1) : setPending({ side, points: 1 }))}
                  >
                    +1 <small>nekworp</small>
                  </button>
                  <button
                    type="button"
                    className="ssk-goal rug"
                    onClick={() => (supportersMode ? scoreAnon(side, 2) : setPending({ side, points: 2 }))}
                  >
                    +2 <small>rugworp</small>
                  </button>
                </div>
              )}
              {/* Wissel/veldspelers enkel in de gewone modus — in supporters-modus tellen we geen
                  spelers (doel is doel). */}
              {!finished && !supportersMode && teamRosterOf(side).length > 0 && (
                <button type="button" className="ssk-wissel" onClick={() => { setSubSide(side); setSubOut(null) }}>
                  ⇄ Wissel · veld: {fieldPlayersOf(side).map((p) => (p.id === state.captain[side] ? `👑${p.shirtNumber}` : `${p.shirtNumber}`)).join(' ') || '—'}
                </button>
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
                  <span className="ssk-stat-lbl">⏱ Time-outs</span>
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

      {live && (
        <div className="ssk-controls">
          <button type="button" className="ssk-btn" onClick={() => act({ action: 'simpleundo' })}>↶ Undo doelpunt</button>
          {half === 1 && (
            <button type="button" className="ssk-btn primary" onClick={() => setConfirmHalfEnd(true)}>
              ⏭ Einde 1e helft → 2e
            </button>
          )}
          {half >= 2 && (
            <button
              type="button"
              className="ssk-btn danger"
              onClick={() => {
                if (window.confirm('Hele wedstrijd beëindigen? De eindstand wordt vastgelegd.')) act({ action: 'finish' })
              }}
            >
              ⏹ Einde wedstrijd
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

      {confirmHalfEnd && (
        <div className="ssk-modal-overlay" onClick={() => setConfirmHalfEnd(false)}>
          <div className="ssk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Einde 1e helft — bevestig de stand</h3>
            <div className="ssk-confirm-score">
              <span>{state.teams.home.name}</span>
              <strong>{state.score.home} – {state.score.away}</strong>
              <span>{state.teams.away.name}</span>
            </div>
            <p className="ssk-confirm-note">
              De scheidsrechter bevestigt deze stand. Daarna kan de score van de 1e helft niet meer
              aangepast worden.
            </p>
            <div className="ssk-modal-btns">
              <button type="button" className="ssk-btn" onClick={() => setConfirmHalfEnd(false)}>Annuleren</button>
              <button
                type="button"
                className="ssk-btn primary"
                onClick={() => {
                  setConfirmHalfEnd(false)
                  void act({ action: 'simplehalf' })
                }}
              >
                ✓ Bevestigen & naar 2e helft
              </button>
            </div>
          </div>
        </div>
      )}

      {pending && (() => {
        const team = state.teams[pending.side]
        const teamPlayers = fieldPlayersOf(pending.side)
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
                <>
                  <p className="ssk-dim">
                    Nog geen spelers ingevuld voor deze ploeg. Je kan het doelpunt tóch noteren en de
                    spelers later aanvullen in de opstelling.
                  </p>
                  <button
                    type="button"
                    className="ssk-goal"
                    onClick={() => {
                      const { side, points } = pending
                      setPending(null)
                      void act(
                        { action: 'simplegoal', side, points },
                        (s) => ({ ...s, score: { ...s.score, [side]: s.score[side] + points } }),
                      )
                    }}
                  >
                    ✓ Noteer +{pending.points} {pending.points === 2 ? 'rugworp' : 'nekworp'} <small>zonder speler</small>
                  </button>
                </>
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
                        void act(
                          { action: 'simplegoal', side, points, playerId: p.id, shirtNumber: p.shirtNumber, playerName: p.name },
                          // Optimistisch: de score loopt meteen verder, ook zonder internet.
                          (s) => ({ ...s, score: { ...s.score, [side]: s.score[side] + points } }),
                        )
                      }}
                    >
                      <span className="ssk-pick-num">{p.shirtNumber}</span>
                      <span className="ssk-pick-naam">{firstName(p.name)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="ssk-modal-btns">
                <button type="button" className="ssk-btn" onClick={() => { const s = pending.side; setPending(null); setSubSide(s); setSubOut(null) }}>⇄ Wissel</button>
                <button type="button" className="ssk-btn" onClick={() => setPending(null)}>Annuleren</button>
              </div>
            </div>
          </div>
        )
      })()}

      {subSide && (() => {
        const side = subSide
        const team = state.teams[side]
        const onField = fieldPlayersOf(side)
        const bench = teamRosterOf(side).filter((p) => !field[side].includes(p.id))
        const captainId = state.captain[side]
        // De kapitein ging eruit (of staat niet meer op het veld) → er moet een nieuwe aangeduid worden.
        const mustPickCaptain = needCaptain === side
        return (
          <div className="ssk-modal-overlay" onClick={() => { if (!mustPickCaptain) { setSubSide(null); setSubOut(null) } }}>
            <div className="ssk-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{mustPickCaptain ? 'Nieuwe kapitein' : 'Wissel'} <span className="ssk-modal-pts">{team.name}</span></h3>
              {mustPickCaptain ? (
                <>
                  <p className="ssk-sub-hint">👑 De kapitein ging eruit — tik wie nu kapitein is.</p>
                  <div className="ssk-sub-sec">
                    <div className="ssk-pick-grid">
                      {onField.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          className="ssk-pick-player"
                          onClick={() => { void act({ action: 'setcaptain', side, playerId: p.id }); setNeedCaptain(null) }}
                        >
                          <span className="ssk-pick-num">{p.shirtNumber}</span>
                          <span className="ssk-pick-naam">{firstName(p.name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="ssk-sub-hint">{subOut == null ? 'Tik wie eruit gaat …' : 'Tik wie erin komt …'}</p>
                  <div className="ssk-sub-sec">
                    <span className="ssk-sub-lbl">Op het veld</span>
                    <div className="ssk-pick-grid">
                      {onField.map((p) => (
                        <button type="button" key={p.id} className={`ssk-pick-player ${subOut === p.id ? 'sel' : ''}`} onClick={() => setSubOut(subOut === p.id ? null : p.id)}>
                          {p.id === captainId && <span className="ssk-cap-badge" aria-hidden>👑</span>}
                          <span className="ssk-pick-num">{p.shirtNumber}</span>
                          <span className="ssk-pick-naam">{firstName(p.name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ssk-sub-sec">
                    <span className="ssk-sub-lbl">Bank</span>
                    {bench.length === 0 ? (
                      <p className="ssk-dim">Geen wisselspelers.</p>
                    ) : (
                      <div className="ssk-pick-grid">
                        {bench.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            className="ssk-pick-player bench"
                            disabled={subOut == null && field[side].length >= 4}
                            onClick={() => {
                              const wasCaptain = subOut != null && subOut === captainId
                              setField((f) => {
                                const cur = f[side]
                                const next = subOut != null ? cur.map((id) => (id === subOut ? p.id : id)) : cur.length < 4 ? [...cur, p.id] : cur
                                return { ...f, [side]: next }
                              })
                              setSubOut(null)
                              // Ging de kapitein eruit, dan moet er meteen een nieuwe aangeduid worden.
                              if (wasCaptain) setNeedCaptain(side)
                            }}
                          >
                            <span className="ssk-pick-num">{p.shirtNumber}</span>
                            <span className="ssk-pick-naam">{firstName(p.name)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ssk-modal-btns">
                    <button type="button" className="ssk-btn primary" onClick={() => { setSubSide(null); setSubOut(null) }}>Klaar</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
