'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { ClubColorBlast } from '@/components/ClubColorBlast'
import { TeamLogo } from '@/components/TeamLogo'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark } from '@/lib/club-colors'
import type { FieldScreenTheme } from '@/lib/field-screens'
import { DEFAULT_UITSNEDE } from '@/lib/reclame'
import type { MatchState, TimelineItem } from '@/lib/match-engine'
import { buildMomentum, type MomentumPoint } from '@/lib/match-momentum'
import { goalPointsFromLabel, goalScorerFromLabel, useLiveStream } from '@/lib/use-live-stream'
import { QrCode } from '@/components/QrCode'
import { AdMarquee, type Ad } from './AdMarquee'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Side = 'home' | 'away'

type Goal = {
  key: number
  side: Side
  team: string
  points: number
  scorer: string | null
}

// Responsieve logomaat voor het grote veldscherm — zo groot mogelijk zonder de score/klok te
// verdringen (van ver op het veld moet het clublogo meteen herkenbaar zijn).
const FS_LOGO_SIZE = 'clamp(110px, 17vw, 260px)'

// Voorbeeld-reclames voor de testknop (als er nog geen echte reclame is ingesteld): gekleurde
// tegels als data-URI zodat de scrollende balk meteen iets toont. Eén keer opgebouwd.
const demoTile = (label: string, bg: string): string =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='84'><rect width='100%' height='100%' rx='10' fill='${bg}'/><text x='50%' y='50%' font-family='Arial,sans-serif' font-size='22' font-weight='800' fill='#fff' text-anchor='middle' dominant-baseline='central'>${label}</text></svg>`,
  )
const demoAd = (id: number, label: string, bg: string): Ad => ({
  id,
  url: demoTile(label, bg),
  naam: 'Demo',
  uitsnede: DEFAULT_UITSNEDE,
  achtergrond: 'donker',
})
const DEMO_ADS: Ad[] = [
  demoAd(-1, 'JOUW LOGO HIER', '#1d4ed8'),
  demoAd(-2, 'SPONSOR', '#db2777'),
  demoAd(-3, 'CAFÉ DE KANTINE', '#059669'),
  demoAd(-4, 'BOUWWERKEN BV', '#d97706'),
  demoAd(-5, 'JOUW LOGO HIER', '#7c3aed'),
]

// Voorbeeld-foto's voor de pauze-slideshow als er nog geen echte wedstrijdfoto's zijn.
const demoPhoto = (label: string, bg: string): string =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' font-family='Arial,sans-serif' font-size='48' font-weight='800' fill='#ffffff' text-anchor='middle' dominant-baseline='central'>${label}</text></svg>`,
  )
const DEMO_PHOTOS: string[] = [
  demoPhoto('📷 Wedstrijdfoto 1', '#0f2a44'),
  demoPhoto('📷 Wedstrijdfoto 2', '#3a1d44'),
  demoPhoto('📷 Wedstrijdfoto 3', '#143a2c'),
]

// Speelse "kracht-cam"-bijschriften (kiss-cam-stijl, maar krachtbal) die met de foto's meewisselen.
const CAM_CAPTIONS: string[] = [
  '💪 Toon je kracht!',
  '📣 Supporters aan zet!',
  '🔥 Wat een sfeer!',
  '❤️ Krachtbalfamilie',
  '👀 Wie zien we daar?',
  '🙌 Geef ze een applaus!',
]
// SVG-hartpad voor de kiss-cam-overlay.
const HEART_PATH =
  'M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2c6.1-9.3,16-12,16-21.2C32,3.8,28.2,0,23.6,0z'

