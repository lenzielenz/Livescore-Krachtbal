import { logoFitStyle } from '@/lib/logo-fit'

export type ScorecardAxisView = { label: string; frac: number; value: string }

const SIZE = 320
const CX = SIZE / 2
const CY = SIZE / 2 + 6
const R = 104
const RINGS = [0.25, 0.5, 0.75, 1]

function angle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n
}
function pt(i: number, frac: number, n: number): [number, number] {
  const a = angle(i, n)
  const r = Math.max(0, Math.min(1, frac)) * R
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

// Presentatie-component: de scorecard zoals op een spelerskaart — foto, naam, positie en een
// radar met de zeven prestatie-assen. Zuiver render (server-side bruikbaar).
export function Scorecard({
  name,
  clubName,
  positionLabel,
  photoUrl,
  fit,
  axes,
  rating,
  stats,
}: {
  name: string
  clubName: string | null
  positionLabel: string | null
  photoUrl: string | null
  fit: { zoom: number; offsetX: number; offsetY: number }
  axes: ScorecardAxisView[]
  rating: number
  stats?: { matches: number; goals: number; points: number } | null
}) {
  const n = axes.length
  const fracs = axes.map((a) => a.frac)
  const poly = fracs.map((f, i) => pt(i, f, n).join(',')).join(' ')
  const imgStyle = logoFitStyle(fit)

  return (
    <div className="sc-card">
      <div className="sc-head">
        <div className="sc-photo">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} style={imgStyle} />
          ) : (
            <span className="sc-photo-empty" aria-hidden>👤</span>
          )}
        </div>
        <div className="sc-id">
          <div className="sc-name">{name}</div>
          {positionLabel && <div className="sc-pos">{positionLabel}</div>}
          {clubName && <div className="sc-club">{clubName}</div>}
        </div>
        <div className="sc-rating" title="Algemene rating">
          <span className="sc-rating-num">{rating}</span>
          <span className="sc-rating-cap">RATING</span>
        </div>
      </div>

      {stats && (
        <div className="sc-stats">
          <div className="sc-stat"><b>{stats.matches}</b><span>WEDSTRIJDEN</span></div>
          <div className="sc-stat"><b>{stats.goals}</b><span>DOELPUNTEN</span></div>
          <div className="sc-stat"><b>{stats.points}</b><span>PUNTEN</span></div>
        </div>
      )}

      <svg className="sc-radar" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Radar van ${name}`}>
        {RINGS.map((r) => (
          <polygon
            key={r}
            className="sc-ring"
            points={axes.map((_, i) => pt(i, r, n).join(',')).join(' ')}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 1, n)
          return <line key={i} className="sc-spoke" x1={CX} y1={CY} x2={x} y2={y} />
        })}
        <polygon className="sc-poly" points={poly} />
        {axes.map((a, i) => {
          const [dx, dy] = pt(i, a.frac, n)
          return <circle key={i} className="sc-dot" cx={dx} cy={dy} r={3.5} />
        })}
        {axes.map((a, i) => {
          const a2 = angle(i, n)
          const lx = CX + (R + 24) * Math.cos(a2)
          const ly = CY + (R + 24) * Math.sin(a2)
          const anchor = Math.abs(Math.cos(a2)) < 0.3 ? 'middle' : Math.cos(a2) > 0 ? 'start' : 'end'
          return (
            <text key={i} className="sc-axis" x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
              <tspan className="sc-axis-lbl">{a.label}</tspan>
              <tspan className="sc-axis-val" x={lx} dy="13">{a.value}</tspan>
            </text>
          )
        })}
      </svg>
    </div>
  )
}
