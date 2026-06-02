'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { attackDirForSide, deriveOutcome } from '@/lib/krachtbal-rules'
import type { AttackDir, Point } from '@/lib/field'
import type { MatchState } from '@/lib/match-engine'
import { LINEUP_MIN, type Readiness } from '@/lib/match-readiness'
import { DemoTutorial } from './DemoTutorial'

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

// Voornaam = eerste woord van de naam (compact tonen naast het rugnummer).
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

export function Scorekeeper({
  matchId,
  initialState,
  roster,
  readiness,
  isAdmin,
}: {
  matchId: number
  initialState: MatchState
  roster: RosterPlayer[]
  readiness: Readiness
  isAdmin: boolean
}) {
  const [state, setState] = useState<MatchState>(initialState)
  const isDemo = readiness.isDemo
  // Admin/federatie kan de startcontrole bewust overslaan (testen).
  const [bypass, setBypass] = useState(false)
  const unlocked = readiness.ready || bypass
  // Per-worp keuzes worden in het keuzescherm gezet (na het tikken op het veld).
  const [throwType, setThrowType] = useState<'nek' | 'rug'>('nek')
  const [tapMode, setTapMode] = useState<'ground' | 'caught'>('ground')
  const [recentTaps, setRecentTaps] = useState<FieldMarker[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ title: string; big: string; color: string; team: string; player?: string } | null>(null)
  // Nieuwe flow: eerst de bal-valt-plek (pendingThrow), dan kiezen wie wierp.
  const [pendingThrow, setPendingThrow] = useState<{ p: Point } | null>(null)
  const [pendingOut, setPendingOut] = useState<{ p: Point; tapCount: 1 | 2; playerId: number; isDoelworp: boolean } | null>(null)
  const [subOpen, setSubOpen] = useState(false)
  const [subSide, setSubSide] = useState<'home' | 'away'>('home')
  const [subOut, setSubOut] = useState<{ side: 'home' | 'away'; playerId: number } | null>(null)
  // Kickoff: de timer is geblokkeerd tot er een ploeg gekozen is die opzet.
  // Tik op de geblokkeerde timer → dit keuzescherm opent.
  const [kickoffOpen, setKickoffOpen] = useState(false)

  // Basistijdstip voor de lopende klok: als de klok loopt, reken vanaf clockUpdatedAt (server),
  // zodat de verstreken tijd na een refresh behouden blijft — niet terug naar nul.
  const clockBaseAt = (m: MatchState['match']) =>
    m.clockRunning && m.clockUpdatedAt ? new Date(m.clockUpdatedAt).getTime() : Date.now()

  const [clock, setClock] = useState(initialState.match.clockSeconds)
  const baseRef = useRef({
    seconds: initialState.match.clockSeconds,
    running: initialState.match.clockRunning,
    at: clockBaseAt(initialState.match),
  })

  // Volledig scherm (handig op tablet/laptop bij het veld). We zetten de scorekeeper-container
  // zelf op fullscreen (niet het hele document), zodat het veld netjes in beeld blijft passen.
  const rootRef = useRef<HTMLDivElement>(null)
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
      rootRef.current?.requestFullscreen().catch(() => {})
    }
  }

  // Houd het scherm wakker zolang de wedstrijd live is (Wake Lock API), zodat de gsm niet
  // in slaap valt tijdens het aantekenen. Wordt vrijgegeven als de match niet meer live is.
  useEffect(() => {
    if (state.match.status !== 'live') return
    type SentinelLike = { release: () => Promise<void> }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<SentinelLike> } }
    if (!nav.wakeLock) return
    let sentinel: SentinelLike | null = null
    let active = true
    const request = () => {
      nav.wakeLock
        ?.request('screen')
        .then((s) => {
          if (active) sentinel = s
          else s.release().catch(() => {})
        })
        .catch(() => {})
    }
    request()
    // Na tab-wissel/lock wordt de wake lock vrijgegeven → opnieuw aanvragen bij terugkeer.
    const onVis = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVis)
      sentinel?.release().catch(() => {})
    }
  }, [state.match.status])

  useEffect(() => {
    baseRef.current = {
      seconds: state.match.clockSeconds,
      running: state.match.clockRunning,
      at: clockBaseAt(state.match),
    }
    const b = baseRef.current
    setClock(b.running ? b.seconds + (Date.now() - b.at) / 1000 : b.seconds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.match.clockSeconds, state.match.clockRunning, state.match.clockUpdatedAt])

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

      const scorer = roster.find((r) => r.id === playerId)
      const scorerLabel = scorer ? `${scorer.shirtNumber} ${scorer.name}` : undefined

      let f: { title: string; big: string; color: string; team: string; player?: string } | null = null
      if (result?.outcome === 'goal') {
        f = { title: result.type === 'rug' ? 'RUGWORP' : 'DOELPUNT', big: `+${result.points ?? 1}`, color, team: teamName, player: scorerLabel }
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
    [poss, throwType, clock, act, state.teams, roster],
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

      // Bij élke bal buiten vragen we of hij aangeraakt is: op de doelworp bepaalt dat het
      // kruisje, op een eerdere worp bepaalt het wie de bal krijgt (inworp vanuit het midden).
      if (outcome === 'out_back' || outcome === 'out_side') {
        setPendingOut({ p, tapCount, playerId, isDoelworp })
        setPendingThrow(null)
        return
      }
      void submitThrow(p, tapCount, false, playerId)
      setPendingThrow(null)
    },
    [pendingThrow, poss, tapMode, state.match.goalAreaDepth, submitThrow],
  )

  const isScheduled = state.match.status === 'scheduled'
  const isLive = state.match.status === 'live'
  const isFinished = state.match.status === 'finished'
  const atHalfTime = state.atHalfTime

  // Na 'Einde': de scheidsrechter duidt aan wie effectief gespeeld heeft (O-markering op het blad).
  const [played, setPlayed] = useState<{ home: Set<number>; away: Set<number> }>(() => ({
    home: new Set(state.lineup.home),
    away: new Set(state.lineup.away),
  }))
  const [deelnameMsg, setDeelnameMsg] = useState<string | null>(null)
  const [deelnameSaved, setDeelnameSaved] = useState(false)

  // Bij een afgelopen wedstrijd de eventueel al bewaarde deelname inladen (pre-fill).
  useEffect(() => {
    if (!isFinished) return
    let active = true
    fetch(`/api/matchsheet/${matchId}/deelname`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { home?: number[]; away?: number[] } | null) => {
        if (!active || !d) return
        if ((d.home?.length ?? 0) + (d.away?.length ?? 0) === 0) return
        setPlayed({ home: new Set(d.home ?? []), away: new Set(d.away ?? []) })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isFinished, matchId])

  const togglePlayed = (side: 'home' | 'away', id: number) => {
    setDeelnameSaved(false)
    setPlayed((prev) => {
      const next = new Set(prev[side])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, [side]: next }
    })
  }

  const saveDeelname = async () => {
    setBusy(true)
    setDeelnameMsg(null)
    try {
      const res = await fetch(`/api/matchsheet/${matchId}/deelname`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home: [...played.home], away: [...played.away] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Bewaren mislukt')
      setDeelnameSaved(true)
      setDeelnameMsg('Deelname bewaard op het wedstrijdblad.')
    } catch (e) {
      setDeelnameMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Tik op de timer: zolang de wedstrijd nog niet gestart is, is hij geblokkeerd en
  // opent het keuzescherm "wie zet op?". Pas daarna kan de klok gestart/gepauzeerd worden.
  const onClockClick = () => {
    if (isScheduled) {
      // Geblokkeerd zolang de wedstrijd niet ontgrendeld is (opstelling + SR-akkoord, of demo).
      if (unlocked) setKickoffOpen(true)
      return
    }
    act({ action: 'clock', running: !state.match.clockRunning, seconds: Math.floor(clock) })
  }

  // Kies de ploeg die opzet → wedstrijd gaat live met een stilstaande klok,
  // zodat de timer vrij is en gestart kan worden wanneer ze willen.
  // allowUnready: enkel een admin die bewust de controle overslaat (testknop).
  const chooseKickoff = async (teamId: number) => {
    const res = await act({ action: 'start', startingTeamId: teamId, allowUnready: bypass })
    if (res) setKickoffOpen(false)
  }

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

  // Smalle zijbalk naast het veld: VW + wissel (makkelijk links/rechts), grote richtingspijl
  // en de worpteller voor de ploeg-aan-zet. Houdt het speelveld zo groot mogelijk.
  const SideRail = ({ side, arrow }: { side: 'home' | 'away'; arrow: string }) => {
    const active = possSide === side
    const teamId = side === 'home' ? state.teams.home.id : state.teams.away.id
    return (
      <div className={`sk-rail sk-rail-${side} ${active ? 'active' : 'dim'}`}>
        <button type="button" className="sk-rail-btn" disabled={busy || !isLive} title="Vrijworp" onClick={() => act({ action: 'freethrow', teamId })}>VW</button>
        <button type="button" className="sk-rail-btn" disabled={busy} title="Wissel" onClick={() => { setSubOut(null); setSubSide(side); setSubOpen(true) }}>⇄</button>
        <div className="sk-rail-dir" aria-label="speelrichting">{arrow}</div>
        {active && poss && (
          <div className="sk-rail-worp">{poss.freeThrow ? 'VW' : `${poss.nextThrowNumber}/${poss.throwsAllowed}`}</div>
        )}
      </div>
    )
  }

  return (
    <div className="sk" ref={rootRef}>
      {flash && (
        <div className="sk-goal-flash" style={{ ['--flash' as string]: flash.color }}>
          <div className="sk-goal-big">{flash.title}</div>
          <div className="sk-goal-pts">{flash.big}</div>
          {flash.player && <div className="sk-goal-scorer">{flash.player}</div>}
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
                    className="sk-pick-player"
                    disabled={justThrew}
                    onClick={() => choosePlayer(p.id)}
                    title={justThrew ? `${p.name} — net geworpen, niet 2× na elkaar` : p.name}
                  >
                    <span className="sk-pick-num">{p.shirtNumber}</span>
                    <span className="sk-pick-naam">{firstName(p.name)}</span>
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
            <p>Werd de bal door de tegenstander aangeraakt vóór hij buiten ging?</p>
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
                Ja — aangeraakt{' '}
                <span className="sk-modal-hint">{pendingOut.isDoelworp ? '(geen kruisje)' : '(bal blijft bij ons, inworp vanuit midden)'}</span>
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
                Nee — rechtstreeks{' '}
                <span className="sk-modal-hint">{pendingOut.isDoelworp ? '(kruisje)' : '(bal naar tegenstander, vanuit midden)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {subOpen && (() => {
        const teamId = subSide === 'home' ? state.teams.home.id : state.teams.away.id
        const teamName = subSide === 'home' ? state.teams.home.name : state.teams.away.name
        const field = roster.filter((p) => p.teamId === teamId && state.lineup[subSide].includes(p.id))
        const bench = roster.filter((p) => p.teamId === teamId && !state.lineup[subSide].includes(p.id))
        const outName = subOut ? roster.find((p) => p.id === subOut.playerId)?.name : null
        return (
          <div className="sk-modal-overlay">
            <div className={`sk-modal sk-sub side-${subSide}`}>
              <h3>Wissel — {teamName}</h3>
              <p>{subOut ? `${outName} eruit → kies wie erin komt` : 'Tik een speler op het veld die eruit gaat.'}</p>
              <div className="sk-sub-row">
                <span className="sk-sub-lbl">veld</span>
                {field.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`sk-sub-item ${subOut?.playerId === p.id ? 'on' : ''}`}
                    onClick={() => setSubOut({ side: subSide, playerId: p.id })}
                  >
                    <span className="num">{p.shirtNumber}</span>
                    <span className="nm">{p.name}</span>
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
                    className="sk-sub-item bench"
                    disabled={!subOut}
                    onClick={() => {
                      act({ action: 'substitute', side: subSide, outPlayerId: subOut!.playerId, inPlayerId: p.id })
                      setSubOut(null)
                      setSubOpen(false)
                    }}
                  >
                    <span className="num">{p.shirtNumber}</span>
                    <span className="nm">{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="sk-modal-btns">
                <button type="button" className="sk-btn primary" onClick={() => { setSubOpen(false); setSubOut(null) }}>Sluiten</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Keuzescherm bij de aftrap: opent via de geblokkeerde timer. */}
      {kickoffOpen && (
        <div className="sk-modal-overlay">
          <div className="sk-modal sk-kickoff-modal">
            <h3>Wie mag starten?</h3>
            <p>Kies de ploeg die opzet. Daarna is de timer vrij en kan je starten wanneer je wil.</p>
            <div className="sk-kickoff-teams">
              <button
                type="button"
                className="sk-kickoff-team home"
                disabled={busy}
                onClick={() => chooseKickoff(state.teams.home.id)}
              >
                {state.teams.home.name}
              </button>
              <button
                type="button"
                className="sk-kickoff-team away"
                disabled={busy}
                onClick={() => chooseKickoff(state.teams.away.id)}
              >
                {state.teams.away.name}
              </button>
            </div>
            <div className="sk-modal-btns">
              <button type="button" className="sk-btn" disabled={busy} onClick={() => setKickoffOpen(false)}>Annuleren</button>
            </div>
          </div>
        </div>
      )}

      {isDemo && <DemoTutorial matchId={matchId} />}

      <div className="sk-topbar">
        <a className="sk-back" href="/scorekeeper" title="Terug naar overzicht — de wedstrijd blijft gewoon live">← Overzicht</a>
        {isDemo && <span className="sk-demo-chip">DEMO</span>}
        <button type="button" className="sk-fs" onClick={toggleFullscreen} title="Volledig scherm aan/uit">
          {isFullscreen ? '⤡ Sluiten' : '⛶ Volledig scherm'}
        </button>
      </div>

      <header className="sk-head">
        <div className="sk-scorebar">
          <div className="sk-team home">
            <span className="sk-tn">{state.teams.home.name}</span>
            <span className="sk-sc">{state.score.home}</span>
            <button type="button" className="sk-to" disabled={busy || !isLive || state.timeouts.home >= 2} onClick={() => act({ action: 'timeout', teamId: state.teams.home.id })} title="Time-out thuis (2 per helft)">
              <span className="sk-to-lbl">T.O.</span>
              <span className={`sk-to-dot ${state.timeouts.home >= 1 ? 'used' : ''}`} />
              <span className={`sk-to-dot ${state.timeouts.home >= 2 ? 'used' : ''}`} />
            </button>
          </div>
          <button
            type="button"
            className={`sk-clock ${state.match.clockRunning ? 'running' : ''} ${isScheduled ? 'locked' : ''}`}
            disabled={busy || (!isLive && !isScheduled)}
            onClick={onClockClick}
            title={isScheduled ? (unlocked ? 'Tik om te kiezen wie opzet' : 'Vergrendeld — opstelling + akkoord scheidsrechter nodig') : 'Tik om te starten/pauzeren'}
          >
            <span className="sk-half-chip">H{state.match.currentHalf}</span>
            {fmtClock(clock)}
            <span className="sk-clock-ico">{isScheduled ? '🔒' : state.match.clockRunning ? '⏸' : '▶'}</span>
          </button>
          <div className="sk-team away">
            <span className="sk-tn">{state.teams.away.name}</span>
            <span className="sk-sc">{state.score.away}</span>
            <button type="button" className="sk-to" disabled={busy || !isLive || state.timeouts.away >= 2} onClick={() => act({ action: 'timeout', teamId: state.teams.away.id })} title="Time-out uit (2 per helft)">
              <span className="sk-to-lbl">T.O.</span>
              <span className={`sk-to-dot ${state.timeouts.away >= 1 ? 'used' : ''}`} />
              <span className={`sk-to-dot ${state.timeouts.away >= 2 ? 'used' : ''}`} />
            </button>
          </div>
        </div>
        <div className="sk-crossrow" title="Kruisjes (rechtstreeks buiten)">
          Kruisjes ✚ <strong>{state.crosses.home}</strong>–<strong>{state.crosses.away}</strong>
        </div>
      </header>

      {error && <div className="sk-error" onClick={() => setError(null)}>{error}</div>}

      {!isScheduled && (
        <div className="sk-toolbar">
          <button type="button" className="tb warn" disabled={busy} onClick={() => act({ action: 'undo' })}>↶ Undo</button>
          {isLive && (
            <button type="button" className="tb" disabled={busy} onClick={() => act({ action: 'referee_stop' })} title="Scheidsrechter-minuut / onderbreking">⏱ SR-minuut</button>
          )}
          {isLive && state.match.currentHalf < 2 && !atHalfTime && (
            <button type="button" className="tb" disabled={busy} onClick={() => act({ action: 'endhalf' })}>⏹ Einde 1e helft</button>
          )}
          {isLive && (
            <button type="button" className="tb danger" disabled={busy} onClick={() => { if (window.confirm('Wedstrijd beëindigen?')) act({ action: 'finish' }) }}>🏁 Einde</button>
          )}
        </div>
      )}

      {isScheduled && !unlocked ? (
        <div className="sk-kickoff">
          <div className="sk-kickoff-card sk-lock-card">
            <div className="sk-kickoff-title">Wedstrijd vergrendeld 🔒</div>
            <div className="sk-kickoff-sub">
              Voor je kan openen moeten beide opstellingen ingevuld zijn én moet de scheidsrechter
              akkoord geven.
            </div>
            <ul className="sk-checklist">
              <li className={readiness.homeOk ? 'ok' : 'todo'}>
                <span className="sk-check-ico">{readiness.homeOk ? '✓' : '○'}</span>
                Opstelling thuis ({readiness.homeCount}/{LINEUP_MIN})
                {!readiness.homeOk && <a className="sk-check-link" href={`/opstelling/${matchId}`}>invullen →</a>}
              </li>
              <li className={readiness.awayOk ? 'ok' : 'todo'}>
                <span className="sk-check-ico">{readiness.awayOk ? '✓' : '○'}</span>
                Opstelling uit ({readiness.awayCount}/{LINEUP_MIN})
                {!readiness.awayOk && <a className="sk-check-link" href={`/opstelling/${matchId}`}>invullen →</a>}
              </li>
              <li className={readiness.refereeOk ? 'ok' : 'todo'}>
                <span className="sk-check-ico">{readiness.refereeOk ? '✓' : '○'}</span>
                Akkoord scheidsrechter
                {!readiness.refereeOk && <a className="sk-check-link" href={`/scheidsrechter/${matchId}`}>scheidsrechter →</a>}
              </li>
            </ul>
            {isAdmin && (
              <button
                type="button"
                className="sk-lock-bypass"
                disabled={busy}
                onClick={() => {
                  setBypass(true)
                  setKickoffOpen(true)
                }}
                title="Admin: startcontrole overslaan om te testen"
              >
                🔧 Test — toch openen
              </button>
            )}
          </div>
        </div>
      ) : isScheduled ? (
        <div className="sk-kickoff">
          <div className="sk-kickoff-card">
            <div className="sk-kickoff-title">{bypass ? 'Test-modus 🔧' : isDemo ? 'Demo — klaar 🎓' : 'Klaar om te starten ✓'}</div>
            <div className="sk-kickoff-sub">
              Tik op de timer bovenaan om te kiezen wie opzet. Daarna is de timer vrij en kan je
              starten wanneer je wil.
            </div>
            <button type="button" className="sk-kickoff-start" disabled={busy} onClick={() => setKickoffOpen(true)}>
              Kies wie opzet
            </button>
          </div>
        </div>
      ) : isFinished ? (
        <div className="sk-kickoff">
          <div className="sk-kickoff-card sk-deelname-card">
            <div className="sk-kickoff-title">Wie heeft gespeeld?</div>
            <div className="sk-kickoff-sub">
              Duid per ploeg aan wie effectief deelnam. Dit komt op het wedstrijdblad (O-markering).
            </div>
            <div className="sk-deelname-grid">
              {(['home', 'away'] as const).map((side) => {
                const teamId = side === 'home' ? state.teams.home.id : state.teams.away.id
                const teamName = side === 'home' ? state.teams.home.name : state.teams.away.name
                const teamPlayers = roster.filter((p) => p.teamId === teamId)
                return (
                  <div key={side} className={`sk-deelname-col ${side}`}>
                    <h4>{teamName}</h4>
                    {teamPlayers.length === 0 && <span className="sk-dim">Geen spelers.</span>}
                    {teamPlayers.map((p) => {
                      const on = played[side].has(p.id)
                      return (
                        <button
                          type="button"
                          key={p.id}
                          className={`sk-deelname-item ${on ? 'on' : ''}`}
                          onClick={() => togglePlayed(side, p.id)}
                        >
                          <span className="sk-check-ico">{on ? '✓' : '○'}</span>
                          <span className="num">{p.shirtNumber}</span>
                          <span className="nm">{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            {deelnameMsg && <p className={`sk-deelname-msg ${deelnameSaved ? 'ok' : ''}`}>{deelnameMsg}</p>}
            <div className="sk-modal-btns">
              <button type="button" className="sk-btn primary" disabled={busy} onClick={saveDeelname}>
                Deelname bewaren
              </button>
              <a className="sk-btn" href={`/aftekenen/${matchId}`}>Naar aftekenen →</a>
            </div>
          </div>
        </div>
      ) : atHalfTime ? (
        <div className="sk-kickoff">
          <div className="sk-kickoff-card">
            <div className="sk-kickoff-title">Rust</div>
            <div className="sk-kickoff-sub">Eerste helft beëindigd. In de 2e helft zet de andere ploeg op.</div>
            <button type="button" className="sk-kickoff-start" disabled={busy} onClick={() => act({ action: 'starthalf' })}>
              ▶ Start 2e helft
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sk-arena">
            <SideRail side="home" arrow={homeArrow} />
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
            <SideRail side="away" arrow={awayArrow} />
          </div>
        </>
      )}
    </div>
  )
}
