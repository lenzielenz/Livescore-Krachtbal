'use client'

import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'

// Scoreverloop ("momentum"): de cumulatieve voorsprong (thuis − uit) na elk doelpunt, in de
// clubkleuren — bovenkant = thuis, onderkant = uit. Een rugworp (+2) krijgt een ster-markering;
// een gevraagde minuut (time-out) een verticale lijn op het juiste moment.
type Goal = { side: 'home' | 'away'; points: number; half: number; gameClock?: number }
type Timeout = { side: 'home' | 'away'; half: number; gameClock: number }

const W = 320
const H = 130
const PAD = 8

const timeKey = (half: number, gameClock: number) => half * 100000 + gameClock

// Vijfpuntige ster (voor de rugworp-markering) — als echte vorm i.p.v. een glyph, zodat we hem
// groot en duidelijk kunnen tekenen.
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

export function MomentumChart({
  goals,
  timeouts = [],
  teams,
  colors,
}: {
  goals: Goal[]
  timeouts?: Timeout[]
  teams: { home: string; away: string }
  colors?: { home: string | null; away: string | null }
}) {
  if (goals.length < 1) return null

  const homeC = readableOnDark(colors?.home ?? DEFAULT_HOME_COLOR)
  const awayC = readableOnDark(colors?.away ?? DEFAULT_AWAY_COLOR)

  // Cumulatief verschil na elk doelpunt (start bij 0).
  const seq: { x: number; diff: number; side: 'home' | 'away'; rug: boolean; t: number; half: number }[] = []
  let diff = 0
  goals.forEach((g, i) => {
    diff += g.side === 'home' ? g.points : -g.points
    seq.push({ x: i + 1, diff, side: g.side, rug: g.points === 2, t: timeKey(g.half, g.gameClock ?? 0), half: g.half })
  })
  const n = seq.length
  const maxAbs = Math.max(1, ...seq.map((s) => Math.abs(s.diff)))
  const innerW = W - 2 * PAD
  const innerH = H - 2 * PAD
  const mid = PAD + innerH / 2
  const xAt = (i: number) => PAD + (n <= 1 ? innerW / 2 : (i / n) * innerW)
  const yAt = (d: number) => mid - (d / maxAbs) * (innerH / 2 - 4)

  // Lijn vanaf (0,0) door elk doelpunt.
  const linePts = [`${PAD},${mid}`, ...seq.map((s) => `${xAt(s.x).toFixed(1)},${yAt(s.diff).toFixed(1)}`)]
  const areaPath = `M ${linePts.join(' L ')} L ${xAt(n).toFixed(1)},${mid} L ${PAD},${mid} Z`

  // Time-outs op de tijdas plaatsen: interpoleer hun positie tussen de omringende doelpunten.
  const toX = (to: Timeout): number => {
    const t = timeKey(to.half, to.gameClock)
    let before = 0 // index in seq (0 = start) van het laatste doelpunt vóór de time-out
    for (let i = 0; i < seq.length; i++) {
      if (seq[i].t <= t) before = i + 1
      else break
    }
    if (before === 0) return xAt(0)
    if (before >= n) return xAt(n)
    const tBefore = seq[before - 1].t
    const tAfter = seq[before].t
    const frac = tAfter > tBefore ? Math.max(0, Math.min(1, (t - tBefore) / (tAfter - tBefore))) : 0.5
    return xAt(before) + frac * (xAt(before + 1) - xAt(before))
  }

  // Markeer waar een nieuwe helft begint (bv. de 2de helft): een verticale scheidingslijn tussen
  // het laatste doelpunt van de vorige helft en het eerste van de nieuwe. Zo zie je in het
  // scoreverloop meteen wanneer de 2de helft (of verlenging) startte.
  const halfLines: { x: number; half: number }[] = []
  for (let j = 0; j < seq.length; j++) {
    const prevHalf = j === 0 ? 1 : seq[j - 1].half
    if (seq[j].half > prevHalf) {
      const xPrev = j === 0 ? xAt(0) : xAt(seq[j - 1].x)
      halfLines.push({ x: (xPrev + xAt(seq[j].x)) / 2, half: seq[j].half })
    }
  }
  const ordinal = (h: number) => `${h}e`

  const finalDiff = seq[n - 1].diff
  const leader = finalDiff > 0 ? teams.home : finalDiff < 0 ? teams.away : 'Gelijk'

  return (
    <div className="an-momentum" style={{ ['--home' as string]: homeC, ['--away' as string]: awayC }}>
      <h2 className="an-sub">📈 Momentum — scoreverloop</h2>
      <svg className="an-mom-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Scoreverloop">
        <defs>
          <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--home)" stopOpacity="0.5" />
            <stop offset="50%" stopColor="var(--home)" stopOpacity="0.05" />
            <stop offset="50%" stopColor="var(--away)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--away)" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {/* Time-out-lijnen (gevraagde minuten). */}
        {timeouts.map((to, i) => {
          const x = toX(to)
          const c = to.side === 'home' ? 'var(--home)' : 'var(--away)'
          return (
            <g key={`to${i}`}>
              <line x1={x} y1={PAD} x2={x} y2={H - PAD} stroke={c} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
              <text x={x} y={PAD + 7} fontSize={7} textAnchor="middle" fill={c} opacity={0.85}>T</text>
            </g>
          )
        })}
        <line x1={PAD} y1={mid} x2={W - PAD} y2={mid} className="an-mom-zero" />
        {/* Start van een nieuwe helft (2de helft, verlenging, ...). */}
        {halfLines.map((hl, i) => (
          <g key={`hl${i}`}>
            <line x1={hl.x} y1={PAD} x2={hl.x} y2={H - PAD} className="an-mom-half" />
            <text x={hl.x} y={H - PAD - 2} fontSize={7} textAnchor="middle" className="an-mom-half-lbl">{ordinal(hl.half)} helft</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#momFill)" />
        <polyline points={linePts.join(' ')} className="an-mom-line" fill="none" />
        {/* Gewone doelpunten: stippen. */}
        {seq.filter((s) => !s.rug).map((s, i) => (
          <circle key={`d${i}`} cx={xAt(s.x)} cy={yAt(s.diff)} r={2.6} fill={s.side === 'home' ? 'var(--home)' : 'var(--away)'} />
        ))}
        {/* Rugworpen (+2): een grote ster met gouden rand, bovenop — duidelijk te onderscheiden. */}
        {seq.filter((s) => s.rug).map((s, i) => (
          <polygon
            key={`r${i}`}
            points={starPoints(xAt(s.x), yAt(s.diff), 6.5)}
            fill={s.side === 'home' ? 'var(--home)' : 'var(--away)'}
            stroke="#f4c430"
            strokeWidth={1.4}
            strokeLinejoin="round"
            paintOrder="stroke"
          />
        ))}
      </svg>
      <div className="an-mom-legend">
        <span><i className="h" style={{ background: homeC }} /> {teams.home} leidt</span>
        <span><i className="a" style={{ background: awayC }} /> {teams.away} leidt</span>
        <span className="an-mom-leg-mark"><span style={{ color: '#f4c430' }}>★</span> rugworp (+2)</span>
        {timeouts.length > 0 && <span className="an-mom-leg-mark">┊ time-out</span>}
        {halfLines.length > 0 && <span className="an-mom-leg-mark" style={{ color: 'var(--accent)' }}>│ start helft</span>}
        <span className="an-mom-note">{n} doelpunten · grootste kloof {maxAbs} · eindwinst: {leader}</span>
      </div>
    </div>
  )
}
