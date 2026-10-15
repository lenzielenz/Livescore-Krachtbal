'use client'

// Het stadionplan op je scherm: als je voor een wegwijzer staat, verschijnt het vanzelf, groot en
// leesbaar. Een kaartje van het verdiep waar je bent ("U bent hier", en waar je naar kijkt), en
// een lijst van alles in het stadion: op dit verdiep met een pijl (draait mee met je kijkrichting)
// en de afstand, op de andere verdiepen met de weg via de lift.

export type PlanDoel = { naam: string; icoon: string; kleur: string; verdiep: number; x: number; z: number }
export type PlanHier = { x: number; z: number; yaw: number; verdiep: number }

const VERDIEP_NAAM: Record<number, string> = { [-1]: 'Kelder · wellness & ontspanning', 0: 'Gelijkvloers', 1: 'VIP-loges', 2: 'Dak' }
const VERDIEP_KORT: Record<number, string> = { [-1]: '-1', 0: '0', 1: '1', 2: 'D' }

/** Hoek (radialen, met de klok mee) van een doel ten opzichte van je kijkrichting. */
export function pijlHoek(hier: PlanHier, x: number, z: number): number {
  const dx = x - hier.x
  const dz = z - hier.z
  // Vooruit = (sin yaw, cos yaw); rechts = (-cos yaw, sin yaw).
  const voor = dx * Math.sin(hier.yaw) + dz * Math.cos(hier.yaw)
  const rechts = -dx * Math.cos(hier.yaw) + dz * Math.sin(hier.yaw)
  return Math.atan2(rechts, voor)
}

function Kaart({ doelen, hier }: { doelen: PlanDoel[]; hier: PlanHier }) {
  const pts = [...doelen.map((d) => ({ x: d.x, z: d.z })), { x: hier.x, z: hier.z }]
  const minX = Math.min(...pts.map((p) => p.x)) - 8
  const maxX = Math.max(...pts.map((p) => p.x)) + 8
  const minZ = Math.min(...pts.map((p) => p.z)) - 8
  const maxZ = Math.max(...pts.map((p) => p.z)) + 8
  const W = maxX - minX
  const H = maxZ - minZ
  // Het noorden (−z) bovenaan; de kaart draait niet mee, de kijkkegel wel.
  const sx = (x: number) => x - minX
  const sz = (z: number) => z - minZ
  const kijk = Math.atan2(Math.sin(hier.yaw), Math.cos(hier.yaw))
  const kegel = 9
  const a1 = kijk - 0.45
  const a2 = kijk + 0.45
  return (
    <svg className="vk-plan-kaart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {hier.verdiep === 0 && (
        <>
          {/* Het stadion: de gevel, de tribunes en het veld. */}
          <rect x={sx(-48)} y={sz(-31)} width={96} height={62} rx={12} className="gevel" />
          <rect x={sx(-20)} y={sz(-10)} width={40} height={20} rx={1} className="veld" />
        </>
      )}
      {doelen.map((d) => (
        <g key={d.naam + d.x} transform={`translate(${sx(d.x)} ${sz(d.z)})`}>
          <circle r={3.6} fill={d.kleur} opacity={0.25} />
          <text fontSize={4.6} textAnchor="middle" dominantBaseline="central">
            {d.icoon}
          </text>
        </g>
      ))}
      <path
        d={`M ${sx(hier.x)} ${sz(hier.z)} L ${sx(hier.x + Math.sin(a1) * kegel)} ${sz(hier.z + Math.cos(a1) * kegel)} L ${sx(hier.x + Math.sin(a2) * kegel)} ${sz(hier.z + Math.cos(a2) * kegel)} Z`}
        className="kegel"
      />
      <circle cx={sx(hier.x)} cy={sz(hier.z)} r={2.2} className="hier" />
    </svg>
  )
}

export function StadionPlan({ hier, doelen, onSluit }: { hier: PlanHier | null; doelen: PlanDoel[]; onSluit: () => void }) {
  if (!hier) return null
  const hierDoelen = doelen.filter((d) => d.verdiep === hier.verdiep)
  const andere = [...new Set(doelen.map((d) => d.verdiep))].filter((v) => v !== hier.verdiep).sort((a, b) => a - b)
  const afstand = (d: PlanDoel) => Math.hypot(d.x - hier.x, d.z - hier.z)
  return (
    <aside className="vk-plan" aria-label="Stadionplan">
      <div className="vk-plan-kop">
        <div>
          <b>🗺️ Stadionplan</b>
          <span>U bent hier: {VERDIEP_NAAM[hier.verdiep] ?? `verdiep ${hier.verdiep}`}</span>
        </div>
        <button onClick={onSluit} aria-label="Plan sluiten">
          ✕
        </button>
      </div>
      <Kaart doelen={hierDoelen} hier={hier} />
      <ul className="vk-plan-lijst">
        {[...hierDoelen]
          .sort((a, b) => afstand(a) - afstand(b))
          .map((d) => (
            <li key={d.naam + d.x}>
              <i style={{ background: d.kleur }}>{d.icoon}</i>
              <span>{d.naam}</span>
              <em>
                <b className="pijl" style={{ transform: `rotate(${pijlHoek(hier, d.x, d.z)}rad)` }}>
                  ↑
                </b>
                {Math.max(1, Math.round(afstand(d)))} m
              </em>
            </li>
          ))}
      </ul>
      {andere.map((v) => (
        <div key={v} className="vk-plan-verdiep">
          <h4>
            <span className="nr">{VERDIEP_KORT[v]}</span> {VERDIEP_NAAM[v]} <small>· via de lift 🛗</small>
          </h4>
          <p>
            {doelen
              .filter((d) => d.verdiep === v)
              .map((d) => (
                <span key={d.naam + d.x}>
                  {d.icoon} {d.naam}
                </span>
              ))}
          </p>
        </div>
      ))}
    </aside>
  )
}
