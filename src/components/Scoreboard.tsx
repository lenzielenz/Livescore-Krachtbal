'use client'

import { useEffect, useRef, useState } from 'react'

import type { MatchState, TimelineItem } from '@/lib/match-engine'
import type { KrachtbalKleur } from '@/lib/reeksen'
import { ClubColorBlast } from '@/components/ClubColorBlast'
import { KrachtbalIcon } from '@/components/KrachtbalIcon'
import { MomentumChart } from '@/app/(frontend)/analyse/[id]/MomentumChart'
import { BulletTime } from '@/components/BulletTime'
import { LightShow } from '@/components/LightShow'
import { PhotoTribune, type Instant } from '@/components/PhotoTribune'
import { TeamLogo } from '@/components/TeamLogo'
import { WinProbability } from '@/components/WinProbability'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark } from '@/lib/club-colors'
import { goalPointsFromLabel, goalScorerFromLabel, useLiveStream, useViewerId } from '@/lib/use-live-stream'
import { isTribuneOpen, TRIBUNE_GRACE_MS } from '@/lib/tribune'
import './scoreboard.css'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Side = 'home' | 'away'

type Goal = { key: number; side: Side; team: string; points: number; scorer: string | null }
type Shout = { id: number; name: string; text: string; at: number }
// Eén "deeltje" van een emoji-uitbarsting: start (ox/oy) op de ingedrukte knop, spat dan uiteen
// (tx/ty) en dwarrelt al draaiend omhoog. Eigen schaal/duur per deeltje voor een levendige zwerm.
type FloatItem = {
  key: number
  name: EmojiName
  ox: number
  oy: number
  tx: number
  ty: number
  rot: number
  sc: number
  dur: number
  delay: number
  big: boolean
}
const rnd = (min: number, max: number) => min + Math.random() * (max - min)

// Toegelaten supporter-emoji's (komt overeen met de server-whitelist in match-channel.ts).
// 'rocket' = de speciale "rugworp (2 punten)"-reactie die een fullscreen-viering afvuurt.
const EMOJI = { clap: '👏', fire: '🔥', heart: '❤️', goal: '🏐', wow: '😮', rocket: '🚀' } as const
type EmojiName = keyof typeof EMOJI
// "goal" toont het echte krachtbal-icoon i.p.v. een voetbal/emoji, in de categoriekleur van de
// wedstrijd (dames rood, heren wit, U12/U14 geel, U16/U18 blauw).
const reactionGlyph = (name: EmojiName, kleur: KrachtbalKleur) =>
  name === 'goal' ? <KrachtbalIcon size="1.25em" kleur={kleur} style={{ verticalAlign: '-0.18em' }} /> : EMOJI[name]

