'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { type ClubColors, DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR } from '@/lib/club-colors'
import type { MatchState, TimelineItem } from '@/lib/match-engine'
import { type LogoFit } from '@/lib/logo-fit'

export type KantineMatch = {
  id: number
  reeks: string
  time: string
  status: string
  home: { name: string; logoUrl: string | null; logoFit?: LogoFit | null; colors?: ClubColors | null }
  away: { name: string; logoUrl: string | null; logoFit?: LogoFit | null; colors?: ClubColors | null }
  score: { home: number; away: number }
}

const SEL_KEY = 'krachtbal-kantine-selectie'

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function lastGoalScorer(timeline: TimelineItem[], side: 'home' | 'away'): string | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]
    if (item.kind === 'goal' && item.side === side) {
      return item.label.replace(/^Doelpunt\s*\+\d+\s*/, '').trim() || null
    }
  }
  return null
}

// Eén live vak in het raster: abonneert zich op de SSE-stream en toont een doelpunt-melding
// over het vak wanneer er gescoord wordt.
function Tile({ match, onRemove }: { match: KantineMatch; onRemove: (id: number) => void }) {
  const [state, setState] = useState<MatchState | null>(null)
  const [clock, setClock] = useState(0)
  const [flash, setFlash] = useState<{ key: number; side: 'home' | 'away'; team: string; points: number; scorer: string | null } | null>(null)
  const base = useRef({ seconds: 0, at: Date.now() })
  const prevScore = useRef(match.score)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const es = new EventSource(`/api/match/${match.id}/stream`)
    es.addEventListener('update', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { state: MatchState; timeline: TimelineItem[] }
      const prev = prevScore.current
      const next = data.state.score
      const dHome = next.home - prev.home
      const dAway = next.away - prev.away
      const scored: { side: 'home' | 'away'; points: number } | null =
        dHome > 0 ? { side: 'home', points: dHome } : dAway > 0 ? { side: 'away', points: dAway } : null
      prevScore.current = next
      setState(data.state)
      if (scored) {
        seq.current += 1
        setFlash({
          key: seq.current,
          side: scored.side,
          team: data.state.teams[scored.side].name,
          points: scored.points,
          scorer: lastGoalScorer(data.timeline, scored.side),
        })
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setFlash(null), 5000)
      }
    })
    return () => {
      es.close()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [match.id])

  // Ticking klok.
  useEffect(() => {
    if (!state) return
    base.current = { seconds: state.match.clockSeconds, at: Date.now() }
    setClock(state.match.clockSeconds)
  }, [state?.match.clockSeconds, state?.match.clockRunning])

  useEffect(() => {
    if (!state?.match.clockRunning) return
    const t = setInterval(() => setClock(base.current.seconds + (Date.now() - base.current.at) / 1000), 250)
    return () => clearInterval(t)
  }, [state?.match.clockRunning])

  // Tot de eerste SSE-update tonen we de server-gerenderde momentopname.
  const home = state?.teams.home.name ?? match.home.name
  const away = state?.teams.away.name ?? match.away.name
  const homeLogo = state?.teams.home.logoUrl ?? match.home.logoUrl
  const awayLogo = state?.teams.away.logoUrl ?? match.away.logoUrl
  const homeLogoFit = state?.teams.home.logoFit ?? match.home.logoFit
  const awayLogoFit = state?.teams.away.logoFit ?? match.away.logoFit
  const homeColor = (state?.teams.home.colors ?? match.home.colors)?.primary
  const awayColor = (state?.teams.away.colors ?? match.away.colors)?.primary
  const score = state?.score ?? match.score
  const status = state?.match.status ?? match.status
  const played = status !== 'scheduled'

  // Clubkleuren als accenten op het vak (logo-ringen + doelpunt-gloed).
  const tileStyle = { '--home': homeColor ?? DEFAULT_HOME_COLOR, '--away': awayColor ?? DEFAULT_AWAY_COLOR } as React.CSSProperties

  return (
    <div className={`kt-tile ${status === 'live' ? 'live' : ''}`} style={tileStyle}>
      <div className="kt-tile-head">
        <span className="kt-tile-reeks">{match.reeks}</span>
        <span className={`kt-tile-status ${status}`}>
          {status === 'live' ? (state?.atHalfTime ? 'RUST' : 'LIVE') : status === 'finished' ? 'EINDE' : match.time}
        </span>
        <button type="button" className="kt-tile-x" onClick={() => onRemove(match.id)} aria-label="Verwijderen" title="Uit selectie">
          ✕
        </button>
      </div>

      <Link href={`/match/${match.id}`} className="kt-tile-body">
        <div className="kt-tile-team">
          <TeamLogo name={home} logoUrl={homeLogo} logoFit={homeLogoFit} side="home" size="md" ringColor={homeColor} />
          <span className="kt-tile-name">{home}</span>
        </div>
        <div className="kt-tile-score">{played ? `${score.home} – ${score.away}` : 'vs'}</div>
        <div className="kt-tile-team">
          <TeamLogo name={away} logoUrl={awayLogo} logoFit={awayLogoFit} side="away" size="md" ringColor={awayColor} />
          <span className="kt-tile-name">{away}</span>
        </div>
      </Link>

      <div className="kt-tile-foot">
        {status === 'live' && state ? (
          <span className="kt-tile-clock">H{state.match.currentHalf} {fmtClock(clock)}</span>
        ) : (
          <span className="kt-tile-clock dim">{status === 'finished' ? 'Afgelopen' : match.time}</span>
        )}
      </div>

      {flash && (
        <div key={flash.key} className={`kt-flash side-${flash.side}`}>
          <div className="kt-flash-title">DOELPUNT!</div>
          <div className="kt-flash-team">{flash.team}</div>
          {flash.scorer && <div className="kt-flash-scorer">{flash.scorer}</div>}
          <div className="kt-flash-pts">{flash.points === 2 ? 'Rugworp +2' : 'Nekworp +1'}</div>
        </div>
      )}
    </div>
  )
}

