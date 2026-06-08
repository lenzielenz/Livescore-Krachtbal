import type { TeamProfile as Profile } from '@/lib/team-report'

// Visueel ploegprofiel: een radar (6 dimensies), DNA-labels en twee kolommen met de belangrijkste
// sterktes en zwaktes. Pure server-render (SVG), geen interactiviteit nodig.

const SIZE = 260
const C = SIZE / 2
const R = 96

function polygon(values: number[]): string {
  return values
    .map((v, i) => {
      const ang = (-90 + i * (360 / values.length)) * (Math.PI / 180)
      const r = (Math.max(0, Math.min(100, v)) / 100) * R
      return `${(C + r * Math.cos(ang)).toFixed(1)},${(C + r * Math.sin(ang)).toFixed(1)}`
    })
    .join(' ')
}

function vertex(i: number, n: number, r: number): { x: number; y: number } {
  const ang = (-90 + i * (360 / n)) * (Math.PI / 180)
  return { x: C + r * Math.cos(ang), y: C + r * Math.sin(ang) }
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

  return (
    <section className="rep-profile">
      {tags.length > 0 && (
        <div className="rep-tags">
          <span className="rep-tags-lbl">Profiel</span>
          {tags.map((t) => (
            <span key={t} className="rep-tag">{t}</span>
          ))}
        </div>
      )}

      <div className="rep-profile-grid">
        <figure className="rep-radar">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Ploegprofiel radar">
            {/* Rasterringen */}
            {rings.map((ring) => (
              <polygon
                key={ring}
                points={Array.from({ length: n }, (_, i) => {
                  const p = vertex(i, n, (ring / 100) * R)
                  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
                }).join(' ')}
                fill="none"
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={1}
              />
            ))}
            {/* Assen */}
            {radar.map((_, i) => {
              const p = vertex(i, n, R)
              return <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            })}
            {/* Datavlak */}
            <polygon points={polygon(radar.map((a) => a.value))} fill="var(--accent)" fillOpacity={0.28} stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
            {radar.map((a, i) => {
              const p = vertex(i, n, (Math.max(0, Math.min(100, a.value)) / 100) * R)
              return <circle key={a.key} cx={p.x} cy={p.y} r={3} fill="var(--accent)" />
            })}
            {/* Labels */}
            {radar.map((a, i) => {
              const p = vertex(i, n, R + 16)
              const anchor = p.x < C - 8 ? 'end' : p.x > C + 8 ? 'start' : 'middle'
              return (
                <text key={a.key} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" className="rep-radar-axis">
                  <tspan>{a.label}</tspan>
                  <tspan x={p.x} dy="12" className="rep-radar-val">{a.display}</tspan>
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
