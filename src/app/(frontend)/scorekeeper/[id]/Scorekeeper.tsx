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
const OUT_COLOR = '#ef476f'

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
  // Per-worp keuzes worden in het keuzescherm gezet (na het tikken op het veld).
  const [throwType, setThrowType] = useState<'nek' | 'rug'>('nek')
  const [tapMode, setTapMode] = useState<'ground' | 'caught'>('ground')
  const [recentTaps, setRecentTaps] = useState<FieldMarker[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ title: string; big: string; color: string; team: string } | null>(null)
  // Nieuwe flow: eerst de bal-valt-plek (pendingThrow), dan kiezen wie wierp.
  const [pendingThrow, setPendingThrow] = useState<{ p: Point } | null>(null)
  const [pendingOut, setPendingOut] = useState<{ p: Point; tapCount: 1 | 2; playerId: number } | null>(null)
  const [subOpen, setSubOpen] = useState(false)
  const [subOut, setSubOut] = useState<{ side: 'home' | 'away'; playerId: number } | null>(null)

  const [clock, setClock] = useState(initialState.match.clockSeconds)
  const baseRef = useRef({ seconds: initialState.match.clockSeconds, running: initialState.match.clockRunning, at: Date.now() })

  // Volledig scherm (handig op tablet/laptop bij het veld).
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

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
  // Enkel de spelers op het veld (de actieve opstelling) zijn selecteerbaar.
  const homePlayers = roster.filter((p) => p.teamId === state.teams.home.id && state.lineup.home.includes(p.id))
  const awayPlayers = roster.filter((p) => p.teamId === state.teams.away.id && state.lineup.away.includes(p.id))
  // Spelers van de ploeg-aan-zet voor het keuzescherm.
  const pickPlayers = possSide === 'home' ? homePlayers : possSide === 'away' ? awayPlayers : []

  // Registreer de worp (na ev. aanraking-vraag) en geef visuele feedback.
  const submitThrow = useCallback(
    async (p: Point, tapCount: 1 | 2, touchedBeforeOut: boolean, playerId: number) => {
      if (!poss) return
      const scoringSide = poss.side
      const color = scoringSide === 'home' ? HOME_COLOR : AWAY_COLOR
      const teamName = scoringSide === 'home' ? state.teams.home.name : state.teams.away.name
      const wasFreeThrow = poss.freeThrow

      setRecentTaps((prev) => [
        ...prev.slice(-6),
        {
          x: Math.max(0, Math.min(1, p.x)),
          y: Math.max(0, Math.min(1, p.y)),
          color,
          r: 7,
          label: wasFreeThrow ? 'V' : String(poss.nextThrowNumber),
        },
      ])

      const result = (await act({
        action: 'throw',
        playerId,
        type: throwType,
        x: p.x,
        y: p.y,
        tapCount,
        touchedBeforeOut,
        gameClock: Math.floor(clock),
      })) as { outcome?: string; type?: string; points?: number; isCross?: boolean; state?: MatchState } | null

      let f: { title: string; big: string; color: string; team: string } | null = null
      if (result?.outcome === 'goal') {
        f = { title: result.type === 'rug' ? 'RUGWORP' : 'DOELPUNT', big: `+${result.points ?? 1}`, color, team: teamName }
      } else if (result?.isCross) {
        f = { title: 'KRUISJE', big: '✕', color: OUT_COLOR, team: teamName }
      } else if (result?.outcome === 'out_side' || result?.outcome === 'out_back') {
        f = { title: 'BAL BUITEN', big: '↗', color: OUT_COLOR, team: teamName }
      }
      if (f) {
        setFlash(f)
        window.setTimeout(() => setFlash(null), 1600)
      }

      // Aanval afgewerkt (balbezit gewisseld) → veld leegmaken voor de volgende ploeg.
      if (result?.state?.possession && result.state.possession.nextThrowNumber === 1) {
        setRecentTaps([])
      }

      // Klaar voor de volgende worp.
      setTapMode('ground')
      setThrowType('nek')
    },
    [poss, throwType, clock, act, state.teams],
  )

  // Stap 1: tik op het veld waar de bal valt → open het keuzescherm.
  const onTap = useCallback(
    (p: Point) => {
      if (state.match.status !== 'live' || !poss) {
        setError('Wedstrijd is niet live of geen lopend balbezit.')
        return
      }
      setThrowType('nek')
      setTapMode('ground')
      setPendingThrow({ p })
    },
    [state.match.status, poss],
  )

  // Stap 2: kies wie wierp → bereken de uitkomst en registreer (of vraag eerst naar aanraking).
  const choosePlayer = useCallback(
    (playerId: number) => {
      if (!pendingThrow || !poss) return
      const p = pendingThrow.p
      const dir = poss.dir as AttackDir
      const tapCount: 1 | 2 = tapMode === 'caught' ? 2 : 1
      const outcome = deriveOutcome({ tapCount, point: p, dir, goalAreaDepthM: state.match.goalAreaDepth })
      const isDoelworp = poss.nextThrowNumber >= poss.throwsAllowed || poss.freeThrow

      // Bij buiten op de doelworp/vrijworp bepaalt aanraking of het een kruisje is → nette modal.
      if ((outcome === 'out_back' || outcome === 'out_side') && isDoelworp) {
        setPendingOut({ p, tapCount, playerId })
        setPendingThrow(null)
        return
      }
      void submitThrow(p, tapCount, false, playerId)
      setPendingThrow(null)
    },
    [pendingThrow, poss, tapMode, state.match.goalAreaDepth, submitThrow],
  )

  const toggleClock = () =>
    act({ action: 'clock', running: !state.match.clockRunning, seconds: Math.floor(clock) })

  const isScheduled = state.match.status === 'scheduled'
  const isLive = state.match.status === 'live'

  // De naam staat aan de EIGEN kant (het doel dat je verdedigt); je scoort aan de overkant.
  // home valt in helft 1 'up' (naar y=1 = onder) aan → verdedigt dus bovenaan.
  const homeDirUp = attackDirForSide('home', state.match.currentHalf) === 'up'
  const fieldEnds = {
    top: homeDirUp
      ? { text: state.teams.home.name, color: HOME_COLOR }
      : { text: state.teams.away.name, color: AWAY_COLOR },
    bottom: homeDirUp
      ? { text: state.teams.away.name, color: AWAY_COLOR }
      : { text: state.teams.home.name, color: HOME_COLOR },
  }

  // Pijl die de speelrichting op het scherm toont: dir 'up' = naar onder (▼), 'down' = naar boven (▲).
  const homeArrow = homeDirUp ? '▼' : '▲'
  const awayArrow = homeDirUp ? '▲' : '▼'

  // Tijdelijke '?'-markering op de gekozen plek terwijl het keuzescherm openstaat.
  const fieldMarkers: FieldMarker[] = pendingThrow
    ? [
        ...recentTaps,
        {
          x: Math.max(0, Math.min(1, pendingThrow.p.x)),
          y: Math.max(0, Math.min(1, pendingThrow.p.y)),
          color: '#ffffff',
          r: 8,
          label: '?',
        },
      ]
    : recentTaps

  const PlayerColumn = ({ side, players, arrow }: { side: 'home' | 'away'; players: RosterPlayer[]; arrow: string }) => {
    const active = possSide === side
    const teamId = side === 'home' ? state.teams.home.id : state.teams.away.id
    return (
      <div className={`sk-col sk-col-${side} ${active ? 'active' : 'dim'}`}>
        <div className="sk-col-head">
          <div className="sk-col-actions">
            <button type="button" className="sk-col-mini" disabled={busy || !isLive} title="Vrijworp" onClick={() => act({ action: 'freethrow', teamId })}>VW</button>
            <button type="button" className="sk-col-mini" disabled={busy} title="Wissel" onClick={() => { setSubOut(null); setSubOpen(true) }}>⇄</button>
          </div>
          <span className="sk-col-dir" aria-label="speelrichting">{arrow}</span>
          {active && poss && (
            <span className="sk-col-worp">{poss.freeThrow ? 'VW' : `${poss.nextThrowNumber}/${poss.throwsAllowed}`}</span>
          )}
        </div>
        {players.map((p) => {
          const justThrew = active && poss?.lastPlayerId === p.id
          // Numbers tonen de opstelling; de selectie gebeurt in het keuzescherm na het tikken.
          return (
            <div
              key={p.id}
              className="sk-num display"
              style={{ opacity: justThrew ? 0.45 : 1 }}
              title={p.name}
            >
              {p.shirtNumber}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="sk">
      {flash && (
        <div className="sk-goal-flash" style={{ ['--flash' as string]: flash.color }}>
          <div className="sk-goal-big">{flash.title}</div>
          <div className="sk-goal-pts">{flash.big}</div>
          <div className="sk-goal-team">{flash.team}</div>
        </div>
      )}

      {/* Stap 2: keuzescherm — wie wierp + nek/rug + grond/gevangen, alles op één scherm. */}
      {pendingThrow && (
        <div className="sk-modal-overlay">
          <div className="sk-modal sk-pick">
            <h3>Wie wierp?</h3>
            <p>
              {possSide === 'home' ? state.teams.home.name : state.teams.away.name}
              {poss && ` · ${poss.freeThrow ? 'vrijworp' : `worp ${poss.nextThrowNumber}/${poss.throwsAllowed}`}`}
            </p>
            <div className="sk-pills sk-pick-pills">
              <button type="button" className={`pill ${throwType === 'nek' ? 'on' : ''}`} onClick={() => setThrowType('nek')}>Nek +1</button>
              <button type="button" className={`pill ${throwType === 'rug' ? 'on' : ''}`} onClick={() => setThrowType('rug')}>Rug +2</button>
              <button type="button" className={`pill ${tapMode === 'ground' ? 'on' : ''}`} onClick={() => setTapMode('ground')}>Grond</button>
              <button type="button" className={`pill ${tapMode === 'caught' ? 'on' : ''}`} onClick={() => setTapMode('caught')}>Gevangen</button>
            </div>
            <div className="sk-pick-grid">
              {pickPlayers.length === 0 && <span className="sk-dim">Geen spelers op het veld.</span>}
              {pickPlayers.map((p) => {
                const justThrew = poss?.lastPlayerId === p.id
                return (
                  <button
                    type="button"
                    key={p.id}
                    className="sk-num"
                    disabled={justThrew}
                    onClick={() => choosePlayer(p.id)}
                    title={justThrew ? `${p.name} — net geworpen, niet 2× na elkaar` : p.name}
                  >
                    {p.shirtNumber}
                  </button>
                )
              })}
            </div>
            <div className="sk-modal-btns">
              <button type="button" className="sk-btn" onClick={() => setPendingThrow(null)}>Annuleren</button>
            </div>
          </div>
        </div>
      )}

      {pendingOut && (
        <div className="sk-modal-overlay">
          <div className="sk-modal">
            <h3>Bal buiten</h3>
            <p>Werd de bal aangeraakt vóór hij buiten ging?</p>
            <div className="sk-modal-btns">
              <button
                type="button"
                className="sk-btn"
                onClick={() => {
                  const { p, tapCount, playerId } = pendingOut
                  setPendingOut(null)
                  void submitThrow(p, tapCount, true, playerId)
                }}
              >
                Ja — aangeraakt <span className="sk-modal-hint">(geen kruisje)</span>
              </button>
              <button
                type="button"
                className="sk-btn primary"
                onClick={() => {
                  const { p, tapCount, playerId } = pendingOut
                  setPendingOut(null)
                  void submitThrow(p, tapCount, false, playerId)
                }}
              >
                Nee — rechtstreeks <span className="sk-modal-hint">(kruisje)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {subOpen && (
        <div className="sk-modal-overlay">
          <div className="sk-modal sk-sub">
            <h3>Wissel</h3>
            <p>Tik een speler op het veld, dan een speler op de bank om te wisselen.</p>
            {(['home', 'away'] as const).map((sideKey) => {
              const teamId = sideKey === 'home' ? state.teams.home.id : state.teams.away.id
              const teamName = sideKey === 'home' ? state.teams.home.name : state.teams.away.name
              const field = roster.filter((p) => p.teamId === teamId && state.lineup[sideKey].includes(p.id))
              const bench = roster.filter((p) => p.teamId === teamId && !state.lineup[sideKey].includes(p.id))
              return (
                <div key={sideKey} className={`sk-sub-team side-${sideKey}`}>
                  <div className="sk-sub-name">{teamName}</div>
                  <div className="sk-sub-row">
                    <span className="sk-sub-lbl">veld</span>
                    {field.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className={`sk-num ${subOut?.side === sideKey && subOut.playerId === p.id ? 'on' : ''}`}
                        onClick={() => setSubOut({ side: sideKey, playerId: p.id })}
                        title={p.name}
                      >
                        {p.shirtNumber}
                      </button>
                    ))}
                  </div>
                  <div className="sk-sub-row">
                    <span className="sk-sub-lbl">bank</span>
                    {bench.length === 0 && <span className="sk-dim">geen wissels</span>}
                    {bench.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="sk-num bench"
                        disabled={subOut?.side !== sideKey}
                        onClick={() => {
                          act({ action: 'substitute', side: sideKey, outPlayerId: subOut!.playerId, inPlayerId: p.id })
                          setSubOut(null)
                        }}
                        title={p.name}
                      >
                        {p.shirtNumber}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="sk-modal-btns">
              <button type="button" className="sk-btn primary" onClick={() => { setSubOpen(false); setSubOut(null) }}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      <div className="sk-topbar">
        <a className="sk-back" href="/scorekeeper" title="Terug naar overzicht — de wedstrijd blijft gewoon live">← Overzicht</a>
        <button type="button" className="sk-fs" onClick={toggleFullscreen} title="Volledig scherm aan/uit">
          {isFullscreen ? '⤡ Sluiten' : '⛶ Volledig scherm'}
        </button>
      </div>

      <header className="sk-head">
        <div className="sk-scorebar">
          <button type="button" className="sk-to home" disabled={busy || !isLive || state.timeouts.home >= 2} onClick={() => act({ action: 'timeout', teamId: state.teams.home.id })} title="Time-out thuis">
            {'●'.repeat(state.timeouts.home)}{'○'.repeat(Math.max(0, 2 - state.timeouts.home))}
          </button>
          <span className="sk-sc home">{state.score.home}</span>
          <button type="button" className={`sk-clock ${state.match.clockRunning ? 'running' : ''}`} disabled={busy || !isLive} onClick={toggleClock} title="Tik om te starten/pauzeren">
            <span className="sk-half-chip">H{state.match.currentHalf}</span>
            {fmtClock(clock)}
            <span className="sk-clock-ico">{state.match.clockRunning ? '⏸' : '▶'}</span>
          </button>
          <span className="sk-sc away">{state.score.away}</span>
          <button type="button" className="sk-to away" disabled={busy || !isLive || state.timeouts.away >= 2} onClick={() => act({ action: 'timeout', teamId: state.teams.away.id })} title="Time-out uit">
            {'●'.repeat(state.timeouts.away)}{'○'.repeat(Math.max(0, 2 - state.timeouts.away))}
          </button>
        </div>
        <div className="sk-names">
          <span className="sk-tn home">{state.teams.home.name}</span>
          <span className="sk-kr" title="Kruisjes">✚ {state.crosses.home}–{state.crosses.away}</span>
          <span className="sk-tn away">{state.teams.away.name}</span>
        </div>
      </header>

      {error && <div className="sk-error" onClick={() => setError(null)}>{error}</div>}

      {!isScheduled && (
        <div className="sk-toolbar">
          <button type="button" className="tb warn" disabled={busy} onClick={() => act({ action: 'undo' })}>↶ Undo</button>
          {isLive && state.match.currentHalf < 2 && (
            <button type="button" className="tb" disabled={busy} onClick={() => act({ action: 'half' })}>⏭ 2e helft</button>
          )}
          {isLive && (
            <button type="button" className="tb danger" disabled={busy} onClick={() => { if (window.confirm('Wedstrijd beëindigen?')) act({ action: 'finish' }) }}>🏁 Einde</button>
          )}
        </div>
      )}

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
          <div className="sk-hint">Tik op het veld waar de bal valt → kies wie wierp.</div>
          <div className="sk-arena">
            <PlayerColumn side="home" players={homePlayers} arrow={homeArrow} />
            <div className="sk-field-wrap">
              <FieldSchema
                className="sk-field"
                onTap={onTap}
                markers={fieldMarkers}
                ends={fieldEnds}
                goalAreaDepthM={state.match.goalAreaDepth}
                glowGoal={
                  poss?.freeThrow
                    ? { end: poss.dir === 'up' ? 'bottom' : 'top', color: possSide === 'home' ? HOME_COLOR : AWAY_COLOR }
                    : undefined
                }
              />
            </div>
            <PlayerColumn side="away" players={awayPlayers} arrow={awayArrow} />
          </div>
        </>
      )}
    </div>
  )
}
