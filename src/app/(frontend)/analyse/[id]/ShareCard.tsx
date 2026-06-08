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
async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    return await blobToDataUrl(await res.blob())
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
  const result = winner === 'draw' ? 'GELIJKSPEL ⚖️' : `${shortName(winnerName, 18).toUpperCase()} WINT 🏆`

  // ── Hoogtepunten. ──
  const active = players.filter((p) => p.throws > 0)
  const hasPlayers = active.length > 0
  const mvp = pick(active, () => true, (a, b) =>
    a.score > b.score || (a.score === b.score && a.goals.points > b.goals.points) || (a.score === b.score && a.goals.points === b.goals.points && a.lost < b.lost),
  )
  const verste = pick(active, (p) => p.distance.max > 0, (a, b) => a.distance.max > b.distance.max)
  const topscorer = pick(active, (p) => p.goals.points > 0, (a, b) => a.goals.points > b.goals.points)
  const conv = pick(active, (p) => p.goalAttempts >= 3, (a, b) => a.conversion > b.conversion)
  const cOf = (p: Player) => (p.teamSide === 'home' ? homeC : awayC)
  const chips = [
    verste && { ico: '🚀', lbl: 'Verste worp', val: `${verste.distance.max.toFixed(1)} m`, who: `#${verste.shirtNumber} ${first(verste.playerName)}`, c: cOf(verste) },
    topscorer && { ico: '🎯', lbl: 'Topscorer', val: `${topscorer.goals.points} ptn`, who: `#${topscorer.shirtNumber} ${first(topscorer.playerName)}`, c: cOf(topscorer) },
    conv && { ico: '✅', lbl: 'Conversie', val: `${Math.round(conv.conversion * 100)}%`, who: `#${conv.shirtNumber} ${first(conv.playerName)}`, c: cOf(conv) },
  ].filter(Boolean) as { ico: string; lbl: string; val: string; who: string; c: string }[]

  const facts = [
    { ico: '🥅', txt: `${nGoals} doelpunten` },
    { ico: '📊', txt: `grootste kloof ${maxAbs}` },
    rugTotal > 0 ? { ico: '💪', txt: `${rugTotal} rugworp${rugTotal === 1 ? '' : 'en'}` } : null,
  ].filter(Boolean) as { ico: string; txt: string }[]

  // ── Verticale flow: kop / hero / momentum / feiten / details / voet. ──
  const pad = Math.round(H * 0.022)
  const headerH = Math.round(H * 0.115)
  const footerH = Math.round(H * 0.05)
  const contentTop = pad + headerH
  const contentBot = H - footerH
  const avail = contentBot - contentTop
  // Blok-hoogtes (fracties); details groter als er spelerdata is.
  const wHero = 0.40, wMom = 0.24, wFacts = 0.07, wDet = hasPlayers ? 0.29 : 0.16
  const wSum = wHero + wMom + wFacts + wDet
  const gaps = 3
  const blockSpace = avail - Math.round(avail * 0.06) // 6% van de hoogte voor tussenruimtes
  const gap = (avail - blockSpace) / gaps
  const hHero = blockSpace * (wHero / wSum)
  const hMom = blockSpace * (wMom / wSum)
  const hFacts = blockSpace * (wFacts / wSum)
  const hDet = blockSpace * (wDet / wSum)
  let y = contentTop
  const heroBox = { y, h: hHero }; y += hHero + gap
  const momBox = { y, h: hMom }; y += hMom + gap
  const factsBox = { y, h: hFacts }; y += hFacts + gap
  const detBox = { y, h: hDet }

  // Gedeelde hero-geometrie: badges + namen bovenaan, score eronder, uitslag onderaan — gestapeld,
  // zodat de score nooit over de clublogo's valt.
  const heroR = clamp(heroBox.h * 0.21, 52, 110)
  const heroCy = heroBox.y + heroR + heroBox.h * 0.03
  const heroNameSize = clamp(heroR * 0.34, 22, 36)

  // ── Render-helpers (alles schaalt mee met zijn vak). ──
  const Badge = ({ side }: { side: 'home' | 'away' }) => {
    const r = heroR
    const cy = heroCy
    const cx = side === 'home' ? W * 0.25 : W * 0.75
    const c = side === 'home' ? homeC : awayC
    const data = side === 'home' ? logoData.home : logoData.away
    const name = side === 'home' ? teams.home : teams.away
    return (
      <g>
        <circle cx={cx} cy={cy} r={r + r * 0.07} fill="none" stroke={c} strokeWidth={Math.max(3, r * 0.05)} opacity={0.85} />
        <circle cx={cx} cy={cy} r={r} fill="#0b1d14" filter="url(#soft)" />
        {data ? (
          <>
            <clipPath id={`clip-${side}`}><circle cx={cx} cy={cy} r={r - 4} /></clipPath>
            <image href={data} x={cx - (r - 4)} y={cy - (r - 4)} width={(r - 4) * 2} height={(r - 4) * 2} clipPath={`url(#clip-${side})`} preserveAspectRatio="xMidYMid meet" />
          </>
        ) : (
          <text x={cx} y={cy + r * 0.34} textAnchor="middle" fontSize={r * 0.78} fontWeight={800} fill={c}>{initials(name)}</text>
        )}
        <text x={cx} y={cy + r + heroNameSize * 1.3} textAnchor="middle" fontSize={heroNameSize} fontWeight={800} fill="#eafff5">{shortName(name, 16)}</text>
      </g>
    )
  }

  const Hero = () => {
    const scoreSize = clamp(heroBox.h * 0.30, 72, 156)
    const scoreBaseline = heroBox.y + heroBox.h * 0.74
    const capSize = clamp(heroBox.h * 0.078, 20, 38) * (result.length > 22 ? 0.78 : 1)
    const capY = heroBox.y + heroBox.h - capSize * 0.4
    return (
      <>
        <Badge side="home" />
        <Badge side="away" />
        <text x={W / 2} y={scoreBaseline} textAnchor="middle" fontSize={scoreSize} fontWeight={900} letterSpacing="-2">
          <tspan fill={winner === 'away' ? '#8aa399' : homeC}>{score.home}</tspan>
          <tspan fill="#5f7268" fontSize={scoreSize * 0.6} dx={scoreSize * 0.04}> – </tspan>
          <tspan fill={winner === 'home' ? '#8aa399' : awayC} dx={scoreSize * 0.04}>{score.away}</tspan>
        </text>
        <text x={W / 2} y={capY} textAnchor="middle" fontSize={capSize} fontWeight={800} letterSpacing="3" fill="#f4c430">{result}</text>
      </>
    )
  }

  const Momentum = () => {
    const titleSize = clamp(momBox.h * 0.13, 24, 40)
    const cx0 = 96, cw = W - 192
    const top = momBox.y + momBox.h * 0.34
    const ch = momBox.h * 0.52
    const cmid = top + ch / 2
    const xAt = (i: number) => cx0 + (nGoals <= 1 ? cw / 2 : (i / nGoals) * cw)
    const yAt = (d: number) => cmid - (d / maxAbs) * (ch / 2 - 6)
    const dot = clamp(momBox.h * 0.035, 4, 8)
    const linePts = nGoals > 0 ? [`${cx0},${cmid}`, ...seq.map((s) => `${xAt(s.x).toFixed(1)},${yAt(s.diff).toFixed(1)}`)] : []
    const areaPath = nGoals > 0 ? `M ${linePts.join(' L ')} L ${xAt(nGoals).toFixed(1)},${cmid} L ${cx0},${cmid} Z` : ''
    return (
      <>
        <g filter="url(#soft)">
          <rect x="60" y={momBox.y} width={W - 120} height={momBox.h} rx="26" fill="#0c2418" fillOpacity={photo ? 0.82 : 1} stroke="#ffffff" strokeOpacity={0.08} strokeWidth={2} />
        </g>
        <text x="92" y={momBox.y + titleSize * 1.4} fontSize={titleSize} fontWeight={800} fill="#eafff5">📈 Scoreverloop</text>
        {nGoals > 0 && (
          <>
            <line x1={cx0} y1={cmid} x2={cx0 + cw} y2={cmid} stroke="#ffffff" strokeOpacity={0.18} strokeWidth={2} strokeDasharray="2 6" />
            <path d={areaPath} fill="url(#momFill)" />
            <polyline points={linePts.join(' ')} fill="none" stroke="#ffffff" strokeOpacity={0.92} strokeWidth={clamp(dot * 0.7, 3, 5)} strokeLinejoin="round" strokeLinecap="round" />
            {seq.map((s, i) =>
              s.rug ? (
                <text key={i} x={xAt(s.x)} y={yAt(s.diff) + dot * 1.6} textAnchor="middle" fontSize={dot * 4.5} fill={s.side === 'home' ? homeC : awayC}>★</text>
              ) : (
                <circle key={i} cx={xAt(s.x)} cy={yAt(s.diff)} r={dot} fill={s.side === 'home' ? homeC : awayC} stroke="#08160f" strokeWidth={2} />
              ),
            )}
          </>
        )}
      </>
    )
  }

  const Facts = () => {
    const n = facts.length || 1
    const ph = clamp(factsBox.h * 0.82, 48, 72)
    const pw = clamp((W - 120 - (n - 1) * 24) / n, 220, 320)
    const totalW = n * pw + (n - 1) * 24
    const fy = factsBox.y + (factsBox.h - ph) / 2
    const fs = clamp(ph * 0.38, 20, 28)
    return (
      <>
        {facts.map((f, i) => {
          const x = W / 2 - totalW / 2 + i * (pw + 24)
          return (
            <g key={i}>
              <rect x={x} y={fy} width={pw} height={ph} rx={ph / 2} fill="#103122" fillOpacity={photo ? 0.85 : 1} stroke="#ffffff" strokeOpacity={0.08} strokeWidth={2} />
              <text x={x + pw / 2} y={fy + ph * 0.64} textAnchor="middle" fontSize={fs} fontWeight={700} fill="#eafff5">{f.ico} {f.txt}</text>
            </g>
          )
        })}
      </>
    )
  }

  const Details = () => {
    if (hasPlayers && mvp) {
      const bh = detBox.h * 0.34
      const labelSize = clamp(bh * 0.22, 18, 30)
      const nameSize = clamp(bh * 0.34, 28, 48)
      return (
        <>
          <g filter="url(#soft)">
            <rect x="60" y={detBox.y} width={W - 120} height={bh} rx="24" fill={cOf(mvp)} fillOpacity={0.16} stroke={cOf(mvp)} strokeWidth={2} strokeOpacity={0.6} />
          </g>
          <text x="92" y={detBox.y + bh * 0.4} fontSize={labelSize} fontWeight={800} letterSpacing="1" fill={cOf(mvp)}>★ SPELER VAN DE WEDSTRIJD</text>
          <text x="92" y={detBox.y + bh * 0.82} fontSize={nameSize} fontWeight={900} fill="#ffffff">#{mvp.shirtNumber} {mvp.playerName}</text>
          <text x={W - 90} y={detBox.y + bh * 0.62} textAnchor="end" fontSize={clamp(bh * 0.22, 18, 28)} fill="#cfe6dc">{mvp.goals.points} ptn · {mvp.goals.total} doelp.</text>
          {(() => {
            const n = chips.length || 1
            const cy0 = detBox.y + bh + detBox.h * 0.05
            const cardH = detBox.y + detBox.h - cy0
            const cwid = (W - 120 - (n - 1) * 20) / n
            return chips.map((ch, i) => {
              const x = 60 + i * (cwid + 20)
              return (
                <g key={i}>
                  <rect x={x} y={cy0} width={cwid} height={cardH} rx="22" fill="#0c2418" fillOpacity={photo ? 0.82 : 1} stroke={ch.c} strokeOpacity={0.5} strokeWidth={2} />
                  <text x={x + cwid / 2} y={cy0 + cardH * 0.34} textAnchor="middle" fontSize={clamp(cardH * 0.3, 32, 48)}>{ch.ico}</text>
                  <text x={x + cwid / 2} y={cy0 + cardH * 0.62} textAnchor="middle" fontSize={clamp(cardH * 0.13, 16, 22)} fill="#9fc6b6">{ch.lbl}</text>
                  <text x={x + cwid / 2} y={cy0 + cardH * 0.86} textAnchor="middle" fontSize={clamp(cardH * 0.2, 22, 32)} fontWeight={800} fill={ch.c}>{ch.val}</text>
                </g>
              )
            })
          })()}
        </>
      )
    }
    // Geen worpdata (snelscore): een strakke, ingetogen afsluiter — geen emoji-parade.
    const lineW = clamp(W * 0.34, 280, 460)
    const cy = detBox.y + detBox.h * 0.5
    const headline = winner === 'draw' ? 'Punten gedeeld' : `Overwinning voor ${shortName(winnerName, 20)}`
    return (
      <>
        <line x1={W / 2 - lineW / 2} y1={cy - detBox.h * 0.28} x2={W / 2 + lineW / 2} y2={cy - detBox.h * 0.28} stroke="#f4c430" strokeOpacity={0.4} strokeWidth={2} />
        <text x={W / 2} y={cy + clamp(detBox.h * 0.1, 14, 22)} textAnchor="middle" fontSize={clamp(detBox.h * 0.3, 30, 52)} fontWeight={800} fill="#ffffff">{headline}</text>
      </>
    )
  }

  const brandSize = clamp(headerH * 0.34, 34, 56)
  const metaSize = clamp(headerH * 0.2, 22, 32)

  const rasterize = async () => svgToPngBlob(svgRef.current!, { scale: 2, background: '#08160f' })
  const fileName = () => `${slugFilename('krachtbal', teams.home, teams.away, fmt) || `krachtbal-wedstrijd-${matchId}`}.png`

  const share = async () => {
    if (busy || !svgRef.current) return
    setBusy(true); setMsg(null)
    try {
      await ensureLogos()
      await saveOrShareBlob(await rasterize(), fileName(), `${teams.home} ${score.home}–${score.away} ${teams.away} 🏐`)
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
          fontFamily="'Inter','Segoe UI',system-ui,-apple-system,'Apple Color Emoji','Noto Color Emoji',sans-serif">
          <defs>
            <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={homeC} stopOpacity={0.16} />
              <stop offset="22%" stopColor="#0a1c12" />
              <stop offset="78%" stopColor="#08160f" />
              <stop offset="100%" stopColor={awayC} stopOpacity={0.16} />
            </linearGradient>
            <radialGradient id="glowH" cx="18%" cy="14%" r="50%">
              <stop offset="0%" stopColor={homeC} stopOpacity={0.16} />
              <stop offset="100%" stopColor={homeC} stopOpacity={0} />
            </radialGradient>
            <radialGradient id="glowA" cx="84%" cy="86%" r="50%">
              <stop offset="0%" stopColor={awayC} stopOpacity={0.16} />
              <stop offset="100%" stopColor={awayC} stopOpacity={0} />
            </radialGradient>
            <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={homeC} stopOpacity={0.55} />
              <stop offset="50%" stopColor={homeC} stopOpacity={0.04} />
              <stop offset="50%" stopColor={awayC} stopOpacity={0.04} />
              <stop offset="100%" stopColor={awayC} stopOpacity={0.55} />
            </linearGradient>
            <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="10" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Achtergrond */}
          <rect x="0" y="0" width={W} height={H} fill="#08160f" />
          {photo && <image href={photo} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" opacity={0.5} />}
          {photo && <rect x="0" y="0" width={W} height={H} fill="#08160f" opacity={0.52} />}
          <rect x="0" y="0" width={W} height={H} fill="url(#cardBg)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#glowH)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#glowA)" />
          <rect x="14" y="14" width={W - 28} height={H - 28} rx="36" fill="none" stroke="#f4c430" strokeOpacity={0.22} strokeWidth={2} />

          {/* Kop */}
          <text x={W / 2} y={pad + brandSize} textAnchor="middle" fontSize={brandSize} fontWeight={900} letterSpacing="3" fill="#ffffff">KRACHTBAL <tspan fill="#f4c430">LIVE</tspan></text>
          <text x={W / 2} y={pad + brandSize + metaSize * 1.5} textAnchor="middle" fontSize={metaSize} fill="#cfe6dc" opacity={0.85}>{[reeks, datum].filter(Boolean).join('  ·  ')}</text>

          <Hero />
          <Momentum />
          <Facts />
          <Details />

          {/* Voet */}
          <text x={W / 2} y={H - footerH * 0.4} textAnchor="middle" fontSize={clamp(footerH * 0.4, 20, 28)} fontWeight={700} fill="#f4c430" opacity={0.9}>gedeeld via krachtbal.live</text>
        </svg>
      </div>
    </div>
  )
}
