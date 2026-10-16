'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  heatKleur,
  isDoelpunt,
  somHeat,
  uitkomstKleur,
  uitkomstLabel,
  veldLijnen,
  type AppData,
  type AppPas,
  type AppWorp,
  type XY,
} from '@/lib/app-analyse-veld'

// Het tactiekbord: het veld in meters, zoom met scrollen of knijpen, verschuiven met slepen. Lagen
// naar keuze: heatmap, worpen (pijl van werpplaats naar landing, kleur = afloop), vangsten,
// passen, passennetwerk. Tik op een worp om hem te kiezen.

export interface Veld2DLagen {
  heat?: boolean
  worpen?: boolean
  vangsten?: boolean
  passen?: boolean
  netwerk?: boolean
}

export interface Veld2DProps {
  data: AppData
  kleuren: { thuis: string; uit: string }
  lagen: Veld2DLagen
  /** Heatmap van deze spelers (leeg = niemand). */
  heatSpelers: string[]
  worpen: AppWorp[]
  passen?: AppPas[]
  netwerk?: { knopen: { id: string; plek: XY; label: string; team: number }[]; lijnen: { van: string; naar: string; n: number }[] }
  gekozen?: AppWorp | null
  onKies?: (w: AppWorp) => void
  hoogte?: number | string
  naamVan: (id?: string | null) => string
}

const MARGE = 3

function heatAfbeelding(raster: number[][], max: number): string | null {
  if (typeof document === 'undefined' || raster.length === 0 || max <= 0) return null
  const rijen = raster.length
  const kolommen = raster[0].length
  const c = document.createElement('canvas')
  c.width = kolommen
  c.height = rijen
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(kolommen, rijen)
  for (let r = 0; r < rijen; r++) {
    for (let k = 0; k < kolommen; k++) {
      const [R, G, B, A] = heatKleur((raster[r][k] || 0) / max)
      const i = (r * kolommen + k) * 4
      img.data[i] = R
      img.data[i + 1] = G
      img.data[i + 2] = B
      img.data[i + 3] = A
    }
  }
  ctx.putImageData(img, 0, 0)
  // Opschalen met afvlakking: een vloeiende heatmap in plaats van blokjes.
  const groot = document.createElement('canvas')
  groot.width = kolommen * 8
  groot.height = rijen * 8
  const g = groot.getContext('2d')
  if (!g) return c.toDataURL()
  g.filter = 'blur(6px)'
  g.imageSmoothingEnabled = true
  g.drawImage(c, 0, 0, groot.width, groot.height)
  return groot.toDataURL()
}

