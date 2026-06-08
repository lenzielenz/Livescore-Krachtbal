import type { TeamProfile as Profile } from '@/lib/team-report'

// Visueel ploegprofiel: een radar (6 dimensies), DNA-labels en twee kolommen met de belangrijkste
// sterktes en zwaktes. Pure server-render (SVG), geen interactiviteit nodig. De viewBox is ruim
// genoeg gekozen zodat de aslabels altijd binnen beeld vallen (geen overflow op smalle schermen).

const VW = 400
const VH = 360
const CX = VW / 2
const CY = 168
const R = 96

function pt(i: number, n: number, r: number): { x: number; y: number } {
  const ang = (-90 + i * (360 / n)) * (Math.PI / 180)
  return { x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang) }
}
function ringPoints(n: number, r: number): string {
  return Array.from({ length: n }, (_, i) => {
    const p = pt(i, n, r)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}

function Finding({ f, kind }: { f: Profile['strengths'][number]; kind: 'strong' | 'weak' }) {
  return (
    <li className={`rep-finding ${kind}`}>
      <span className="rep-finding-area">{f.area}</span>
      <span className="rep-finding-title">{f.title}</span>
      <span className="rep-finding-detail">{f.detail}</span>
    </li>
  )
}

export function TeamProfile({ profile }: { profile: Profile }) {
  const { tags, radar, strengths, weaknesses } = profile
  const n = radar.length
  const rings = [25, 50, 75, 100]
  const dataPoly = radar.map((a) => a.value)

  return (
    <section className="rep-profile">
      <div className="rep-profile-head">
        <span className="rep-profile-kicker">Ploeg-DNA</span>
        <span className="rep-profile-sub">datagedreven profiel</span>
      </div>
      {tags.length > 0 && (
        <div className="rep-tags">
          {tags.map((t) => (
            <span key={t} className="rep-tag">{t}</span>
          ))}
        </div>
      )}

      <div className="rep-profile-grid">
        <figure className="rep-radar">
          <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="Ploegprofiel radar">
            <defs>
              <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.08} />
              </radialGradient>
              <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </radialGradient>
              <filter id="radarGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Achtergrondgloed */}
            <circle cx={CX} cy={CY} r={R + 6} fill="url(#radarBg)" />
            {/* Rasterringen */}
            {rings.map((ring) => (
              <polygon key={ring} points={ringPoints(n, (ring / 100) * R)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            ))}
            {/* Schaal-ticks op de bovenste as */}
            {rings.map((ring) => (
              <text key={`t${ring}`} x={CX + 4} y={CY - (ring / 100) * R + 3} className="rep-radar-tick">{ring}</text>
            ))}
            {/* Assen */}
            {radar.map((_, i) => {
              const p = pt(i, n, R)
              return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            })}
            {/* Datavlak met gloed */}
            <polygon points={radar.map((a, i) => { const p = pt(i, n, (Math.max(0, Math.min(100, a.value)) / 100) * R); return `${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(' ')} fill="url(#radarFill)" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" filter="url(#radarGlow)" />
            {dataPoly.map((v, i) => {
              const p = pt(i, n, (Math.max(0, Math.min(100, v)) / 100) * R)
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4.5} fill="var(--accent)" />
                  <circle cx={p.x} cy={p.y} r={1.8} fill="#06140d" />
                </g>
              )
            })}
            <circle cx={CX} cy={CY} r={2.5} fill="var(--accent)" />
            {/* Labels (binnen de viewBox) */}
            {radar.map((a, i) => {
              const p = pt(i, n, R + 20)
              const anchor = p.x < CX - 8 ? 'end' : p.x > CX + 8 ? 'start' : 'middle'
              return (
                <text key={a.key} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" className="rep-radar-axis">
                  <tspan x={p.x} dy={p.y > CY + 8 ? 0 : p.y < CY - 8 ? -4 : 0}>{a.label}</tspan>
                  <tspan x={p.x} dy="14" className="rep-radar-val">{a.display}</tspan>
                </text>
              )
            })}
          </svg>
        </figure>

        <div className="rep-sw">
          <div className="rep-sw-col strong">
            <h3>💪 Sterktes</h3>
            {strengths.length > 0 ? (
              <ul>{strengths.map((f, i) => <Finding key={i} f={f} kind="strong" />)}</ul>
            ) : (
              <p className="rep-sw-empty">Nog te weinig data voor duidelijke sterktes.</p>
            )}
          </div>
          <div className="rep-sw-col weak">
            <h3>⚠️ Zwaktes</h3>
            {weaknesses.length > 0 ? (
              <ul>{weaknesses.map((f, i) => <Finding key={i} f={f} kind="weak" />)}</ul>
            ) : (
              <p className="rep-sw-empty">Nog te weinig data voor duidelijke zwaktes.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
