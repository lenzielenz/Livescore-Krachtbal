import './analytics.css'

// Gedeelde, leesbare vormcurve (punten per wedstrijd). Vervangt de twee mini-polylines
// (seizoens- en spelerdossier) door één verzorgde versie: groter, met een zachte vlak-vulling
// onder de lijn, een stippellijn op het gemiddelde voor context, en een geaccentueerd laatste
// punt dat groen kleurt bij stijgende vorm en amber bij dalende. Toegankelijk via aria-label.

export function Sparkline({
  values,
  width = 132,
  height = 38,
  color = 'var(--accent)',
  showArea = true,
  showAverage = true,
  ariaLabel = 'Vorm per wedstrijd',
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
  showArea?: boolean
  showAverage?: boolean
  ariaLabel?: string
}) {
  if (values.length < 2) return <span className="ac-spark-empty">—</span>

  const W = width
  const H = height
  const pad = 4
  const n = values.length
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad)
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad)

  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const baseY = (H - pad).toFixed(1)
  const areaPath = `M ${x(0).toFixed(1)},${baseY} L ${pts.join(' L ')} L ${x(n - 1).toFixed(1)},${baseY} Z`

  const avg = values.reduce((s, v) => s + v, 0) / n
  const last = values[n - 1]
  const first = values[0]
  const rising = last >= first
  const dotColor = rising ? '#3ec98a' : '#d6a93b'

  return (
    <svg
      className="ac-spark"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${ariaLabel}: ${n} wedstrijden, van ${first} naar ${last} (${rising ? 'stijgend' : 'dalend'})`}
    >
      {showArea && <path d={areaPath} fill={color} opacity={0.13} />}
      {showAverage && (
        <line
          x1={pad}
          x2={W - pad}
          y1={y(avg)}
          y2={y(avg)}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      )}
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(n - 1)} cy={y(last)} r={4.6} fill={dotColor} opacity={0.18} />
      <circle cx={x(n - 1)} cy={y(last)} r={2.6} fill={dotColor} />
    </svg>
  )
}
