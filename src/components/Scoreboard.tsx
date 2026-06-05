'use client'

import { useEffect, useRef, useState } from 'react'

import type { MatchState, TimelineItem } from '@/lib/match-engine'
import type { KrachtbalKleur } from '@/lib/reeksen'
import { KrachtbalIcon } from '@/components/KrachtbalIcon'
import { TeamLogo } from '@/components/TeamLogo'
import { WinProbability } from '@/components/WinProbability'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark } from '@/lib/club-colors'
import { goalPointsFromLabel, goalScorerFromLabel, useLiveStream } from '@/lib/use-live-stream'
import './scoreboard.css'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Side = 'home' | 'away'

type Goal = { key: number; side: Side; team: string; points: number; scorer: string | null }

// Toegelaten supporter-emoji's (komt overeen met de server-whitelist in match-channel.ts).
const EMOJI = { clap: '👏', fire: '🔥', heart: '❤️', goal: '🏐', wow: '😮' } as const
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
}: {
  matchId: number
  initial: { state: MatchState; timeline: TimelineItem[] }
  /** Helftduur (sec), afgeleid uit de reeks — voor de live winstkans. */
  halfSeconds: number
  /** Verwachte punten/ploeg/min — voor de live winstkans. */
  ratePerMin: number
  /** Categoriekleur van de krachtbal (dames rood, heren wit, U12/U14 geel, U16/U18 blauw). */
  ballKleur?: KrachtbalKleur
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
  // Supporter-engagement: live kijkersaantal + zwevende emoji-reacties.
  const [viewers, setViewers] = useState(0)
  const [floats, setFloats] = useState<{ key: number; name: EmojiName }[]>([])
  const floatSeq = useRef(0)

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
    },
    {
      viewers: (d) => setViewers((d as { count?: number }).count ?? 0),
      reactions: (d) => spawnFloats(d as Record<string, number>),
    },
  )

  // Eigen tikken gebatcht versturen (client-throttle ~300ms) zodat één supporter de server niet spamt.
  const pendingReacts = useRef<Record<string, number>>({})
  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendReaction = (name: keyof typeof EMOJI) => {
    spawnFloats({ [name]: 1 }) // optimistisch: meteen voelbaar
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

  useEffect(() => {
    return () => {
      if (goalTimer.current) clearTimeout(goalTimer.current)
      if (reactTimer.current) clearTimeout(reactTimer.current)
    }
  }, [])

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
      {state.match.status === 'live' && (
        <div className="sb-reactions">
          {(Object.keys(EMOJI) as (keyof typeof EMOJI)[]).map((name) => (
            <button
              key={name}
              type="button"
              className="sb-react-btn"
              onClick={() => sendReaction(name)}
              aria-label={`Reageer met ${name}`}
            >
              {reactionGlyph(name, ballKleur)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
