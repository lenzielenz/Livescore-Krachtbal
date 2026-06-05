'use client'

// Scoreverloop ("momentum"): de cumulatieve voorsprong (thuis − uit) na elk doelpunt.
// Boven de middenlijn = thuis leidt (groen), eronder = uit leidt (blauw).
type Goal = { side: 'home' | 'away'; points: number; half: number }

const W = 320
const H = 130
const PAD = 8

export function MomentumChart({ goals, teams }: { goals: Goal[]; teams: { home: string; away: string } }) {
  if (goals.length < 1) return null

  // Cumulatief verschil na elk doelpunt (start bij 0).
  const seq: { x: number; diff: number; side: 'home' | 'away' }[] = []
  let diff = 0
  goals.forEach((g, i) => {
    diff += g.side === 'home' ? g.points : -g.points
    seq.push({ x: i + 1, diff, side: g.side })
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

  const finalDiff = seq[n - 1].diff
  const leader = finalDiff > 0 ? teams.home : finalDiff < 0 ? teams.away : 'Gelijk'

  return (
    <div className="an-momentum">
      <h2 className="an-sub">📈 Momentum — scoreverloop</h2>
      <svg className="an-mom-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Scoreverloop">
        <defs>
          <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--home)" stopOpacity="0.45" />
            <stop offset="50%" stopColor="var(--home)" stopOpacity="0.05" />
            <stop offset="50%" stopColor="var(--away)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--away)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <line x1={PAD} y1={mid} x2={W - PAD} y2={mid} className="an-mom-zero" />
        <path d={areaPath} fill="url(#momFill)" />
        <polyline points={linePts.join(' ')} className="an-mom-line" fill="none" />
        {seq.map((s, i) => (
          <circle key={i} cx={xAt(s.x)} cy={yAt(s.diff)} r={2.6} className={s.side === 'home' ? 'an-mom-dot-h' : 'an-mom-dot-a'} />
        ))}
      </svg>
      <div className="an-mom-legend">
        <span><i className="h" /> {teams.home} leidt</span>
        <span><i className="a" /> {teams.away} leidt</span>
        <span className="an-mom-note">{n} doelpunten · grootste kloof {maxAbs} · eindwinst: {leader}</span>
      </div>
    </div>
  )
}
