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

export function FieldSchema({
  onTap,
  markers = [],
  highlight,
  className,
}: {
  onTap?: (p: Point) => void
  markers?: FieldMarker[]
  /** Optioneel: markeer een aanvalsrichting met een pijl. */
  highlight?: { dir: 'up' | 'down'; label: string }
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
      {/* Out-zone achtergrond */}
      <rect x={-M} y={-M} width={W + 2 * M} height={H + 2 * M} fill="#0a1f14" />
      {/* Speelveld */}
      <rect x={0} y={0} width={W} height={H} fill="#0f3d27" stroke="#e8f5ee" strokeWidth={1.5} />
      {/* Doelgebieden */}
      <rect x={0} y={0} width={W} height={HOME_GOAL_Y} fill="#ffffff" opacity={0.06} />
      <rect x={0} y={AWAY_GOAL_Y} width={W} height={H - AWAY_GOAL_Y} fill="#ffffff" opacity={0.06} />
      {/* Lijnen */}
      <line x1={0} y1={HOME_GOAL_Y} x2={W} y2={HOME_GOAL_Y} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={0} y1={AWAY_GOAL_Y} x2={W} y2={AWAY_GOAL_Y} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={0} y1={MID_Y} x2={W} y2={MID_Y} stroke="#e8f5ee" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={0} y1={FT_TOP_Y} x2={W} y2={FT_TOP_Y} stroke="#9fd9ba" strokeWidth={0.8} strokeDasharray="2 3" />
      <line x1={0} y1={FT_BOT_Y} x2={W} y2={FT_BOT_Y} stroke="#9fd9ba" strokeWidth={0.8} strokeDasharray="2 3" />
      {/* Zone-derden */}
      <line x1={THIRD_1} y1={0} x2={THIRD_1} y2={H} stroke="#9fd9ba" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />
      <line x1={THIRD_2} y1={0} x2={THIRD_2} y2={H} stroke="#9fd9ba" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />

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

      {highlight && (
        <text x={W / 2} y={highlight.dir === 'up' ? H - 6 : 12} fontSize={9} textAnchor="middle" fill="#ffd166">
          {highlight.label} {highlight.dir === 'up' ? '↓' : '↑'}
        </text>
      )}
    </svg>
  )
}
