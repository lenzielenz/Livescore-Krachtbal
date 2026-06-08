'use client'

import { useEffect, useRef, useState } from 'react'

import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import { saveOrShareBlob, slugFilename, svgToPngBlob } from '@/lib/client-download'
import type { MatchStats } from '@/lib/stats'

type Goal = { side: 'home' | 'away'; points: number; half: number; gameClock?: number }
type Player = MatchStats['players'][number]

// ── Afmetingen van de deelkaart (4:5 — perfect voor WhatsApp/Insta-story). ──────────────
const W = 1080
const H = 1350

const first = (n: string) => n.split(/\s+/)[0]

// Splits een (lange) ploegnaam over max. 2 regels zodat hij netjes onder het logo past.
function wrapName(name: string, max = 13): string[] {
  const words = name.trim().split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w
    else { lines.push(cur); cur = w }
    if (lines.length === 1 && cur.length > max) break
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 2)
}

const initials = (name: string) =>
  name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

// Eén hoogtepunt uit de spelerdata kiezen (zelfde logica als de samenvatting).
function pick(players: Player[], ok: (p: Player) => boolean, better: (a: Player, b: Player) => boolean): Player | null {
  const c = players.filter(ok)
  if (c.length === 0) return null
  return c.reduce((best, p) => (better(p, best) ? p : best))
}

