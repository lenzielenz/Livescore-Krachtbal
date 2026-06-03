'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

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
// over het vak wanneer er gescoord wordt. `onRemove` is optioneel (enkel op de kiezer).
// `fontSize`/`logoSize` schalen het vak mee met de dynamische schermlayout.
export function Tile({
  match,
  onRemove,
  fontSize,
  logoSize = 'md',
}: {
  match: KantineMatch
  onRemove?: (id: number) => void
  fontSize?: number
  logoSize?: string
}) {
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

  const tileStyle = {
    '--home': homeColor ?? DEFAULT_HOME_COLOR,
    '--away': awayColor ?? DEFAULT_AWAY_COLOR,
    ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
  } as React.CSSProperties

  return (
    <div className={`kt-tile ${status === 'live' ? 'live' : ''}`} style={tileStyle}>
      <div className="kt-tile-head">
        <span className="kt-tile-reeks">{match.reeks}</span>
        <span className={`kt-tile-status ${status}`}>
          {status === 'live' ? (state?.atHalfTime ? 'RUST' : 'LIVE') : status === 'finished' ? 'EINDE' : match.time}
        </span>
        {onRemove && (
          <button type="button" className="kt-tile-x" onClick={() => onRemove(match.id)} aria-label="Verwijderen" title="Uit selectie">
            ✕
          </button>
        )}
      </div>

      <Link href={`/match/${match.id}`} className="kt-tile-body">
        <div className="kt-tile-team">
          <TeamLogo name={home} logoUrl={homeLogo} logoFit={homeLogoFit} side="home" size={logoSize} ringColor={homeColor} />
          <span className="kt-tile-name">{home}</span>
        </div>
        <div className="kt-tile-mid">
          <div className="kt-tile-score">{played ? `${score.home} – ${score.away}` : 'vs'}</div>
          {status === 'live' && state ? (
            <span className="kt-tile-clock live">
              <span className="kt-clock-half">H{state.match.currentHalf}</span>
              <span className="kt-clock-time">{state.atHalfTime ? 'RUST' : fmtClock(clock)}</span>
            </span>
          ) : status === 'finished' ? (
            <span className="kt-tile-clock dim">Afgelopen</span>
          ) : (
            <span className="kt-tile-clock dim">{match.time}</span>
          )}
        </div>
        <div className="kt-tile-team">
          <TeamLogo name={away} logoUrl={awayLogo} logoFit={awayLogoFit} side="away" size={logoSize} ringColor={awayColor} />
          <span className="kt-tile-name">{away}</span>
        </div>
      </Link>

      {played && state && (
        <div className="kt-tile-foot">
          <span className="kt-stat" title="Kruisjes">
            <span className="kt-stat-lbl">Kruisjes</span>
            <span className="kt-stat-val">
              <b className="h">{state.crosses.home}</b>
              <i>–</i>
              <b className="a">{state.crosses.away}</b>
            </span>
          </span>
          <span className="kt-stat-div" aria-hidden />
          <span className="kt-stat" title="Minuten (time-outs)">
            <span className="kt-stat-lbl">Minuten</span>
            <span className="kt-stat-val">
              <b className="h">{state.timeouts.home}</b>
              <i>–</i>
              <b className="a">{state.timeouts.away}</b>
              {state.refereeStops > 0 && <em className="kt-stat-sr">+{state.refereeStops} SR</em>}
            </span>
          </span>
        </div>
      )}

      {flash && (
        <div key={flash.key} className={`kt-flash side-${flash.side}`}>
          <span className="kt-flash-burst" aria-hidden />
          <div className="kt-flash-logo">
            <TeamLogo
              name={flash.team}
              logoUrl={flash.side === 'home' ? homeLogo : awayLogo}
              logoFit={flash.side === 'home' ? homeLogoFit : awayLogoFit}
              side={flash.side}
              size="clamp(54px, 15vmin, 120px)"
              ringColor={flash.side === 'home' ? homeColor : awayColor}
            />
          </div>
          <div className="kt-flash-title">DOELPUNT!</div>
          <div className="kt-flash-team">{flash.team}</div>
          {flash.scorer && <div className="kt-flash-scorer">{flash.scorer}</div>}
          <div className="kt-flash-pts">{flash.points === 2 ? 'Rugworp +2' : 'Nekworp +1'}</div>
        </div>
      )}
    </div>
  )
}