export function KantineBoard({ date, today, matches }: { date: string; today: string; matches: KantineMatch[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEL_KEY)
      if (raw) setSelected(new Set(JSON.parse(raw) as number[]))
    } catch {}
    setLoaded(true)
  }, [])

  const persist = (next: Set<number>) => {
    try {
      localStorage.setItem(SEL_KEY, JSON.stringify([...next]))
    } catch {}
  }
  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persist(next)
      return next
    })
  }
  const remove = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      persist(next)
      return next
    })
  }

  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches])
  // Alleen geselecteerde wedstrijden die ook op de gekozen dag bestaan, tonen we als vak.
  const shown = useMemo(() => matches.filter((m) => selected.has(m.id)), [matches, selected])

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('nl-BE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })

  return (
    <div className="kt">
      <div className="kt-datenav">
        <Link href={`/kantine?date=${shiftDate(date, -1)}`} className="kt-datebtn">‹</Link>
        <div className="kt-date">
          <span className="kt-datelabel">{date === today ? 'Vandaag' : dateLabel}</span>
          <input
            type="date"
            className="kt-dateinput"
            value={date}
            onChange={(e) => e.target.value && router.push(`/kantine?date=${e.target.value}`)}
            aria-label="Kies datum"
          />
        </div>
        <Link href={`/kantine?date=${shiftDate(date, 1)}`} className="kt-datebtn">›</Link>
      </div>

      <section className="kt-picker">
        <h3>Kies wedstrijden om te volgen</h3>
        {matches.length === 0 ? (
          <p className="kt-empty">Geen wedstrijden op deze dag.</p>
        ) : (
          <div className="kt-chips">
            {matches.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`kt-chip ${selected.has(m.id) ? 'on' : ''} ${m.status === 'live' ? 'live' : ''}`}
                onClick={() => toggle(m.id)}
              >
                <span className="kt-chip-check">{selected.has(m.id) ? '✓' : '+'}</span>
                <span className="kt-chip-teams">{m.home.name} – {m.away.name}</span>
                <span className="kt-chip-meta">{m.status === 'live' ? 'LIVE' : m.time}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {loaded && shown.length === 0 ? (
        <p className="kt-hint">Selecteer hierboven één of meer wedstrijden — ze verschijnen dan als live borden.</p>
      ) : (
        <div className="kt-grid">
          {shown.map((m) => (
            <Tile key={m.id} match={byId.get(m.id) ?? m} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  )
}
