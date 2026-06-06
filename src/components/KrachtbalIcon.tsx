import type { CSSProperties } from 'react'

import type { KrachtbalKleur } from '@/lib/reeksen'

// Een krachtbal is een glanzende leren medicijnbal. Kenmerkend: de leren stroken komen samen in
// één rozet ("bolletje") AAN DE ZIJKANT — niet onderaan. Rond die rozet lopen 8 naden, telkens 2
// samen als één strook (dus 4 stroken). Zie de referentiefoto. Er bestaat geen Unicode-emoji voor,
// dus we tekenen hem als klein SVG-icoon dat als een emoji naast tekst staat.
//
// De balkleur hangt af van de categorie (KVKBF): dames = rood, heren = wit, U12/U14 = geel,
// U16/U18 = blauw. Geef `kleur` mee (afgeleid uit de reeks via `krachtbalKleur`).
const PALETTE: Record<KrachtbalKleur, { hi: string; mid: string; edge: string; seam: string; ring: string }> = {
  wit: { hi: '#ffffff', mid: '#f1f3f1', edge: '#bcc1bf', seam: '#8d928e', ring: '#9a9f9c' },
  rood: { hi: '#ffd7cf', mid: '#e23b3b', edge: '#9e1f1f', seam: '#7e1818', ring: '#8e1a1a' },
  geel: { hi: '#fff4c2', mid: '#f3c220', edge: '#bd8e0c', seam: '#8f6c08', ring: '#a87d0a' },
  blauw: { hi: '#d3e3ff', mid: '#2f74d0', edge: '#184a96', seam: '#143a78', ring: '#1a4283' },
}

// ── Geometrie: één keer berekend (hangt niet af van kleur/grootte; viewBox is vast 0..24). ──
// We modelleren de bal als een bol. De zichtbare pool (de rozet) staat aan de rechterzijkant, iets
// onder het midden. Vanuit die pool tekenen we 8 meridiaan-naden, gegroepeerd als 4 stroken (paren).
type V3 = [number, number, number]
const norm3 = (v: V3): V3 => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / m, v[1] / m, v[2] / m]
}
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function buildKrachtbalGeometry() {
  const R = 10.4
  const cx = 12
  const cy = 12
  const P = norm3([0.45, -0.27, 0.85]) // zichtbare pool (rozet) — rechterzijkant, iets onder
  const U = norm3(cross(P, [0, 1, 0])) // twee assen loodrecht op P, om de meridianen te oriënteren
  const V = cross(P, U)
  const project = (d: V3): [number, number] => [cx + d[0] * R, cy - d[1] * R]

  // 4 stroken, elk een paar naden dicht bij elkaar (±delta), de paren 90° uit elkaar.
  const centers = [0, 1, 2, 3].map((i) => 0.5 + (i * Math.PI) / 2)
  const delta = 0.3 // halve hoekbreedte van een strook (paar dichter dan de tussenruimte)
  const seamPaths: string[] = []
  for (const cc of centers) {
    for (const s of [-delta, delta]) {
      const phi = cc + s
      const cp = Math.cos(phi)
      const sp = Math.sin(phi)
      const pts: string[] = []
      // Loop langs de meridiaan van de pool weg; stop bij het silhouet (achterkant).
      for (let t = 0.16; t <= Math.PI; t += 0.09) {
        const ct = Math.cos(t)
        const st = Math.sin(t)
        const d: V3 = [
          ct * P[0] + st * (cp * U[0] + sp * V[0]),
          ct * P[1] + st * (cp * U[1] + sp * V[1]),
          ct * P[2] + st * (cp * U[2] + sp * V[2]),
        ]
        if (d[2] < 0.03) break // verdwijnt achter de bol
        const [x, y] = project(d)
        pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
      }
      if (pts.length > 1) seamPaths.push('M' + pts.join(' L'))
    }
  }
  return { seamPaths, node: project(P) }
}

const KB = buildKrachtbalGeometry()

export function KrachtbalIcon({
  size = '1.1em',
  kleur = 'wit',
  className,
  style,
}: {
  size?: string | number
  kleur?: KrachtbalKleur
  className?: string
  style?: CSSProperties
}) {
  const c = PALETTE[kleur]
  // Per kleur een eigen gradient-id zodat meerdere ballen (verschillende kleuren) op één pagina
  // elkaars vulling niet overschrijven (gedeelde SVG-id's verwijzen anders naar de eerste def).
  const lid = `kbLeather-${kleur}`
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} role="img" aria-label={`krachtbal (${kleur})`}>
      <defs>
        {/* Glanzend leer: lichte tint in het centrum, donkerder naar de rand. */}
        <radialGradient id={lid} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={c.hi} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.edge} />
        </radialGradient>
        <radialGradient id="kbGloss" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill={`url(#${lid})`} stroke={c.ring} strokeWidth="1" />
      {/* 8 leren naden vanuit de zijwaartse rozet (4 stroken van elk 2 naden). */}
      <g fill="none" stroke={c.seam} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.82">
        {KB.seamPaths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* De rozet ("bolletje") aan de zijkant waar alle stroken samenkomen. */}
      <circle cx={KB.node[0]} cy={KB.node[1]} r="1.5" fill="none" stroke={c.seam} strokeWidth="1.1" opacity="0.9" />
      <circle cx={KB.node[0]} cy={KB.node[1]} r="0.6" fill={c.seam} opacity="0.9" />
      {/* Blinkende glans: een felle specular hotspot + een zachtere veeg. */}
      <ellipse cx="9" cy="7.4" rx="4" ry="2.7" fill="url(#kbGloss)" />
      <ellipse cx="8" cy="6.3" rx="1.6" ry="1.05" fill="#ffffff" opacity="0.95" />
    </svg>
  )
}
