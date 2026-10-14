'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { ClubColorBlast } from '@/components/ClubColorBlast'
import { TeamLogo } from '@/components/TeamLogo'
import { type ClubColors, DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark } from '@/lib/club-colors'
import type { KantineBord } from '@/lib/kantine-borden'
import type { KantineLive } from '@/lib/kantine-channel'
import { fmtClock, useLiveClock } from '@/lib/use-live-clock'

/**
 * Eén bord op het kantinescherm. Zelfde vorm als wat de kantine-API's teruggeven — die bouwen hem
 * met `bouwKantineBorden`, dus één definitie voor de server- én de browserkant.
 */
export type KantineMatch = KantineBord

// Eén live vak in het raster. De live gegevens komen NIET uit een eigen verbinding: het scherm
// houdt er één voor al zijn borden samen (zie kantine-channel.ts) en geeft elk vak zijn stuk door.
// Een dozijn borden was vroeger een dozijn open verbindingen uit dezelfde browser, en daar loopt
// een browser op vast. `onRemove` is optioneel (enkel op de kiezer); `fontSize`/`logoSize` schalen
// het vak mee met de dynamische schermlayout.
export function Tile({
  match,
  live,
  onRemove,
  fontSize,
  logoSize = 'md',
}: {
  match: KantineMatch
  live?: KantineLive | null
  onRemove?: (id: number) => void
  fontSize?: number
  logoSize?: string
}) {
  const [flash, setFlash] = useState<{ key: number; side: 'home' | 'away'; team: string; points: number; scorer: string | null } | null>(null)
  // Het doelpunt dat we al gezien hebben. Het eerste frame "leert" de stand zonder te vieren —
  // anders knalt er een viering op het scherm zodra de tv 's ochtends aangaat.
  const gezienGoal = useRef<string | null>(null)
  const eersteFrame = useRef(true)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Clubkleuren-viering (afgevuurd vanaf een supporter-scherm) ook hier over dit vak tonen.
  const [blast, setBlast] = useState<{ key: number; colors: ClubColors; name: string } | null>(null)
  const gezienBlast = useRef<number | null>(null)
  const blastSeq = useRef(0)
  const blastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const home = match.home.name
  const away = match.away.name
  const naamVan = { home, away }

  const goalId = live?.goal?.id ?? null
  useEffect(() => {
    if (!live) return
    const g = live.goal
    const eerste = eersteFrame.current
    eersteFrame.current = false
    if (eerste) {
      gezienGoal.current = g?.id ?? null
      return
    }
    if (!g || g.id === gezienGoal.current) return
    gezienGoal.current = g.id
    seq.current += 1
    const key = seq.current
    setFlash({ key, side: g.side, team: naamVan[g.side], points: g.points, scorer: g.scorer })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash((f) => (f && f.key === key ? null : f)), 5000)
    // De viering hangt aan het doelpunt-id; de rest van het frame verandert elke paar seconden.
  }, [goalId, Boolean(live)])

  const blastTs = live?.blast?.ts ?? null
  useEffect(() => {
    const b = live?.blast
    if (!b || b.ts === gezienBlast.current) return
    // Bij het openen van het scherm geen oude viering opnieuw afspelen.
    if (gezienBlast.current === null && eersteFrame.current) {
      gezienBlast.current = b.ts
      return
    }
    gezienBlast.current = b.ts
    const fallback = b.side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
    const colors = (match[b.side].colors ?? { primary: fallback, secondary: fallback }) as ClubColors
    const key = ++blastSeq.current
    setBlast({ key, colors, name: naamVan[b.side] })
    if (blastTimer.current) clearTimeout(blastTimer.current)
    blastTimer.current = setTimeout(() => setBlast((v) => (v && v.key === key ? null : v)), 2800)
  }, [blastTs])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (blastTimer.current) clearTimeout(blastTimer.current)
    }
  }, [])

  // Ticking klok — reken vanaf clockUpdatedAt (server) zodat de tijd klopt en niet reset. De hook
  // zelf tikt maar één keer per hele seconde (niet meer om de 250ms), dus geen extra optimalisatie
  // hier nodig ondanks het dozijn klokken naast elkaar op een kantinescherm.
  const clock = useLiveClock({
    seconds: live?.clockSeconds ?? 0,
    running: Boolean(live?.clockRunning),
    updatedAt: live?.clockUpdatedAt ?? null,
  })

  // Tot het eerste live-frame tonen we de server-gerenderde momentopname. Namen, logo's en kleuren
  // komen sowieso daarvandaan: die veranderen niet tijdens een wedstrijd en horen niet elke drie
  // seconden over de lijn.
  const homeLogo = match.home.logoUrl
  const awayLogo = match.away.logoUrl
  const homeLogoFit = match.home.logoFit
  const awayLogoFit = match.away.logoFit
  const homeColor = match.home.colors?.primary
  const awayColor = match.away.colors?.primary
  const score = live?.score ?? match.score
  const status = live?.status ?? match.status
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
          {status === 'live' ? (live?.atHalfTime ? 'RUST' : 'LIVE') : status === 'finished' ? 'EINDE' : match.time}
        </span>
        {onRemove && (
          <button type="button" className="kt-tile-x" onClick={() => onRemove(match.id)} aria-label="Verwijderen" title="Uit selectie">
            ✕
          </button>
        )}
      </div>

      {/* prefetch uit: op een tv klikt niemand ooit door, en elke tegel zou anders de volledige
          wedstrijdpagina ophalen. De link zelf blijft, voor het scherm op /kantine. */}
      <Link href={`/match/${match.id}`} prefetch={false} className="kt-tile-body">
        <div className="kt-tile-team">
          <TeamLogo name={home} logoUrl={homeLogo} logoFit={homeLogoFit} side="home" size={logoSize} ringColor={homeColor} />
          <span className="kt-tile-name">{home}</span>
          {played && live && (
            <span className="kt-tile-teamstats home">
              <span title="Kruisjes">✖ {live.crosses.home}</span>
              <span title="Time-outs">⏱ {live.timeouts.home}</span>
            </span>
          )}
        </div>
        <div className="kt-tile-mid">
          <div className="kt-tile-score">{played ? `${score.home} – ${score.away}` : 'vs'}</div>
          {status === 'live' && live ? (
            <span className="kt-tile-clock live">
              <span className="kt-clock-half">H{live.half}</span>
              <span className="kt-clock-time">{live.atHalfTime ? 'RUST' : fmtClock(clock)}</span>
            </span>
          ) : status === 'finished' ? (
            <span className="kt-tile-clock dim">Afgelopen</span>
          ) : (
            <span className="kt-tile-clock dim">{match.time}</span>
          )}
          {played && live && live.refereeStops > 0 && (
            <span className="kt-tile-sr" title="Time-outs scheidsrechter">🧑‍⚖️ ⏱ {live.refereeStops}</span>
          )}
        </div>
        <div className="kt-tile-team">
          <TeamLogo name={away} logoUrl={awayLogo} logoFit={awayLogoFit} side="away" size={logoSize} ringColor={awayColor} />
          <span className="kt-tile-name">{away}</span>
          {played && live && (
            <span className="kt-tile-teamstats away">
              <span title="Kruisjes">✖ {live.crosses.away}</span>
              <span title="Time-outs">⏱ {live.timeouts.away}</span>
            </span>
          )}
        </div>
      </Link>

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

