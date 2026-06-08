'use client'

import { useEffect, useRef, useState } from 'react'

import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import { downloadBlob, saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import type { MatchStats } from '@/lib/stats'

type Goal = { side: 'home' | 'away'; points: number; half: number; gameClock?: number }
type Player = MatchStats['players'][number]
type Fmt = 'vierkant' | 'portret' | 'verhaal'

// Drie deelformaten — vierkant (Insta-feed), portret (4:5) en verhaal (9:16 story).
const FORMATS: Record<Fmt, { W: number; H: number; label: string }> = {
  vierkant: { W: 1080, H: 1080, label: 'Vierkant' },
  portret: { W: 1080, H: 1350, label: 'Portret' },
  verhaal: { W: 1080, H: 1920, label: 'Verhaal' },
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const first = (n: string) => n.split(/\s+/)[0]

// Vijfpuntige ster voor de rugworp-markering op het scoreverloop.
function starPoints(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.44
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (-90 + i * 36) * (Math.PI / 180)
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

// Eén compacte regel onder de badge (afgekort indien nodig) — zo botst de naam nooit met de
// uitslag-pil eronder, ongeacht het formaat.
function shortName(name: string, max = 18): string {
  const n = name.trim()
  return n.length > max ? n.slice(0, max - 1).trimEnd() + '…' : n
}

const initials = (name: string) =>
  name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

function pick(players: Player[], ok: (p: Player) => boolean, better: (a: Player, b: Player) => boolean): Player | null {
  const c = players.filter(ok)
  if (c.length === 0) return null
  return c.reduce((best, p) => (better(p, best) ? p : best))
}

// Bestand (logo of teamfoto) als data-URL — anders "tainted canvas" en mislukt de PNG-export op gsm.
async function tryFetchDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.type && !blob.type.startsWith('image/')) return null
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}
async function urlToDataUrl(url: string): Promise<string | null> {
  // 1) Rechtstreeks (werkt voor eigen/CORS-vriendelijke logo's).
  const direct = await tryFetchDataUrl(url)
  if (direct) return direct
  // 2) Extern logo zonder CORS → via onze eigen proxy (zelfde origin, geen taint).
  try {
    const abs = new URL(url, window.location.origin).href
    return await tryFetchDataUrl(`/api/logo-proxy?url=${encodeURIComponent(abs)}`)
  } catch {
    return null
  }
}
function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
    r.onerror = () => resolve(null)
    r.readAsDataURL(blob)
  })
}

