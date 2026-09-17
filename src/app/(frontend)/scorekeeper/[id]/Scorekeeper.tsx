'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import { balgewichtLabel } from '@/lib/balgewicht'
import { attackDirForSide, deriveOutcome } from '@/lib/krachtbal-rules'
import { goalLineNorm, isOpDoellijn, matenVanMatch, projectWerpplaats, totalLengthM, zoneOf } from '@/lib/field'
import type { AttackDir, Point } from '@/lib/field'
import type { MatchState } from '@/lib/match-engine'
import { LINEUP_MIN, type Readiness } from '@/lib/match-readiness'
import { genOpId } from '@/lib/op-id'
import { useActionQueue } from '@/lib/use-action-queue'
import { fmtClock, useLiveClock } from '@/lib/use-live-clock'
import { useLiveStream } from '@/lib/use-live-stream'
import { DemoTutorial } from './DemoTutorial'

interface RosterPlayer {
  id: number
  name: string
  shirtNumber: number
  teamId: number
  position?: string | null
}

const HOME_COLOR = '#06d6a0'
const AWAY_COLOR = '#4cc9f0'
const OUT_COLOR = '#ef476f'

// Veiligheidsgrens tegen een weggelopen klok: een analysewedstrijd kan dagen blijven openstaan met
// de klok nog "running" (niemand pauzeerde bij het wegklikken) — de verstreken tijd zou dan
// duizenden minuten tonen ("H1 96748:50"). Geen enkele helft duurt realistisch langer dan dit; erna
// clampen we de weergave en tonen we een waarschuwing zodat de aantekenaar pauzeert en corrigeert.
const MAX_CLOCK_SECONDS = 3 * 60 * 60

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
  positionOptions,
}: {
  matchId: number
  initialState: MatchState
  roster: RosterPlayer[]
  readiness: Readiness
  isAdmin: boolean
  positionOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  const [state, setState] = useState<MatchState>(initialState)
  const isDemo = readiness.isDemo
  const isAnalyseOnly = readiness.analyseOnly
  // Manueel een speler toevoegen aan een ploeg (analyse / ontbrekende tegenstander). Bij een
  // analysewedstrijd is de positie verplicht — die voedt de analyse, dus kies ze meteen bij het
  // eerste keer toevoegen.
  const [addSide, setAddSide] = useState<'home' | 'away' | null>(null)
  const [addNum, setAddNum] = useState('')
  const [addName, setAddName] = useState('')
  const [addPos, setAddPos] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const needsPosition = isAnalyseOnly
  const submitAddPlayer = async (side: 'home' | 'away') => {
    setAddBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/match/${matchId}/add-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ side, name: addName.trim(), shirtNumber: Number(addNum), ...(addPos ? { position: addPos } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Speler toevoegen mislukt.')
        return
      }
      setAddSide(null)
      setAddNum('')
      setAddName('')
      setAddPos('')
      router.refresh()
    } finally {
      setAddBusy(false)
    }
  }
  // Admin/federatie kan de startcontrole bewust overslaan (testen).
  const [bypass, setBypass] = useState(false)
  // Analysewedstrijd: nooit het slot-scherm — de veldspelers kies je hier in het scherm zelf
  // (de spelers voegde je al toe bij het aanmaken). Starten blijft server-side geblokkeerd tot
  // beide opstellingen gekozen zijn.
  const unlocked = readiness.ready || bypass || isAnalyseOnly
  // Per-worp keuzes worden in het keuzescherm gezet (na het tikken op het veld).
  const [throwType, setThrowType] = useState<'nek' | 'rug'>('nek')
  const [recentTaps, setRecentTaps] = useState<FieldMarker[]>([])
  // Werpplaats voor de volgende worp: de werper mag zich vóór de worp zijdelings verplaatsen. Dit
  // is de (versleepbare) breedte-positie x; null = niet verschoven (gebruik de vorige landing).
  const [werpX, setWerpX] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ title: string; big: string; color: string; team: string; player?: string } | null>(null)
  // Flow: tik de bal-valt-plek (1 tik = grond, dubbeltik op dezelfde plek = gevangen), kies dan de
  // werper uit het vaste roster onder het veld. Geen popup meer die het veld bedekt.
  const [pendingThrow, setPendingThrow] = useState<{ p: Point; tapCount: 1 | 2 } | null>(null)
  // Pass-modus (§6.10): één tik legt vast wáár de bal doorgegeven wordt, daarna kies je de vanger.
  // Bewust een aparte modus: de gewone tik-flow (worp) mag er geen stap bij krijgen.
  const [passMode, setPassMode] = useState(false)
  const [pendingPass, setPendingPass] = useState<{ p: Point } | null>(null)
  const [pendingOut, setPendingOut] = useState<{ p: Point; tapCount: 1 | 2; playerId: number; isDoelworp: boolean } | null>(null)
  // Gevangen worp: kies welke tegenstander de bal ving.
  const [pendingCatch, setPendingCatch] = useState<{ p: Point; tapCount: 1 | 2; playerId: number } | null>(null)
  // Optionele "getikt naar de achterman door?"-stap na een diepe vangst (achterman).
  const [pendingTap, setPendingTap] = useState<{ p: Point; tapCount: 1 | 2; playerId: number; catcherId: number } | null>(null)
  const [subOpen, setSubOpen] = useState(false)
  const [subSide, setSubSide] = useState<'home' | 'away'>('home')
  // Vlotte wissel: kies (in willekeurige volgorde) één veldspeler (eruit) en één bankspeler
  // (erin); zodra beide gekozen zijn, wisselt het meteen en blijft het paneel open.
  const [subOut, setSubOut] = useState<number | null>(null)
  const [subIn, setSubIn] = useState<number | null>(null)
  // Positie-overschrijving voor DEZE match (verandert de globale spelersfiche niet): een invaller
  // erft de positie van wie hij vervangt, zodat de vanger-suggestie blijft kloppen na een wissel.
  const [posOverride, setPosOverride] = useState<Record<number, string>>({})
  const posOf = useCallback(
    (p: RosterPlayer): string | null => posOverride[p.id] ?? p.position ?? null,
    [posOverride],
  )
  // Kickoff: de timer is geblokkeerd tot er een ploeg gekozen is die opzet.
  // Tik op de geblokkeerde timer → dit keuzescherm opent.
  const [kickoffOpen, setKickoffOpen] = useState(false)
  // Veldspelers kiezen vóór de aftrap: welke 4 van de selectie op het veld staan.
  // De rest zijn wissels; enkel veldspelers verschijnen in het worp-keuzescherm.
  const [lineupSide, setLineupSide] = useState<'home' | 'away' | null>(null)
  const [lineupSel, setLineupSel] = useState<number[]>([])
  // Elke ploeg bevestigt vóór de aftrap met welke veldspelers ze starten. Pas als
  // BEIDE bevestigd zijn, verschijnt de "Kies wie opzet"-melding.
  const [lineupConfirmed, setLineupConfirmed] = useState<{ home: boolean; away: boolean }>({ home: false, away: false })
  const setConfirm = (side: 'home' | 'away', value: boolean) =>
    setLineupConfirmed((c) => ({ ...c, [side]: value }))
  const bothConfirmed = lineupConfirmed.home && lineupConfirmed.away
  // Kapitein aanduiden = tik een veldspeler aan. Verplicht vóór het bevestigen.
  const pickCaptain = (side: 'home' | 'away', playerId: number) => act({ action: 'setcaptain', side, playerId })

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
  // Automatisch volledig scherm zodra je het scherm voor het eerst aanraakt (browsers staan
  // fullscreen enkel toe vanuit een gebruikersgebaar). Eén keer per opening; verlaten kan altijd
  // met de ⛶-knop of Esc — daarna trapt het je niet opnieuw.
  const autoFsRef = useRef(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const tryFs = () => {
      if (autoFsRef.current) return
      autoFsRef.current = true
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {})
    }
    el.addEventListener('pointerdown', tryFs, { once: true })
    return () => el.removeEventListener('pointerdown', tryFs)
  }, [])

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

  // Clamp tegen de weggelopen-klok-bug (zie MAX_CLOCK_SECONDS hierboven): nooit een groter getal
  // in de state zetten dan de grens, anders zou "pauzeren" dat foute getal alsnog naar de server
  // wegschrijven (de pauzeknop stuurt Math.floor(clock) mee als nieuwe clockSeconds).
  const clock = useLiveClock({
    seconds: state.match.clockSeconds,
    running: state.match.clockRunning,
    updatedAt: state.match.clockUpdatedAt,
    max: MAX_CLOCK_SECONDS,
  })

  // Offline-bestendigheid (ROADMAP 1b): dezelfde wachtrij als de snelscoremodus. Valt het netwerk
  // weg, dan gaat een worp niet meer verloren met een foutmelding — hij wordt bewaard (localStorage)
  // en in volgorde nagestuurd (met vaste opId, dus nooit dubbel) zodra er weer verbinding is.
  const { send, pendingCount, offline } = useActionQueue(matchId, (data) => {
    const d = data as { state?: MatchState }
    setState(d.state ?? (data as MatchState))
  })

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        // opId → de server past een (per ongeluk) heruitgezonden actie niet dubbel toe (idempotentie).
        const op = typeof body.opId === 'string' ? body : { ...body, opId: genOpId() }
        const r = await send(op)
        // Serverfout: duidelijk melden i.p.v. stil falen (AUDIT §3). Gequeued (offline) is géén
        // fout — de banner meldt dat er nagestuurd wordt zodra de verbinding terug is.
        if (r.status === 'error') {
          setError(r.message)
          return null
        }
        if (r.status === 'queued') return { queued: true }
        return r.data as { outcome?: string; state?: MatchState }
      } finally {
        setBusy(false)
      }
    },
    [send],
  )

  // Live sync met de server (met reconnect-backoff): vangt wijzigingen van een tweede toestel of
  // de scheidsrechter op, en herstelt de juiste stand na een verbroken/herstelde verbinding.
  // Negeer updates terwijl een eigen actie loopt, zodat we geen optimistische schrijf overschrijven.
  // display=1: de aantekentafel is geen kijker — anders staat het oogje nooit op nul.
  useLiveStream<{ state?: MatchState }>(`/api/match/${matchId}/stream?display=1`, (data) => {
    if (busy) return
    if (data.state) setState(data.state)
  })

  const poss = state.possession
  const possSide = poss?.side ?? null
  // Enkel de spelers op het veld (de actieve opstelling) zijn selecteerbaar.
  const homePlayers = roster.filter((p) => p.teamId === state.teams.home.id && state.lineup.home.includes(p.id))
  const awayPlayers = roster.filter((p) => p.teamId === state.teams.away.id && state.lineup.away.includes(p.id))
  // Spelers van de ploeg-aan-zet voor het keuzescherm.
  const pickPlayers = possSide === 'home' ? homePlayers : possSide === 'away' ? awayPlayers : []

  // De werpplaats geldt per worp: zodra er een worp bijkomt (recentTaps groeit) of het balbezit
  // wisselt, vervalt de zijdelingse verschuiving (de nieuwe werpplaats = de nieuwe landing).
  useEffect(() => {
    setWerpX(null)
  }, [recentTaps.length, possSide, poss?.nextThrowNumber])

  // Registreer de worp (na ev. aanraking-vraag) en geef visuele feedback.
  const submitThrow = useCallback(
    async (p: Point, tapCount: 1 | 2, touchedBeforeOut: boolean, playerId: number, caughtById?: number, tappedById?: number) => {
      if (!poss) return
      const scoringSide = poss.side
      const color = scoringSide === 'home' ? HOME_COLOR : AWAY_COLOR
      const teamName = scoringSide === 'home' ? state.teams.home.name : state.teams.away.name
      const wasFreeThrow = poss.freeThrow

      // Optimistische markering met een eigen id, zodat we ze kunnen terugdraaien als de
      // registratie faalt (anders "liegt" de stip dat de worp geregistreerd is — AUDIT §3).
      const markerId = `${Date.now()}-${Math.round(p.x * 1000)}`
      const marker: FieldMarker = {
        id: markerId,
        x: Math.max(0, Math.min(1, p.x)),
        y: Math.max(0, Math.min(1, p.y)),
        color,
        r: 7,
        label: wasFreeThrow ? 'V' : String(poss.nextThrowNumber),
      }
      setRecentTaps((prev) => [...prev.slice(-6), marker])

      const result = (await act({
        action: 'throw',
        playerId,
        type: throwType,
        x: p.x,
        y: p.y,
        tapCount,
        touchedBeforeOut,
        caughtById,
        tappedById,
        // Zijdelings verschoven werpplaats (breedte) voor deze worp, indien versleept.
        originX: werpX ?? undefined,
        gameClock: Math.floor(clock),
      })) as { outcome?: string; type?: string; points?: number; isCross?: boolean; state?: MatchState } | null

      // Mislukt → de optimistische stip weer weghalen (geen valse "geregistreerd"-indruk).
      if (!result) {
        setRecentTaps((prev) => prev.filter((m) => m.id !== markerId))
        return
      }

      const scorer = roster.find((r) => r.id === playerId)
      const scorerLabel = scorer ? `${scorer.shirtNumber} ${scorer.name}` : undefined

      let f: { title: string; big: string; color: string; team: string; player?: string } | null = null
      if (result?.outcome === 'goal') {
        f = { title: result.type === 'rug' ? 'RUGWORP' : 'DOELPUNT', big: `+${result.points ?? 1}`, color, team: teamName, player: scorerLabel }
      } else if (result?.outcome === 'own_goal') {
        // §6.6: bal aan de grond in het EIGEN doelgebied = punt voor de tegenpartij. Duidelijk
        // anders tonen dan een gewoon doelpunt, anders lijkt het alsof de verkeerde ploeg scoorde.
        const other = scoringSide === 'home' ? state.teams.away : state.teams.home
        f = { title: 'EIGEN DOELPUNT', big: '+1', color: OUT_COLOR, team: other.name, player: scorerLabel }
      } else if (result?.isCross) {
        f = { title: 'KRUISJE', big: '✕', color: OUT_COLOR, team: teamName }
      } else if (result?.outcome === 'out_side' || result?.outcome === 'out_back') {
        f = { title: 'BAL BUITEN', big: '↗', color: OUT_COLOR, team: teamName }
      }
      if (f) {
        // Bij een analyse-opname is dit geen viering maar een bevestiging: kort tonen en door.
        // Op een echte wedstrijd (scorebord, publiek) blijft de flits staan zoals ze was.
        setFlash(f)
        window.setTimeout(() => setFlash(null), isAnalyseOnly ? 550 : 1600)
      }

      // Aanval afgewerkt (balbezit gewisseld) → veld leegmaken voor de volgende ploeg.
      if (result?.state?.possession && result.state.possession.nextThrowNumber === 1) {
        setRecentTaps([])
      }

      // Klaar voor de volgende worp.
      setThrowType('nek')
    },
    [poss, throwType, clock, act, state.teams, roster, werpX, isAnalyseOnly],
  )

  // Pass registreren (§6.10): geen werpbeurt, wel een nieuwe werpplaats. Een voorwaartse pass is
  // een fout — dan gaat de bal naar de tegenpartij en maken we het veld leeg.
  const submitPass = useCallback(
    async (playerId: number) => {
      if (!pendingPass || !poss) return
      const p = pendingPass.p
      setPendingPass(null)
      const res = (await act({
        action: 'pass',
        playerId,
        x: p.x,
        y: p.y,
        gameClock: Math.floor(clock),
      })) as { forward?: boolean; state?: MatchState } | null
      if (!res) return
      if (res.forward) {
        setFlash({ title: 'VOORWAARTSE PASS', big: '⟂', color: OUT_COLOR, team: 'Bal naar de tegenpartij' })
        window.setTimeout(() => setFlash(null), 1600)
        setRecentTaps([])
        setPassMode(false)
        return
      }
      // De bal ligt nu bij de vanger: die plek is de nieuwe werpplaats.
      setRecentTaps((prev) => [
        ...prev.slice(-6),
        { id: `pass-${Date.now()}`, x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)), color: '#c9a0ff', r: 6, label: 'P' },
      ])
      setWerpX(null)
      setPassMode(false)
    },
    [pendingPass, poss, act, clock],
  )

  // Stap 1: tik op het veld waar de bal valt. 1 tik = grond; een tweede tik op (nagenoeg) dezelfde
  // plek wisselt naar gevangen (en terug). Een tik op een andere plek verzet de plek (terug grond).
  const onTap = useCallback(
    (p: Point) => {
      if (state.match.status !== 'live' || !poss) {
        setError('Wedstrijd is niet live of geen lopend balbezit.')
        return
      }
      // Tijdens een sub-stap (vanger/tikker/buiten) doet een veld-tik niets.
      if (pendingCatch || pendingTap || pendingOut) return
      // Pass-modus: de tik legt de plek vast waar de medespeler de bal aanneemt.
      if (passMode) {
        setPendingPass({ p })
        return
      }
      // Werpplaats verleggen: vóór je de volgende landing aanduidt, verzet een tik op (ongeveer)
      // dezelfde horizontale lijn als de werpplaats enkel de breedte ervan. Bij de eerste worp is
      // dat het opzetpunt (bv. de doellijn na een vangst in het doelgebied). Geen slepen — tikken.
      const anchorY = recentTaps.length ? recentTaps[recentTaps.length - 1].y : poss.setupY
      if (!pendingThrow && Math.abs(p.y - anchorY) <= 0.05) {
        setWerpX(Math.max(0, Math.min(1, p.x)))
        return
      }
      setPendingThrow((cur) => {
        if (cur && Math.hypot(cur.p.x - p.x, cur.p.y - p.y) < 0.06) {
          return { p: cur.p, tapCount: cur.tapCount === 2 ? 1 : 2 }
        }
        return { p, tapCount: 1 }
      })
    },
    [state.match.status, poss, pendingCatch, pendingTap, pendingOut, pendingThrow, recentTaps, passMode],
  )

  // Stap 2: kies wie wierp → bereken de uitkomst en registreer (of vraag eerst naar aanraking).
  const choosePlayer = useCallback(
    (playerId: number) => {
      if (!pendingThrow || !poss) return
      const p = pendingThrow.p
      const dir = poss.dir as AttackDir
      const tapCount = pendingThrow.tapCount
      const outcome = deriveOutcome({ tapCount, point: p, dir, goalAreaDepthM: state.match.goalAreaDepth })
      const isDoelworp = poss.nextThrowNumber >= poss.throwsAllowed || poss.freeThrow

      // Bij élke bal buiten vragen we of hij aangeraakt is: op de doelworp bepaalt dat het
      // kruisje, op een eerdere worp bepaalt het wie de bal krijgt (inworp vanuit het midden).
      if (outcome === 'out_back' || outcome === 'out_side') {
        setPendingOut({ p, tapCount, playerId, isDoelworp })
        setPendingThrow(null)
        return
      }
      // Gevangen → enkel op een ANALYSE-wedstrijd vragen wie de bal ving (verdedigende registratie).
      // Op een gewone live-match gaat de gevangen worp meteen door — geen extra vraag, geen gesleur.
      if (outcome === 'caught') {
        if (isAnalyseOnly) {
          setPendingCatch({ p, tapCount, playerId })
        } else {
          void submitThrow(p, tapCount, false, playerId)
        }
        setPendingThrow(null)
        return
      }
      void submitThrow(p, tapCount, false, playerId)
      setPendingThrow(null)
    },
    [pendingThrow, poss, state.match.goalAreaDepth, submitThrow, isAnalyseOnly],
  )

  const isScheduled = state.match.status === 'scheduled'
  const isLive = state.match.status === 'live'
  const isFinished = state.match.status === 'finished'
  const atHalfTime = state.atHalfTime
  // Echte terreinmaten van deze wedstrijd (leeg = reglementair): bepalen de meters én de
  // lijnposities van het getekende veld, zodat tekening en berekening dezelfde waarheid delen.
  const veldMaten = matenVanMatch({ veldBreedte: state.match.veldBreedte, veldSpeelveld: state.match.veldSpeelveld })
  // Reglement §8: een vrije worp die vóór het rustsignaal werd toegekend, mag nog genomen worden.
  // Zolang die openstaat blijft het veld dus zichtbaar i.p.v. meteen naar het rustscherm te springen.
  const vrijeWorpNaRust = atHalfTime && Boolean(poss?.freeThrow) && (poss?.throwsUsed ?? 0) === 0

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

  // Eén bevestigingsstap voor alles wat je niet per ongeluk wil doen (starten, beëindigen,
  // heropenen, terugzetten). Bewust een eigen kaart i.p.v. window.confirm: die is op een tablet aan
  // de tafel makkelijk weg te tikken en toont geen uitleg over de gevolgen.
  const [bevestig, setBevestig] = useState<
    | null
    | { titel: string; tekst: string; knop: string; gevaar?: boolean; doe: () => void | Promise<unknown> }
  >(null)

  // Signaleert de weggelopen-klok-situatie (zie MAX_CLOCK_SECONDS): de werkelijke verstreken tijd
  // is dan toch onbetrouwbaar (dagenlang "running" vergeten) — 180:00 in een helft laten staan zou
  // even fout zijn als de oorspronkelijke gigantische waarde, dus resetten we naar 0 i.p.v. te
  // pauzeren op de geclampte grens.
  const clockStale = clock >= MAX_CLOCK_SECONDS

  // Tik op de timer: zolang de wedstrijd nog niet gestart is, is hij geblokkeerd en
  // opent het keuzescherm "wie zet op?". Pas daarna kan de klok gestart/gepauzeerd worden.
  const onClockClick = () => {
    if (isScheduled) {
      // Geblokkeerd zolang de wedstrijd niet ontgrendeld is (opstelling + SR-akkoord, of demo).
      if (unlocked) setKickoffOpen(true)
      return
    }
    if (clockStale) {
      act({ action: 'clock', running: false, seconds: 0 })
      return
    }
    act({ action: 'clock', running: !state.match.clockRunning, seconds: Math.floor(clock) })
  }

  // Kies de ploeg die opzet → wedstrijd gaat live met een stilstaande klok,
  // zodat de timer vrij is en gestart kan worden wanneer ze willen.
  // allowUnready: enkel een admin die bewust de controle overslaat (testknop).
  const chooseKickoff = (teamId: number) => {
    const naam = teamId === state.teams.home.id ? state.teams.home.name : state.teams.away.name
    // Analyse-opname: geen publiek, geen meldingen, niets dat "per ongeluk live gaat" — dus geen
    // drempel. Tik de ploeg die opzet en je zit meteen in het spel.
    if (isAnalyseOnly) {
      void (async () => {
        const res = await act({ action: 'start', startingTeamId: teamId, allowUnready: true })
        if (res) setKickoffOpen(false)
      })()
      return
    }
    // Extra drempel: één misgetikte ploegnaam startte vroeger meteen de wedstrijd — ook wanneer
    // die reeks nog moest beginnen. Nu zie je eerst zwart op wit wat je op het punt staat te doen.
    setBevestig({
      titel: 'Wedstrijd nu starten?',
      tekst: `${naam} zet op. De wedstrijd gaat live en supporters krijgen een melding. Start dit pas wanneer er echt gespeeld wordt.`,
      knop: '▶ Ja, starten',
      doe: async () => {
        const res = await act({ action: 'start', startingTeamId: teamId, allowUnready: bypass })
        if (res) setKickoffOpen(false)
      },
    })
  }

  // Veldspelers kiezen: open het keuzescherm voorgevuld met de huidige opstelling.
  const openLineup = (side: 'home' | 'away') => {
    setLineupSel([...state.lineup[side]])
    setLineupSide(side)
  }
  // Tik een speler aan/uit; nooit meer dan LINEUP_MIN (4) tegelijk geselecteerd.
  const toggleLineupPick = (id: number) => {
    setLineupSel((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= LINEUP_MIN) return prev
      return [...prev, id]
    })
  }
  const saveLineup = async () => {
    if (lineupSide === null || lineupSel.length !== LINEUP_MIN) return
    const res = await act({ action: 'setlineup', side: lineupSide, playerIds: lineupSel })
    if (res) {
      // Opstelling gewijzigd → die ploeg moet opnieuw bevestigen.
      setConfirm(lineupSide, false)
      setLineupSide(null)
    }
  }

  // Bevestigen = ook BEWAREN. De getoonde veldspelers kunnen de standaard "eerste 4" zijn die
  // nooit opgeslagen werd (bij precies 4 spelers is er zelfs geen kies-knop) — zonder save
  // weigert de server daarna de start met "opstelling thuis, opstelling uit".
  const confirmLineup = async (side: 'home' | 'away') => {
    const teamId = side === 'home' ? state.teams.home.id : state.teams.away.id
    const ids = roster.filter((p) => p.teamId === teamId && state.lineup[side].includes(p.id)).map((p) => p.id)
    if (ids.length !== LINEUP_MIN) return
    const res = await act({ action: 'setlineup', side, playerIds: ids })
    if (res) setConfirm(side, true)
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

  // Werpplaats voor de volgende worp. Bij een vervolgworp is dat de laatste landing; bij de EERSTE
  // worp van een balbezit het opzetpunt (bv. na een vangst in het doelgebied: het midden van de
  // doellijn). De werper mag zich vóór de worp zijdelings (alleen breedte) verplaatsen — je verlegt
  // de werpplaats door op de horizontale hulplijn te tikken (geen slepen). Het traject start er.
  // Lag de bal binnen de 4 m van een doellijn, dan schuift de werpplaats terug tot op de
  // vrijeworplijn (§6.4) — exact dezelfde projectie als op de server, zodat de gele stip en de
  // berekende afstand niet uit elkaar lopen.
  // Zet het balbezit op vanaf de doellijn (vangst in het doelgebied), dan blijft de werpplaats
  // dáár — de doellijn is dan de beperkende lijn, niet de vrijeworplijn (§6.4).
  const lastTap = recentTaps.length ? recentTaps[recentTaps.length - 1] : null
  const werpAnchor = lastTap
    ? projectWerpplaats({ x: lastTap.x, y: lastTap.y }, state.match.goalAreaDepth ?? undefined, { maten: veldMaten })
    : poss
      ? projectWerpplaats({ x: poss.setupX, y: poss.setupY }, state.match.goalAreaDepth ?? undefined, {
          vanuitDoelgebied: isOpDoellijn({ x: poss.setupX, y: poss.setupY }, state.match.goalAreaDepth ?? undefined, veldMaten),
          maten: veldMaten,
        })
      : null
  const showWerp = isLive && werpAnchor && !pendingCatch && !pendingTap && !pendingOut
  const werpPoint = werpAnchor ? { x: werpX ?? werpAnchor.x, y: werpAnchor.y } : null
  const werpMarker: FieldMarker | null =
    showWerp && werpPoint
      ? { id: 'werpplaats', x: werpPoint.x, y: werpPoint.y, color: '#ffd166', r: 4 }
      : null
  const baseMarkers: FieldMarker[] = werpMarker ? [...recentTaps, werpMarker] : recentTaps

  // Tijdelijke markering op de gekozen plek terwijl je de werper kiest. Gevangen (dubbeltik) krijgt
  // een eigen kleur + ✋ zodat je in één oogopslag ziet of het grond of gevangen is.
  const fieldMarkers: FieldMarker[] = pendingPass
    ? [
        ...baseMarkers,
        {
          x: Math.max(0, Math.min(1, pendingPass.p.x)),
          y: Math.max(0, Math.min(1, pendingPass.p.y)),
          color: '#c9a0ff',
          r: 9,
          label: 'P',
          ...(werpPoint ? { fromX: werpPoint.x, fromY: werpPoint.y } : {}),
        },
      ]
    : pendingThrow
    ? [
        ...baseMarkers,
        {
          x: Math.max(0, Math.min(1, pendingThrow.p.x)),
          y: Math.max(0, Math.min(1, pendingThrow.p.y)),
          color: pendingThrow.tapCount === 2 ? '#4cc9f0' : '#ffffff',
          r: 9,
          label: pendingThrow.tapCount === 2 ? '✋' : '?',
          // Traject vertrekt vanaf de (eventueel verschoven) werpplaats.
          ...(werpPoint ? { fromX: werpPoint.x, fromY: werpPoint.y } : {}),
        },
      ]
    : baseMarkers

  // Smalle zijbalk naast het veld: VW + wissel (makkelijk links/rechts), grote richtingspijl
  // en de worpteller voor de ploeg-aan-zet. Houdt het speelveld zo groot mogelijk.
  const SideRail = ({ side, arrow }: { side: 'home' | 'away'; arrow: string }) => {
    const active = possSide === side
    const teamId = side === 'home' ? state.teams.home.id : state.teams.away.id
    return (
      <div className={`sk-rail sk-rail-${side} ${active ? 'active' : 'dim'}`}>
        <button type="button" className="sk-rail-btn" disabled={busy || !isLive} title="Vrijworp" onClick={() => act({ action: 'freethrow', teamId })}>VW</button>
        {active && (
          <button
            type="button"
            className={`sk-rail-btn sk-rail-pass${passMode ? ' on' : ''}`}
            disabled={busy || !isLive}
            title="Pass: tik waar de medespeler de bal aanneemt (verbruikt geen worp)"
            onClick={() => { setPendingThrow(null); setPassMode((v) => !v) }}
          >
            P
          </button>
        )}
        <button type="button" className="sk-rail-btn" disabled={busy} title="Wissel" onClick={() => { setSubOut(null); setSubIn(null); setSubSide(side); setSubOpen(true) }}>⇄</button>
        <div className="sk-rail-dir" aria-label="speelrichting">{arrow}</div>
        {active && poss && (
          <div className="sk-rail-worp">{poss.freeThrow ? 'VW' : `${poss.nextThrowNumber}/${poss.throwsAllowed}`}</div>
        )}
        {/* Globale beheerknoppen onderaan de zijbalken (zo houdt het veld alle hoogte). */}
        {!isScheduled && (
          <div className="sk-rail-acts">
            {side === 'home' ? (
              <>
                <button type="button" className="sk-rail-act warn" disabled={busy} onClick={() => act({ action: 'undo' })} title="Ongedaan maken">↶<span>Undo</span></button>
                {isLive && (
                  <button type="button" className="sk-rail-act" disabled={busy} onClick={() => act({ action: 'referee_stop' })} title="Scheidsrechter-minuut / onderbreking">⏱<span>SR-min</span></button>
                )}
              </>
            ) : (
              <>
                {isLive && state.match.currentHalf < 2 && !atHalfTime && (
                  <button
                    type="button"
                    className="sk-rail-act notice"
                    disabled={busy}
                    onClick={() =>
                      setBevestig({
                        titel: 'Einde eerste helft?',
                        tekst: 'De klok gaat op rust. Daarna zet de andere ploeg op in de tweede helft.',
                        knop: '⏹ Ja, het is rust',
                        doe: () => act({ action: 'endhalf' }),
                      })
                    }
                    title="Einde eerste helft"
                  >⏹<span>Einde 1e</span></button>
                )}
                {isLive && (
                  <button
                    type="button"
                    className="sk-rail-act danger"
                    disabled={busy}
                    onClick={() =>
                      setBevestig({
                        titel: 'Wedstrijd beëindigen?',
                        tekst:
                          'De eindstand wordt vastgelegd en het aantekenen stopt. Ging het per ongeluk, dan kan je de wedstrijd daarna nog heropenen — je verliest niets.',
                        knop: '🏁 Ja, de wedstrijd is gedaan',
                        gevaar: true,
                        doe: () => act({ action: 'finish' }),
                      })
                    }
                    title="Wedstrijd beëindigen"
                  >🏁<span>Einde</span></button>
                )}
              </>
            )}
          </div>
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

      {/* Grote herinnering: zodra de wedstrijd live is maar de klok nog op nul staat, vraagt
          dit scherm uitdrukkelijk om de timer te starten — zo vergeet niemand hem aan te leggen. */}
      {isLive && !state.match.clockRunning && clock < 1 && (
        <div className="sk-starttimer">
          <button
            type="button"
            className="sk-starttimer-btn"
            disabled={busy}
            onClick={() => act({ action: 'clock', running: true, seconds: 0 })}
          >
            ▶ Start de timer
          </button>
        </div>
      )}

      {/* Werper kiezen — vaste balk onderaan (veld blijft zichtbaar). Grond/gevangen volgt de
          (dubbel)tik op het veld; de indicator is ook hier tikbaar. */}
      {pendingThrow && (
        <div className={`sk-entry${pendingThrow.tapCount === 2 ? ' sk-entry-caught' : ''}`}>
          <div className="sk-entry-box sk-pick">
            <div className="sk-entry-head">
              <span className="sk-entry-title">Wie wierp?</span>
              <span className="sk-entry-meta">
                {possSide === 'home' ? state.teams.home.name : state.teams.away.name}
                {poss && ` · ${poss.freeThrow ? 'vrijworp' : `worp ${poss.nextThrowNumber}/${poss.throwsAllowed}`}`}
              </span>
            </div>
            {pendingThrow.tapCount === 2 && (
              <div className="sk-caught-banner">✋ Gevangen — tik nogmaals op het veld voor “grond”</div>
            )}
            <div className="sk-pills sk-pick-pills">
              <button type="button" className={`pill ${throwType === 'nek' ? 'on' : ''}`} onClick={() => setThrowType('nek')}>Nek +1</button>
              <button type="button" className={`pill ${throwType === 'rug' ? 'on' : ''}`} onClick={() => setThrowType('rug')}>Rug +2</button>
              <button
                type="button"
                className={`pill sk-tapmode ${pendingThrow.tapCount === 2 ? 'caught' : 'ground'}`}
                onClick={() => setPendingThrow((c) => (c ? { p: c.p, tapCount: c.tapCount === 2 ? 1 : 2 } : c))}
                title="Dubbeltik op het veld wisselt grond/gevangen — of tik hier"
              >
                {pendingThrow.tapCount === 2 ? '✋ Gevangen' : '● Grond'}
              </button>
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

      {/* Pass (§6.10): wie neemt de bal aan? Verbruikt geen werpbeurt — enkel de werpplaats
          verschuift. Voorwaarts doorgeven mag niet; dat meldt de server als fout. */}
      {pendingPass && (
        <div className="sk-entry sk-entry-pass">
          <div className="sk-entry-box sk-pick">
            <div className="sk-entry-head">
              <span className="sk-entry-title">Wie vangt de pass?</span>
              <span className="sk-entry-meta">
                {possSide === 'home' ? state.teams.home.name : state.teams.away.name} · pass (geen worp)
              </span>
            </div>
            <div className="sk-pick-grid">
              {pickPlayers.length === 0 && <span className="sk-dim">Geen spelers op het veld.</span>}
              {pickPlayers.map((p) => (
                <button type="button" key={p.id} className="sk-pick-player" onClick={() => void submitPass(p.id)} title={p.name}>
                  <span className="sk-pick-num">{p.shirtNumber}</span>
                  <span className="sk-pick-naam">{firstName(p.name)}</span>
                </button>
              ))}
            </div>
            <div className="sk-modal-btns">
              <button type="button" className="sk-btn" onClick={() => setPendingPass(null)}>Annuleren</button>
            </div>
          </div>
        </div>
      )}

      {pendingCatch && (() => {
        // De vangende ploeg is de tegenstander van de werpende ploeg.
        const catchers = possSide === 'home' ? awayPlayers : homePlayers
        const submit = (catcherId?: number) => {
          const { p, tapCount, playerId } = pendingCatch
          const catcher = catcherId ? catchers.find((c) => c.id === catcherId) : undefined
          setPendingCatch(null)
          // Diepe vangst door de achterman → vraag optioneel wie naar hem tikte.
          if (catcherId && catcher && posOf(catcher) === 'achter') {
            setPendingTap({ p, tapCount, playerId, catcherId })
            return
          }
          void submitThrow(p, tapCount, false, playerId, catcherId)
        }
        // Slimme suggestie op basis van wáár de bal viel (geen gesleur):
        //  • de breedte-zone bepaalt wélke vleugel in beeld komt;
        //  • de DIEPTE (afstand tot de aangevallen doellijn) bepaalt de volgorde — diep bij het
        //    doel is het domein van de achterman (≈ 13 m-regel), ondieper op een vleugel is de
        //    vleugelverdediger. Zo staat de meest waarschijnlijke vanger altijd eerst.
        const dir = poss ? (poss.dir as AttackDir) : 'up'
        const zone = poss ? zoneOf(pendingCatch.p, dir) : 'midden'
        const wingPos = zone === 'links' ? 'vleugel-links' : zone === 'rechts' ? 'vleugel-rechts' : null
        const wing = wingPos ? catchers.find((c) => posOf(c) === wingPos) : undefined
        const back = catchers.find((c) => posOf(c) === 'achter')
        const depthM = state.match.goalAreaDepth
        const goalY = dir === 'up' ? 1 - goalLineNorm(depthM, veldMaten) : goalLineNorm(depthM, veldMaten)
        const distToGoalM = Math.abs(pendingCatch.p.y - goalY) * totalLengthM(depthM, veldMaten)
        const deep = distToGoalM <= 13
        const ordered = deep ? [back, wing] : [wing, back]
        const suggested = ordered.filter((c): c is RosterPlayer => Boolean(c))
        const suggestedIds = new Set(suggested.map((c) => c.id))
        const posLabel = (pos?: string | null) =>
          pos === 'vleugel-links' ? 'vleugel links' : pos === 'vleugel-rechts' ? 'vleugel rechts' : pos === 'achter' ? 'achterman' : ''
        const rest = catchers.filter((c) => !suggestedIds.has(c.id))
        return (
          <div className="sk-entry">
            <div className="sk-entry-box sk-lineup-modal">
              <h3>Wie ving de bal?</h3>
              {suggested.length > 0 ? (
                <>
                  <p className="sk-suggest-lbl">
                    Wellicht <strong>{firstName(suggested[0].name)}</strong> — bevestig of corrigeer
                  </p>
                  <div className="sk-suggest-row">
                    {suggested.map((c, i) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`sk-pick-player sk-suggest${i === 0 ? ' sk-suggest-top' : ''}`}
                        onClick={() => submit(c.id)}
                      >
                        {i === 0 && <span className="sk-suggest-check" aria-hidden>✓</span>}
                        <span className="sk-pick-num">{c.shirtNumber}</span>
                        <span className="sk-pick-naam">{firstName(c.name)}</span>
                        <span className="sk-pick-pos">{posLabel(posOf(c))}</span>
                      </button>
                    ))}
                  </div>
                  {rest.length > 0 && <p className="sk-suggest-or">of iemand anders</p>}
                </>
              ) : (
                <p>Tik de tegenstander aan die de bal ving (of sla over).</p>
              )}
              {rest.length > 0 && (
                <div className="sk-lineup-pick-grid">
                  {rest.map((p) => (
                    <button type="button" key={p.id} className="sk-pick-player" onClick={() => submit(p.id)}>
                      <span className="sk-pick-num">{p.shirtNumber}</span>
                      <span className="sk-pick-naam">{firstName(p.name)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="sk-modal-btns">
                <button type="button" className="sk-btn" onClick={() => submit(undefined)}>Onbekend / overslaan</button>
              </div>
            </div>
          </div>
        )
      })()}

      {pendingTap && (() => {
        // Wie tikte naar de achterman? De vangende ploeg (tegenstander), zonder de vanger zelf.
        const tappers = (possSide === 'home' ? awayPlayers : homePlayers).filter((c) => c.id !== pendingTap.catcherId)
        const submit = (tapperId?: number) => {
          const { p, tapCount, playerId, catcherId } = pendingTap
          setPendingTap(null)
          void submitThrow(p, tapCount, false, playerId, catcherId, tapperId)
        }
        // De tik naar de achterman komt bijna altijd van de vleugel aan de kant waar de bal
        // viel → die staat groot bovenaan zodat je hem in één tik bevestigt.
        const dir = poss ? (poss.dir as AttackDir) : 'up'
        const zone = poss ? zoneOf(pendingTap.p, dir) : 'midden'
        const wingPos = zone === 'links' ? 'vleugel-links' : zone === 'rechts' ? 'vleugel-rechts' : null
        const wing = wingPos ? tappers.find((c) => posOf(c) === wingPos) : undefined
        const rest = wing ? tappers.filter((c) => c.id !== wing.id) : tappers
        return (
          <div className="sk-entry">
            <div className="sk-entry-box sk-lineup-modal">
              <h3>Getikt naar de achterman door?</h3>
              <p>Wie tikte de bal naar de achterman? (optioneel)</p>
              {wing && (
                <>
                  <p className="sk-suggest-lbl">
                    Wellicht <strong>{firstName(wing.name)}</strong> — bevestig of corrigeer
                  </p>
                  <div className="sk-suggest-row">
                    <button type="button" className="sk-pick-player sk-suggest sk-suggest-top" onClick={() => submit(wing.id)}>
                      <span className="sk-suggest-check" aria-hidden>✓</span>
                      <span className="sk-pick-num">{wing.shirtNumber}</span>
                      <span className="sk-pick-naam">{firstName(wing.name)}</span>
                      <span className="sk-pick-pos">{zone === 'links' ? 'vleugel links' : 'vleugel rechts'}</span>
                    </button>
                  </div>
                  {rest.length > 0 && <p className="sk-suggest-or">of iemand anders</p>}
                </>
              )}
              <div className="sk-lineup-pick-grid">
                {rest.map((c) => (
                  <button type="button" key={c.id} className="sk-pick-player" onClick={() => submit(c.id)}>
                    <span className="sk-pick-num">{c.shirtNumber}</span>
                    <span className="sk-pick-naam">{firstName(c.name)}</span>
                  </button>
                ))}
              </div>
              <div className="sk-modal-btns">
                <button type="button" className="sk-btn" onClick={() => submit(undefined)}>Niet getikt / direct</button>
              </div>
            </div>
          </div>
        )
      })()}

      {pendingOut && (
        <div className="sk-entry">
          <div className="sk-entry-box">
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

        // Zodra één veldspeler én één bankspeler gekozen zijn → meteen wisselen, paneel blijft open.
        const doSwap = (outId: number, inId: number) => {
          void act({ action: 'substitute', side: subSide, outPlayerId: outId, inPlayerId: inId })
          // De invaller erft de positie van wie eruit gaat — enkel voor deze match.
          const outPlayer = roster.find((p) => p.id === outId)
          const inheritedPos = outPlayer ? posOf(outPlayer) : null
          if (inheritedPos) setPosOverride((m) => ({ ...m, [inId]: inheritedPos }))
          setSubOut(null)
          setSubIn(null)
        }
        const pickField = (id: number) => (subIn != null ? doSwap(id, subIn) : setSubOut(subOut === id ? null : id))
        const pickBench = (id: number) => (subOut != null ? doSwap(subOut, id) : setSubIn(subIn === id ? null : id))
        const hint =
          subOut != null
            ? 'Kies wie van de bank erin komt.'
            : subIn != null
              ? 'Kies wie van het veld eruit gaat.'
              : 'Tik een veldspeler én een bankspeler — in willekeurige volgorde, ze wisselen meteen.'

        return (
          <div className="sk-modal-overlay">
            <div className={`sk-modal sk-sub side-${subSide}`}>
              <h3>Wissel — {teamName}</h3>
              <p>{hint}</p>
              <div className="sk-sub-row">
                <span className="sk-sub-lbl">veld</span>
                {field.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`sk-sub-item ${subOut === p.id ? 'on' : ''}`}
                    onClick={() => pickField(p.id)}
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
                    className={`sk-sub-item bench ${subIn === p.id ? 'on' : ''}`}
                    onClick={() => pickBench(p.id)}
                  >
                    <span className="num">{p.shirtNumber}</span>
                    <span className="nm">{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="sk-modal-btns">
                <button type="button" className="sk-btn primary" onClick={() => { setSubOpen(false); setSubOut(null); setSubIn(null) }}>Klaar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Keuzescherm bij de aftrap: opent via de geblokkeerde timer. */}
      {/* Bevestigingskaart: dezelfde vorm voor starten, beëindigen, heropenen en terugzetten. */}
      {bevestig && (
        <div className="sk-modal-overlay">
          <div className={`sk-modal sk-bevestig${bevestig.gevaar ? ' gevaar' : ''}`}>
            <h3>{bevestig.titel}</h3>
            <p>{bevestig.tekst}</p>
            <div className="sk-modal-btns">
              <button type="button" className="sk-btn" disabled={busy} onClick={() => setBevestig(null)}>
                Nee, terug
              </button>
              <button
                type="button"
                className={`sk-btn ${bevestig.gevaar ? 'danger' : 'primary'}`}
                disabled={busy}
                onClick={async () => {
                  const doe = bevestig.doe
                  setBevestig(null)
                  await doe()
                }}
              >
                {bevestig.knop}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Veldspelers kiezen vóór de aftrap: tik precies LINEUP_MIN spelers aan. */}
      {lineupSide !== null && (() => {
        const teamId = lineupSide === 'home' ? state.teams.home.id : state.teams.away.id
        const teamName = lineupSide === 'home' ? state.teams.home.name : state.teams.away.name
        const teamRoster = roster.filter((p) => p.teamId === teamId)
        return (
          <div className="sk-modal-overlay">
            <div className={`sk-modal sk-lineup-modal side-${lineupSide}`}>
              <h3>Veldspelers — {teamName}</h3>
              <p>Tik {LINEUP_MIN} spelers aan die op het veld starten. De rest zijn wissels.</p>
              <div className="sk-lineup-pick-grid">
                {teamRoster.map((p) => {
                  const on = lineupSel.includes(p.id)
                  const full = lineupSel.length >= LINEUP_MIN
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={`sk-pick-player ${on ? 'on' : ''}`}
                      disabled={!on && full}
                      onClick={() => toggleLineupPick(p.id)}
                    >
                      <span className="sk-pick-num">{p.shirtNumber}</span>
                      <span className="sk-pick-naam">{firstName(p.name)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="sk-modal-btns">
                <span className={`sk-lineup-count ${lineupSel.length === LINEUP_MIN ? 'ok' : ''}`}>
                  {lineupSel.length}/{LINEUP_MIN} gekozen
                </span>
                <button type="button" className="sk-btn" disabled={busy} onClick={() => setLineupSide(null)}>Annuleren</button>
                <button
                  type="button"
                  className="sk-btn primary"
                  disabled={busy || lineupSel.length !== LINEUP_MIN}
                  onClick={() => void saveLineup()}
                >
                  Bewaren
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Help/uitleg op echte wedstrijden en demo, maar niet bij een analysewedstrijd. */}
      {!isAnalyseOnly && <DemoTutorial matchId={matchId} />}

      <div className="sk-topbar">
        <Link className="sk-back" href={isAnalyseOnly ? '/analyse' : '/scorekeeper'} title="Terug naar overzicht — de wedstrijd blijft gewoon live">← Overzicht</Link>
        {isDemo && <span className="sk-demo-chip">DEMO</span>}
        {isAnalyseOnly && <span className="sk-demo-chip">ANALYSE</span>}
        {/* Te vroeg gestart? Zet de wedstrijd terug op niet-gestart. Bewust hier, weg van de
            aantekenknoppen: je vindt het als je het zoekt, maar je tikt het niet per ongeluk aan. */}
        {isLive && (
          <button
            type="button"
            className="sk-terug"
            disabled={busy}
            onClick={() =>
              setBevestig({
                titel: 'Terugzetten naar niet-gestart?',
                tekst:
                  'Gebruik dit als de wedstrijd per ongeluk gestart is. Alles wat al ingevoerd werd — worpen, score, kruisjes en de klok — verdwijnt, en de wedstrijd staat weer klaar om later gewoon te beginnen. Dit kan niet ongedaan gemaakt worden.',
                knop: '↺ Ja, terugzetten',
                gevaar: true,
                doe: () => act({ action: 'reset' }),
              })
            }
            title="De wedstrijd was nog niet bezig — terugzetten naar niet-gestart"
          >
            ↺ Niet gestart
          </button>
        )}
        <button type="button" className="sk-fs" onClick={toggleFullscreen} title="Volledig scherm aan/uit">
          {isFullscreen ? '⤡ Sluiten' : '⛶ Volledig scherm'}
        </button>
      </div>

      {(offline || pendingCount > 0) && (
        <div className="sk-offline" role="status">
          📴 Offline — je blijft aantekenen; {pendingCount > 0 ? `${pendingCount} worp${pendingCount === 1 ? '' : 'en'}/actie${pendingCount === 1 ? '' : 's'} word${pendingCount === 1 ? 't' : 'en'} bewaard` : 'alles wordt bewaard'} en automatisch gesynct zodra je weer verbinding hebt.
        </div>
      )}

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
            <span className="sk-cross" title="Kruisjes — 3e = vrije worp voor de tegenstander">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`sk-cross-x ${i < state.crosses.home ? 'on' : ''}`}>✖</span>
              ))}
            </span>
          </div>
          <button
            type="button"
            className={`sk-clock ${state.match.clockRunning ? 'running' : ''} ${isScheduled ? 'locked' : ''} ${clockStale ? 'stale' : ''}`}
            disabled={busy || (!isLive && !isScheduled)}
            onClick={onClockClick}
            title={
              clockStale
                ? 'De klok liep te lang door (waarschijnlijk vergeten pauzeren) — tik om terug te zetten naar 0:00'
                : isScheduled
                  ? (unlocked ? 'Tik om te kiezen wie opzet' : isAnalyseOnly ? 'Vergrendeld — opstellingen nodig' : 'Vergrendeld — opstelling + akkoord scheidsrechter nodig')
                  : 'Tik om te starten/pauzeren'
            }
          >
            <span className="sk-half-chip">H{state.match.currentHalf}</span>
            {clockStale ? <span className="sk-clock-stale">⚠️ corrigeren</span> : fmtClock(clock)}
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
            <span className="sk-cross" title="Kruisjes — 3e = vrije worp voor de tegenstander">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`sk-cross-x ${i < state.crosses.away ? 'on' : ''}`}>✖</span>
              ))}
            </span>
          </div>
        </div>
      </header>

      {error && <div className="sk-error" onClick={() => setError(null)}>{error}</div>}

      {isScheduled && !unlocked ? (
        <div className="sk-kickoff">
          <div className="sk-kickoff-card sk-lock-card">
            <div className="sk-kickoff-title">Wedstrijd vergrendeld 🔒</div>
            <div className="sk-kickoff-sub">
              {isAnalyseOnly
                ? 'Voeg eerst de spelers toe in beide opstellingen — voor een analysewedstrijd heb je geen akkoord van de scheidsrechter nodig.'
                : 'Voor je kan openen moeten beide opstellingen ingevuld zijn én moet de scheidsrechter akkoord geven.'}
            </div>
            <ul className="sk-checklist">
              <li className={readiness.homeOk ? 'ok' : 'todo'}>
                <span className="sk-check-ico">{readiness.homeOk ? '✓' : '○'}</span>
                Opstelling thuis ({readiness.homeCount}/{LINEUP_MIN})
                {!readiness.homeOk && <a className="sk-check-link" href={`/opstelling/${matchId}`}>spelers toevoegen →</a>}
              </li>
              <li className={readiness.awayOk ? 'ok' : 'todo'}>
                <span className="sk-check-ico">{readiness.awayOk ? '✓' : '○'}</span>
                Opstelling uit ({readiness.awayCount}/{LINEUP_MIN})
                {!readiness.awayOk && <a className="sk-check-link" href={`/opstelling/${matchId}`}>spelers toevoegen →</a>}
              </li>
              {!isAnalyseOnly && (
                <li className={readiness.refereeOk ? 'ok' : 'todo'}>
                  <span className="sk-check-ico">{readiness.refereeOk ? '✓' : '○'}</span>
                  Akkoord scheidsrechter
                  {!readiness.refereeOk && <a className="sk-check-link" href={`/scheidsrechter/${matchId}`}>scheidsrechter →</a>}
                </li>
              )}
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
          {/* Veldspelers: kies per ploeg de 4 die op het veld staan; de rest zijn wissels.
              Enkel veldspelers kunnen werpen, dus enkel zij verschijnen in het keuzescherm.
              Zodra BEIDE ploegen bevestigd hebben, verdwijnt dit en blijft enkel de startkaart. */}
          {!bothConfirmed && (
          <div className="sk-kickoff-card sk-lineup-card">
            <div className="sk-kickoff-title">Veldspelers ({LINEUP_MIN} per ploeg)</div>
            <div className="sk-kickoff-sub">
              Kies wie op het veld staat. De overige spelers zijn wissels en kunnen niet
              geselecteerd worden bij een worp — breng ze tijdens het spel in via ⇄ Wissel.
            </div>
            <div className="sk-lineup-grid">
              {(['home', 'away'] as const).map((side) => {
                const teamId = side === 'home' ? state.teams.home.id : state.teams.away.id
                const teamName = side === 'home' ? state.teams.home.name : state.teams.away.name
                const teamRoster = roster.filter((p) => p.teamId === teamId)
                const field = teamRoster.filter((p) => state.lineup[side].includes(p.id))
                const bench = teamRoster.filter((p) => !state.lineup[side].includes(p.id))
                const canPick = teamRoster.length > LINEUP_MIN
                const captainId = state.captain[side]
                // Op een analyse-opname is er geen wedstrijdblad en geen §6.6-toewijzing van een
                // eigen doelpunt: dan is de kapitein niet van toepassing en houdt hij niets tegen.
                const captainOk = isAnalyseOnly || (captainId != null && field.some((p) => p.id === captainId))
                return (
                  <div key={side} className={`sk-lineup-col ${side}`}>
                    <h4>{teamName}</h4>
                    <div className="sk-lineup-list">
                      <span className="sk-lineup-lbl">veld</span>
                      {field.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          className={`sk-lineup-chip on ${captainId === p.id ? 'captain' : ''}`}
                          disabled={busy || lineupConfirmed[side] || isAnalyseOnly}
                          onClick={() => { if (!isAnalyseOnly) pickCaptain(side, p.id) }}
                          title={isAnalyseOnly ? undefined : captainId === p.id ? 'Kapitein' : 'Tik aan om kapitein te maken'}
                        >
                          {captainId === p.id && <span className="sk-cap-badge" aria-hidden>👑</span>}
                          <span className="num">{p.shirtNumber}</span>
                          <span className="nm">{firstName(p.name)}</span>
                        </button>
                      ))}
                      {field.length === 0 && <span className="sk-dim">nog niemand</span>}
                    </div>
                    {field.length > 0 && !lineupConfirmed[side] && !isAnalyseOnly && (
                      <div className={`sk-cap-status ${captainOk ? 'ok' : 'todo'}`}>
                        {captainOk ? (
                          <>
                            <span aria-hidden>👑</span> Kapitein:{' '}
                            <strong>{firstName(field.find((p) => p.id === captainId)?.name ?? '')}</strong>
                            <span className="sk-cap-change"> — tik een ander aan om te wijzigen</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden>👑</span> Kies de kapitein:{' '}
                            <strong>tik een veldspeler aan</strong>
                          </>
                        )}
                      </div>
                    )}
                    {bench.length > 0 && (
                      <div className="sk-lineup-list">
                        <span className="sk-lineup-lbl">wissel</span>
                        {bench.map((p) => (
                          <span key={p.id} className="sk-lineup-chip">
                            <span className="num">{p.shirtNumber}</span>
                            <span className="nm">{firstName(p.name)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="sk-lineup-actions">
                      {canPick && !lineupConfirmed[side] && (
                        <button type="button" className="sk-btn" disabled={busy} onClick={() => openLineup(side)}>
                          Veldspelers kiezen
                        </button>
                      )}
                      {lineupConfirmed[side] ? (
                        <button type="button" className="sk-btn sk-lineup-ok" disabled={busy} onClick={() => setConfirm(side, false)}>
                          ✓ Bevestigd — wijzig
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="sk-btn primary"
                            disabled={busy || field.length !== LINEUP_MIN || !captainOk}
                            onClick={() => void confirmLineup(side)}
                          >
                            Bevestig opstelling
                          </button>
                        </>
                      )}
                    </div>
                    {!lineupConfirmed[side] && (
                      <div className="sk-addplayer">
                        {addSide === side ? (
                          <form
                            className="sk-addplayer-form"
                            onSubmit={(e) => {
                              e.preventDefault()
                              void submitAddPlayer(side)
                            }}
                          >
                            <input
                              className="sk-addp-num"
                              inputMode="numeric"
                              placeholder="nr"
                              value={addNum}
                              onChange={(e) => setAddNum(e.target.value.replace(/[^0-9]/g, ''))}
                              aria-label="Rugnummer"
                            />
                            <input
                              className="sk-addp-name"
                              placeholder="naam"
                              value={addName}
                              onChange={(e) => setAddName(e.target.value)}
                              aria-label="Naam"
                            />
                            {needsPosition && (
                              <select
                                className="sk-addp-pos"
                                value={addPos}
                                onChange={(e) => setAddPos(e.target.value)}
                                aria-label="Positie"
                              >
                                <option value="">— positie —</option>
                                {positionOptions.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            )}
                            <button type="submit" className="sk-btn primary" disabled={addBusy || !addName.trim() || !addNum.trim() || (needsPosition && !addPos)}>
                              Toevoegen
                            </button>
                            <button type="button" className="sk-btn" disabled={addBusy} onClick={() => setAddSide(null)} aria-label="Annuleren">
                              ✕
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="sk-addp-toggle"
                            disabled={busy}
                            onClick={() => {
                              setAddSide(side)
                              setAddNum('')
                              setAddName('')
                              setAddPos('')
                            }}
                          >
                            + speler toevoegen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          )}

          {bothConfirmed && (
            <div className="sk-kickoff-card">
              <div className="sk-kickoff-title">{bypass ? 'Test-modus 🔧' : isDemo ? 'Demo — klaar 🎓' : 'Klaar om te starten ✓'}</div>
              <div className="sk-kickoff-sub">
                {isAnalyseOnly
                  ? 'Tik de ploeg die opzet — dan begint het aantekenen meteen.'
                  : 'Beide opstellingen zijn bevestigd. Tik op de timer bovenaan om te kiezen wie opzet, daarna is de timer vrij en kan je starten wanneer je wil.'}
              </div>
              {/* Laatste materiaalcontrole vóór de aftrap: het reglement (§3) schrijft het balgewicht
                  voor per categorie en geslacht — handig net wanneer de bal op het veld komt. */}
              <div className="sk-kickoff-bal">
                🏐 Voorgeschreven bal: <strong>{balgewichtLabel(state.match.category, state.match.reeks)}</strong>
              </div>
              {isAnalyseOnly ? (
                <div className="sk-kickoff-teams">
                  {(['home', 'away'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={`sk-kickoff-team ${side}`}
                      disabled={busy}
                      onClick={() => chooseKickoff(side === 'home' ? state.teams.home.id : state.teams.away.id)}
                    >
                      {side === 'home' ? state.teams.home.name : state.teams.away.name}
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className="sk-kickoff-start" disabled={busy} onClick={() => setKickoffOpen(true)}>
                  Kies wie opzet
                </button>
              )}
              <button type="button" className="sk-btn sk-kickoff-edit" disabled={busy} onClick={() => setLineupConfirmed({ home: false, away: false })}>
                ✏️ Opstelling aanpassen
              </button>
            </div>
          )}
        </div>
      ) : isFinished ? (
        <div className="sk-kickoff">
          <div className="sk-kickoff-card sk-deelname-card">
            <div className="sk-kickoff-title">{isAnalyseOnly ? 'Opgeslagen ✓' : 'Wie heeft gespeeld?'}</div>
            <div className="sk-kickoff-sub">
              {isAnalyseOnly
                ? 'Elke worp is bewaard terwijl je aantekende — er valt niets meer op te slaan. Bekijk de analyse of ga terug naar het overzicht.'
                : 'Duid per ploeg aan wie effectief deelnam. Dit komt op het wedstrijdblad (O-markering).'}
            </div>
            {!isAnalyseOnly && (
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
            )}
            {!isAnalyseOnly && deelnameMsg && <p className={`sk-deelname-msg ${deelnameSaved ? 'ok' : ''}`}>{deelnameMsg}</p>}
            <div className="sk-modal-btns">
              {isAnalyseOnly ? (
                <>
                  <Link className="sk-btn primary" href={`/analyse/${matchId}`}>📊 Naar de analyse</Link>
                  <Link className="sk-btn" href="/analyse">← Alle analyses</Link>
                </>
              ) : (
                <>
                  <button type="button" className="sk-btn primary" disabled={busy} onClick={saveDeelname}>
                    Deelname bewaren
                  </button>
                  <a className="sk-btn" href={`/aftekenen/${matchId}`}>Naar aftekenen →</a>
                </>
              )}
            </div>
            {/* Te vroeg op "Einde" gedrukt? Hier ga je gewoon verder waar je stond. */}
            <button
              type="button"
              className="sk-heropen"
              disabled={busy}
              onClick={() =>
                setBevestig({
                  titel: 'Wedstrijd heropenen?',
                  tekst:
                    'De wedstrijd gaat terug live en je kan verder aantekenen. De score, de worpen en de kruisjes blijven allemaal staan; de klok blijft stil tot je ze zelf weer start.',
                  knop: '🔓 Ja, heropenen',
                  doe: () => act({ action: 'reopen' }),
                })
              }
            >
              🔓 Toch nog niet gedaan? Wedstrijd heropenen
            </button>
          </div>
        </div>
      ) : atHalfTime && !vrijeWorpNaRust ? (
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
          {vrijeWorpNaRust && (
            <div className="sk-halftime-vw" role="status">
              ⏸ Rust — nog één vrije worp te nemen (toegekend vóór het signaal). Registreer ze;
              daarna verschijnt het rustscherm.
            </div>
          )}
          <div className="sk-arena">
            <SideRail side="home" arrow={homeArrow} />
            <div className="sk-field-wrap">
              <FieldSchema
                className="sk-field"
                onTap={onTap}
                markers={fieldMarkers}
                guideY={showWerp && werpPoint ? werpPoint.y : undefined}
                ends={fieldEnds}
                goalAreaDepthM={state.match.goalAreaDepth}
                speelveldM={state.match.veldSpeelveld ?? undefined}
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
