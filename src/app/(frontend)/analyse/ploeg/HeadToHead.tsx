import type { Matchup } from '@/lib/matchup'

// Head-to-Head: het DNA-profiel van twee ploegen over elkaar. Dual-radar + per-as divergerende
// vergelijking + een verdict-meter, en de scherpe conclusie: jullie troef ↔ het gevaar.
// Pure server-render (SVG). OURS = accent (groen), OPP = amber.

const OURS = 'var(--accent)'
const OPP = '#ff924c'

const VW = 360
const VH = 320
const CX = VW / 2
const CY = 158
const R = 92

function pt(i: number, n: number, r: number): { x: number; y: number } {
  const ang = (-90 + i * (360 / n)) * (Math.PI / 180)
  return { x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang) }
}
function ring(n: number, r: number): string {
  return Array.from({ length: n }, (_, i) => {
    const p = pt(i, n, r)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}
function poly(values: number[], n: number): string {
  return values
    .map((v, i) => {
      const p = pt(i, n, (Math.max(0, Math.min(100, v)) / 100) * R)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    })
    .join(' ')
}

export function HeadToHead({ matchup }: { matchup: Matchup }) {
  const { axes, ourName, oppName, verdict, edgeScore, exploit, danger, tips } = matchup
  if (axes.length === 0) return null
  const n = axes.length
  const rings = [25, 50, 75, 100]

  // Verdict-meter: 0 in het midden; vul naar de winnaar, geschaald (|edge| 50 ≈ volle helft).
  const fill = Math.min(50, Math.abs(edgeScore))
  const toOurs = verdict.side === 'ours'

  return (
    <section className="h2h">
      <h2 className="an-sub">
        ⚔️ Head-to-Head <span className="an-chart-hint">{ourName} tegenover {oppName}</span>
      </h2>

      {/* Verdict-meter */}
      <div className={`h2h-verdict ${verdict.side}`}>
        <span className="h2h-verdict-team ours">{ourName}</span>
        <span className="h2h-meter" aria-hidden>
          <span className="h2h-meter-mid" />
          {verdict.side !== 'even' && (
            <span
              className={`h2h-meter-fill ${verdict.side}`}
              style={toOurs ? { right: '50%', width: `${fill}%` } : { left: '50%', width: `${fill}%` }}
            />
          )}
        </span>
        <span className="h2h-verdict-team opp">{oppName}</span>
      </div>
      <p className="h2h-verdict-lbl">{verdict.label}{verdict.side !== 'even' ? ` · +${Math.abs(edgeScore)}` : ''}</p>

      <div className="h2h-grid">
        {/* Dual-radar */}
        <figure className="h2h-radar">
          <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Profielvergelijking ${ourName} vs ${oppName}`}>
            {rings.map((rr) => (
              <polygon key={rr} points={ring(n, (rr / 100) * R)} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            ))}
            {axes.map((_, i) => {
              const p = pt(i, n, R)
              return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            })}
            {/* Opp eerst (achtergrond), dan ours erbovenop. */}
            <polygon points={poly(axes.map((a) => a.opp), n)} fill={OPP} fillOpacity={0.16} stroke={OPP} strokeWidth={2} strokeLinejoin="round" />
            <polygon points={poly(axes.map((a) => a.ours), n)} fill={OURS} fillOpacity={0.22} stroke={OURS} strokeWidth={2.5} strokeLinejoin="round" />
            {axes.map((a, i) => {
              const p = pt(i, n, R + 16)
              const anchor = p.x < CX - 8 ? 'end' : p.x > CX + 8 ? 'start' : 'middle'
              return (
                <text key={a.key} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" className="h2h-axis">
                  {a.label}
                </text>
              )
            })}
          </svg>
          <figcaption className="h2h-legend">
            <span><i style={{ background: OURS }} /> {ourName}</span>
            <span><i style={{ background: OPP }} /> {oppName}</span>
          </figcaption>
        </figure>

        {/* Per-as divergerende vergelijking */}
        <div className="h2h-bars">
          {axes.map((a) => (
            <div className="h2h-row" key={a.key}>
              <span className={`h2h-num ours ${a.leader === 'ours' ? 'win' : ''}`}>{a.ours}</span>
              <span className="h2h-track left">
                <span className="h2h-fill ours" style={{ width: `${a.ours}%` }} />
              </span>
              <span className="h2h-axislbl">{a.label}</span>
              <span className="h2h-track right">
                <span className="h2h-fill opp" style={{ width: `${a.opp}%` }} />
              </span>
              <span className={`h2h-num opp ${a.leader === 'opp' ? 'win' : ''}`}>{a.opp}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Conclusie: troef ↔ gevaar */}
      {(exploit || danger || tips.length > 0) && (
        <div className="h2h-edges">
          {exploit && (
            <div className="h2h-edge exploit">
              <span className="h2h-edge-ico" aria-hidden>⚡</span>
              <span className="h2h-edge-body">
                <span className="h2h-edge-lbl">Jullie troef</span>
                <span className="h2h-edge-txt">{tips[0] ?? exploit.label}</span>
              </span>
            </div>
          )}
          {danger && (
            <div className="h2h-edge danger">
              <span className="h2h-edge-ico" aria-hidden>🛡️</span>
              <span className="h2h-edge-body">
                <span className="h2h-edge-lbl">Het gevaar</span>
                <span className="h2h-edge-txt">{(exploit ? tips[1] : tips[0]) ?? `${oppName} is sterker in ${danger.label}.`}</span>
              </span>
            </div>
          )}
          {!exploit && !danger && tips[0] && (
            <div className="h2h-edge even">
              <span className="h2h-edge-ico" aria-hidden>⚖️</span>
              <span className="h2h-edge-body">
                <span className="h2h-edge-lbl">Evenwicht</span>
                <span className="h2h-edge-txt">{tips[0]}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