// Logo's vooraf als data-URL inladen — anders "tainted canvas" en mislukt de export op gsm.
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [logoData, setLogoData] = useState<{ home: string | null; away: string | null }>({ home: null, away: null })

  // Logo's inlinen zodra de kaart in beeld komt (best effort — valt terug op een monogram).
  useEffect(() => {
    let alive = true
    void (async () => {
      const [h, a] = await Promise.all([
        logos.home ? toDataUrl(logos.home) : Promise.resolve(null),
        logos.away ? toDataUrl(logos.away) : Promise.resolve(null),
      ])
      if (alive) setLogoData({ home: h, away: a })
    })()
    return () => { alive = false }
  }, [logos.home, logos.away])

  const homeC = readableOnDark(colors.home ?? DEFAULT_HOME_COLOR)
  const awayC = readableOnDark(colors.away ?? DEFAULT_AWAY_COLOR)

  // ── Scoreverloop (momentum): cumulatief verschil thuis − uit na elk doelpunt. ──
  let diff = 0
  const seq = goals.map((g, i) => {
    diff += g.side === 'home' ? g.points : -g.points
    return { x: i + 1, diff, side: g.side, rug: g.points === 2 }
  })
  const nGoals = seq.length
  const maxAbs = Math.max(1, ...seq.map((s) => Math.abs(s.diff)))
  const rugTotal = seq.filter((s) => s.rug).length

  // Chart-vlak.
  const cx0 = 100, cy0 = 690, cw = 880, ch = 150
  const cmid = cy0 + ch / 2
  const xAt = (i: number) => cx0 + (nGoals <= 1 ? cw / 2 : (i / nGoals) * cw)
  const yAt = (d: number) => cmid - (d / maxAbs) * (ch / 2 - 8)
  const linePts = nGoals > 0 ? [`${cx0},${cmid}`, ...seq.map((s) => `${xAt(s.x).toFixed(1)},${yAt(s.diff).toFixed(1)}`)] : []
  const areaPath = nGoals > 0 ? `M ${linePts.join(' L ')} L ${xAt(nGoals).toFixed(1)},${cmid} L ${cx0},${cmid} Z` : ''

  // Uitslag-tekst.
  const winner = score.home > score.away ? 'home' : score.away > score.home ? 'away' : 'draw'
  const winnerName = winner === 'home' ? teams.home : winner === 'away' ? teams.away : ''
  const result = winner === 'draw' ? 'GELIJKSPEL ⚖️' : `${winnerName.toUpperCase()} WINT 🏆`
  const resultFont = result.length > 22 ? 30 : result.length > 16 ? 36 : 42

  // ── Hoogtepunten uit de spelerdata (indien aanwezig). ──
  const active = players.filter((p) => p.throws > 0)
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

  // Feitjes-pillen (werken óók in snelscoremodus, zonder spelerdata).
  const facts = [
    { ico: '🥅', txt: `${nGoals} doelpunten` },
    { ico: '📊', txt: `grootste kloof ${maxAbs}` },
    rugTotal > 0 ? { ico: '💪', txt: `${rugTotal} rugworp${rugTotal === 1 ? '' : 'en'} (+2)` } : null,
  ].filter(Boolean) as { ico: string; txt: string }[]

  const hasPlayers = active.length > 0

  // Decoratieve confetti op de achtergrond (vast patroon = reproduceerbaar).
  const confetti = [
    [120, 250, '🎉'], [960, 300, '🏐'], [80, 1180, '✨'], [990, 1150, '🎊'],
    [540, 150, '⭐'], [200, 1240, '🔥'], [880, 1240, '🚀'],
  ] as [number, number, string][]

  const badge = (side: 'home' | 'away') => {
    const cx = side === 'home' ? 235 : 845
    const cy = 320
    const r = 96
    const c = side === 'home' ? homeC : awayC
    const data = side === 'home' ? logoData.home : logoData.away
    const name = side === 'home' ? teams.home : teams.away
    return (
      <g>
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke={c} strokeWidth={6} opacity={0.9} />
        <circle cx={cx} cy={cy} r={r} fill="#0c1f16" />
        {data ? (
          <>
            <clipPath id={`clip-${side}`}>
              <circle cx={cx} cy={cy} r={r - 4} />
            </clipPath>
            <image href={data} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#clip-${side})`} preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <text x={cx} y={cy + 26} textAnchor="middle" fontSize={70} fontWeight={800} fill={c}>{initials(name)}</text>
        )}
        {wrapName(name).map((ln, i) => (
          <text key={i} x={cx} y={cy + r + 50 + i * 36} textAnchor="middle" fontSize={32} fontWeight={800} fill={c}>{ln}</text>
        ))}
      </g>
    )
  }

  const run = async () => {
    if (busy || !svgRef.current) return
    setBusy(true)
    setMsg(null)
    try {
      const blob = await svgToPngBlob(svgRef.current, { scale: 2, background: '#08160f' })
      const name = slugFilename('krachtbal', teams.home, teams.away) || `krachtbal-wedstrijd-${matchId}`
      await saveOrShareBlob(blob, `${name}.png`, `${teams.home} ${score.home}–${score.away} ${teams.away} 🏐`)
    } catch {
      setMsg('Kaart maken mislukt — probeer opnieuw.')
      setTimeout(() => setMsg(null), 3500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="an-pdf-bar">
      <button type="button" className="sk-demo-cta" onClick={run} disabled={busy}>
        {busy ? '⏳ Kaart maken…' : '🎉 Deelkaart maken'}
      </button>
      <span className="an-pdf-msg">{msg ?? 'Een fraaie kaart om in de groep te delen.'}</span>

      {/* Off-screen render-doel — wordt naar PNG omgezet bij het delen. */}
      <div style={{ position: 'absolute', left: -99999, top: 0, width: W, height: H, pointerEvents: 'none' }} aria-hidden>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg"
          fontFamily="'Inter','Segoe UI',system-ui,-apple-system,'Apple Color Emoji','Noto Color Emoji',sans-serif">
          <defs>
            <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={homeC} stopOpacity={0.22} />
              <stop offset="30%" stopColor="#0a1c12" />
              <stop offset="70%" stopColor="#081610" />
              <stop offset="100%" stopColor={awayC} stopOpacity={0.22} />
            </linearGradient>
            <radialGradient id="glowH" cx="20%" cy="22%" r="55%">
              <stop offset="0%" stopColor={homeC} stopOpacity={0.28} />
              <stop offset="100%" stopColor={homeC} stopOpacity={0} />
            </radialGradient>
            <radialGradient id="glowA" cx="82%" cy="80%" r="55%">
              <stop offset="0%" stopColor={awayC} stopOpacity={0.28} />
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
          <rect x="0" y="0" width={W} height={H} fill="url(#cardBg)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#glowH)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#glowA)" />
          <rect x="14" y="14" width={W - 28} height={H - 28} rx="36" fill="none" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={2} />
          {confetti.map(([x, y, e], i) => (
            <text key={i} x={x} y={y} fontSize={i % 2 ? 40 : 52} opacity={0.5} textAnchor="middle">{e}</text>
          ))}

          {/* Kop */}
          <text x={W / 2} y={86} textAnchor="middle" fontSize={42} fontWeight={900} letterSpacing="2" fill="#ffffff">🏐 KRACHTBAL <tspan fill="#f4c430">LIVE</tspan></text>
          <text x={W / 2} y={128} textAnchor="middle" fontSize={26} fill="#cfe6dc" opacity={0.85}>{[reeks, datum].filter(Boolean).join('  ·  ')}</text>

          {/* Badges + score */}
          {badge('home')}
          {badge('away')}
          <text x={W / 2} y={362} textAnchor="middle" fontSize={150} fontWeight={900} filter="url(#soft)">
            <tspan fill={winner === 'away' ? '#9fb3aa' : homeC}>{score.home}</tspan>
            <tspan fill="#7d8f86" dx="6" dy="-6" fontSize={92}> – </tspan>
            <tspan fill={winner === 'home' ? '#9fb3aa' : awayC} dy="6">{score.away}</tspan>
          </text>

          {/* Uitslag-pil */}
          <g filter="url(#soft)">
            <rect x={W / 2 - 320} y={470} width={640} height={70} rx="35" fill="#0e2b1d" stroke="#f4c430" strokeOpacity={0.55} strokeWidth={2} />
            <text x={W / 2} y={516} textAnchor="middle" fontSize={resultFont} fontWeight={800} fill="#f4c430">{result}</text>
          </g>

          {/* Scoreverloop-paneel */}
          <g filter="url(#soft)">
            <rect x="60" y="590" width="960" height="290" rx="28" fill="#0c2418" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={2} />
          </g>
          <text x="92" y="640" fontSize={30} fontWeight={800} fill="#eafff5">📈 Scoreverloop</text>
          {nGoals > 0 && (
            <>
              <line x1={cx0} y1={cmid} x2={cx0 + cw} y2={cmid} stroke="#ffffff" strokeOpacity={0.18} strokeWidth={2} strokeDasharray="2 6" />
              <path d={areaPath} fill="url(#momFill)" />
              <polyline points={linePts.join(' ')} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
              {seq.map((s, i) =>
                s.rug ? (
                  <text key={i} x={xAt(s.x)} y={yAt(s.diff) + 9} textAnchor="middle" fontSize={28} fill={s.side === 'home' ? homeC : awayC}>★</text>
                ) : (
                  <circle key={i} cx={xAt(s.x)} cy={yAt(s.diff)} r={6} fill={s.side === 'home' ? homeC : awayC} stroke="#08160f" strokeWidth={2} />
                ),
              )}
            </>
          )}

          {/* Feitjes-pillen */}
          {facts.map((f, i) => {
            const n = facts.length
            const pw = 300, gap = 24
            const totalW = n * pw + (n - 1) * gap
            const x = W / 2 - totalW / 2 + i * (pw + gap)
            return (
              <g key={i}>
                <rect x={x} y={912} width={pw} height={64} rx="32" fill="#103122" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={2} />
                <text x={x + pw / 2} y={953} textAnchor="middle" fontSize={26} fontWeight={700} fill="#eafff5">{f.ico} {f.txt}</text>
              </g>
            )
          })}

          {/* MVP + hoogtepunten (alleen met spelerdata) */}
          {hasPlayers && mvp ? (
            <>
              <g filter="url(#soft)">
                <rect x="60" y="1014" width="960" height="116" rx="26" fill={cOf(mvp)} fillOpacity={0.16} stroke={cOf(mvp)} strokeWidth={2} strokeOpacity={0.6} />
              </g>
              <text x="96" y="1058" fontSize={24} fontWeight={800} letterSpacing="1" fill={cOf(mvp)}>★ SPELER VAN DE WEDSTRIJD</text>
              <text x="96" y="1100" fontSize={38} fontWeight={900} fill="#ffffff">#{mvp.shirtNumber} {mvp.playerName}</text>
              <text x="1010" y="1082" textAnchor="end" fontSize={26} fill="#cfe6dc">{mvp.goals.points} ptn · {mvp.goals.total} doelp.</text>
              {chips.map((ch, i) => {
                const n = chips.length || 1
                const cwid = (960 - (n - 1) * 20) / n
                const x = 60 + i * (cwid + 20)
                return (
                  <g key={i}>
                    <rect x={x} y={1156} width={cwid} height={150} rx="24" fill="#0c2418" stroke={ch.c} strokeOpacity={0.5} strokeWidth={2} />
                    <text x={x + cwid / 2} y={1208} textAnchor="middle" fontSize={42}>{ch.ico}</text>
                    <text x={x + cwid / 2} y={1248} textAnchor="middle" fontSize={20} fill="#9fc6b6">{ch.lbl}</text>
                    <text x={x + cwid / 2} y={1280} textAnchor="middle" fontSize={30} fontWeight={800} fill={ch.c}>{ch.val}</text>
                  </g>
                )
              })}
            </>
          ) : (
            <>
              <text x={W / 2} y={1110} textAnchor="middle" fontSize={64} fontWeight={900} fill="#ffffff">Wat een match! 🔥</text>
              <text x={W / 2} y={1170} textAnchor="middle" fontSize={30} fill="#cfe6dc">
                {winner === 'draw' ? 'Geen winnaar, wel spektakel.' : `Knappe overwinning voor ${winnerName}.`}
              </text>
              <text x={W / 2} y={1250} textAnchor="middle" fontSize={48} opacity={0.85}>🎊  🏐  ⭐  🚀  🎉</text>
            </>
          )}

          {/* Voet */}
          <text x={W / 2} y={1326} textAnchor="middle" fontSize={24} fontWeight={700} fill="#f4c430" opacity={0.9}>gedeeld via krachtbal.live</text>
        </svg>
      </div>
    </div>
  )
}
