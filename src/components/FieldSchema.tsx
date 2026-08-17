'use client'

import React, { useId, useRef } from 'react'

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
  /** Horizontaal versleepbaar (enkel de breedte): bv. de werpplaats voor de volgende worp.
   *  Vereist een `id` en de `onMarkerDragX`-callback op het veld. */
  draggableX?: boolean
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

// Zachte radiale "blob" — vloeit vloeiend naar transparant uit (mooie afloop).
interface Blob {
  id: string
  color: string
  op: number
  cx: number
  cy: number
  r: number
}
function BlobLayer({ blobs }: { blobs: Blob[] }) {
  if (blobs.length === 0) return null
  return (
    <g clipPath="url(#fieldclip)">
      <defs>
        {blobs.map((b) => (
          <radialGradient key={b.id} id={b.id} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={b.color} stopOpacity={b.op} />
            <stop offset="50%" stopColor={b.color} stopOpacity={b.op * 0.6} />
            <stop offset="100%" stopColor={b.color} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      {blobs.map((b) => (
        <circle key={b.id} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#${b.id})`} />
      ))}
    </g>
  )
}

// Dichtheidskaart ("waar het meeste gebeurt"): tel de punten per cel, kleur naar volume
// (groen = weinig, rood = veel) en teken zachte blobs op het zwaartepunt.
function HeatLayer({ points, h }: { points: Point[]; h: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const grid = Array.from({ length: GY }, () => new Array(GX).fill(0))
  const sx = Array.from({ length: GY }, () => new Array(GX).fill(0))
  const sy = Array.from({ length: GY }, () => new Array(GX).fill(0))
  let max = 0
  for (const p of points) {
    const gx = Math.min(GX - 1, Math.max(0, Math.floor(p.x * GX)))
    const gy = Math.min(GY - 1, Math.max(0, Math.floor(p.y * GY)))
    grid[gy][gx] += 1
    sx[gy][gx] += p.x
    sy[gy][gx] += p.y
    if (grid[gy][gx] > max) max = grid[gy][gx]
  }
  if (max === 0) return null
  const cw = W / GX
  const ch = h / GY
  const baseR = Math.max(cw, ch)
  const blobs: Blob[] = []
  for (let y = 0; y < GY; y++) {
    for (let x = 0; x < GX; x++) {
      const n = grid[y][x]
      if (!n) continue
      const t = n / max
      blobs.push({
        id: `${uid}-${x}-${y}`,
        color: heatColor(t),
        op: 0.3 + 0.55 * t,
        cx: (sx[y][x] / n) * W,
        cy: (sy[y][x] / n) * h,
        r: baseR * Math.min(1.4, 0.7 + 0.3 * n),
      })
    }
  }
  return <BlobLayer blobs={blobs} />
}

// Een doelpoging op een vaste positie (genormaliseerd, canoniek "aanval naar onder").
export interface ConvPoint {
  x: number
  y: number
  goal: boolean
}

// Conversie-heatmap ("gevaarzone"): bin de doelpogingen, kleur per zone naar scoringskans
// (rood = zwak, groen = gevaarlijk). De dekking schaalt met het aantal pogingen, zodat
// zones met weinig data licht blijven. Grover raster dan de dichtheid-heatmap (meer data
// per cel = betrouwbaarder percentage).
const CGX = 5
const CGY = 9
const CONV_MIN_ATTEMPTS = 2

function convColor(t: number): string {
  // t = conversie 0..1: 0 = groen (weinig scoringskans), 0.5 = amber, 1 = rood (gevaarlijk).
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

function ConvLayer({ points, h, minAttempts }: { points: ConvPoint[]; h: number; minAttempts: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const att = Array.from({ length: CGY }, () => new Array(CGX).fill(0))
  const gls = Array.from({ length: CGY }, () => new Array(CGX).fill(0))
  // Som van de werkelijke posities per cel → zwaartepunt (de blob staat waar de worpen
  // écht liggen, niet in het celmidden).
  const sx = Array.from({ length: CGY }, () => new Array(CGX).fill(0))
  const sy = Array.from({ length: CGY }, () => new Array(CGX).fill(0))
  let maxAtt = 0
  for (const p of points) {
    const gx = Math.min(CGX - 1, Math.max(0, Math.floor(p.x * CGX)))
    const gy = Math.min(CGY - 1, Math.max(0, Math.floor(p.y * CGY)))
    att[gy][gx] += 1
    sx[gy][gx] += p.x
    sy[gy][gx] += p.y
    if (p.goal) gls[gy][gx] += 1
    if (att[gy][gx] > maxAtt) maxAtt = att[gy][gx]
  }
  if (maxAtt === 0) return null
  const cw = W / CGX
  const ch = h / CGY
  // Straal schaalt mee met het aantal worpen: weinig data = kleine, precieze stip;
  // meer worpen in een zone = een ruimere gevaarvlek. Zachte radiale afloop.
  const baseR = Math.min(cw, ch)
  const blobs: Blob[] = []
  for (let y = 0; y < CGY; y++) {
    for (let x = 0; x < CGX; x++) {
      const n = att[y][x]
      if (n < minAttempts) continue
      const conv = gls[y][x] / n
      blobs.push({
        id: `${uid}-${x}-${y}`,
        color: convColor(conv),
        op: 0.4 + 0.5 * Math.min(1, n / maxAtt),
        cx: (sx[y][x] / n) * W,
        cy: (sy[y][x] / n) * h,
        r: baseR * Math.min(1.3, 0.5 + 0.2 * n),
      })
    }
  }
  return <BlobLayer blobs={blobs} />
}

export function FieldSchema({
  onTap,
  markers = [],
  onMarkerDragX,
  guideY,
  heatPoints,
  convPoints,
  ends,
  glowGoal,
  goalAreaDepthM = 10,
  half,
  zoom,
  convMinAttempts = CONV_MIN_ATTEMPTS,
  className,
}: {
  onTap?: (p: Point) => void
  markers?: FieldMarker[]
  /** Versleep-callback voor horizontaal versleepbare markers (geeft de nieuwe x, 0..1). */
  onMarkerDragX?: (id: string, x: number) => void
  /** Toont een horizontale hulplijn (genormaliseerde y) — tik erop om de werpplaats te verleggen. */
  guideY?: number
  /** Wanneer gezet: render een dichtheid-heatmap i.p.v. losse punten. */
  heatPoints?: Point[]
  /** Wanneer gezet: render een conversie-heatmap (gevaarzone) van doelpogingen. */
  convPoints?: ConvPoint[]
  /** Min. aantal pogingen per cel voor de conversie-heatmap (default 2; 1 voor één speler). */
  convMinAttempts?: number
  /** Richtingslabels per ploeg: bovenaan valt aan naar boven (↑), onderaan naar onder (↓). */
  ends?: { top?: EndLabel; bottom?: EndLabel }
  /** Laat een doelgebied oplichten (vrije worp). */
  glowGoal?: { end: 'top' | 'bottom'; color: string }
  /** Diepte van het doelgebied (m) — bepaalt de veldlengte/verhoudingen. */
  goalAreaDepthM?: number
  /** Toon enkel één speelhelft (van de middellijn tot het doel aan die zijde). */
  half?: 'top' | 'bottom'
  /** Zoom in op het doelgebied onderaan (bij scoren telt enkel het doelgebied). */
  zoom?: 'goal'
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const { H, homeGoalY, awayGoalY, midY, ftTopY, ftBotY } = fieldPx(goalAreaDepthM)
  // Uitsnede: doelgebied-zoom (scoren) > halfveld > volledig veld.
  const goalTop = awayGoalY - 4 * SCALE // 4 m context boven de doellijn
  const viewY = zoom === 'goal' ? goalTop : half === 'bottom' ? midY : -M
  const viewH = zoom === 'goal' ? H - goalTop + 8 : half === 'bottom' ? H + M - midY : half === 'top' ? midY + M : H + 2 * M

  // Onderdruk de tik die een touch-device ná het slepen kan synthetiseren (anders zou die een
  // worp plaatsen). We negeren elke veld-tik kort na het einde van een sleep.
  const suppressTapUntil = useRef(0)

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onTap || !ref.current) return
    if (Date.now() < suppressTapUntil.current) return
    const rect = ref.current.getBoundingClientRect()
    const vx = -M + ((e.clientX - rect.left) / rect.width) * (W + 2 * M)
    const vy = -M + ((e.clientY - rect.top) / rect.height) * (H + 2 * M)
    onTap({ x: vx / W, y: vy / H })
  }

  // Horizontaal slepen van een marker (de werpplaats): enkel de breedte (x) wijzigt; de diepte
  // blijft gelijk. Stopt de tik-propagatie zodat het verslepen geen nieuwe worp plaatst.
  const dragId = useRef<string | null>(null)
  function clientToNormX(clientX: number): number {
    if (!ref.current) return 0.5
    const rect = ref.current.getBoundingClientRect()
    const vx = -M + ((clientX - rect.left) / rect.width) * (W + 2 * M)
    return Math.max(0, Math.min(1, vx / W))
  }
  function startDrag(e: React.PointerEvent, id?: string) {
    if (!onMarkerDragX || !id) return
    e.stopPropagation()
    e.preventDefault()
    dragId.current = id
    // Pointer capture: alle vervolg-events gaan naar dit element, ook buiten zijn vorm. Samen met
    // touch-action:none belet dit dat de browser de beweging als scrollen kaapt (en zo de sleep in
    // stukjes hakt). We luisteren op het element zelf zodat de capture/listeners ook na re-renders
    // (de marker verschuift) blijven werken.
    const el = e.currentTarget as SVGElement
    try { el.setPointerCapture(e.pointerId) } catch {}
    const move = (ev: PointerEvent) => {
      if (dragId.current) onMarkerDragX(dragId.current, clientToNormX(ev.clientX))
    }
    const end = () => {
      dragId.current = null
      suppressTapUntil.current = Date.now() + 350
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      try { el.releasePointerCapture(e.pointerId) } catch {}
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }

  return (
    <svg
      ref={ref}
      className={className}
      viewBox={`${-M} ${viewY} ${W + 2 * M} ${viewH}`}
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
        {/* Grasmat: zachte gradiënt + maaibanen + vignette → een echt veld i.p.v. een vlak groen vlak. */}
        <linearGradient id="turf" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#22854f" />
          <stop offset="0.5" stopColor="#155a37" />
          <stop offset="1" stopColor="#0c4028" />
        </linearGradient>
        <pattern id="mow" patternUnits="userSpaceOnUse" width={W} height={16}>
          <rect width={W} height={8} fill="#ffffff" opacity={0.045} />
        </pattern>
        <radialGradient id="turfvig" cx="0.5" cy="0.42" r="0.72">
          <stop offset="0.55" stopColor="#000000" stopOpacity={0} />
          <stop offset="1" stopColor="#000000" stopOpacity={0.42} />
        </radialGradient>
        <filter id="fieldshadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
        </filter>
      </defs>
      {/* Out-zone: rode rand rond het veld — tik hier = bal buiten gesmeten */}
      <rect x={-M} y={-M} width={W + 2 * M} height={H + 2 * M} fill="#3a1018" />
      <rect x={-M} y={-M} width={W + 2 * M} height={H + 2 * M} fill="#ef476f" opacity={0.18} />
      <text x={W / 2} y={-M / 2 + 3} fontSize={6} textAnchor="middle" fill="#ffb3c1" letterSpacing={1}>
        BUITEN
      </text>
      {/* Speelveld: grasmat met diepte (schaduw), maaibanen en vignette */}
      <rect x={0} y={0} width={W} height={H} fill="url(#turf)" stroke="#e8f5ee" strokeWidth={1.5} filter="url(#fieldshadow)" />
      <rect x={0} y={0} width={W} height={H} fill="url(#mow)" clipPath="url(#fieldclip)" />
      <rect x={0} y={0} width={W} height={H} fill="url(#turfvig)" clipPath="url(#fieldclip)" />
      {/* Doelgebieden — gekleurd in de kleur van de ploeg die ER NAARTOE aanvalt */}
      <rect x={0} y={0} width={W} height={homeGoalY} fill={ends?.top?.color ?? '#ffffff'} opacity={ends?.top ? 0.22 : 0.06} />
      <rect x={0} y={awayGoalY} width={W} height={H - awayGoalY} fill={ends?.bottom?.color ?? '#ffffff'} opacity={ends?.bottom ? 0.22 : 0.06} />
      {/* Lijnen */}
      <line x1={0} y1={homeGoalY} x2={W} y2={homeGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={0} y1={awayGoalY} x2={W} y2={awayGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      {/* Middellijn — volle lijn (zoals op het officiële terrein). */}
      <line x1={0} y1={midY} x2={W} y2={midY} stroke="#e8f5ee" strokeWidth={1.5} />
      {/* Doellijn steekt aan beide zijlijnen een eindje buiten het veld — 4 streepjes in totaal
          (2 per doellijn), zoals op het reglementaire terrein. */}
      <line x1={-1.2 * SCALE} y1={homeGoalY} x2={0} y2={homeGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={W} y1={homeGoalY} x2={W + 1.2 * SCALE} y2={homeGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={-1.2 * SCALE} y1={awayGoalY} x2={0} y2={awayGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      <line x1={W} y1={awayGoalY} x2={W + 1.2 * SCALE} y2={awayGoalY} stroke="#e8f5ee" strokeWidth={1.5} />
      {/* Vrijworplijnen — volle lijn (zoals op het officiële terrein). */}
      <line x1={0} y1={ftTopY} x2={W} y2={ftTopY} stroke="#e8f5ee" strokeWidth={1} />
      <line x1={0} y1={ftBotY} x2={W} y2={ftBotY} stroke="#e8f5ee" strokeWidth={1} />
      {/* Zone-derden — enkel binnen het speelvak (tussen de doellijnen), niet tot in de
          doelgebieden, anders steken er kleine lijntjes voorbij de doellijn uit. */}
      <line x1={THIRD_1} y1={homeGoalY} x2={THIRD_1} y2={awayGoalY} stroke="#c7f2d9" strokeWidth={0.6} strokeDasharray="2 4" opacity={0.62} />
      <line x1={THIRD_2} y1={homeGoalY} x2={THIRD_2} y2={awayGoalY} stroke="#c7f2d9" strokeWidth={0.6} strokeDasharray="2 4" opacity={0.62} />

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

      {/* Conversie-heatmap (gevaarzone, optioneel) */}
      {convPoints && convPoints.length > 0 && <ConvLayer points={convPoints} h={H} minAttempts={convMinAttempts} />}

      {/* Werpplaats-hulplijn: tik ergens op deze horizontale lijn om de werpplaats te verleggen. */}
      {typeof guideY === 'number' && (
        <g pointerEvents="none">
          <line x1={0} y1={guideY * H} x2={W} y2={guideY * H} stroke="#ffd166" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.7} />
          <path d={`M 5 ${guideY * H} l 3 -3 M 5 ${guideY * H} l 3 3`} stroke="#ffd166" strokeWidth={1.2} fill="none" strokeLinecap="round" strokeOpacity={0.8} />
          <path d={`M ${W - 5} ${guideY * H} l -3 -3 M ${W - 5} ${guideY * H} l -3 3`} stroke="#ffd166" strokeWidth={1.2} fill="none" strokeLinecap="round" strokeOpacity={0.8} />
        </g>
      )}

      {/* Markers */}
      {markers.map((m, i) => {
        const color = m.color ?? '#ffd166'
        const hasFrom = typeof m.fromX === 'number' && typeof m.fromY === 'number'
        const r = m.r ?? 6
        const cx = m.x * W
        const cy = m.y * H
        const canDrag = Boolean(m.draggableX && m.id && onMarkerDragX)
        return (
          <g key={m.id ?? i}>
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
            <circle cx={cx} cy={cy} r={r} fill={color} stroke="#06140d" strokeWidth={1} />
            {m.label && (
              <text x={cx} y={cy + 2.5} fontSize={7} textAnchor="middle" fill="#06140d" fontWeight={700}>
                {m.label}
              </text>
            )}
            {canDrag && (
              // Versleep-affordance: een ruime, horizontaal versleepbare greep met ↔-pijlen.
              <g
                style={{ cursor: 'ew-resize', touchAction: 'none' }}
                onPointerDown={(e) => startDrag(e, m.id)}
                onClick={(e) => e.stopPropagation()}
              >
                <circle cx={cx} cy={cy} r={r + 6} fill="transparent" stroke={color} strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.85} />
                {/* Grote onzichtbare hitzone voor een vlotte aanraking. */}
                <circle cx={cx} cy={cy} r={r + 12} fill="#ffffff" fillOpacity={0.001} />
                <path d={`M ${cx - r - 9} ${cy} l 3 -3 M ${cx - r - 9} ${cy} l 3 3`} stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
                <path d={`M ${cx + r + 9} ${cy} l -3 -3 M ${cx + r + 9} ${cy} l -3 3`} stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" />
              </g>
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
