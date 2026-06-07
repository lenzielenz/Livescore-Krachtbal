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
  const [floats, setFloats] = useState<{ key: number; name: EmojiName }[]>([])
  const floatSeq = useRef(0)
  const [totals, setTotals] = useState<Record<string, number>>({})
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
  // 5 doelpunten. We tellen vanaf de huidige stand zodat reeds gespeelde doelpunten niets opleveren.
  const [charges, setCharges] = useState<{ home: number; away: number }>({ home: 0, away: 0 })
  const awardedMilestone = useRef<{ home: number; away: number }>({
    home: Math.floor((initial.state.score.home ?? 0) / 5),
    away: Math.floor((initial.state.score.away ?? 0) / 5),
  })
  const [blast, setBlast] = useState<{ key: number; colors: { primary: string; secondary: string }; name: string } | null>(null)
  const blastSeq = useRef(0)
  const blastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorsFor = (side: Side): { primary: string; secondary: string } => {
    const c = state.teams[side].colors
    const fallback = side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
    return c ?? { primary: fallback, secondary: fallback }
  }
  const fireBlast = (side: Side) => {
    if (charges[side] <= 0) return
    const key = ++blastSeq.current
    setBlast({ key, colors: colorsFor(side), name: state.teams[side].name })
    setCharges((c) => ({ ...c, [side]: Math.max(0, c[side] - 1) }))
    if (blastTimer.current) clearTimeout(blastTimer.current)
    blastTimer.current = setTimeout(() => setBlast((b) => (b && b.key === key ? null : b)), 2800)
  }

  // Live tribune (shoutouts van ingelogde supporters).
  const [shouts, setShouts] = useState<Shout[]>([])
  const [chatText, setChatText] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const chatFeedRef = useRef<HTMLDivElement>(null)

  const spawnFloats = (counts: Record<string, number>) => {
    const next: { key: number; name: EmojiName }[] = []
    for (const [name, n] of Object.entries(counts)) {
      if (!(name in EMOJI)) continue
      for (let i = 0; i < Math.min(n, 6); i++) next.push({ key: ++floatSeq.current, name: name as EmojiName })
    }
    if (next.length === 0) return
    setFloats((prev) => [...prev.slice(-40), ...next])
    const keys = new Set(next.map((f) => f.key))
    setTimeout(() => setFloats((prev) => prev.filter((f) => !keys.has(f.key))), 2600)
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
    },
  )

  // Eigen tikken gebatcht versturen (client-throttle ~300ms) zodat één supporter de server niet spamt.
  const pendingReacts = useRef<Record<string, number>>({})
  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendReaction = (name: keyof typeof EMOJI) => {
    spawnFloats({ [name]: 1 }) // optimistisch: meteen voelbaar
    if (name === 'rocket') triggerCelebrate(true) // eigen tik → meteen de fullscreen-viering
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

  // Klok-basis bijwerken bij elke state-update.
  useEffect(() => {
    base.current = { seconds: state.match.clockSeconds, running: state.match.clockRunning, at: Date.now() }
    setClock(state.match.clockSeconds)
  }, [state.match.clockSeconds, state.match.clockRunning])

  useEffect(() => {
    if (!state.match.clockRunning) return
    const t = setInterval(() => {
      const b = base.current
      setClock(b.seconds + (Date.now() - b.at) / 1000)
    }, 250)
    return () => clearInterval(t)
  }, [state.match.clockRunning])

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

  // Accenten in de clubkleuren (ringen, tijdlijn, doelpunt-gloed). Valt terug op groen/blauw.
  // De rauwe kleur dient voor de ring/logo; voor TEKST/cijfers op het donkere paneel klemmen we
  // naar een leesbare variant zodat donkere crests de naam/score niet onzichtbaar maken (AUDIT §1).
  const homeColor = state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR
  const awayColor = state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR
  const homeInk = readableOnDark(homeColor)
  const awayInk = readableOnDark(awayColor)
  const sbStyle = {
    '--home': homeInk,
    '--away': awayInk,
    '--home-ink': inkOn(homeColor),
    '--away-ink': inkOn(awayColor),
  } as React.CSSProperties

  return (
    <div className="sb" style={sbStyle}>
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
          {[...timeline].reverse().map((item) => (
            <li key={item.id} className={`sb-tl sb-tl-${item.kind} ${item.side ? `side-${item.side}` : ''}`}>
              <span className="sb-tl-time">{item.half}H {fmtClock(item.gameClock)}</span>
              <span className="sb-tl-team">
                {item.side === 'home' ? state.teams.home.name : item.side === 'away' ? state.teams.away.name : ''}
              </span>
              <span className="sb-tl-label">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Supporter-reacties: zwevende emoji's + een reactiebalk (enkel tijdens een live wedstrijd). */}
      <div className="sb-floats" aria-hidden>
        {floats.map((f) => (
          <span key={f.key} className="sb-float">
            {reactionGlyph(f.name, ballKleur)}
          </span>
        ))}
      </div>
      {tribuneOpen && (
        <div className="sb-reactions">
          {(Object.keys(EMOJI) as (keyof typeof EMOJI)[]).map((name) => (
            <button
              key={name}
              type="button"
              className={`sb-react-btn${name === 'rocket' ? ' sb-react-rocket' : ''}`}
              onClick={() => sendReaction(name)}
              aria-label={name === 'rocket' ? 'Vier een rugworp (2 punten)' : `Reageer met ${name}`}
              title={name === 'rocket' ? 'Rugworp! 2 punten 🚀' : undefined}
            >
              {reactionGlyph(name, ballKleur)}
              {totals[name] > 0 && <span className="sb-react-count">{totals[name]}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Clubkleuren-viering: per ploeg een knop die je ontgrendelt (rugworp of elke 5 doelpunten)
          en kan afvuren — een fullscreen rook/vuurwerk-explosie in de clubkleuren. */}
      {tribuneOpen && (
        <div className="sb-blast-bar">
          {(['home', 'away'] as const).map((side) => {
            const team = state.teams[side]
            const c = colorsFor(side)
            const armed = charges[side] > 0
            return (
              <button
                key={side}
                type="button"
                className={`sb-blast-btn ${armed ? 'armed' : 'locked'}`}
                style={{ ['--bc' as string]: c.primary, ['--bc1' as string]: c.primary, ['--bc2' as string]: c.secondary || c.primary }}
                onClick={() => fireBlast(side)}
                disabled={!armed}
                title={armed ? `Vier in de kleuren van ${team.name}!` : 'Ontgrendel met een rugworp of elke 5 doelpunten'}
              >
                <span className="sb-blast-dot" aria-hidden />
                <span>{team.name}</span>
                <span className="sb-blast-hint">
                  {armed ? `🎆 Vier!${charges[side] > 1 ? ` ×${charges[side]}` : ''}` : '🔒 Ontgrendel'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Fullscreen clubkleuren-explosie (rook + vuurwerk). */}
      {blast && <ClubColorBlast key={blast.key} colors={blast.colors} teamName={blast.name} />}

      {/* Fullscreen "rugworp +2"-viering: een raket schiet over het scherm. */}
      {celebrate != null && (
        <div className="sb-celebrate" key={celebrate} aria-hidden>
          <div className="sb-celebrate-flash" />
          <div className="sb-celebrate-rocket">🚀</div>
          <div className="sb-celebrate-text">
            <span className="sb-celebrate-word">RUGWORP</span>
            <span className="sb-celebrate-pts">+2</span>
          </div>
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className={`sb-celebrate-spark s${i % 7}`} />
          ))}
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