export function Scoreboard({
  matchId,
  initial,
  halfSeconds,
  ratePerMin,
  ballKleur = 'wit',
  canChat = false,
  initialReactions,
  initialShouts,
  canPostInstant = false,
  initialInstants,
  momentumGoals,
  momentumTimeouts,
  myClubPrimary = null,
}: {
  matchId: number
  initial: { state: MatchState; timeline: TimelineItem[] }
  /** Helftduur (sec), afgeleid uit de reeks — voor de live winstkans. */
  halfSeconds: number
  /** Verwachte punten/ploeg/min — voor de live winstkans. */
  ratePerMin: number
  /** Categoriekleur van de krachtbal (dames rood, heren wit, U12/U14 geel, U16/U18 blauw). */
  ballKleur?: KrachtbalKleur
  /** Mag de bezoeker live shoutouts plaatsen? (enkel ingelogd) */
  canChat?: boolean
  /** Reeds bewaarde emoji-tellers (server-side), zodat ze meteen zichtbaar zijn voor iedereen. */
  initialReactions?: Record<string, number>
  /** Reeds bewaarde shoutouts (server-side), zodat de tribune meteen gevuld is voor iedereen. */
  initialShouts?: Shout[]
  /** Mag de bezoeker een foto in de tribune plaatsen? (ingelogd + volwassen reeks + tribune open) */
  canPostInstant?: boolean
  /** Reeds geplaatste, niet-verlopen foto's bij deze wedstrijd. */
  initialInstants?: Instant[]
  /** Doelpunten (op volgorde) voor het scoreverloop onder het scorebord (na afloop). */
  momentumGoals?: { side: 'home' | 'away'; points: number; half: number; gameClock?: number }[]
  /** Time-outs voor het scoreverloop. */
  momentumTimeouts?: { side: 'home' | 'away'; half: number; gameClock: number }[]
  /** Clubkleur van de ingelogde supporter (voor de lichtshow: elk toestel kleurt in zijn eigen club). */
  myClubPrimary?: string | null
}) {
  const [state, setState] = useState<MatchState>(initial.state)
  const [timeline, setTimeline] = useState<TimelineItem[]>(initial.timeline)
  const [clock, setClock] = useState(initial.state.match.clockSeconds)
  const [goal, setGoal] = useState<Goal | null>(null)
  const base = useRef({ seconds: initial.state.match.clockSeconds, running: initial.state.match.clockRunning, at: Date.now() })
  // Reeds geziene doelpunt-events (op stabiel timeline-id), zodat de viering NIET op een numerieke
  // score-diff steunt (die mist gelijktijdige doelpunten en mis-attribueert na een catch-up tick).
  const seenGoals = useRef<Set<string>>(new Set(initial.timeline.filter((i) => i.kind === 'goal').map((i) => i.id)))
  const goalSeq = useRef(0)
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Supporter-engagement: live kijkersaantal + zwevende emoji-reacties + zichtbare tellers.
  const [viewers, setViewers] = useState(0)
  const [floats, setFloats] = useState<FloatItem[]>([])
  const floatSeq = useRef(0)
  const sbRef = useRef<HTMLDivElement>(null)
  // Start met de reeds bewaarde tellers/shoutouts (server-side), zodat iedereen — ook
  // niet-ingelogde bezoekers — ze meteen ziet, zonder op de SSE-stream te wachten.
  const [totals, setTotals] = useState<Record<string, number>>(initialReactions ?? {})
  // Fullscreen "rugworp +2"-viering (raket): key = nieuwe trigger, throttle tegen spam.
  const [celebrate, setCelebrate] = useState<number | null>(null)
  const celebrateSeq = useRef(0)
  const lastCelebrate = useRef(0)
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerCelebrate = (force = false) => {
    const now = Date.now()
    if (!force && now - lastCelebrate.current < 2500) return // throttle bij een raket-storm
    lastCelebrate.current = now
    const key = ++celebrateSeq.current
    setCelebrate(key)
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current)
    celebrateTimer.current = setTimeout(() => setCelebrate((c) => (c === key ? null : c)), 1800)
  }
  // Clubkleuren-viering: per ploeg "ladingen" die je verdient (ontgrendelt) en kan afvuren — een
  // fullscreen rook/vuurwerk-explosie in de clubkleuren. Ontgrendelt bij elke rugworp én bij elke
  // 5 doelpunten. We tellen vanaf de HUIDIGE stand: open je een wedstrijd die al op 5 (of 10, …)
  // staat, dan staat de viering meteen klaar — en elke volgende mijlpaal voegt er één toe.
  const [charges, setCharges] = useState<{ home: number; away: number }>({
    home: Math.floor((initial.state.score.home ?? 0) / 5),
    away: Math.floor((initial.state.score.away ?? 0) / 5),
  })
  const awardedMilestone = useRef<{ home: number; away: number }>({
    home: Math.floor((initial.state.score.home ?? 0) / 5),
    away: Math.floor((initial.state.score.away ?? 0) / 5),
  })
  const [blast, setBlast] = useState<{ key: number; colors: { primary: string; secondary: string }; name: string } | null>(null)
  const blastSeq = useRef(0)
  const blastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBlast = useRef(0)
  const colorsFor = (side: Side): { primary: string; secondary: string } => {
    const c = state.teams[side].colors
    const fallback = side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
    return c ?? { primary: fallback, secondary: fallback }
  }
  // Toon de fullscreen clubkleuren-viering (lokaal of via de stream van een ander scherm),
  // met throttle zodat de eigen optimistische trigger + de echo niet dubbel afgaan.
  const triggerBlast = (side: Side) => {
    const now = Date.now()
    if (now - lastBlast.current < 2500) return
    lastBlast.current = now
    const key = ++blastSeq.current
    setBlast({ key, colors: colorsFor(side), name: state.teams[side].name })
    if (blastTimer.current) clearTimeout(blastTimer.current)
    blastTimer.current = setTimeout(() => setBlast((b) => (b && b.key === key ? null : b)), 2800)
  }
  // Afvuren: verbruik een lading, toon ze meteen lokaal én stuur ze naar ALLE schermen.
  const fireBlast = (side: Side) => {
    if (charges[side] <= 0) return
    setCharges((c) => ({ ...c, [side]: Math.max(0, c[side] - 1) }))
    triggerBlast(side)
    fetch(`/api/match/${matchId}/blast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side }),
    }).catch(() => {})
  }

  // Vluchtige foto-tribune: live foto's + welke ik zelf plaatste (zodat ik die kan verwijderen).
  const [instants, setInstants] = useState<Instant[]>(initialInstants ?? [])
  const [mineIds, setMineIds] = useState<Set<number>>(new Set())
  // Lichtshow / digitale tifo: gedeeld starttijdstip + duur (gesynchroniseerd via het live-kanaal),
  // zodat alle toestellen in de tribune samen één lichtscherm vormen.
  const [lightshow, setLightshow] = useState<{ at: number; dur: number } | null>(null)
  const [lightshowBusy, setLightshowBusy] = useState(false)
  const startLightshow = async () => {
    if (lightshowBusy) return
    setLightshowBusy(true)
    try {
      await fetch(`/api/match/${matchId}/lightshow`, { method: 'POST' })
    } catch {
      /* leuk extraatje, geen kritieke actie */
    }
    setTimeout(() => setLightshowBusy(false), 25_000)
  }
  // Multi-angle "bullet-time": gedeeld starttijdstip; alle toestellen tellen samen af en leggen dan
  // (ieder vanuit zijn eigen hoek) hetzelfde moment vast; de app speelt de hoeken als een sweep af.
  const [bulletAt, setBulletAt] = useState<number | null>(null)
  const [bulletBusy, setBulletBusy] = useState(false)
  const startBulletTime = async () => {
    if (bulletBusy) return
    setBulletBusy(true)
    try {
      await fetch(`/api/match/${matchId}/bullettime`, { method: 'POST' })
    } catch {
      /* leuk extraatje */
    }
    setTimeout(() => setBulletBusy(false), 28_000)
  }
  const addInstantLocal = (i: Instant) => {
    setInstants((prev) => (prev.some((x) => x.id === i.id) ? prev : [i, ...prev].slice(0, 40)))
  }
  const onLocalAdd = (i: Instant) => {
    setMineIds((s) => new Set(s).add(i.id))
    addInstantLocal(i)
  }
  const removeInstantLocal = (id: number) => setInstants((prev) => prev.filter((x) => x.id !== id))

  // Live tribune (shoutouts van ingelogde supporters). Begin met de bewaarde berichten.
  const [shouts, setShouts] = useState<Shout[]>(initialShouts ?? [])
  // "Op de hoogte blijven": zodra je zelf meedeed (reactie of bericht) en er komen nieuwe berichten
  // binnen terwijl je niet onderaan de tribune kijkt, tonen we een belletje met het aantal nieuwe.
  const engagedRef = useRef(false)
  const atBottomRef = useRef(true)
  const [unread, setUnread] = useState(0)
  const [chatText, setChatText] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)
  // Tijdlijn: wie scoorde is standaard verborgen; je onthult het per doelpunt door erop te tikken.
  const [revealedScorers, setRevealedScorers] = useState<Set<string>>(new Set())
  const toggleScorer = (id: string) =>
    setRevealedScorers((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const chatFeedRef = useRef<HTMLDivElement>(null)

  // Eén uitbarsting: deeltjes spatten vanuit (ox,oy) in alle richtingen uiteen en dwarrelen omhoog.
  const burst = (name: EmojiName, ox: number, oy: number, count: number) => {
    if (!(name in EMOJI)) return
    const isRocket = name === 'rocket'
    const next: FloatItem[] = []
    for (let i = 0; i < count; i++) {
      const ang = rnd(0, Math.PI * 2)
      // Ingetogen: kleinere spreiding en schaal, zodat het verzorgd oogt i.p.v. een explosie.
      const dist = rnd(35, isRocket ? 130 : 100)
      next.push({
        key: ++floatSeq.current,
        name,
        ox,
        oy,
        tx: Math.cos(ang) * dist,
        ty: Math.sin(ang) * dist - rnd(40, 110), // zachte opwaartse drift
        rot: rnd(-120, 120),
        sc: isRocket ? rnd(0.95, 1.3) : rnd(0.7, 1.05),
        dur: isRocket ? rnd(1.8, 2.4) : rnd(1.6, 2.2),
        delay: rnd(0, 0.12),
        big: isRocket,
      })
    }
    setFloats((prev) => [...prev.slice(-70), ...next])
    const keys = new Set(next.map((f) => f.key))
    setTimeout(() => setFloats((prev) => prev.filter((f) => !keys.has(f.key))), 3000)
  }

  // Inkomende reacties (van anderen): laat ze opborrelen nabij de reactiebalk.
  const spawnFloats = (counts: Record<string, number>) => {
    const rect = sbRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 360
    const h = rect?.height ?? 600
    for (const [name, n] of Object.entries(counts)) {
      if (!(name in EMOJI)) continue
      const isRocket = name === 'rocket'
      const count = Math.min(n, isRocket ? 6 : 4)
      burst(name as EmojiName, w / 2 + rnd(-w * 0.32, w * 0.32), h - rnd(70, 150), count)
    }
  }

  // Per-browser kijker-id zodat het oogje personen telt (één persoon = één kijker).
  const viewerId = useViewerId()
  const { connected } = useLiveStream<{ state: MatchState; timeline: TimelineItem[] }>(
    `/api/match/${matchId}/stream${viewerId ? `?v=${viewerId}` : ''}`,
    (data) => {
      // Nieuwe doelpunten = timeline-items 'goal' met een id dat we nog niet zagen.
      const fresh = data.timeline.filter((i) => i.kind === 'goal' && !seenGoals.current.has(i.id))
      fresh.forEach((i) => seenGoals.current.add(i.id))

      setState(data.state)
      setTimeline(data.timeline)

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
        goalTimer.current = setTimeout(() => setGoal(null), 5000)
      }

      // Clubkleuren-viering ontgrendelen: +1 lading per nieuwe rugworp (2 ptn) én per nieuwe
      // 5-doelpunten-mijlpaal van een ploeg.
      const add = { home: 0, away: 0 }
      for (const g of fresh) {
        if (g.side && goalPointsFromLabel(g.label) === 2) add[g.side] += 1
      }
      for (const side of ['home', 'away'] as const) {
        const ms = Math.floor((data.state.score[side] ?? 0) / 5)
        if (ms > awardedMilestone.current[side]) {
          add[side] += ms - awardedMilestone.current[side]
          awardedMilestone.current[side] = ms
        }
      }
      if (add.home || add.away) setCharges((c) => ({ home: c.home + add.home, away: c.away + add.away }))
    },
    {
      viewers: (d) => setViewers((d as { count?: number }).count ?? 0),
      reactions: (d) => {
        const r = d as { delta?: Record<string, number>; totals?: Record<string, number> }
        if (r.delta) spawnFloats(r.delta)
        if (r.delta?.rocket) triggerCelebrate() // iemand vuurde een rugworp af → fullscreen-viering
        if (r.totals) setTotals(r.totals)
      },
      shoutout: (d) => {
        setShouts((prev) => [...prev.slice(-79), d as Shout])
        // Nieuw bericht terwijl je meedeed maar niet onderaan kijkt → tel het als ongelezen.
        if (engagedRef.current && !atBottomRef.current) setUnread((n) => n + 1)
      },
      shoutouts: (d) => setShouts(d as Shout[]),
      instant: (d) => addInstantLocal(d as Instant),
      instant_removed: (d) => removeInstantLocal((d as { id: number }).id),
      blast: (d) => {
        const side = (d as { side?: string }).side
        if (side === 'home' || side === 'away') triggerBlast(side)
      },
      lightshow: (d) => {
        const at = Number((d as { at?: unknown }).at)
        const dur = Number((d as { dur?: unknown }).dur) || 22_000
        if (Number.isFinite(at)) setLightshow({ at, dur })
      },
      bullettime: (d) => {
        const at = Number((d as { at?: unknown }).at)
        if (Number.isFinite(at)) setBulletAt(at)
      },
    },
  )

  // Eigen tikken gebatcht versturen (client-throttle ~300ms) zodat één supporter de server niet spamt.
  const pendingReacts = useRef<Record<string, number>>({})
  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendReaction = (name: keyof typeof EMOJI, ev?: React.MouseEvent<HTMLButtonElement>) => {
    // Reageren kan enkel ingelogd (net als de tribune). Niet ingelogd → toon de login-hint.
    if (!canChat) {
      setNeedLogin(true)
      return
    }
    engagedRef.current = true // je deed mee → voortaan op de hoogte van nieuwe tribune-berichten
    // Eigen tik = een uitbarsting vanaf de ingedrukte knop (raket = grotere zwerm).
    const sbRect = sbRef.current?.getBoundingClientRect()
    let ox = (sbRect?.width ?? 360) / 2
    let oy = (sbRect?.height ?? 600) - 90
    if (ev && sbRect) {
      const b = ev.currentTarget.getBoundingClientRect()
      ox = b.left + b.width / 2 - sbRect.left
      oy = b.top + b.height / 2 - sbRect.top
    }
    burst(name, ox, oy, name === 'rocket' ? 8 : 6)
    if (name === 'rocket') triggerCelebrate(true) // eigen tik → meteen de strakke rugworp-melding
    pendingReacts.current[name] = (pendingReacts.current[name] ?? 0) + 1
    if (reactTimer.current) return
    reactTimer.current = setTimeout(() => {
      const batch = pendingReacts.current
      pendingReacts.current = {}
      reactTimer.current = null
      for (const [emoji, count] of Object.entries(batch)) {
        fetch(`/api/match/${matchId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji, count }),
        }).catch(() => {})
      }
    }, 350)
  }

  const sendShout = async () => {
    const text = chatText.replace(/\s+/g, ' ').trim()
    if (!text || chatBusy) return
    setChatBusy(true)
    try {
      const res = await fetch(`/api/match/${matchId}/shoutout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        setChatText('') // het eigen bericht komt via de stream terug in de feed
        engagedRef.current = true // je deed mee → voortaan op de hoogte van nieuwe berichten
      }
    } catch {
      /* stil falen — de gebruiker kan opnieuw proberen */
    } finally {
      setChatBusy(false)
    }
  }

  useEffect(() => {
    return () => {
      if (goalTimer.current) clearTimeout(goalTimer.current)
      if (reactTimer.current) clearTimeout(reactTimer.current)
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current)
      if (blastTimer.current) clearTimeout(blastTimer.current)
    }
  }, [])

  // Tribune-feed naar het nieuwste bericht scrollen — enkel als je al onderaan meevolgt, zodat we
  // je niet wegtrekken terwijl je terugleest. Volg je mee, dan is er per definitie niets ongelezen.
  useEffect(() => {
    const el = chatFeedRef.current
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight
      setUnread(0)
    }
  }, [shouts])
  // Bijhouden of je onderaan de feed kijkt; kom je onderaan, dan vervalt het "nieuw"-belletje.
  const onFeedScroll = () => {
    const el = chatFeedRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    atBottomRef.current = atBottom
    if (atBottom) setUnread(0)
  }
  const jumpToNewest = () => {
    const el = chatFeedRef.current
    if (el) el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setUnread(0)
  }

  // Klok-basis bijwerken bij elke state-update — reken vanaf clockUpdatedAt (server), zodat de tijd
  // klopt voor wie later instapt en NIET telkens terug naar 0 "reset".
  useEffect(() => {
    const m = state.match
    const at = m.clockUpdatedAt ? new Date(m.clockUpdatedAt).getTime() : Date.now()
    base.current = { seconds: m.clockSeconds, running: m.clockRunning, at }
    setClock(m.clockRunning ? m.clockSeconds + Math.max(0, (Date.now() - at) / 1000) : m.clockSeconds)
  }, [state.match.clockSeconds, state.match.clockRunning, state.match.clockUpdatedAt])

  useEffect(() => {
    if (!state.match.clockRunning) return
    const t = setInterval(() => {
      const b = base.current
      setClock(b.seconds + Math.max(0, (Date.now() - b.at) / 1000))
    }, 250)
    return () => clearInterval(t)
  }, [state.match.clockRunning, state.match.clockUpdatedAt])

  const statusLabel =
    state.match.status === 'live' ? 'LIVE' : state.match.status === 'finished' ? 'AFGELOPEN' : 'GEPLAND'

  // De tribune (reacties + shoutouts) staat open tijdens de wedstrijd en nog tot 1u erna.
  // Een tikje state zorgt dat ze vanzelf sluit op het einde van dat venster, zonder refresh.
  const [, forceTribuneTick] = useState(0)
  const tribuneOpen = isTribuneOpen(state.match.status, state.match.finishedAt)
  const tribuneClosingSoon = state.match.status === 'finished' && tribuneOpen
  useEffect(() => {
    if (state.match.status !== 'finished' || !state.match.finishedAt) return
    const remaining = new Date(state.match.finishedAt).getTime() + TRIBUNE_GRACE_MS - Date.now()
    if (remaining <= 0) return
    const t = setTimeout(() => forceTribuneTick((n) => n + 1), remaining + 500)
    return () => clearTimeout(t)
  }, [state.match.status, state.match.finishedAt])

  // Speelduur-melding: tot waar de klok van deze helft loopt (de klok telt op tot `halfSeconds`)
  // + hoeveel minuten er in totaal gevraagd zijn (time-outs van beide ploegen + SR-minuten), want
  // die pauzeren de klok en rekken de échte speeltijd op.
  // Gevraagde extra minuten in DEZE helft (time-outs van beide ploegen + SR-minuten). We spreken
  // steeds over één helft. De helftduur volgt het reglement per leeftijd (reeksHalfDurationSeconds:
  // U12/U14/U16 = 20 min, U18/landelijk/nationaal = 25 min).
  const requestedMin = state.timeouts.home + state.timeouts.away + state.refereeStops
  const halfMin = Math.round(halfSeconds / 60)
  // Tot welke minuut deze helft loopt als er minuten bijkomen (anders zeggen we niets).
  const playsUntilMin = halfMin + requestedMin

  // Accenten in de clubkleuren (ringen, tijdlijn, doelpunt-gloed). Valt terug op groen/blauw.
  // De rauwe kleur dient voor de ring/logo; voor TEKST/cijfers op het donkere paneel klemmen we
  // naar een leesbare variant zodat donkere crests de naam/score niet onzichtbaar maken (AUDIT §1).
  const homeColor = state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR
  const awayColor = state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR
  const homeInk = readableOnDark(homeColor)
  const awayInk = readableOnDark(awayColor)
  // "Krachtmeting": de kleur van de leidende ploeg verovert steeds meer van het scherm.
  // 0.5 bij gelijke stand; ~6% per puntverschil, geklemd zodat beide kleuren zichtbaar blijven.
  const diff = state.score.home - state.score.away
  const homeShare = Math.max(0.16, Math.min(0.84, 0.5 + diff * 0.06))
  const sbStyle = {
    '--home': homeInk,
    '--away': awayInk,
    '--home-ink': inkOn(homeColor),
    '--away-ink': inkOn(awayColor),
    '--home-share': homeShare,
  } as React.CSSProperties

  return (
    <div className="sb" style={sbStyle} ref={sbRef}>
      {/* Levende clubkleuren-arena: beide ploegkleuren strijden; de leider verovert meer terrein. */}
      <div className="sb-arena" aria-hidden>
        <div className="sb-arena-grad" />
        <div className="sb-arena-blob home" />
        <div className="sb-arena-blob away" />
        <div className="sb-arena-sheen" />
      </div>
      <div className="sb-status">
        <span className={`sb-badge ${state.match.status}`}>{statusLabel}</span>
        {state.match.status === 'live' &&
          (connected ? (
            <span className="sb-conn on">● live</span>
          ) : (
            <span className="sb-conn off" title="Verbinding verbroken — opnieuw verbinden…">● verbinden…</span>
          ))}
        {state.match.status === 'live' && viewers > 0 && (
          <span className="sb-viewers" title="Kijkers nu">
            👁 {viewers}
          </span>
        )}
      </div>

      <div className="sb-main">
        <div className={`sb-side-team ${goal?.side === 'home' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" size="lg" float medallion ringColor={state.teams.home.colors?.primary} />
          <div className="sb-name">{state.teams.home.name}</div>
          <div className="sb-teamstats home">
            <span title="Kruisjes">✖ {state.crosses.home}</span>
            <span title="Time-outs">⏱ {state.timeouts.home}</span>
          </div>
        </div>
        <div className="sb-scorebox">
          <div className="sb-score">
            <span className={goal?.side === 'home' ? 'sb-pulse' : ''}>{state.score.home}</span>
            <span className="sb-dash">–</span>
            <span className={goal?.side === 'away' ? 'sb-pulse' : ''}>{state.score.away}</span>
          </div>
          <div className={`sb-clock ${state.match.status === 'finished' ? 'done' : ''}`}>{fmtClock(clock)}</div>
          {state.match.status === 'finished' ? (
            <div className="sb-final">Afgelopen · eindstand</div>
          ) : (
            <>
              <div className="sb-half">Helft {state.match.currentHalf}</div>
              {/* Enkel iets tonen als er minuten bijkomen: dan loopt deze helft tot een latere minuut. */}
              {requestedMin > 0 && (
                <div className="sb-playto" title="Time-outs en SR-minuten rekken deze helft op: ze speelt tot deze minuut.">
                  speelt tot minuut {playsUntilMin}
                </div>
              )}
            </>
          )}
          {state.refereeStops > 0 && (
            <div className="sb-refmin" title="Time-outs scheidsrechter">🧑‍⚖️ ⏱ {state.refereeStops}</div>
          )}
        </div>
        <div className={`sb-side-team ${goal?.side === 'away' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" size="lg" float medallion ringColor={state.teams.away.colors?.primary} />
          <div className="sb-name">{state.teams.away.name}</div>
          <div className="sb-teamstats away">
            <span title="Kruisjes">✖ {state.crosses.away}</span>
            <span title="Time-outs">⏱ {state.timeouts.away}</span>
          </div>
        </div>
      </div>

      {/* Scoreverloop (momentum) vlak onder het scorebord — verschijnt zodra er doelpunten zijn
          (na afloop). Verbergt zichzelf bij geen doelpunten. */}
      {momentumGoals && momentumGoals.length > 0 && (
        <MomentumChart
          goals={momentumGoals}
          timeouts={momentumTimeouts}
          teams={{ home: state.teams.home.name, away: state.teams.away.name }}
          colors={{ home: state.teams.home.colors?.primary ?? null, away: state.teams.away.colors?.primary ?? null }}
        />
      )}

      {/* Uitgelogd zie je enkel de score en de tijd. Al de rest (tijdlijn, reacties, vieringen,
          tribune) zit achter login — met een korte uitnodiging. */}
      {!canChat ? (
        <p className="sb-loginmore">
          <a href="/inloggen">Log in</a> voor de tijdlijn, reacties, vieringen en de live tribune.
        </p>
      ) : (
      <>
      {goal && (
        <div key={goal.key} className={`sb-goal side-${goal.side}`}>
          <div className="sb-goal-card">
            <div className="sb-goal-title">DOELPUNT!</div>
            <div className="sb-goal-team">{goal.team}</div>
            {goal.scorer && <div className="sb-goal-scorer">{goal.scorer}</div>}
            <div className="sb-goal-pts">{goal.points === 2 ? 'Rugworp +2' : 'Nekworp +1'}</div>
          </div>
        </div>
      )}

      <WinProbability
        score={state.score}
        currentHalf={state.match.currentHalf}
        clockSeconds={clock}
        halfSeconds={halfSeconds}
        ratePerMin={ratePerMin}
        status={state.match.status}
        homeColor={homeInk}
        awayColor={awayInk}
        timeline={timeline}
      />


      <div className="sb-timeline">
        <h3>Tijdlijn</h3>
        {timeline.length === 0 && <p className="sb-dim">Nog geen gebeurtenissen.</p>}
        <ul>
          {(() => {
            // Kort & krachtig: enkel doelpunten (en kruisjes) als compacte chips in meerdere
            // kolommen — met een "Xe helft"-scheiding zodra een nieuwe helft begint, zodat een
            // lange stand (richting 25-25) overzichtelijk blijft i.p.v. eindeloos lang.
            const out: React.ReactNode[] = []
            let lastHalf = 0
            const divider = (half: number) => (
              <li key={`half-${half}`} className="sb-tl-half">
                {half === 1 ? '1e helft' : half === 2 ? '2e helft' : `${half}e helft`}
              </li>
            )
            for (const item of timeline) {
              if (item.kind === 'half_start') {
                if (item.half > lastHalf) { lastHalf = item.half; out.push(divider(item.half)) }
                continue
              }
              if (item.kind !== 'goal' && item.kind !== 'cross') continue // time-out/sr enz. weglaten
              if (item.half > lastHalf) { lastHalf = item.half; out.push(divider(item.half)) }
              const team = item.side ? state.teams[item.side] : null
              const min = Math.floor((item.gameClock ?? 0) / 60)
              const isGoal = item.kind === 'goal'
              const points = isGoal ? goalPointsFromLabel(item.label) : 0
              const scorer = isGoal ? goalScorerFromLabel(item.label) : null
              const open = revealedScorers.has(item.id)
              out.push(
                <li
                  key={item.id}
                  className={`sb-tl sb-tl-${item.kind} ${item.side ? `side-${item.side}` : ''} ${isGoal ? 'sb-tl-clickable' : ''} ${open ? 'open' : ''}`}
                  onClick={isGoal ? () => toggleScorer(item.id) : undefined}
                  role={isGoal ? 'button' : undefined}
                  tabIndex={isGoal ? 0 : undefined}
                  onKeyDown={
                    isGoal
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleScorer(item.id)
                          }
                        }
                      : undefined
                  }
                  title={isGoal ? 'Tik om te zien wie scoorde' : undefined}
                >
                  <span className="sb-tl-min">{min}&apos;</span>
                  {team ? (
                    <TeamLogo name={team.name} logoUrl={team.logoUrl} logoFit={team.logoFit} side={item.side ?? undefined} size={22} ringColor={team.colors?.primary} />
                  ) : (
                    <span className="sb-tl-logo-ph" aria-hidden />
                  )}
                  {isGoal ? (
                    <span className={`sb-tl-pts ${points === 2 ? 'rug' : 'nek'}`}>+{points}</span>
                  ) : (
                    <span className="sb-tl-x" aria-hidden>✖</span>
                  )}
                  {/* Wie scoorde verschijnt pas als je op het doelpunt tikt (en enkel voor ingelogden). */}
                  {isGoal && open && (
                    <span className="sb-tl-scorer">
                      <span className="sb-tl-scorer-ico" aria-hidden>{canChat ? '⚡' : '🔒'}</span>
                      <span className="sb-tl-scorer-name">{canChat ? (scorer ?? 'Onbekend') : 'Log in om te zien'}</span>
                    </span>
                  )}
                  {isGoal && <span className={`sb-tl-rev ${open ? 'open' : ''}`} aria-hidden>›</span>}
                </li>,
              )
            }
            return out
          })()}
        </ul>
      </div>

      {/* Vluchtige foto-tribune (enkel volwassen wedstrijden; verdwijnt na 24u). Verbergt zichzelf
          als er niets te tonen valt en de bezoeker niet mag posten. */}
      <PhotoTribune
        matchId={matchId}
        instants={instants}
        canPost={canPostInstant}
        mineIds={mineIds}
        onLocalAdd={onLocalAdd}
        onLocalRemove={removeInstantLocal}
      />

      {/* Supporter-reacties: zwevende emoji's + een reactiebalk (enkel tijdens een live wedstrijd). */}
      <div className="sb-floats" aria-hidden>
        {floats.map((f) => (
          <span
            key={f.key}
            className={`sb-float${f.big ? ' rocket' : ''}`}
            style={{
              ['--ox' as string]: `${f.ox}px`,
              ['--oy' as string]: `${f.oy}px`,
              ['--tx' as string]: `${f.tx}px`,
              ['--ty' as string]: `${f.ty}px`,
              ['--rot' as string]: `${f.rot}deg`,
              ['--sc' as string]: f.sc,
              ['--dur' as string]: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            }}
          >
            {reactionGlyph(f.name, ballKleur)}
          </span>
        ))}
      </div>
      {tribuneOpen && (
        <>
          <div className={`sb-reactions${canChat ? '' : ' locked'}`}>
            {(Object.keys(EMOJI) as (keyof typeof EMOJI)[]).map((name) => (
              <button
                key={name}
                type="button"
                className={`sb-react-btn${name === 'rocket' ? ' sb-react-rocket' : ''}`}
                onClick={(e) => sendReaction(name, e)}
                aria-label={name === 'rocket' ? 'Vier een rugworp (2 punten)' : `Reageer met ${name}`}
                title={!canChat ? 'Log in om te reageren' : name === 'rocket' ? 'Rugworp! 2 punten 🚀' : undefined}
              >
                {reactionGlyph(name, ballKleur)}
                {totals[name] > 0 && <span className="sb-react-count">{totals[name]}</span>}
              </button>
            ))}
          </div>
          {!canChat && (
            <p className="sb-react-login">
              <a href="/inloggen">Log in</a> om te reageren{needLogin ? ' — gratis account 🎉' : ''}.
            </p>
          )}
        </>
      )}

      {/* Clubkleuren-viering: laad op met elke 5 doelpunten of een rugworp; vuur ze dan af op
          ÁLLE schermen — een fullscreen rook/vuurwerk-explosie in de clubkleuren. */}
      {tribuneOpen && (
        <div className="sb-blast">
          <div className="sb-blast-bar">
            {(['home', 'away'] as const).map((side) => {
              const team = state.teams[side]
              const c = colorsFor(side)
              const armed = charges[side] > 0
              const inCycle = (state.score[side] ?? 0) % 5
              const remaining = 5 - inCycle
              const pct = armed ? 100 : Math.round((inCycle / 5) * 100)
              return (
                <button
                  key={side}
                  type="button"
                  className={`sb-blast-btn ${armed ? 'armed' : 'locked'}`}
                  style={{ ['--bc' as string]: c.primary, ['--bc1' as string]: c.primary, ['--bc2' as string]: c.secondary || c.primary }}
                  onClick={() => fireBlast(side)}
                  disabled={!armed}
                  title={armed ? `Vier ${team.name} op álle schermen!` : 'Laadt op met elke 5 doelpunten of een rugworp'}
                >
                  <span className="sb-blast-top">
                    <span className="sb-blast-dot" aria-hidden />
                    <span className="sb-blast-team">{team.name}</span>
                    <span className="sb-blast-status">
                      {armed ? `🎆 Vier!${charges[side] > 1 ? ` ×${charges[side]}` : ''}` : '🔒'}
                    </span>
                  </span>
                  <span className="sb-blast-meter" aria-hidden>
                    <span className="sb-blast-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="sb-blast-sub">
                    {armed ? 'Klaar! Druk om op alle schermen te vieren' : `nog ${remaining} ${remaining === 1 ? 'doelpunt' : 'doelpunten'}`}
                  </span>
                </button>
              )
            })}
          </div>
          {/* Lichtshow / digitale tifo: één tik roept iedereen op; alle telefoons in de tribune
              vormen samen één gesynchroniseerd lichtscherm. Werkt enkel echt met véél toestellen. */}
          <div className="sb-crowd-acts">
            <button
              type="button"
              className="sb-lightshow-btn"
              onClick={() => void startLightshow()}
              disabled={lightshowBusy}
              title="Start een lichtshow op alle telefoons in de tribune"
            >
              {lightshowBusy ? '💡 Lichtshow loopt…' : '💡 Lichtshow'}
            </button>
            <button
              type="button"
              className="sb-lightshow-btn sb-bullet-btn"
              onClick={() => void startBulletTime()}
              disabled={bulletBusy}
              title="Multi-angle: leg samen hetzelfde moment vast vanuit meerdere hoeken"
            >
              {bulletBusy ? '🎥 Bezig…' : '🎥 Multi-angle'}
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen clubkleuren-explosie (rook + vuurwerk). */}
      {blast && <ClubColorBlast key={blast.key} colors={blast.colors} teamName={blast.name} />}

      {/* Lichtshow: fullscreen gesynchroniseerd lichtscherm over alle toestellen. */}
      {lightshow && (
        <LightShow
          at={lightshow.at}
          durationMs={lightshow.dur}
          mine={myClubPrimary}
          home={colorsFor('home').primary}
          away={colorsFor('away').primary}
          onDone={() => setLightshow(null)}
        />
      )}

      {/* Multi-angle bullet-time: samen aftellen, vastleggen en als sweep afspelen. */}
      {bulletAt && (
        <BulletTime matchId={matchId} at={bulletAt} canCapture={canPostInstant} onDone={() => setBulletAt(null)} />
      )}

      {/* Strakke "rugworp +2"-melding: een verzorgde flits met clean typografie (geen cartoon). */}
      {celebrate != null && (
        <div className="sb-celebrate" key={celebrate} aria-hidden>
          <div className="sb-celebrate-flash" />
          <div className="sb-celebrate-rocket">🚀</div>
          <div className="sb-celebrate-text">
            <span className="sb-celebrate-word">Rugworp</span>
            <span className="sb-celebrate-pts">+2</span>
          </div>
        </div>
      )}

      {/* Live tribune: shoutouts van ingelogde supporters. Open tijdens de wedstrijd en nog tot 1u erna. */}
      {tribuneOpen && (
        <div className="sb-chat">
          <h3 className="sb-chat-title">Live tribune</h3>
          {tribuneClosingSoon && (
            <p className="sb-chat-note">De wedstrijd is afgelopen — de tribune blijft nog tot een uur na de match open.</p>
          )}
          <div className="sb-chat-feed" ref={chatFeedRef} onScroll={onFeedScroll}>
            {shouts.length === 0 ? (
              <p className="sb-dim">Nog stil in de tribune… wees de eerste om je ploeg aan te moedigen!</p>
            ) : (
              shouts.map((s) => (
                <div key={s.id} className="sb-shout">
                  <span className="sb-shout-name">{s.name}</span>
                  <span className="sb-shout-text">{s.text}</span>
                </div>
              ))
            )}
          </div>
          {unread > 0 && (
            <button type="button" className="sb-chat-new" onClick={jumpToNewest}>
              🔔 {unread} nieuwe {unread === 1 ? 'reactie' : 'reacties'} — bekijk
            </button>
          )}
          {canChat ? (
            <form
              className="sb-chat-form"
              onSubmit={(e) => {
                e.preventDefault()
                void sendShout()
              }}
            >
              <input
                className="sb-chat-input"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                maxLength={200}
                placeholder="Moedig je ploeg aan…"
                aria-label="Bericht voor de live tribune"
              />
              <button type="submit" className="sb-chat-send" disabled={chatBusy || !chatText.trim()}>
                Stuur
              </button>
            </form>
          ) : (
            <p className="sb-chat-login">
              <a href="/inloggen">Log in</a> om mee te juichen in de tribune.
            </p>
          )}
        </div>
      )}
      </>
      )}
    </div>
  )
}