// Telmarkeringen onder de ploegnaam: invul-vakjes gegroepeerd per set.
// Kruisjes per 3 (3e kruisje → vrije worp, §6.7); time-outs per 2 (max. 2 per helft, §8.1).
function Marks({ count, group, kind }: { count: number; group: number; kind: 'cross' | 'timeout' }) {
  const total = Math.max(group, Math.ceil(count / group) * group)
  const groups: boolean[][] = []
  for (let i = 0; i < total; i += group) {
    groups.push(Array.from({ length: group }, (_, j) => i + j < count))
  }
  return (
    <span className={`fs-marks fs-marks-${kind}`}>
      {groups.map((g, gi) => (
        <span className="fs-mark-group" key={gi}>
          {g.map((on, j) => (
            <span key={j} className={`fs-mark ${on ? 'on' : ''}`} aria-hidden>
              {kind === 'cross' ? '✖' : '⏱'}
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}

// Statblok (kruisjes + time-outs) onder een ploegnaam.
function TeamStats({ crosses, timeouts }: { crosses: number; timeouts: number }) {
  return (
    <div className="fs-stats">
      <div className="fs-stat" title="Kruisjes (rechtstreeks buiten)">
        <span className="fs-stat-cap">Kruisjes</span>
        <Marks count={crosses} group={3} kind="cross" />
      </div>
      <div className="fs-stat" title="Time-outs (max. 2 per helft)">
        <span className="fs-stat-cap">Time-outs</span>
        <Marks count={timeouts} group={2} kind="timeout" />
      </div>
    </div>
  )
}

// Momentum-grafiek: het verschil (thuis − uit) als een vloeiende lijn over de tijd, met een
// gekleurd vlak boven/onder de middenlijn (thuis vs uit). Toont in één oogopslag hoe de match loopt.
function MomentumChart({ points, nowT, homeColor, awayColor }: { points: MomentumPoint[]; nowT: number; homeColor: string; awayColor: string }) {
  const W = 100
  const H = 50
  const mid = H / 2
  // Laat de lijn doorlopen tot "nu" zodat de grafiek meebeweegt met de wedstrijd.
  const last = points[points.length - 1]
  const pts = nowT > last.t ? [...points, { ...last, t: nowT }] : points
  const maxT = Math.max(1, pts[pts.length - 1].t)
  const maxAbs = Math.max(1, ...pts.map((p) => Math.abs(p.diff)))
  const x = (t: number) => (t / maxT) * W
  const y = (d: number) => mid - (d / maxAbs) * (mid - 4)
  // Stapsgewijs: een doelpunt verandert de stand meteen (horizontaal tot het punt, dan verticaal).
  let d = `M ${x(pts[0].t).toFixed(2)} ${y(pts[0].diff).toFixed(2)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${x(pts[i].t).toFixed(2)} ${y(pts[i - 1].diff).toFixed(2)} L ${x(pts[i].t).toFixed(2)} ${y(pts[i].diff).toFixed(2)}`
  }
  const area = `${d} L ${x(pts[pts.length - 1].t).toFixed(2)} ${mid} L ${x(pts[0].t).toFixed(2)} ${mid} Z`
  const goalDots = points.filter((p) => p.t > 0)
  return (
    <svg className="fs-flow-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Wedstrijdverloop">
      <defs>
        <linearGradient id="fsFlowFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={homeColor} stopOpacity="0.55" />
          <stop offset="50%" stopColor={homeColor} stopOpacity="0.05" />
          <stop offset="50%" stopColor={awayColor} stopOpacity="0.05" />
          <stop offset="100%" stopColor={awayColor} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(255,255,255,.28)" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
      <path d={area} fill="url(#fsFlowFill)" stroke="none" />
      <path d={d} fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="0.9" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {goalDots.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.diff)} r="0.9" fill={p.diff >= 0 ? homeColor : awayColor} stroke="#fff" strokeWidth="0.3" />
      ))}
    </svg>
  )
}

export function FieldScreen({
  matchId,
  reeks,
  halfSeconds,
  ads = [],
  theme = 'dark',
  initial,
}: {
  matchId: number
  reeks: string | null
  halfSeconds: number
  ads?: Ad[]
  /** 'light' voor een veld in de volle zon — een donker scherm is dan nauwelijks af te lezen. */
  theme?: FieldScreenTheme
  initial: { state: MatchState; timeline: TimelineItem[] }
}) {
  const [state, setState] = useState<MatchState>(initial.state)
  const [timeline, setTimeline] = useState<TimelineItem[]>(initial.timeline)
  const [clock, setClock] = useState(initial.state.match.clockSeconds)
  const [goal, setGoal] = useState<Goal | null>(null)
  // Wedstrijdverloop-grafiek: rond het midden van de eerste helft ±1 min tonen (de score blijft staan).
  const [showFlow, setShowFlow] = useState(false)
  const flowShown = useRef(false)
  const flowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pauze-foto's: een slideshow van de wedstrijdfoto's (supporter-instants), te tonen tijdens de rust.
  const [photos, setPhotos] = useState<string[] | null>(null) // null = dicht, [] = geen foto's
  const [photoIdx, setPhotoIdx] = useState(0)
  const [photosLoading, setPhotosLoading] = useState(false)
  // Absolute URL naar de wedstrijdpagina (voor de QR-code in de pre-match lobby) — pas op de client bekend.
  const [matchUrl, setMatchUrl] = useState('')
  // Volledig scherm voor de zaal-tv: zet het veldscherm over het hele scherm (verbergt browser-UI).
  const rootRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const base = useRef({ seconds: initial.state.match.clockSeconds, at: Date.now() })
  const seenGoals = useRef<Set<string>>(new Set(initial.timeline.filter((i) => i.kind === 'goal').map((i) => i.id)))
  const goalSeq = useRef(0)
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viewers, setViewers] = useState(0)
  // Clubkleuren-viering die vanaf een supporter-scherm wordt afgevuurd, ook hier op de zaal-tv tonen.
  const [blast, setBlast] = useState<{ key: number; colors: { primary: string; secondary: string }; name: string } | null>(null)
  const blastSeq = useRef(0)
  const blastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBlast = useRef(0)
  const triggerBlast = (side: 'home' | 'away') => {
    const now = Date.now()
    if (now - lastBlast.current < 2500) return
    lastBlast.current = now
    const t = state.teams[side]
    const fallback = side === 'home' ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
    const colors = t.colors ?? { primary: fallback, secondary: fallback }
    const key = ++blastSeq.current
    setBlast({ key, colors, name: t.name })
    if (blastTimer.current) clearTimeout(blastTimer.current)
    blastTimer.current = setTimeout(() => setBlast((b) => (b && b.key === key ? null : b)), 2800)
  }

  // SSE-abonnement op dezelfde stream als het publieke scorebord (met reconnect-backoff).
  // display=1: het veldscherm is een passief scherm en telt niet mee in de kijkersteller.
  const { connected } = useLiveStream<{ state: MatchState; timeline: TimelineItem[] }>(
    `/api/match/${matchId}/stream?display=1`,
    (data) => {
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
        goalTimer.current = setTimeout(() => setGoal(null), 6000)
      }
    },
    {
      viewers: (d) => setViewers((d as { count?: number }).count ?? 0),
      blast: (d) => {
        const side = (d as { side?: string }).side
        if (side === 'home' || side === 'away') triggerBlast(side)
      },
    },
  )

  useEffect(() => {
    return () => {
      if (goalTimer.current) clearTimeout(goalTimer.current)
      if (blastTimer.current) clearTimeout(blastTimer.current)
    }
  }, [])

  // Houd de knop-status in sync, ook als de gebruiker met Esc/F11 het volledige scherm verlaat.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void rootRef.current?.requestFullscreen?.()
    }
  }

  // Pauze-foto's tonen: haalt de (niet-verlopen) wedstrijdfoto's op en start een slideshow.
  // Zijn er nog geen, dan tonen we voorbeeld-foto's zodat je meteen ziet hoe het eruitziet.
  const showPhotos = async () => {
    if (photos !== null) { setPhotos(null); return } // toggle dicht
    setPhotosLoading(true)
    setPhotoIdx(0)
    try {
      const res = await fetch(`/api/match-instants?where[match][equals]=${matchId}&depth=0&limit=60&sort=-createdAt`, { credentials: 'include' })
      const data = (await res.json().catch(() => ({}))) as { docs?: { filename?: string; url?: string; expiresAt?: string }[] }
      const now = Date.now()
      const urls = (data.docs ?? [])
        .filter((d) => !d.expiresAt || new Date(d.expiresAt).getTime() > now)
        .map((d) => (d.filename ? `/api/match-instants/file/${encodeURIComponent(d.filename)}` : d.url ?? ''))
        .filter(Boolean)
      setPhotos(urls.length > 0 ? urls : DEMO_PHOTOS)
    } catch {
      setPhotos(DEMO_PHOTOS)
    } finally {
      setPhotosLoading(false)
    }
  }

  // Slideshow: elke 4,5 s naar de volgende foto.
  useEffect(() => {
    if (!photos || photos.length < 2) return
    const t = setInterval(() => setPhotoIdx((i) => (i + 1) % photos.length), 4500)
    return () => clearInterval(t)
  }, [photos])

  // Klok-basis bijwerken — reken vanaf clockUpdatedAt (server) zodat de tijd klopt en niet reset.
  useEffect(() => {
    const m = state.match
    const at = m.clockUpdatedAt ? new Date(m.clockUpdatedAt).getTime() : Date.now()
    base.current = { seconds: m.clockSeconds, at }
    setClock(m.clockRunning ? m.clockSeconds + Math.max(0, (Date.now() - at) / 1000) : m.clockSeconds)
  }, [state.match.clockSeconds, state.match.clockRunning, state.match.clockUpdatedAt])

  useEffect(() => {
    if (!state.match.clockRunning) return
    const t = setInterval(() => {
      setClock(base.current.seconds + Math.max(0, (Date.now() - base.current.at) / 1000))
    }, 250)
    return () => clearInterval(t)
  }, [state.match.clockRunning, state.match.clockUpdatedAt])

  const momentum = useMemo(() => buildMomentum(timeline, halfSeconds), [timeline, halfSeconds])
  const nowT = (Math.max(1, state.match.currentHalf) - 1) * halfSeconds + clock

  // Toon de verloop-grafiek één keer, rond het midden van de eerste helft (±30 s), ~1 minuut lang.
  useEffect(() => {
    if (flowShown.current) return
    const mid = halfSeconds / 2
    const inWindow =
      state.match.status === 'live' &&
      !state.atHalfTime &&
      state.match.currentHalf === 1 &&
      clock >= mid - 30 &&
      clock <= mid + 30
    if (!inWindow) return
    flowShown.current = true
    setShowFlow(true)
    flowTimer.current = setTimeout(() => setShowFlow(false), 60_000)
  }, [clock, halfSeconds, state.match.status, state.match.currentHalf, state.atHalfTime])

  useEffect(() => () => {
    if (flowTimer.current) clearTimeout(flowTimer.current)
  }, [])

  useEffect(() => {
    setMatchUrl(`${window.location.origin}/match/${matchId}`)
  }, [matchId])

  const status = state.match.status
  const statusLabel =
    status === 'live' ? (state.atHalfTime ? 'RUST' : 'LIVE') : status === 'finished' ? 'AFGELOPEN' : 'GEPLAND'

  // Pre-match "lobby": het scherm staat aan maar de wedstrijd is nog niet begonnen (klok op 0, niet
  // lopend, 0–0, eerste helft). Dan tonen we scrollende sponsors + een grote QR om online mee te doen.
  // Zodra de wedstrijd start (klok loopt / tijd > 0 / er is gescoord), verdwijnt de lobby vanzelf.
  const preMatch =
    status !== 'finished' &&
    state.match.currentHalf === 1 &&
    !state.match.clockRunning &&
    (state.match.clockSeconds ?? 0) === 0 &&
    clock < 1 &&
    state.score.home === 0 &&
    state.score.away === 0
  const showLobby = preMatch
  const lobbyAds = ads.length > 0 ? ads : DEMO_ADS

  // Dynamische stijl op basis van de clubkleuren. De thuisploeg geeft de toon aan;
  // scoort de tegenpartij, dan komen tijdens de viering hún kleuren naar boven.
  // Op de zaal-tv worden deze kleuren als TEKST/cijfer/klok op een bijna-zwart paneel gebruikt.
  // Klem ze naar een leesbare variant zodat een donker crest de klok/score niet onzichtbaar maakt.
  const home1 = readableOnDark(state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR)
  const home2 = readableOnDark(state.teams.home.colors?.secondary ?? state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR)
  const away1 = readableOnDark(state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR)
  const away2 = readableOnDark(state.teams.away.colors?.secondary ?? state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR)
  const themeAway = goal?.side === 'away'
  const fsStyle = {
    '--home': home1,
    '--away': away1,
    '--theme-1': themeAway ? away1 : home1,
    '--theme-2': themeAway ? away2 : home2,
    // Inkt voor de doelpunt-pil (donkere of witte tekst, afhankelijk van de pil-achtergrond).
    '--goal-ink': inkOn(themeAway ? away1 : home1),
  } as React.CSSProperties

  return (
    <div className={`fs${theme === 'light' ? ' fs-light' : ''}`} style={fsStyle} ref={rootRef}>
      {blast && <ClubColorBlast key={blast.key} colors={blast.colors} teamName={blast.name} />}
      <div className="fs-controls">
        <button
          type="button"
          className="fs-ctrlbtn fs-photobtn"
          onClick={() => void showPhotos()}
          title="Toon de wedstrijdfoto's (kracht-cam, ideaal tijdens de pauze)"
        >
          {photosLoading ? '📷 …' : photos !== null ? '✕ Foto’s' : '📷 Foto’s'}
        </button>
        <button
          type="button"
          className="fs-fsbtn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}
          title={isFullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}
        >
          <svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {isFullscreen ? (
              <path d="M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5" />
            ) : (
              <path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" />
            )}
          </svg>
        </button>
      </div>
      <div className="fs-top">
        <span className={`fs-status ${status}`}>{statusLabel}</span>
        {reeks && <span className="fs-reeks">{reeks}</span>}
        {status === 'live' && !connected && (
          <span className="fs-offline" title="Verbinding verbroken — opnieuw verbinden…">⚠ verbinden…</span>
        )}
        {viewers > 0 && <span className="fs-viewers" title="Kijkers nu">👁 {viewers}</span>}
      </div>

      <div className="fs-main">
        <div className={`fs-team ${goal?.side === 'home' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.home.name} logoUrl={state.teams.home.logoUrl} logoFit={state.teams.home.logoFit} side="home" size={FS_LOGO_SIZE} float ringColor={state.teams.home.colors?.primary} />
          <div className="fs-name">{state.teams.home.name}</div>
          <TeamStats crosses={state.crosses.home} timeouts={state.timeouts.home} />
        </div>

        <div className="fs-center">
          <div className="fs-score">
            <span className={goal?.side === 'home' ? 'fs-pulse' : ''}>{state.score.home}</span>
            <span className="fs-dash">–</span>
            <span className={goal?.side === 'away' ? 'fs-pulse' : ''}>{state.score.away}</span>
          </div>
          <div className="fs-clock">{fmtClock(clock)}</div>
          <div className="fs-half">{status === 'finished' ? 'Einde' : `Helft ${state.match.currentHalf}`}</div>
          {state.refereeStops > 0 && (
            <div className="fs-refmin" title="Time-outs scheidsrechter">🧑‍⚖️ ⏱ {state.refereeStops}</div>
          )}
        </div>

        <div className={`fs-team ${goal?.side === 'away' ? 'scored' : ''}`}>
          <TeamLogo name={state.teams.away.name} logoUrl={state.teams.away.logoUrl} logoFit={state.teams.away.logoFit} side="away" size={FS_LOGO_SIZE} float ringColor={state.teams.away.colors?.primary} />
          <div className="fs-name">{state.teams.away.name}</div>
          <TeamStats crosses={state.crosses.away} timeouts={state.timeouts.away} />
        </div>
      </div>

      {showLobby && (
        <div className="fs-lobby">
          <AdMarquee ads={lobbyAds} position="top" />
          <div className="fs-lobby-body">
            <div className="fs-lobby-teams">
              {state.teams.home.name} <span>—</span> {state.teams.away.name}
            </div>
            <div className="fs-lobby-qr">{matchUrl && <QrCode value={matchUrl} size={320} />}</div>
            <div className="fs-lobby-title">📱 Scan &amp; doe mee</div>
          </div>
          <AdMarquee ads={lobbyAds} position="bottom" />
        </div>
      )}

      {photos !== null && (
        <div className="fs-cam" onClick={() => setPhotos(null)}>
          {photos.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={photoIdx} className="fs-cam-bg" src={photos[photoIdx]} alt={`Wedstrijdfoto ${photoIdx + 1}`} />
              <div className="fs-cam-shade" aria-hidden />
              <div className="fs-cam-spin" aria-hidden />
              <svg className="fs-cam-heart" viewBox="0 0 32 29.6" aria-hidden>
                <path d={HEART_PATH} />
              </svg>
              <span className="fs-cam-spark s1" aria-hidden>✨</span>
              <span className="fs-cam-spark s2" aria-hidden>⭐</span>
              <span className="fs-cam-spark s3" aria-hidden>✨</span>
              <div className="fs-cam-title">💪 KRACHT-CAM 💪</div>
              <div key={`cap-${photoIdx}`} className="fs-cam-caption">{CAM_CAPTIONS[photoIdx % CAM_CAPTIONS.length]}</div>
              <span className="fs-cam-float a" aria-hidden>❤️</span>
              <span className="fs-cam-float b" aria-hidden>💪</span>
              <span className="fs-cam-float c" aria-hidden>🔥</span>
              <span className="fs-cam-float d" aria-hidden>❤️</span>
              <span className="fs-cam-float e" aria-hidden>🎉</span>
              <span className="fs-cam-float f" aria-hidden>💪</span>
            </>
          ) : (
            <div className="fs-photos-empty">Nog geen foto’s van deze wedstrijd.</div>
          )}
        </div>
      )}

      {goal && (
        <div key={goal.key} className={`fs-goal side-${goal.side}`}>
          <div className="fs-goal-burst" aria-hidden />
          <div className="fs-goal-card">
            <div className="fs-goal-title">DOELPUNT!</div>
            <div className="fs-goal-team">{goal.team}</div>
            {goal.scorer && <div className="fs-goal-scorer">{goal.scorer}</div>}
            <div className="fs-goal-pts">{goal.points === 2 ? 'RUGWORP +2' : 'NEKWORP +1'}</div>
          </div>
        </div>
      )}

      {showFlow && (
          <div className="fs-flow">
            <div className="fs-flow-card">
              <div className="fs-flow-head">
                <span className="fs-flow-title">📈 Wedstrijdverloop</span>
                <span className="fs-flow-score">
                  <b style={{ color: home1 }}>{state.score.home}</b>
                  <i>–</i>
                  <b style={{ color: away1 }}>{state.score.away}</b>
                </span>
              </div>
              <MomentumChart points={momentum} nowT={nowT} homeColor={home1} awayColor={away1} />
              <div className="fs-flow-legend">
                <span><i style={{ background: home1 }} /> {state.teams.home.name}</span>
                <span className="fs-flow-mid">{fmtClock(clock)} · Helft {state.match.currentHalf}</span>
                <span>{state.teams.away.name} <i style={{ background: away1 }} /></span>
              </div>
            </div>
          </div>
      )}
    </div>
  )
}
