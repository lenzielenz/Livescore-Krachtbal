'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { ClubColors } from '@/lib/club-colors'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import { EINDE_HELFT_KNOP, inRust, magHelftAfsluiten, type HelftStand } from '@/lib/helft-overgang'
import type { LogoFit } from '@/lib/logo-fit'
import type { Side } from '@/lib/tournament'
import type { TMatchState, TournamentState } from '@/lib/tournament-engine'
import { useLiveStream } from '@/lib/use-live-stream'
import { fmtClock, useTicking } from '../../../useTournament'
import '@/app/(frontend)/scorekeeper/[id]/simple-scorekeeper.css'

export interface TeamInfo {
  id: number
  name: string
  logoUrl: string | null
  logoFit: LogoFit | null
  colors: ClubColors | null
}
interface RosterPlayer {
  id: number
  name: string
  shirtNumber: number
  side: Side
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

function findMatch(state: TournamentState, matchId: number): TMatchState | null {
  for (const r of state.rounds) {
    const hit = r.matches.find((m) => m.id === matchId)
    if (hit) return hit
  }
  return state.thirdPlace?.id === matchId ? state.thirdPlace : null
}

// Tornooi-aantekentafel met de échte spelerslijst: exact hetzelfde aantekenblad als bij een gewone
// wedstrijd (logo's, grote tik-klok, "wie scoorde", wissels, kruisjes, time-outs, SR-minuut).
export function TournamentScoresheetPro({
  id,
  matchId,
  initial,
  halfDurationSeconds,
  home,
  away,
  roster,
}: {
  id: number
  matchId: number
  initial: TournamentState
  halfDurationSeconds: number
  home: TeamInfo
  away: TeamInfo
  roster: RosterPlayer[]
}) {
  const [state, setState] = useState<TournamentState>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ side: Side; points: 1 | 2 } | null>(null)
  const [askWinner, setAskWinner] = useState(false)
  const [confirmHalfEnd, setConfirmHalfEnd] = useState(false)
  // Eén bevestigingsstap voor alles wat je niet per ongeluk wil doen: starten, beëindigen,
  // heropenen en terugzetten naar niet-gestart.
  const [bevestig, setBevestig] = useState<
    | null
    | { titel: string; tekst: string; knop: string; gevaar?: boolean; doe: () => void | Promise<unknown> }
  >(null)
  const busy = useRef(false)

  const teamInfo = (side: Side): TeamInfo => (side === 'home' ? home : away)
  const teamRosterOf = (side: Side) => roster.filter((p) => p.side === side).sort((a, b) => a.shirtNumber - b.shirtNumber)
  const initField = (side: Side): number[] => teamRosterOf(side).slice(0, 4).map((p) => p.id)
  const [field, setField] = useState<{ home: number[]; away: number[] }>(() => ({ home: initField('home'), away: initField('away') }))
  const [captain, setCaptain] = useState<{ home: number | null; away: number | null }>({ home: null, away: null })
  const fieldPlayersOf = (side: Side) => {
    const tr = teamRosterOf(side)
    return field[side].map((pid) => tr.find((p) => p.id === pid)).filter((p): p is RosterPlayer => !!p)
  }
  const [subSide, setSubSide] = useState<Side | null>(null)
  const [subOut, setSubOut] = useState<number | null>(null)

  useLiveStream<TournamentState>(`/api/tournament/${id}/stream`, (data) => {
    if (busy.current) return
    setState(data)
  })

