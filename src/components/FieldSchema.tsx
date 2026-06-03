'use client'

import React, { useRef } from 'react'

import type { Point } from '@/lib/field'

// Veld op schaal: 14 m breed, 10 px/m. Breedte vast (140 px); de LENGTE hangt af van de
// doelgebied-diepte (speelveld 26 m + 2×diepte), dus die wordt per render berekend.
const M = 22 // marge in px (out-zone)
const W = 140
const SCALE = 10 // px per meter
const PLAYING_LENGTH_M = 26
const THIRD_1 = W / 3
const THIRD_2 = (2 * W) / 3

interface FieldPx {
  H: number
  homeGoalY: number
  awayGoalY: number
  midY: number
  ftTopY: number
  ftBotY: number
}
function fieldPx(goalAreaDepthM: number): FieldPx {
  const d = goalAreaDepthM
  return {
    H: (PLAYING_LENGTH_M + 2 * d) * SCALE,
    homeGoalY: d * SCALE,
    awayGoalY: (d + PLAYING_LENGTH_M) * SCALE,
    midY: (d + PLAYING_LENGTH_M / 2) * SCALE,
    ftTopY: (d + 4) * SCALE,
    ftBotY: (d + PLAYING_LENGTH_M - 4) * SCALE,
  }
}

export interface FieldMarker {
  /** Optioneel stabiel id (om een optimistische markering terug te kunnen draaien). */
  id?: string
  x: number
  y: number
  color?: string
  label?: string
  r?: number
  /** Optioneel vertrekpunt (0..1) — tekent het worp-traject naar (x,y). */
  fromX?: number
  fromY?: number
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

function HeatLayer({ points, h }: { points: Point[]; h: number }) {
  const H = h
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
  glowGoal,
  goalAreaDepthM = 10,
  className,
}: {
  onTap?: (p: Point) => void
  markers?: FieldMarker[]
  /** Wanneer gezet: render een dichtheid-heatmap i.p.v. losse punten. */
  heatPoints?: Point[]
  /** Richtingslabels per ploeg: bovenaan valt aan naar boven (↑), onderaan naar onder (↓). */
  ends?: { top?: EndLabel; bottom?: EndLabel }
  /** Laat een doelgebied oplichten (vrije worp). */
  glowGoal?: { end: 'top' | 'bottom'; color: string }
  /** Diepte van het doelgebied (m) — bepaalt de veldlengte/verhoudingen. */
  goalAreaDepthM?: number
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const { H, homeGoalY, awayGoalY, midY, ftTopY, ftBotY } = fieldPx(goalAreaDepthM)

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
      <rect x={0} y={0} width={W} height={homeGoalY} fill={ends?.top?.color ?? '#ffffff'} opacity={ends?.top ? 0.22 : 0.06} />
      <rect x={0} y={awayGoalY} width={W} height={H - awayGoalY} fill={ends?.bottom?.color ?? '#ffffff'} opacity={ends?.bottom ? 0.22 : 0.06} />
      {/* Lijnen */}
      <line x1={0} y1={homeGoalY} x2={W} y2={homeGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={0} y1={awayGoalY} x2={W} y2={awayGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={0} y1={midY} x2={W} y2={midY} stroke="#e8f5ee" strokeWidth={1} strokeDasharray="4 4" />
      {/* Vrijworplijnen — volle lijn (zoals op het officiële terrein). */}
      <line x1={0} y1={ftTopY} x2={W} y2={ftTopY} stroke="#e8f5ee" strokeWidth={1} />
      <line x1={0} y1={ftBotY} x2={W} y2={ftBotY} stroke="#e8f5ee" strokeWidth={1} />
      {/* Zone-derden — enkel binnen het speelvak (tussen de doellijnen), niet tot in de
          doelgebieden, anders steken er kleine lijntjes voorbij de doellijn uit. */}
      <line x1={THIRD_1} y1={homeGoalY} x2={THIRD_1} y2={awayGoalY} stroke="#9fd9ba" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />
      <line x1={THIRD_2} y1={homeGoalY} x2={THIRD_2} y2={awayGoalY} stroke="#9fd9ba" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />

      {/* Oplichtend doelgebied bij vrije worp — duidelijk t.o.v. de rest: gevulde glow,
          opvallende pulserende rand en een VW-label. */}
      {glowGoal && (
        <g>
          <rect
            x={0}
            y={glowGoal.end === 'top' ? 0 : awayGoalY}
            width={W}
            height={glowGoal.end === 'top' ? homeGoalY : H - awayGoalY}
            fill={glowGoal.color}
            className="field-goal-glow"
          />
          <rect
            x={1.5}
            y={(glowGoal.end === 'top' ? 0 : awayGoalY) + 1.5}
            width={W - 3}
            height={(glowGoal.end === 'top' ? homeGoalY : H - awayGoalY) - 3}
            fill="none"
            stroke={glowGoal.color}
            strokeWidth={3}
            className="field-goal-border"
          />
          <text
            x={W / 2}
            y={glowGoal.end === 'top' ? homeGoalY / 2 + 4 : awayGoalY + (H - awayGoalY) / 2 + 4}
            fontSize={13}
            textAnchor="middle"
            fontWeight={900}
            fill="#06140d"
            opacity={0.85}
          >
            VRIJE WORP
          </text>
        </g>
      )}

      {/* Heatmap-laag (optioneel) */}
      {heatPoints && heatPoints.length > 0 && <HeatLayer points={heatPoints} h={H} />}

      {/* Markers */}
      {markers.map((m, i) => {
        const color = m.color ?? '#ffd166'
        const hasFrom = typeof m.fromX === 'number' && typeof m.fromY === 'number'
        return (
          <g key={i}>
            {hasFrom && (
              <>
                <line
                  x1={(m.fromX as number) * W}
                  y1={(m.fromY as number) * H}
                  x2={m.x * W}
                  y2={m.y * H}
                  stroke={color}
                  strokeWidth={1.6}
                  strokeOpacity={0.7}
                  strokeLinecap="round"
                />
                <circle cx={(m.fromX as number) * W} cy={(m.fromY as number) * H} r={2} fill={color} opacity={0.6} />
              </>
            )}
            <circle cx={m.x * W} cy={m.y * H} r={m.r ?? 6} fill={color} stroke="#06140d" strokeWidth={1} />
            {m.label && (
              <text x={m.x * W} y={m.y * H + 2.5} fontSize={7} textAnchor="middle" fill="#06140d" fontWeight={700}>
                {m.label}
              </text>
            )}
          </g>
        )
      })}

      {ends?.top && (
        <text x={W / 2} y={15} fontSize={9} textAnchor="middle" fill={ends.top.color} fontWeight={800}>
          {ends.top.text}
        </text>
      )}
      {ends?.bottom && (
        <text x={W / 2} y={H - 6} fontSize={9} textAnchor="middle" fill={ends.bottom.color} fontWeight={800}>
          {ends.bottom.text}
        </text>
      )}
    </svg>
  )
}
