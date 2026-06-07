'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { ClubColorBlast } from '@/components/ClubColorBlast'
import { TeamLogo } from '@/components/TeamLogo'
import { type ClubColors, DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark } from '@/lib/club-colors'
import type { MatchState, TimelineItem } from '@/lib/match-engine'
import { type LogoFit } from '@/lib/logo-fit'
import { goalPointsFromLabel, goalScorerFromLabel, useLiveStream } from '@/lib/use-live-stream'

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
  const seenGoals = useRef<Set<string>>(new Set())
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Clubkleuren-viering (afgevuurd vanaf een supporter-scherm) ook hier over dit vak tonen.
  const [blast, setBlast] = useState<{ key: number; colors: ClubColors; name: string } | null>(null)
  const blastSeq = useRef(0)
  const blastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef<MatchState | null>(null)
  stateRef.current = state

  useLiveStream<{ state: MatchState; timeline: TimelineItem[] }>(
    `/api/match/${match.id}/stream`,
    (data) => {
      // Eerste frame "leert" de bestaande doelpunten zonder te vieren; daarna enkel nieuwe id's.
      const first = seenGoals.current.size === 0 && !state
      const fresh = data.timeline.filter((i) => i.kind === 'goal' && !seenGoals.current.has(i.id))
      fresh.forEach((i) => seenGoals.current.add(i.id))
      setState(data.state)
      const last = fresh[fresh.length - 1]
      if (!first && last && last.side) {
        seq.current += 1
        setFlash({
          key: seq.current,
          side: last.side,
          team: data.state.teams[last.side].name,
          points: goalPointsFromLabel(last.label),
          scorer: goalScorerFromLabel(last.label),
        })
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setFlash(null), 5000)
      }
    },
    {
      blast: (d) => {
        const side = (d as { side?: string }).side
        if (side !== 'home' && side !== 'away') return
        const teams = stateRef.current?.teams
        const fallback = side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
        const colors = (teams?.[side].colors ?? match[side].colors ?? { primary: fallback, secondary: fallback }) as ClubColors
        const name = teams?.[side].name ?? match[side].name
        const key = ++blastSeq.current
        setBlast({ key, colors, name })
        if (blastTimer.current) clearTimeout(blastTimer.current)
        blastTimer.current = setTimeout(() => setBlast((b) => (b && b.key === key ? null : b)), 2800)
      },
    },
  )

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (blastTimer.current) clearTimeout(blastTimer.current)
    }
  }, [])

  // Ticking klok — reken vanaf clockUpdatedAt (server) zodat de tijd klopt en niet reset.
  useEffect(() => {
    if (!state) return
    const m = state.match
    const at = m.clockUpdatedAt ? new Date(m.clockUpdatedAt).getTime() : Date.now()
    base.current = { seconds: m.clockSeconds, at }
    setClock(m.clockRunning ? m.clockSeconds + Math.max(0, (Date.now() - at) / 1000) : m.clockSeconds)
  }, [state?.match.clockSeconds, state?.match.clockRunning, state?.match.clockUpdatedAt])

  useEffect(() => {
    if (!state?.match.clockRunning) return
    const t = setInterval(() => setClock(base.current.seconds + Math.max(0, (Date.now() - base.current.at) / 1000)), 250)
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

  // Leesbare varianten voor tekst/stat-cijfers op het donkere vak; rauwe kleur blijft voor de ring.
  const homeInk = readableOnDark(homeColor ?? DEFAULT_HOME_COLOR)
  const awayInk = readableOnDark(awayColor ?? DEFAULT_AWAY_COLOR)
  const tileStyle = {
    '--home': homeInk,
    '--away': awayInk,
    '--goal-ink': inkOn(flash?.side === 'away' ? awayInk : homeInk),
    ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
  } as React.CSSProperties

  return (
    <div className={`kt-tile ${status === 'live' ? 'live' : ''}`} style={tileStyle}>
      {blast && <ClubColorBlast key={blast.key} colors={blast.colors} teamName={blast.name} contained />}
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