  const m = findMatch(state, matchId)
  const clock = useTicking(m?.clockSeconds ?? 0, m?.clockRunning ?? false)

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy.current) return false
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

  // Volledig scherm (handig op een tablet bij het veld).
  const rootRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen().catch(() => {})
    setIsFullscreen((v) => !v)
  }

  if (!m) return <p className="trn-error">Wedstrijd niet gevonden.</p>

  const half = m.currentHalf
  const status = m.status
  const finished = status === 'finished'
  const live = status === 'live'
  // Dezelfde bron als de tornooitafel en het oefenscherm (lib/helft-overgang.ts).
  const helftStand: HelftStand = {
    status,
    helft: half,
    klokLoopt: Boolean(m.clockRunning),
    klokSeconden: m.clockSeconds ?? 0,
  }
  const rust = inRust(helftStand)
  const ready = Boolean(m.home && m.away)
  const overtime = live && clock >= halfDurationSeconds

  const homeC = home.colors?.primary ?? DEFAULT_HOME_COLOR
  const awayC = away.colors?.primary ?? DEFAULT_AWAY_COLOR

  return (
    <div className="ssk" ref={rootRef} style={{ ['--home-c' as string]: homeC, ['--away-c' as string]: awayC }}>
      <header className="ssk-top">
        <Link href={`/tornooi/${id}`} className="ssk-home">
          <span className="brand">Krachtbal</span> · Aantekentafel
        </Link>
        <span className="ssk-toplinks">
          <button type="button" className="ssk-toplink" onClick={toggleFullscreen}>
            {isFullscreen ? '⛶ Verlaten' : '⛶ Volledig scherm'}
          </button>
          <Link href={`/tornooi/${id}/veld/${matchId}`} className="ssk-toplink">Veldscherm →</Link>
        </span>
      </header>

      <div className="ssk-meta">
        <span className="ssk-mode">🏆 <span className="ssk-reeks">{m.label}</span></span>
        <span className={`ssk-status ${status}`}>
          {finished ? 'AFGELOPEN' : live ? `LIVE · H${half}` : 'NOG NIET GESTART'}
        </span>
      </div>

      {!ready ? (
        <p className="trn-empty">Wacht tot beide ploegen gekend zijn (winnaars van de vorige ronde).</p>
      ) : (
        <>
          <div className="ssk-clockrow">
            <span className="ssk-cl-logo home">
              <TeamLogo name={home.name} logoUrl={home.logoUrl} logoFit={home.logoFit} side="home" size="clamp(60px, 15vw, 104px)" ringColor={home.colors?.primary ?? null} />
            </span>
            <button
              type="button"
              className={`ssk-clock ${overtime ? 'over' : ''} ${m.clockRunning ? 'running' : ''} ${!finished && (!live || (!m.clockRunning && clock < 1)) ? 'tostart' : ''}`}
              disabled={finished}
              onClick={() => {
                if (finished) return
                if (!live) {
                  // Extra drempel: één tik startte vroeger meteen de wedstrijd — ook wanneer die
                  // reeks nog moest beginnen. Nu bevestig je eerst dat er echt gespeeld wordt.
                  setBevestig({
                    titel: 'Wedstrijd nu starten?',
                    tekst: `${m.home} – ${m.away} gaat live en de klok begint te lopen. Start dit pas wanneer er echt gespeeld wordt.`,
                    knop: '▶ Ja, starten',
                    doe: () => act({ action: 'start' }),
                  })
                } else if (!m.clockRunning) {
                  // Geen pauze meer: aan een tornooitafel wordt de klok niet stilgezet, en een
                  // hele klok die als pauzeknop werkt is te makkelijk per ongeluk aan te tikken.
                  // Een stilstaande klok (rust) weer op gang trekken kan wél.
                  act({ action: 'clock', running: true })
                }
              }}
            >
              <span className="ssk-clock-time">{fmtClock(clock)}</span>
              <span className="ssk-clock-half">
                Helft {half} · doel {Math.round(halfDurationSeconds / 60)} min
                {/* In de rust staat de klok op nul en stil. Zonder dit woord is dat niet van een
                    vastgelopen tafel te onderscheiden. */}
                {rust && <> · <b>rust</b></>}
              </span>
              {!finished && (
                <span className="ssk-clock-action">
                  {rust
                    ? `▶ Tik om de ${half}e helft te starten`
                    : !live || (!m.clockRunning && clock < 1)
                      ? '▶ Tik om te starten'
                      : m.clockRunning
                        ? 'de klok loopt'
                        : '▶ Tik om verder te gaan'}
                </span>
              )}
            </button>
            <span className="ssk-cl-logo away">
              <TeamLogo name={away.name} logoUrl={away.logoUrl} logoFit={away.logoFit} side="away" size="clamp(60px, 15vw, 104px)" ringColor={away.colors?.primary ?? null} />
            </span>
          </div>

          {/* Klok vergeten te starten of te laat getikt? Per minuut bijstellen (zelfde knoppen als
              bij de competitie); lopen of stilstaan blijft zoals het was. */}
          {live && !finished && (
            <div className="ssk-clockadj" role="group" aria-label="Klok per minuut bijstellen">
              <button type="button" className="ssk-clockadj-btn" disabled={clock < 1} onClick={() => act({ action: 'clock', seconds: Math.max(0, Math.floor(clock) - 60) })} aria-label="Eén minuut van de klok af">
                − 1 min
              </button>
              <span className="ssk-clockadj-lbl">klok bijstellen</span>
              <button type="button" className="ssk-clockadj-btn" onClick={() => act({ action: 'clock', seconds: Math.floor(clock) + 60 })} aria-label="Eén minuut bij de klok">
                + 1 min
              </button>
            </div>
          )}

          <div className="ssk-board">
            {(['home', 'away'] as Side[]).map((side) => {
              const info = teamInfo(side)
              const teamColor = info.colors?.primary ?? (side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR)
              const teamInk = readableOnDark(teamColor)
              return (
                <div
                  key={side}
                  className={`ssk-team side-${side}`}
                  style={{ ['--team-color' as string]: teamColor, ['--team-ink' as string]: teamInk }}
                >
                  <div className="ssk-team-name">{info.name}</div>
                  <div className="ssk-score">{m.score[side]}</div>
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
                  {!finished && teamRosterOf(side).length > 0 && (
                    <button type="button" className="ssk-wissel" onClick={() => { setSubSide(side); setSubOut(null) }}>
                      ⇄ Wissel · veld: {fieldPlayersOf(side).map((p) => (p.id === captain[side] ? `👑${p.shirtNumber}` : `${p.shirtNumber}`)).join(' ') || '—'}
                    </button>
                  )}
                  <div className="ssk-stats">
                    <div className="ssk-stat">
                      <span className="ssk-stat-lbl">✖ Kruisjes</span>
                      <span className="ssk-stat-ctrl">
                        {!finished && <button type="button" className="ssk-stat-btn" disabled={m.crosses[side] <= 0} onClick={() => act({ action: 'cross', side, delta: -1 })} aria-label="Kruisje min">−</button>}
                        <span className="ssk-stat-n">{m.crosses[side]}</span>
                        {!finished && <button type="button" className="ssk-stat-btn" onClick={() => act({ action: 'cross', side, delta: 1 })} aria-label="Kruisje plus">+</button>}
                      </span>
                    </div>
                    <div className="ssk-stat">
                      <span className="ssk-stat-lbl">⏱ Time-outs</span>
                      <span className="ssk-stat-ctrl">
                        {!finished && <button type="button" className="ssk-stat-btn" disabled={m.timeouts[side] <= 0} onClick={() => act({ action: 'timeout', side, delta: -1 })} aria-label="Time-out min">−</button>}
                        <span className="ssk-stat-n">{m.timeouts[side]}</span>
                        {!finished && <button type="button" className="ssk-stat-btn" disabled={m.timeouts[side] >= 2} onClick={() => act({ action: 'timeout', side, delta: 1 })} aria-label="Time-out plus">+</button>}
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
                <button type="button" className="ssk-stat-btn" disabled={m.refereeStops <= 0} onClick={() => act({ action: 'refstop', delta: -1 })} aria-label="SR-minuut min">−</button>
                <span className="ssk-stat-n">{m.refereeStops}</span>
                <button type="button" className="ssk-stat-btn" onClick={() => act({ action: 'refstop', delta: 1 })} aria-label="SR-minuut plus">+</button>
              </span>
            </div>
          )}

          {live && (
            <div className="ssk-controls">
              {/* De undo zegt wát ze wegneemt — geen blinde gok of je de juiste tik terugdraait. */}
              <button type="button" className="ssk-btn" disabled={!m.lastGoal} onClick={() => act({ action: 'undo' })}>
                {m.lastGoal
                  ? `↶ Ondoen: +${m.lastGoal.points} ${m.lastGoal.side === 'home' ? m.home : m.away}`
                  : '↶ Niets te ondoen'}
              </button>
              {magHelftAfsluiten(helftStand) && (
                <button type="button" className="ssk-btn primary" onClick={() => setConfirmHalfEnd(true)}>
                  {EINDE_HELFT_KNOP}
                </button>
              )}
              {half >= 2 && live && (
                <button
                  type="button"
                  className="ssk-btn danger"
                  onClick={() =>
                    setBevestig({
                      titel: 'Hele wedstrijd beëindigen?',
                      tekst:
                        'De eindstand wordt vastgelegd en de winnaar schuift door in het schema. Ging het per ongeluk, dan kan je nadien nog heropenen zolang de volgende ronde niet bezig is.',
                      knop: '⏹ Ja, de wedstrijd is gedaan',
                      gevaar: true,
                      doe: () => act({ action: 'finish' }),
                    })
                  }
                >
                  ⏹ Einde wedstrijd
                </button>
              )}
              {/* Te vroeg gestart terwijl deze reeks nog moest beginnen? Terug naar niet-gestart. */}
              {live && (
              <button
                type="button"
                className="ssk-btn zacht"
                onClick={() =>
                  setBevestig({
                    titel: 'Terugzetten naar niet-gestart?',
                    tekst:
                      'Gebruik dit als deze wedstrijd per ongeluk gestart is. De ingevoerde doelpunten, kruisjes en de klok verdwijnen; de affiche en het uur blijven staan, zodat ze later gewoon gespeeld kan worden. Dit kan niet ongedaan gemaakt worden.',
                    knop: '↺ Ja, terugzetten',
                    gevaar: true,
                    doe: () => act({ action: 'reset' }),
                  })
                }
              >
                ↺ Wedstrijd was nog niet bezig
              </button>
              )}
            </div>
          )}

          {askWinner && (
            <div className="ssk-modal-overlay">
              <div className="ssk-modal">
                <h3>Gelijkspel — wie gaat door?</h3>
                <div className="ssk-modal-btns">
                  <button type="button" className="ssk-btn primary" onClick={() => act({ action: 'finish', winner: 'home' })}>{m.home}</button>
                  <button type="button" className="ssk-btn primary" onClick={() => act({ action: 'finish', winner: 'away' })}>{m.away}</button>
                </div>
              </div>
            </div>
          )}

          {finished && (
            <div className="ssk-done">
              ✅ Afgelopen — eindstand <strong>{m.score.home} – {m.score.away}</strong>
              {m.winner && <> · winnaar <strong>{m.winner === 'home' ? m.home : m.away}</strong></>}
              <div className="ssk-after">
                <Link href={`/tornooi/${id}`} className="ssk-btn">Terug naar schema</Link>
                {/* Score toch fout genoteerd? Heropen kan zolang de volgende ronde niet bezig is
                    (de server bewaakt dat en trekt de doorgeschoven winnaar terug). */}
                <button
                  type="button"
                  className="ssk-btn"
                  onClick={() =>
                    setBevestig({
                      titel: 'Wedstrijd heropenen?',
                      tekst:
                        'De wedstrijd gaat terug live zodat je de score kan aanpassen of verder aantekenen. De doorgeschoven winnaar wordt uit de volgende ronde teruggetrokken — dat lukt enkel zolang daar nog niet gespeeld is.',
                      knop: '🔓 Ja, heropenen',
                      doe: () => act({ action: 'reopen' }),
                    })
                  }
                >
                  🔓 Score aanpassen
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="ssk-error">{error}</p>}

      {bevestig && (
        <div className="ssk-modal-overlay" onClick={() => setBevestig(null)}>
          <div className="ssk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{bevestig.titel}</h3>
            <p className="ssk-confirm-note">{bevestig.tekst}</p>
            <div className="ssk-modal-btns">
              <button type="button" className="ssk-btn" onClick={() => setBevestig(null)}>Nee, terug</button>
              <button
                type="button"
                className={`ssk-btn ${bevestig.gevaar ? 'danger' : 'primary'}`}
                onClick={() => {
                  const doe = bevestig.doe
                  setBevestig(null)
                  void doe()
                }}
              >
                {bevestig.knop}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmHalfEnd && (
        <div className="ssk-modal-overlay" onClick={() => setConfirmHalfEnd(false)}>
          <div className="ssk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Einde 1e helft — bevestig de stand</h3>
            <div className="ssk-confirm-score">
              <span>{home.name}</span>
              <strong>{m.score.home} – {m.score.away}</strong>
              <span>{away.name}</span>
            </div>
            <p className="ssk-confirm-note">De scheidsrechter bevestigt deze stand. Daarna gaat de klok naar de 2e helft.</p>
            <div className="ssk-modal-btns">
              <button type="button" className="ssk-btn" onClick={() => setConfirmHalfEnd(false)}>Annuleren</button>
              <button type="button" className="ssk-btn primary" onClick={() => { setConfirmHalfEnd(false); void act({ action: 'half' }) }}>
                ✓ Bevestigen & naar 2e helft
              </button>
            </div>
          </div>
        </div>
      )}

      {pending && (() => {
        const info = teamInfo(pending.side)
        const teamPlayers = fieldPlayersOf(pending.side)
        return (
          <div className="ssk-modal-overlay" onClick={() => setPending(null)}>
            <div className="ssk-modal" onClick={(e) => e.stopPropagation()}>
              <h3>
                Wie scoorde? <span className="ssk-modal-pts">+{pending.points} {pending.points === 2 ? 'rugworp' : 'nekworp'}</span>
              </h3>
              <div className="ssk-modal-team">
                <TeamLogo name={info.name} logoUrl={info.logoUrl} logoFit={info.logoFit} side={pending.side} size="sm" ringColor={info.colors?.primary ?? null} />
                <span>{info.name}</span>
              </div>
              {teamPlayers.length === 0 ? (
                <p className="ssk-dim">Geen spelers bekend voor deze ploeg.</p>
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
                        void act({ action: 'goal', side, points, playerId: p.id, shirtNumber: p.shirtNumber, playerName: p.name })
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
                {/* Onbekende scorer: registreer het doelpunt zonder speler. */}
                <button type="button" className="ssk-btn" onClick={() => { const { side, points } = pending; setPending(null); void act({ action: 'goal', side, points }) }}>Onbekend</button>
                <button type="button" className="ssk-btn" onClick={() => setPending(null)}>Annuleren</button>
              </div>
            </div>
          </div>
        )
      })()}

      {subSide && (() => {
        const side = subSide
        const info = teamInfo(side)
        const onField = fieldPlayersOf(side)
        const bench = teamRosterOf(side).filter((p) => !field[side].includes(p.id))
        const captainId = captain[side]
        return (
          <div className="ssk-modal-overlay" onClick={() => { setSubSide(null); setSubOut(null) }}>
            <div className="ssk-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Wissel <span className="ssk-modal-pts">{info.name}</span></h3>
              <p className="ssk-sub-hint">{subOut == null ? 'Tik wie eruit gaat (of tik 👑 om de kapitein te zetten) …' : 'Tik wie erin komt …'}</p>
              <div className="ssk-sub-sec">
                <span className="ssk-sub-lbl">Op het veld</span>
                <div className="ssk-pick-grid">
                  {onField.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={`ssk-pick-player ${subOut === p.id ? 'sel' : ''}`}
                      onClick={() => setSubOut(subOut === p.id ? null : p.id)}
                      onDoubleClick={() => setCaptain((c) => ({ ...c, [side]: p.id }))}
                    >
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
                          setField((f) => {
                            const cur = f[side]
                            const next = subOut != null ? cur.map((pid) => (pid === subOut ? p.id : pid)) : cur.length < 4 ? [...cur, p.id] : cur
                            return { ...f, [side]: next }
                          })
                          if (subOut != null && subOut === captainId) setCaptain((c) => ({ ...c, [side]: null }))
                          setSubOut(null)
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
            </div>
          </div>
        )
      })()}
    </div>
  )
}
