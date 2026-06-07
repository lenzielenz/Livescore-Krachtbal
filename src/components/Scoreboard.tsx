'use client'

import { useEffect, useRef, useState } from 'react'

import type { MatchState, TimelineItem } from '@/lib/match-engine'
import type { KrachtbalKleur } from '@/lib/reeksen'
import { ClubColorBlast } from '@/components/ClubColorBlast'
import { KrachtbalIcon } from '@/components/KrachtbalIcon'
import { TeamLogo } from '@/components/TeamLogo'
import { WinProbability } from '@/components/WinProbability'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark } from '@/lib/club-colors'
import { goalPointsFromLabel, goalScorerFromLabel, useLiveStream } from '@/lib/use-live-stream'
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

function Dots({ filled, total, className }: { filled: number; total: number; className?: string }) {
  return (
    <span className={`sb-dots ${className ?? ''}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`sb-dot ${i < filled ? 'on' : ''}`} />
      ))}
    </span>
  )
}

export function Scoreboard({
  matchId,
  initial,
  halfSeconds,
  ratePerMin,
  ballKleur = 'wit',
  canChat = false,
  initialReactions,
  initialShouts,
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

  // Live tribune (shoutouts van ingelogde supporters). Begin met de bewaarde berichten.
  const [shouts, setShouts] = useState<Shout[]>(initialShouts ?? [])
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

  const { connected } = useLiveStream<{ state: MatchState; timeline: TimelineItem[] }>(
    `/api/match/${matchId}/stream`,
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
      shoutout: (d) => setShouts((prev) => [...prev.slice(-79), d as Shout]),
      shoutouts: (d) => setShouts(d as Shout[]),
      blast: (d) => {
        const side = (d as { side?: string }).side
        if (side === 'home' || side === 'away') triggerBlast(side)
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
      if (res.ok) setChatText('') // het eigen bericht komt via de stream terug in de feed
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

  // Tribune-feed automatisch naar het nieuwste bericht scrollen.
  useEffect(() => {
    const el = chatFeedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [shouts])

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
  const requestedMin = state.timeouts.home + state.timeouts.away + state.refereeStops

  // Geschatte resterende speeltijd, zodat supporters weten hoelang er nog gespeeld wordt: wat rest
  // in deze helft + de nog te spelen helft(en) + de gevraagde extra minuten (time-outs/SR rekken
  // de échte speeltijd op).
  const HALVES = 2
  const halvesLeftAfter = Math.max(0, HALVES - state.match.currentHalf)
  const remainingMin =
    state.match.status === 'live'
      ? Math.max(0, Math.ceil((Math.max(0, halfSeconds - clock) + halvesLeftAfter * halfSeconds + requestedMin * 60) / 60))
      : 0

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
        {viewers > 0 && (
          <span className="sb-viewers" title="Kijkers nu">
            👁 {viewers}
          </span>
        )}
      </div>

      <div className="sb-main">
        <div className={`sb-side-team ${goal?.side === 'home' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" size="lg" float ringColor={state.teams.home.colors?.primary} />
          <div className="sb-name">{state.teams.home.name}</div>
          <div className="sb-min" title="Aangevraagde minuten (time-outs)">
            <span className="sb-min-lbl">min.</span>
            <Dots filled={state.timeouts.home} total={2} className="to" />
          </div>
        </div>
        <div className="sb-scorebox">
          <div className="sb-score">
            <span className={goal?.side === 'home' ? 'sb-pulse' : ''}>{state.score.home}</span>
            <span className="sb-dash">–</span>
            <span className={goal?.side === 'away' ? 'sb-pulse' : ''}>{state.score.away}</span>
          </div>
          <div className="sb-clock">{fmtClock(clock)}</div>
          <div className="sb-half">Helft {state.match.currentHalf}</div>
          {state.match.status === 'live' && (
            <div className="sb-remaining" title="Schatting: resterende speeltijd in deze + de volgende helft, inclusief de gevraagde extra minuten (time-outs/SR).">
              ⏳ nog ± {remainingMin} min
            </div>
          )}
          {state.match.status !== 'finished' && (
            <div className="sb-playto" title="De klok telt op tot dit punt; time-outs en SR-minuten pauzeren ze, dus de échte speeltijd loopt langer.">
              speelt tot {fmtClock(halfSeconds)}
              {requestedMin > 0 && ` · ${requestedMin} min. gevraagd`}
            </div>
          )}
        </div>
        <div className={`sb-side-team ${goal?.side === 'away' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" size="lg" float ringColor={state.teams.away.colors?.primary} />
          <div className="sb-name">{state.teams.away.name}</div>
          <div className="sb-min" title="Aangevraagde minuten (time-outs)">
            <span className="sb-min-lbl">min.</span>
            <Dots filled={state.timeouts.away} total={2} className="to" />
          </div>
        </div>
      </div>

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

      <div className="sb-crosses">
        <span>Kruisjes</span>
        <span className="sb-cross-val">{state.crosses.home}</span>
        <span className="sb-cross-sep">·</span>
        <span className="sb-cross-val">{state.crosses.away}</span>
        {state.refereeStops > 0 && (
          <span className="sb-refmin" title="Minuten gevraagd door de scheidsrechter">
            ⏱ SR-minuut: {state.refereeStops}
          </span>
        )}
      </div>

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
                    <span className="sb-tl-scorer">{canChat ? (scorer ?? 'Onbekend') : '🔒 Log in om te zien'}</span>
                  )}
                </li>,
              )
            }
            return out
          })()}
        </ul>
      </div>

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
        </div>
      )}

      {/* Fullscreen clubkleuren-explosie (rook + vuurwerk). */}
      {blast && <ClubColorBlast key={blast.key} colors={blast.colors} teamName={blast.name} />}

      {/* Strakke "rugworp +2"-melding: een verzorgde flits met clean typografie (geen cartoon). */}
      {celebrate != null && (
        <div className="sb-celebrate" key={celebrate} aria-hidden>
          <div className="sb-celebrate-flash" />
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
          <div className="sb-chat-feed" ref={chatFeedRef}>
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
    </div>
  )
}