export function Veld2D({
  data,
  kleuren,
  lagen,
  heatSpelers,
  worpen,
  passen = [],
  netwerk,
  gekozen,
  onKies,
  hoogte,
  naamVan,
}: Veld2DProps) {
  const v = data.veld
  // Op een smal scherm (gsm) staat het veld rechtop: doelgebied A boven, B onder.
  const houder = useRef<HTMLDivElement>(null)
  const [breedtePx, setBreedtePx] = useState(0)
  useEffect(() => {
    const el = houder.current
    if (!el) return
    const ro = new ResizeObserver(() => setBreedtePx(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const staand = breedtePx > 0 && breedtePx < 560
  const basis = useMemo(
    () =>
      staand
        ? { x: -(v.breedte + MARGE), y: -MARGE, w: v.breedte + 2 * MARGE, h: v.lengte + 2 * MARGE }
        : { x: -MARGE, y: -MARGE, w: v.lengte + 2 * MARGE, h: v.breedte + 2 * MARGE },
    [v, staand],
  )
  const rechtop = staand ? 'rotate(-90)' : undefined
  const [vb, setVb] = useState(basis)
  const svg = useRef<SVGSVGElement>(null)
  const wijzers = useRef(new Map<number, { x: number; y: number }>())
  const sleep = useRef<{ x: number; y: number; vb: typeof basis } | null>(null)
  const knijp = useRef<{ d: number; vb: typeof basis; m: { x: number; y: number } } | null>(null)

  useEffect(() => setVb(basis), [basis])

  const heat = useMemo(() => {
    if (!lagen.heat || heatSpelers.length === 0) return null
    const { raster, max } = somHeat(heatSpelers.map((id) => data.spelers?.[id]?.heat))
    const src = heatAfbeelding(raster, max)
    if (!src) return null
    const r = v.raster ?? 0.5
    return { src, w: (raster[0]?.length ?? 0) * r, h: raster.length * r }
  }, [lagen.heat, heatSpelers, data.spelers, v.raster])

  const naarVeld = (cx: number, cy: number) => {
    const el = svg.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return { x: vb.x + ((cx - r.left) / r.width) * vb.w, y: vb.y + ((cy - r.top) / r.height) * vb.h }
  }

  const zoom = (factor: number, rond?: { x: number; y: number }) => {
    setVb((o) => {
      const m = rond ?? { x: o.x + o.w / 2, y: o.y + o.h / 2 }
      const w = Math.min(basis.w * 1.2, Math.max(basis.w / 12, o.w * factor))
      const f = w / o.w
      const h = o.h * f
      return { x: m.x - (m.x - o.x) * f, y: m.y - (m.y - o.y) * f, w, h }
    })
  }

  useEffect(() => {
    const el = svg.current
    if (!el) return
    const wiel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setVb((o) => {
        const m = { x: o.x + ((e.clientX - r.left) / r.width) * o.w, y: o.y + ((e.clientY - r.top) / r.height) * o.h }
        const factor = Math.exp(e.deltaY * 0.0015)
        const w = Math.min(basis.w * 1.2, Math.max(basis.w / 12, o.w * factor))
        const f = w / o.w
        return { x: m.x - (m.x - o.x) * f, y: m.y - (m.y - o.y) * f, w, h: o.h * f }
      })
    }
    el.addEventListener('wheel', wiel, { passive: false })
    return () => el.removeEventListener('wheel', wiel)
  }, [basis])

  const omlaag = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    wijzers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (wijzers.current.size === 1) sleep.current = { x: e.clientX, y: e.clientY, vb }
    if (wijzers.current.size === 2) {
      const [a, b] = [...wijzers.current.values()]
      knijp.current = { d: Math.hypot(a.x - b.x, a.y - b.y), vb, m: naarVeld((a.x + b.x) / 2, (a.y + b.y) / 2) }
      sleep.current = null
    }
  }
  const beweeg = (e: React.PointerEvent) => {
    if (!wijzers.current.has(e.pointerId)) return
    wijzers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const el = svg.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (knijp.current && wijzers.current.size >= 2) {
      const [a, b] = [...wijzers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const k = knijp.current
      const w = Math.min(basis.w * 1.2, Math.max(basis.w / 12, k.vb.w * (k.d / Math.max(d, 1))))
      const f = w / k.vb.w
      setVb({ x: k.m.x - (k.m.x - k.vb.x) * f, y: k.m.y - (k.m.y - k.vb.y) * f, w, h: k.vb.h * f })
    } else if (sleep.current) {
      const s = sleep.current
      const dx = ((e.clientX - s.x) / r.width) * s.vb.w
      const dy = ((e.clientY - s.y) / r.height) * s.vb.h
      setVb({ ...s.vb, x: s.vb.x - dx, y: s.vb.y - dy })
    }
  }
  const omhoog = (e: React.PointerEvent) => {
    wijzers.current.delete(e.pointerId)
    if (wijzers.current.size < 2) knijp.current = null
    if (wijzers.current.size === 0) sleep.current = null
  }

  const ingezoomd = vb.w < basis.w * 0.98
  const thuisId = data.ploegen?.find((p) => p.thuis)?.id ?? 0
  const kleurTeam = (t?: number) => (t === thuisId ? kleuren.thuis : kleuren.uit)

  return (
    <div
      ref={houder}
      className="v2d"
      style={{
        height: staand ? Math.min(breedtePx * ((v.lengte + 2 * MARGE) / (v.breedte + 2 * MARGE)), 0.78 * (typeof window !== 'undefined' ? window.innerHeight : 800)) : hoogte,
      }}
    >
      <svg
        ref={svg}
        className={`v2d-svg${staand ? ' staand' : ''}`}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={omlaag}
        onPointerMove={beweeg}
        onPointerUp={omhoog}
        onPointerCancel={omhoog}
        onDoubleClick={(e) => zoom(0.6, naarVeld(e.clientX, e.clientY))}
        role="img"
        aria-label="Veld met de analyse"
      >
        <defs>
          <pattern id="v2d-gras" width="5" height={v.breedte} patternUnits="userSpaceOnUse">
            <rect width="2.5" height={v.breedte} fill="#2f6b3a" />
            <rect x="2.5" width="2.5" height={v.breedte} fill="#2a6034" />
          </pattern>
          {['goal', 'caught', 'grond', 'out', 'eigen'].map((k) => (
            <marker key={k} id={`v2d-pijl-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={uitkomstKleur(k === 'out' ? 'out' : k === 'eigen' ? 'own_goal' : k)} />
            </marker>
          ))}
        </defs>
        <g transform={staand ? 'rotate(90)' : undefined}>
        <rect x={-MARGE} y={-MARGE} width={v.lengte + 2 * MARGE} height={v.breedte + 2 * MARGE} fill="#1d3b24" />
        <rect x={0} y={0} width={v.lengte} height={v.breedte} fill="url(#v2d-gras)" />
        <rect x={0} y={0} width={v.doellijn_a} height={v.breedte} fill="rgba(255,255,255,0.06)" />
        <rect x={v.doellijn_b} y={0} width={v.lengte - v.doellijn_b} height={v.breedte} fill="rgba(255,255,255,0.06)" />
        {heat && <image href={heat.src} x={0} y={0} width={heat.w} height={heat.h} preserveAspectRatio="none" opacity={0.9} />}
        <rect x={0} y={0} width={v.lengte} height={v.breedte} fill="none" stroke="rgba(255,255,255,.92)" strokeWidth={0.12} />
        {veldLijnen(v).map((l, i) => (
          <line
            key={i}
            x1={l.x}
            x2={l.x}
            y1={0}
            y2={v.breedte}
            stroke="rgba(255,255,255,.88)"
            strokeWidth={l.soort === 'doel' ? 0.14 : 0.08}
            strokeDasharray={l.soort === 'vwl' ? '0.5 0.4' : undefined}
          />
        ))}
        <text x={v.doellijn_a / 2} y={v.breedte + 1.6} className="v2d-label" transform={staand ? `rotate(-90 ${v.doellijn_a / 2} ${v.breedte + 1.6})` : undefined}>Doelgebied A</text>
        <text x={(v.doellijn_b + v.lengte) / 2} y={v.breedte + 1.6} className="v2d-label" transform={staand ? `rotate(-90 ${(v.doellijn_b + v.lengte) / 2} ${v.breedte + 1.6})` : undefined}>Doelgebied B</text>

        {lagen.passen &&
          passen.map((p, i) =>
            p.van_xy && p.naar_xy ? (
              <line
                key={`p${i}`}
                x1={p.van_xy[0]}
                y1={p.van_xy[1]}
                x2={p.naar_xy[0]}
                y2={p.naar_xy[1]}
                stroke={kleurTeam(p.team)}
                strokeWidth={0.12}
                strokeDasharray="0.35 0.25"
                opacity={0.9}
              >
                <title>{`Pas ${naamVan(p.van)} → ${naamVan(p.naar)}`}</title>
              </line>
            ) : null,
          )}

        {lagen.netwerk && netwerk && (
          <g>
            {netwerk.lijnen.map((l, i) => {
              const a = netwerk.knopen.find((k) => k.id === l.van)
              const b = netwerk.knopen.find((k) => k.id === l.naar)
              if (!a || !b) return null
              return (
                <line key={`n${i}`} x1={a.plek.x} y1={a.plek.y} x2={b.plek.x} y2={b.plek.y} stroke="#fff" strokeOpacity={0.75} strokeWidth={0.1 + 0.12 * l.n} strokeLinecap="round">
                  <title>{`${a.label} ↔ ${b.label}: ${l.n} ${l.n === 1 ? 'pas' : 'passen'}`}</title>
                </line>
              )
            })}
            {netwerk.knopen.map((k) => (
              <g key={k.id} transform={`translate(${k.plek.x} ${k.plek.y})`}>
                <circle r={0.75} fill={kleurTeam(k.team)} stroke="#fff" strokeWidth={0.1} />
                <text className="v2d-nr" y={0.28} transform={rechtop}>{k.label}</text>
              </g>
            ))}
          </g>
        )}

        {lagen.worpen &&
          worpen.map((w, i) => {
            if (!w.opzetplaats || !w.landingspunt) return null
            const u = w.uitkomst ?? ''
            const k = isDoelpunt(w) ? 'goal' : u === 'caught' || u === 'intercepted' ? 'caught' : u.startsWith('out') ? 'out' : u === 'own_goal' ? 'eigen' : 'grond'
            const actief = gekozen === w
            const dim = gekozen && !actief
            return (
              <g
                key={`w${i}`}
                className="v2d-worp"
                opacity={dim ? 0.3 : 1}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onKies?.(w)}
              >
                <line
                  x1={w.opzetplaats.x}
                  y1={w.opzetplaats.y}
                  x2={w.landingspunt.x}
                  y2={w.landingspunt.y}
                  stroke="transparent"
                  strokeWidth={1.2}
                />
                <line
                  x1={w.opzetplaats.x}
                  y1={w.opzetplaats.y}
                  x2={w.landingspunt.x}
                  y2={w.landingspunt.y}
                  stroke={uitkomstKleur(w.uitkomst)}
                  strokeWidth={actief ? 0.28 : 0.16}
                  markerEnd={`url(#v2d-pijl-${k})`}
                  strokeDasharray={w.type === 'rug' ? undefined : '0.6 0.25'}
                />
                <circle cx={w.opzetplaats.x} cy={w.opzetplaats.y} r={0.35} fill={kleurTeam(w.team)} stroke="#fff" strokeWidth={0.08} />
                <title>{`${naamVan(w.identiteit)} · ${w.type === 'rug' ? 'rugworp' : 'nekworp'} · ${uitkomstLabel(w.uitkomst)}${w.afstand != null ? ` · ${w.afstand.toFixed(1)} m` : ''}`}</title>
              </g>
            )
          })}

        {lagen.vangsten &&
          worpen
            .filter((w) => (w.uitkomst === 'caught' || w.uitkomst === 'intercepted') && w.landingspunt)
            .map((w, i) => (
              <g key={`v${i}`} transform={`translate(${w.landingspunt!.x} ${w.landingspunt!.y})`}>
                <circle r={0.55} fill="none" stroke="#f59e0b" strokeWidth={0.14} />
                <circle r={0.18} fill="#f59e0b" />
                <title>{`Gevangen door ${naamVan(w.vangerIdentiteit)}`}</title>
              </g>
            ))}
        </g>
      </svg>
      <div className="v2d-knoppen">
        <button type="button" onClick={() => zoom(0.7)} aria-label="Inzoomen">＋</button>
        <button type="button" onClick={() => zoom(1 / 0.7)} aria-label="Uitzoomen">－</button>
        {ingezoomd && (
          <button type="button" onClick={() => setVb(basis)} aria-label="Hele veld">⤢</button>
        )}
      </div>
    </div>
  )
}