/**
 * Een wedstrijd die vandaag nog moet beginnen, in de middelste strook van het kantinescherm.
 * Bewust zonder clubnamen: op een tv van vijf meter ver lees je die toch niet, en de logo's zeggen
 * al wie er speelt. Wat overblijft is wat je wil weten: welke reeks, en hoe laat.
 */
export function KomendTile({ match, fontSize, logoSize = 'md' }: { match: KantineMatch; fontSize?: number; logoSize?: string }) {
  const homeColor = match.home.colors?.primary
  const awayColor = match.away.colors?.primary
  const style = {
    '--home': readableOnDark(homeColor ?? DEFAULT_HOME_COLOR),
    '--away': readableOnDark(awayColor ?? DEFAULT_AWAY_COLOR),
    ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
  } as React.CSSProperties
  return (
    <div className="kt-tile kt-komend" style={style}>
      <div className="kt-tile-head">
        <span className="kt-tile-reeks">{match.reeks}</span>
      </div>
      <Link href={`/match/${match.id}`} prefetch={false} className="kt-komend-body">
        <TeamLogo name={match.home.name} logoUrl={match.home.logoUrl} logoFit={match.home.logoFit} side="home" size={logoSize} ringColor={homeColor} />
        <span className="kt-komend-uur">{match.time}</span>
        <TeamLogo name={match.away.name} logoUrl={match.away.logoUrl} logoFit={match.away.logoFit} side="away" size={logoSize} ringColor={awayColor} />
      </Link>
    </div>
  )
}

/** Compacte eindstand voor de rustige uitslagenstrook onder de livewedstrijden. */
export function ResultTile({ match, live }: { match: KantineMatch; live?: KantineLive | null }) {
  const score = live?.score ?? match.score
  const homeColor = match.home.colors?.primary ?? DEFAULT_HOME_COLOR
  const awayColor = match.away.colors?.primary ?? DEFAULT_AWAY_COLOR
  return (
    <Link
      href={`/match/${match.id}`}
      prefetch={false}
      className="kt-result"
      style={{ '--home': readableOnDark(homeColor), '--away': readableOnDark(awayColor) } as React.CSSProperties}
    >
      <span className="kt-result-meta"><b>EINDSTAND</b><small>{match.reeks}</small></span>
      <span className="kt-result-team home">
        <TeamLogo name={match.home.name} logoUrl={match.home.logoUrl} logoFit={match.home.logoFit} side="home" size="clamp(34px, 4.4vmin, 54px)" ringColor={homeColor} />
        <span>{match.home.name}</span>
      </span>
      <strong className="kt-result-score">{score.home} – {score.away}</strong>
      <span className="kt-result-team away">
        <TeamLogo name={match.away.name} logoUrl={match.away.logoUrl} logoFit={match.away.logoFit} side="away" size="clamp(34px, 4.4vmin, 54px)" ringColor={awayColor} />
        <span>{match.away.name}</span>
      </span>
    </Link>
  )
}