export function ShareCard({
  matchId,
  teams,
  score,
  colors,
  logos,
  goals,
  players,
  reeks,
  datum,
}: {
  matchId: number
  teams: { home: string; away: string }
  score: { home: number; away: number }
  colors: { home: string | null; away: string | null }
  logos: { home: string | null; away: string | null }
  goals: Goal[]
  players: Player[]
  reeks: string
  datum: string | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [fmt, setFmt] = useState<Fmt>('vierkant')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [logoData, setLogoData] = useState<{ home: string | null; away: string | null }>({ home: null, away: null })
  const [photo, setPhoto] = useState<string | null>(null)
  const logoDataRef = useRef(logoData)
  logoDataRef.current = logoData

  useEffect(() => {
    let alive = true
    void (async () => {
      const [h, a] = await Promise.all([
        logos.home ? urlToDataUrl(logos.home) : Promise.resolve(null),
        logos.away ? urlToDataUrl(logos.away) : Promise.resolve(null),
      ])
      if (alive) setLogoData({ home: h, away: a })
    })()
    return () => { alive = false }
  }, [logos.home, logos.away])

  // Garandeer dat de logo's geladen (en in de SVG getekend) zijn vóór we naar PNG omzetten —
  // anders verschijnen de initialen i.p.v. de clublogo's als je snel klikt.
  const ensureLogos = async () => {
    const cur = logoDataRef.current
    const needH = logos.home && !cur.home
    const needA = logos.away && !cur.away
    if (!needH && !needA) return
    const [h, a] = await Promise.all([
      needH ? urlToDataUrl(logos.home!) : Promise.resolve(cur.home),
      needA ? urlToDataUrl(logos.away!) : Promise.resolve(cur.away),
    ])
    setLogoData({ home: h, away: a })
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())))
  }

  const onPhoto = async (file: File | null) => {
    if (!file) return setPhoto(null)
    setPhoto(await blobToDataUrl(file))
  }

  const { W, H } = FORMATS[fmt]
  const homeC = readableOnDark(colors.home ?? DEFAULT_HOME_COLOR)
  const awayC = readableOnDark(colors.away ?? DEFAULT_AWAY_COLOR)

  // ── Ingetogen, editoriaal palet (geen felle kleuren, geen emoji op de kaart). ──
  const INK = '#f1f5f2'
  const DIM = '#8a9c93'
  const FAINT = 'rgba(255,255,255,0.09)' // hairlines
  const GOLD = '#c9a44c'
  const M = Math.round(W * 0.085) // zijmarge
  const upper = (s: string) => s.toUpperCase()

  // ── Scoreverloop (momentum). ──
  let diff = 0
  const seq = goals.map((g, i) => {
    diff += g.side === 'home' ? g.points : -g.points
    return { x: i + 1, diff, side: g.side, rug: g.points === 2 }
  })
  const nGoals = seq.length
  const maxAbs = Math.max(1, ...seq.map((s) => Math.abs(s.diff)))
  const rugTotal = seq.filter((s) => s.rug).length

  const winner = score.home > score.away ? 'home' : score.away > score.home ? 'away' : 'draw'
  const winnerName = winner === 'home' ? teams.home : winner === 'away' ? teams.away : ''
  const resultLabel = winner === 'draw' ? 'GELIJKSPEL' : `WINST · ${upper(shortName(winnerName, 20))}`

  // ── Kerncijfers (data-forward, geen pillen). ──
  const active = players.filter((p) => p.throws > 0)
  const hasPlayers = active.length > 0
  const mvp = pick(active, () => true, (a, b) =>
    a.score > b.score || (a.score === b.score && a.goals.points > b.goals.points) || (a.score === b.score && a.goals.points === b.goals.points && a.lost < b.lost),
  )
  const verste = pick(active, (p) => p.distance.max > 0, (a, b) => a.distance.max > b.distance.max)
  const topscorer = pick(active, (p) => p.goals.points > 0, (a, b) => a.goals.points > b.goals.points)
  const conv = pick(active, (p) => p.goalAttempts >= 3, (a, b) => a.conversion > b.conversion)

  const stats: { num: string; label: string }[] = [
    { num: `${nGoals}`, label: 'DOELPUNTEN' },
    { num: `${maxAbs}`, label: 'MAX. VOORSPRONG' },
    ...(rugTotal > 0 ? [{ num: `${rugTotal}`, label: 'RUGWORPEN' }] : []),
  ]
  const mvpStats: { num: string; label: string; sub: string }[] = [
    verste && { num: `${verste.distance.max.toFixed(1)} m`, label: 'VERSTE WORP', sub: `#${verste.shirtNumber} ${first(verste.playerName)}` },
    topscorer && { num: `${topscorer.goals.points}`, label: 'MEESTE PUNTEN', sub: `#${topscorer.shirtNumber} ${first(topscorer.playerName)}` },
    conv && { num: `${Math.round(conv.conversion * 100)}%`, label: 'CONVERSIE', sub: `#${conv.shirtNumber} ${first(conv.playerName)}` },
  ].filter(Boolean) as { num: string; label: string; sub: string }[]

  // ── Verticale flow: scorebord / verloop / cijfers / feature. (Kop + voet vast.) ──
  const pad = Math.round(H * 0.05)
  const headerH = Math.round(H * 0.105)
  const footerH = Math.round(H * 0.055)
  const contentTop = pad + headerH
  const contentBot = H - footerH
  const avail = contentBot - contentTop
  const wScore = 0.36, wMom = 0.27, wStats = 0.12, wFeat = hasPlayers ? 0.25 : 0.09
  const wSum = wScore + wMom + wStats + wFeat
  const gaps = 3
  const blockSpace = avail - Math.round(avail * 0.08)
  const gap = (avail - blockSpace) / gaps
  let y = contentTop
  const scoreBox = { y, h: blockSpace * (wScore / wSum) }; y += scoreBox.h + gap
  const momBox = { y, h: blockSpace * (wMom / wSum) }; y += momBox.h + gap
  const statsBox = { y, h: blockSpace * (wStats / wSum) }; y += statsBox.h + gap
  const featBox = { y, h: blockSpace * (wFeat / wSum) }

  // Editoriaal kopje: label links + dunne haarlijn die doorloopt tot de rechtermarge.
  const sectionSize = clamp(H * 0.0145, 17, 26)
  const Section = ({ label, yy, color = DIM }: { label: string; yy: number; color?: string }) => {
    const w = label.length * (sectionSize * 0.64 + 3.2) + 18
    return (
      <>
        <text x={M} y={yy} fontSize={sectionSize} fontWeight={700} letterSpacing="3.2" fill={color}>{label}</text>
        <line x1={M + w} y1={yy - sectionSize * 0.32} x2={W - M} y2={yy - sectionSize * 0.32} stroke={FAINT} strokeWidth={1.5} />
      </>
    )
  }

  // Cijferkolommen met dunne verticale scheidingslijnen — geen pillen.
  const StatColumns = ({ items, box, withSub = false }: { items: { num: string; label: string; sub?: string }[]; box: { y: number; h: number }; withSub?: boolean }) => {
    const n = items.length || 1
    const colW = (W - 2 * M) / n
    const numSize = clamp(box.h * (withSub ? 0.34 : 0.46), 30, withSub ? 52 : 68)
    const labelSize = clamp(box.h * 0.135, 13, 20)
    const numY = box.y + box.h * (withSub ? 0.42 : 0.5)
    return (
      <>
        {items.map((it, i) => {
          const cx = M + colW * (i + 0.5)
          return (
            <g key={i}>
              {i > 0 && <line x1={M + colW * i} y1={box.y + box.h * 0.12} x2={M + colW * i} y2={box.y + box.h * 0.88} stroke={FAINT} strokeWidth={1.5} />}
              <text x={cx} y={numY} textAnchor="middle" fontSize={numSize} fontWeight={800} letterSpacing="-1" fill={INK}>{it.num}</text>
              <text x={cx} y={numY + labelSize * 1.7} textAnchor="middle" fontSize={labelSize} fontWeight={700} letterSpacing="2" fill={DIM}>{it.label}</text>
              {withSub && it.sub && <text x={cx} y={numY + labelSize * 3} textAnchor="middle" fontSize={labelSize * 0.92} fill={DIM} opacity={0.75}>{it.sub}</text>}
            </g>
          )
        })}
      </>
    )
  }

  // ── Scorebord: logo's + namen, daaronder de grote score met een gouden accent onder de winnaar. ──
  const logoR = clamp(scoreBox.h * 0.20, 50, 104)
  const logoCy = scoreBox.y + logoR + scoreBox.h * 0.02
  const ClubMark = ({ side }: { side: 'home' | 'away' }) => {
    const cx = side === 'home' ? W * 0.27 : W * 0.73
    const c = side === 'home' ? homeC : awayC
    const data = side === 'home' ? logoData.home : logoData.away
    const name = side === 'home' ? teams.home : teams.away
    const nameSize = clamp(logoR * 0.3, 19, 30)
    return (
      <g>
        <circle cx={cx} cy={logoCy} r={logoR} fill="#0a1610" stroke={c} strokeWidth={2.5} strokeOpacity={0.55} />
        {data ? (
          <>
            <clipPath id={`clip-${side}`}><circle cx={cx} cy={logoCy} r={logoR - 5} /></clipPath>
            <image href={data} x={cx - (logoR - 5)} y={logoCy - (logoR - 5)} width={(logoR - 5) * 2} height={(logoR - 5) * 2} clipPath={`url(#clip-${side})`} preserveAspectRatio="xMidYMid meet" />
          </>
        ) : (
          <text x={cx} y={logoCy + logoR * 0.32} textAnchor="middle" fontSize={logoR * 0.74} fontWeight={800} fill={c}>{initials(name)}</text>
        )}
        <text x={cx} y={logoCy + logoR + nameSize * 1.5} textAnchor="middle" fontSize={nameSize} fontWeight={700} letterSpacing="1.5" fill={INK}>{upper(shortName(name, 15))}</text>
      </g>
    )
  }

  const Scoreboard = () => {
    const scoreSize = clamp(scoreBox.h * 0.40, 84, 184)
    const baseline = scoreBox.y + scoreBox.h * 0.74
    const maxDigits = Math.max(String(score.home).length, String(score.away).length)
    const sgap = scoreSize * (0.34 + 0.27 * maxDigits)
    const homeX = W / 2 - sgap
    const awayX = W / 2 + sgap
    const capSize = clamp(scoreBox.h * 0.07, 18, 30) * (resultLabel.length > 24 ? 0.82 : 1)
    return (
      <>
        <ClubMark side="home" />
        <ClubMark side="away" />
        <text x={homeX} y={baseline} textAnchor="middle" fontSize={scoreSize} fontWeight={800} letterSpacing="-3" fill={winner === 'away' ? DIM : INK}>{score.home}</text>
        <text x={W / 2} y={baseline - scoreSize * 0.12} textAnchor="middle" fontSize={scoreSize * 0.5} fontWeight={300} fill={DIM}>–</text>
        <text x={awayX} y={baseline} textAnchor="middle" fontSize={scoreSize} fontWeight={800} letterSpacing="-3" fill={winner === 'home' ? DIM : INK}>{score.away}</text>
        {winner !== 'draw' && (
          <line x1={(winner === 'home' ? homeX : awayX) - scoreSize * 0.26} y1={baseline + scoreSize * 0.16} x2={(winner === 'home' ? homeX : awayX) + scoreSize * 0.26} y2={baseline + scoreSize * 0.16} stroke={GOLD} strokeWidth={Math.max(3, scoreSize * 0.03)} />
        )}
        <text x={W / 2} y={scoreBox.y + scoreBox.h - capSize * 0.2} textAnchor="middle" fontSize={capSize} fontWeight={700} letterSpacing="4" fill={GOLD}>{resultLabel}</text>
      </>
    )
  }

  const Momentum = () => {
    const plotTop = momBox.y + momBox.h * 0.18
    const plotH = momBox.h * 0.78
    const cmid = plotTop + plotH / 2
    const x0 = M, plotW = W - 2 * M
    const xAt = (i: number) => x0 + (nGoals <= 1 ? plotW / 2 : (i / nGoals) * plotW)
    const yAt = (d: number) => cmid - (d / maxAbs) * (plotH / 2 - 8)
    const dot = clamp(momBox.h * 0.028, 3.5, 7)
    const linePts = nGoals > 0 ? [`${x0},${cmid}`, ...seq.map((s) => `${xAt(s.x).toFixed(1)},${yAt(s.diff).toFixed(1)}`)] : []
    const areaPath = nGoals > 0 ? `M ${linePts.join(' L ')} L ${xAt(nGoals).toFixed(1)},${cmid} L ${x0},${cmid} Z` : ''
    return (
      <>
        <Section label="VERLOOP" yy={momBox.y} />
        {nGoals > 0 ? (
          <>
            <line x1={x0} y1={cmid} x2={x0 + plotW} y2={cmid} stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} strokeDasharray="1 7" strokeLinecap="round" />
            <path d={areaPath} fill="url(#momFill)" />
            <polyline points={linePts.join(' ')} fill="none" stroke={INK} strokeWidth={clamp(dot * 0.65, 2.5, 4)} strokeLinejoin="round" strokeLinecap="round" />
            {seq.filter((s) => s.rug).map((s, i) => (
              <polygon key={i} points={starPoints(xAt(s.x), yAt(s.diff), dot * 2.1)} fill={s.side === 'home' ? homeC : awayC} stroke={GOLD} strokeWidth={1.6} strokeLinejoin="round" paintOrder="stroke" />
            ))}
          </>
        ) : (
          <text x={W / 2} y={cmid} textAnchor="middle" fontSize={sectionSize} fill={DIM}>Geen scoreverloop beschikbaar</text>
        )}
      </>
    )
  }

  const Feature = () => {
    if (hasPlayers && mvp) {
      const nameSize = clamp(featBox.h * 0.16, 26, 46)
      const sub = `${mvp.goals.points} punten · ${mvp.goals.total} doelpunten`
      return (
        <>
          <Section label="SPELER VAN DE WEDSTRIJD" yy={featBox.y} color={GOLD} />
          <text x={M} y={featBox.y + nameSize * 1.4} fontSize={nameSize} fontWeight={800} fill={INK}>#{mvp.shirtNumber} {mvp.playerName}</text>
          <text x={W - M} y={featBox.y + nameSize * 1.4} textAnchor="end" fontSize={clamp(featBox.h * 0.1, 16, 26)} fill={DIM}>{sub}</text>
          <StatColumns items={mvpStats} box={{ y: featBox.y + featBox.h * 0.42, h: featBox.h * 0.58 }} withSub />
        </>
      )
    }
    return <line x1={M} y1={featBox.y + featBox.h * 0.5} x2={W - M} y2={featBox.y + featBox.h * 0.5} stroke={FAINT} strokeWidth={1.5} />
  }

  const brandSize = clamp(headerH * 0.3, 28, 46)
  const metaSize = clamp(headerH * 0.17, 17, 26)
  const headRuleY = pad + brandSize + metaSize * 1.4

  const rasterize = async () => svgToPngBlob(svgRef.current!, { scale: 2, background: '#07120c' })
  const fileName = () => `${slugFilename('krachtbal', teams.home, teams.away, fmt) || `krachtbal-wedstrijd-${matchId}`}.png`

  const share = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try {
      await ensureLogos()
      await saveOrShareBlob(await rasterize(), fileName(), `${teams.home} ${score.home}–${score.away} ${teams.away}`)
    } catch { setMsg('Kaart maken mislukt — probeer opnieuw.'); setTimeout(() => setMsg(null), 3500) }
    finally { setBusy(false) }
  }
  const download = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try { await ensureLogos(); downloadBlob(await rasterize(), fileName()) }
    catch { setMsg('Download mislukt — probeer opnieuw.'); setTimeout(() => setMsg(null), 3500) }
    finally { setBusy(false) }
  }

  return (
    <div className="an-share">
      <div className="an-share-controls">
        <div className="an-share-fmt" role="group" aria-label="Formaat">
          {(Object.keys(FORMATS) as Fmt[]).map((f) => (
            <button key={f} type="button" className={`an-share-fmt-btn${fmt === f ? ' on' : ''}`} onClick={() => setFmt(f)}>
              {FORMATS[f].label}
            </button>
          ))}
        </div>
        <label className="an-share-photo">
          {photo ? '🖼️ Foto wijzigen' : '🖼️ Teamfoto (optioneel)'}
          <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {photo && <button type="button" className="an-share-photo-clear" onClick={() => setPhoto(null)}>✕ foto weg</button>}
      </div>

      <div className="an-share-actions">
        <button type="button" className="sk-demo-cta" onClick={share} disabled={busy}>
          {busy ? '⏳ Bezig…' : '📲 Delen'}
        </button>
        <button type="button" className="an-share-dl" onClick={download} disabled={busy}>⬇️ Downloaden</button>
        {msg && <span className="an-pdf-msg">{msg}</span>}
      </div>

      {/* Off-screen render-doel — wordt naar PNG omgezet bij delen/downloaden. */}
      <div style={{ position: 'absolute', left: -99999, top: 0, width: W, height: H, pointerEvents: 'none' }} aria-hidden>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg"
          fontFamily="'Inter','Segoe UI',system-ui,-apple-system,sans-serif">
          <defs>
            <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c1a12" />
              <stop offset="55%" stopColor="#071009" />
              <stop offset="100%" stopColor="#050d09" />
            </linearGradient>
            <radialGradient id="vign" cx="50%" cy="42%" r="75%">
              <stop offset="62%" stopColor="#000000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0.45} />
            </radialGradient>
            <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={homeC} stopOpacity={0.32} />
              <stop offset="50%" stopColor={homeC} stopOpacity={0.02} />
              <stop offset="50%" stopColor={awayC} stopOpacity={0.02} />
              <stop offset="100%" stopColor={awayC} stopOpacity={0.32} />
            </linearGradient>
          </defs>

          {/* Achtergrond — diep, ingetogen, met een subtiele clubkleur-zweem boven/onder. */}
          <rect x="0" y="0" width={W} height={H} fill="#07120c" />
          <rect x="0" y="0" width={W} height={H} fill="url(#cardBg)" />
          {photo && <image href={photo} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" opacity={0.42} />}
          {photo && <rect x="0" y="0" width={W} height={H} fill="#07120c" opacity={0.6} />}
          <rect x="0" y="0" width={W} height={Math.round(H * 0.16)} fill={homeC} opacity={0.06} />
          <rect x="0" y={H - Math.round(H * 0.16)} width={W} height={Math.round(H * 0.16)} fill={awayC} opacity={0.06} />
          <rect x="0" y="0" width={W} height={H} fill="url(#vign)" />
          <rect x={Math.round(W * 0.04)} y={Math.round(W * 0.04)} width={W - Math.round(W * 0.08)} height={H - Math.round(W * 0.08)} rx="2" fill="none" stroke={FAINT} strokeWidth={1.5} />

          {/* Kop — masthead met haarlijn en meta links/rechts. */}
          <text x={M} y={pad + brandSize} fontSize={brandSize} fontWeight={800} letterSpacing="5" fill={INK}>KRACHTBAL <tspan fill={GOLD}>LIVE</tspan></text>
          <line x1={M} y1={headRuleY} x2={W - M} y2={headRuleY} stroke={FAINT} strokeWidth={1.5} />
          <text x={M} y={headRuleY + metaSize * 1.5} fontSize={metaSize} letterSpacing="2" fill={DIM}>{upper(reeks)}</text>
          {datum && <text x={W - M} y={headRuleY + metaSize * 1.5} textAnchor="end" fontSize={metaSize} letterSpacing="2" fill={DIM}>{upper(datum)}</text>}

          <Scoreboard />
          <Momentum />
          <Section label="WEDSTRIJD IN CIJFERS" yy={statsBox.y - statsBox.h * 0.16} />
          <StatColumns items={stats} box={statsBox} />
          <Feature />

          {/* Voet */}
          <line x1={M} y1={H - footerH} x2={W - M} y2={H - footerH} stroke={FAINT} strokeWidth={1.5} />
          <text x={W / 2} y={H - footerH * 0.36} textAnchor="middle" fontSize={clamp(footerH * 0.32, 16, 24)} fontWeight={700} letterSpacing="4" fill={DIM}>KRACHTBAL.LIVE</text>
        </svg>
      </div>
    </div>
  )
}
