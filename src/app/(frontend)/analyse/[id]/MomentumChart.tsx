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
  const seq: { x: number; diff: number; side: 'home' | 'away'; rug: boolean; t: number }[] = []
  let diff = 0
  goals.forEach((g, i) => {
    diff += g.side === 'home' ? g.points : -g.points
    seq.push({ x: i + 1, diff, side: g.side, rug: g.points === 2, t: timeKey(g.half, g.gameClock ?? 0) })
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
        <path d={areaPath} fill="url(#momFill)" />
        <polyline points={linePts.join(' ')} className="an-mom-line" fill="none" />
        {seq.map((s, i) =>
          s.rug ? (
            // Rugworp (+2): een ster-markering.
            <text
              key={i}
              x={xAt(s.x)}
              y={yAt(s.diff) + 3.4}
              fontSize={10}
              textAnchor="middle"
              fill={s.side === 'home' ? 'var(--home)' : 'var(--away)'}
            >
              ★
            </text>
          ) : (
            <circle key={i} cx={xAt(s.x)} cy={yAt(s.diff)} r={2.6} fill={s.side === 'home' ? 'var(--home)' : 'var(--away)'} />
          ),
        )}
      </svg>
      <div className="an-mom-legend">
        <span><i className="h" style={{ background: homeC }} /> {teams.home} leidt</span>
        <span><i className="a" style={{ background: awayC }} /> {teams.away} leidt</span>
        <span className="an-mom-leg-mark">★ rugworp (+2)</span>
        {timeouts.length > 0 && <span className="an-mom-leg-mark">┊ time-out</span>}
        <span className="an-mom-note">{n} doelpunten · grootste kloof {maxAbs} · eindwinst: {leader}</span>
      </div>
    </div>
  )
}
