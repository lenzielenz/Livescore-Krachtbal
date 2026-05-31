'use client'

import React, { useRef } from 'react'

import type { Point } from '@/lib/field'

// Veld op schaal: 14 m breed × 46 m lang. 10 px/m → 140 × 460. Met out-marge eromheen.
const M = 22 // marge in px (out-zone)
const W = 140
const H = 460
const HOME_GOAL_Y = 100 // 10 m
const AWAY_GOAL_Y = 360 // 36 m
const MID_Y = 230 // 23 m
const FT_TOP_Y = 140 // vrijeworplijn thuiszijde (14 m)
const FT_BOT_Y = 320 // vrijeworplijn uitzijde (32 m)
const THIRD_1 = W / 3
const THIRD_2 = (2 * W) / 3

export interface FieldMarker {
  x: number
  y: number
  color?: string
  label?: string
  r?: number
}

export interface EndLabel {
  text: string
  color: string
}

// Heatmap: bin de punten in een raster, kleur per dichtheid (groen→geel→rood) en vervaag.
const GX = 7
const GY = 18

function heatColor(t: number): string {
  // t in [0,1]: 0 = koel groen, 0.5 = geel, 1 = rood.
  const stops: [number, [number, number, number]][] = [
    [0, [6, 214, 160]],
    [0.5, [255, 209, 102]],
    [1, [239, 71, 111]],
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0] || 1
  const f = (t - lo[0]) / span
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * f))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function HeatLayer({ points }: { points: Point[] }) {
  const W = 140
  const H = 460
  const grid = Array.from({ length: GY }, () => new Array(GX).fill(0))
  let max = 0
  for (const p of points) {
    const gx = Math.min(GX - 1, Math.max(0, Math.floor(p.x * GX)))
    const gy = Math.min(GY - 1, Math.max(0, Math.floor(p.y * GY)))
    grid[gy][gx] += 1
    if (grid[gy][gx] > max) max = grid[gy][gx]
  }
  if (max === 0) return null
  const cw = W / GX
  const ch = H / GY
  const cells: React.ReactElement[] = []
  for (let y = 0; y < GY; y++) {
    for (let x = 0; x < GX; x++) {
      const n = grid[y][x]
      if (!n) continue
      const t = n / max
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={x * cw}
          y={y * ch}
          width={cw}
          height={ch}
          fill={heatColor(t)}
          opacity={0.25 + 0.6 * t}
        />,
      )
    }
  }
  return (
    <g filter="url(#heatblur)" clipPath="url(#fieldclip)">
      {cells}
    </g>
  )
}

export function FieldSchema({
  onTap,
  markers = [],
  heatPoints,
  ends,
  className,
}: {
  onTap?: (p: Point) => void
  markers?: FieldMarker[]
  /** Wanneer gezet: render een dichtheid-heatmap i.p.v. losse punten. */
  heatPoints?: Point[]
  /** Richtingslabels per ploeg: bovenaan valt aan naar boven (↑), onderaan naar onder (↓). */
  ends?: { top?: EndLabel; bottom?: EndLabel }
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onTap || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vx = -M + ((e.clientX - rect.left) / rect.width) * (W + 2 * M)
    const vy = -M + ((e.clientY - rect.top) / rect.height) * (H + 2 * M)
    onTap({ x: vx / W, y: vy / H })
  }

  return (
    <svg
      ref={ref}
      className={className}
      viewBox={`${-M} ${-M} ${W + 2 * M} ${H + 2 * M}`}
      onClick={handleClick}
      role="img"
      aria-label="Krachtbalveld"
    >
      <defs>
        <filter id="heatblur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <clipPath id="fieldclip">
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>
      {/* Out-zone: rode rand rond het veld — tik hier = bal buiten gesmeten */}
      <rect x={-M} y={-M} width={W + 2 * M} height={H + 2 * M} fill="#3a1018" />
      <rect x={-M} y={-M} width={W + 2 * M} height={H + 2 * M} fill="#ef476f" opacity={0.18} />
      <text x={W / 2} y={-M / 2 + 3} fontSize={6} textAnchor="middle" fill="#ffb3c1" letterSpacing={1}>
        BUITEN
      </text>
      {/* Speelveld */}
      <rect x={0} y={0} width={W} height={H} fill="#0f3d27" stroke="#e8f5ee" strokeWidth={1.5} />
      {/* Doelgebieden — gekleurd in de kleur van de ploeg die ER NAARTOE aanvalt */}
      <rect x={0} y={0} width={W} height={HOME_GOAL_Y} fill={ends?.top?.color ?? '#ffffff'} opacity={ends?.top ? 0.22 : 0.06} />
      <rect x={0} y={AWAY_GOAL_Y} width={W} height={H - AWAY_GOAL_Y} fill={ends?.bottom?.color ?? '#ffffff'} opacity={ends?.bottom ? 0.22 : 0.06} />
      {/* Lijnen */}
      <line x1={0} y1={HOME_GOAL_Y} x2={W} y2={HOME_GOAL_Y} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={0} y1={AWAY_GOAL_Y} x2={W} y2={AWAY_GOAL_Y} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={0} y1={MID_Y} x2={W} y2={MID_Y} stroke="#e8f5ee" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={0} y1={FT_TOP_Y} x2={W} y2={FT_TOP_Y} stroke="#9fd9ba" strokeWidth={0.8} strokeDasharray="2 3" />
      <line x1={0} y1={FT_BOT_Y} x2={W} y2={FT_BOT_Y} stroke="#9fd9ba" strokeWidth={0.8} strokeDasharray="2 3" />
      {/* Zone-derden */}
      <line x1={THIRD_1} y1={0} x2={THIRD_1} y2={H} stroke="#9fd9ba" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />
      <line x1={THIRD_2} y1={0} x2={THIRD_2} y2={H} stroke="#9fd9ba" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />

      {/* Heatmap-laag (optioneel) */}
      {heatPoints && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}

      {/* Markers */}
      {markers.map((m, i) => (
        <g key={i}>
          <circle cx={m.x * W} cy={m.y * H} r={m.r ?? 6} fill={m.color ?? '#ffd166'} stroke="#06140d" strokeWidth={1} />
          {m.label && (
            <text x={m.x * W} y={m.y * H + 2.5} fontSize={7} textAnchor="middle" fill="#06140d" fontWeight={700}>
              {m.label}
            </text>
          )}
        </g>
      ))}

      {ends?.top && (
        <g>
          <text x={W / 2} y={11} fontSize={13} textAnchor="middle" fill={ends.top.color} fontWeight={900}>⬆</text>
          <text x={W / 2} y={20} fontSize={8} textAnchor="middle" fill={ends.top.color} fontWeight={800}>
            {ends.top.text}
          </text>
        </g>
      )}
      {ends?.bottom && (
        <g>
          <text x={W / 2} y={H - 12} fontSize={8} textAnchor="middle" fill={ends.bottom.color} fontWeight={800}>
            {ends.bottom.text}
          </text>
          <text x={W / 2} y={H - 2} fontSize={13} textAnchor="middle" fill={ends.bottom.color} fontWeight={900}>⬇</text>
        </g>
      )}
    </svg>
  )
}
