import type { TeamFormPoint } from '@/lib/team-report'

// Vorm/trend van de eigen ploeg: punten per wedstrijd (balken) + conversie% (lijn), chronologisch.
// Privé eigen-club-zicht op de progressie over het seizoen.

const ACCENT = 'var(--accent)'
const CONV = '#ffd166'

function fmtDate(d: string | null, i: number): string {
  if (!d) return `M${i + 1}`
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return `M${i + 1}`
  return dt.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })
}

export function TeamForm({ form }: { form: TeamFormPoint[] }) {
  if (!form || form.length < 2) return null

  const N = form.length
  const maxPts = Math.max(1, ...form.map((f) => f.points))
  const W = Math.max(320, N * 58)
  const H = 168
  const padT = 14
  const padB = 30
  const plotH = H - padT - padB
  const colW = W / N
  const barW = Math.min(34, colW * 0.5)
  const xAt = (i: number) => colW * (i + 0.5)
  const yPts = (p: number) => padT + plotH - (p / maxPts) * plotH
  const yConv = (c: number) => padT + plotH - Math.max(0, Math.min(1, c)) * plotH

  const convLine = form.map((f, i) => `${xAt(i).toFixed(1)},${yConv(f.conversion).toFixed(1)}`).join(' ')

  // Korte trend: gemiddelde punten eerste helft vs. tweede helft van de reeks.
  const half = Math.floor(N / 2) || 1
  const avg = (arr: TeamFormPoint[]) => (arr.length ? arr.reduce((a, f) => a + f.points, 0) / arr.length : 0)
  const early = avg(form.slice(0, half))
  const late = avg(form.slice(-half))
  const delta = late - early
  const trend = delta > 0.5 ? { ico: '▲', txt: 'stijgende lijn', cls: 'up' } : delta < -0.5 ? { ico: '▼', txt: 'dalende lijn', cls: 'down' } : { ico: '▬', txt: 'stabiel', cls: 'flat' }

  return (
    <div className="an-chart tf">
      <h3 className="an-chart-title">
        Vorm <span className="an-chart-hint">punten &amp; conversie per wedstrijd</span>
        <span className={`tf-trend ${trend.cls}`}>{trend.ico} {trend.txt}</span>
      </h3>
      <svg className="tf-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Vorm per wedstrijd">
        {[0.5, 1].map((g) => (
          <line key={g} x1={0} y1={padT + plotH * (1 - g)} x2={W} y2={padT + plotH * (1 - g)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        ))}
        {form.map((f, i) => (
          <g key={f.matchId}>
            <rect x={xAt(i) - barW / 2} y={yPts(f.points)} width={barW} height={padT + plotH - yPts(f.points)} rx={3} fill={ACCENT} opacity={0.85} />
            <text x={xAt(i)} y={yPts(f.points) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--txt)">{f.points}</text>
            <text x={xAt(i)} y={H - 10} textAnchor="middle" fontSize={9.5} fill="var(--dim)">{fmtDate(f.date, i)}</text>
          </g>
        ))}
        <polyline points={convLine} fill="none" stroke={CONV} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {form.map((f, i) => (
          <circle key={`c${f.matchId}`} cx={xAt(i)} cy={yConv(f.conversion)} r={3} fill={CONV} stroke="#06140d" strokeWidth={1} />
        ))}
      </svg>
      <div className="tf-legend">
        <span><i style={{ background: 'var(--accent)' }} /> punten</span>
        <span><i style={{ background: CONV }} /> conversie</span>
        <span className="tf-note">{N} wedstrijden</span>
      </div>
    </div>
  )
}
