'use client'

// Eenvoudige progressie-lijngrafiek voor één metriek: waarde over de tijd.
// Toont de lijn + punten, de laatste waarde en het verschil t.o.v. de eerste meting.
type Point = { datum: string; value: number }

const W = 320
const H = 120
const PAD_X = 10
const PAD_Y = 12

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function fmtDate(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit' })
}

export function ProgressieChart({ label, unit, points }: { label: string; unit: string; points: Point[] }) {
  const pts = points.filter((p) => Number.isFinite(p.value))
  const n = pts.length

  if (n === 0) {
    return (
      <div className="tr-chart">
        <div className="tr-chart-head">
          <span className="tr-chart-title">{label}</span>
        </div>
        <p className="tr-chart-empty">Nog geen metingen.</p>
      </div>
    )
  }

  const values = pts.map((p) => p.value)
  const first = values[0]
  const last = values[n - 1]
  const delta = last - first
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    // Eén niveau: geef wat lucht zodat de lijn niet plat op de rand plakt.
    min -= 1
    max += 1
  }
  const innerW = W - 2 * PAD_X
  const innerH = H - 2 * PAD_Y
  const xAt = (i: number) => PAD_X + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => PAD_Y + innerH - ((v - min) / (max - min)) * innerH

  const linePts = pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
  const areaPath = `M ${xAt(0).toFixed(1)},${(PAD_Y + innerH).toFixed(1)} L ${linePts.join(' L ')} L ${xAt(n - 1).toFixed(1)},${(PAD_Y + innerH).toFixed(1)} Z`

  const deltaCls = delta > 0 ? 'up' : delta < 0 ? 'down' : ''
  const deltaTxt = delta === 0 ? '±0' : `${delta > 0 ? '+' : ''}${fmt(delta)}`

  return (
    <div className="tr-chart">
      <div className="tr-chart-head">
        <span className="tr-chart-title">{label}</span>
        <span className="tr-chart-now">
          {fmt(last)} <small>{unit}</small>
          {n > 1 && <span className={`tr-delta ${deltaCls}`}>{deltaTxt}</span>}
        </span>
      </div>
      <svg className="tr-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}: verloop`}>
        <defs>
          <linearGradient id={`trfill-${label.replace(/\W+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent, #06d6a0)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent, #06d6a0)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {n > 1 && <path d={areaPath} fill={`url(#trfill-${label.replace(/\W+/g, '')})`} />}
        {n > 1 && <polyline points={linePts.join(' ')} className="tr-line" fill="none" />}
        {pts.map((p, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(p.value)} r={2.8} className="tr-dot">
            <title>{`${fmtDate(p.datum)}: ${fmt(p.value)} ${unit}`}</title>
          </circle>
        ))}
      </svg>
      <div className="tr-chart-foot">
        <span>{fmtDate(pts[0].datum)}</span>
        <span className="tr-chart-count">{n} meting{n === 1 ? '' : 'en'}</span>
        <span>{fmtDate(pts[n - 1].datum)}</span>
      </div>
    </div>
  )
}
