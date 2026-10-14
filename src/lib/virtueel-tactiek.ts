// Het tactiekbord in de kleedkamer van het virtuele stadion: een whiteboard met een krachtbalveld,
// magneetjes voor de spelers (4 veldspelers per ploeg + de bal) en stiftlijnen voor de looplijnen.
// Puur (enkel een canvas-context om op te tekenen): gedeeld door het 3D-bord en het bord op je gsm.

export type Magneet = { id: string; ploeg: 'wij' | 'zij' | 'bal'; nr: number; x: number; y: number }
export type Stiftlijn = { kleur: 'blauw' | 'rood' | 'zwart'; p: number[] }
export type Tactiek = { magneten: Magneet[]; lijnen: Stiftlijn[] }

/** Verhoudingen van het veld (zoals het echte veld: 49,8 × 14 m, doelgebieden tot 11,9 m). */
export const VELD = { L: 49.8, W: 14, doelA: 11.9, doelB: 37.9 }

export const STIFT: Record<Stiftlijn['kleur'], string> = { blauw: '#1d4ed8', rood: '#dc2626', zwart: '#111827' }

/** De beginopstelling: wij links, zij rechts, de bal in het midden. Coördinaten 0–1 op het veld. */
export function beginOpstelling(): Tactiek {
  const wij: [number, number][] = [
    [0.3, 0.25],
    [0.3, 0.75],
    [0.42, 0.4],
    [0.42, 0.6],
  ]
  return {
    magneten: [
      ...wij.map(([x, y], i) => ({ id: `w${i + 1}`, ploeg: 'wij' as const, nr: i + 1, x, y })),
      ...wij.map(([x, y], i) => ({ id: `z${i + 1}`, ploeg: 'zij' as const, nr: i + 1, x: 1 - x, y })),
      { id: 'bal', ploeg: 'bal', nr: 0, x: 0.5, y: 0.5 },
    ],
    lijnen: [],
  }
}

const tussen = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/** Een opgeslagen bord (uit localStorage) veilig inlezen; bij twijfel de beginopstelling. */
export function leesTactiek(ruw: unknown): Tactiek {
  const basis = beginOpstelling()
  if (!ruw || typeof ruw !== 'object') return basis
  const r = ruw as { magneten?: unknown; lijnen?: unknown }
  const opgeslagen = new Map(
    (Array.isArray(r.magneten) ? r.magneten : [])
      .filter((m): m is Magneet => !!m && typeof m === 'object' && typeof (m as Magneet).id === 'string' && tussen((m as Magneet).x) && tussen((m as Magneet).y))
      .map((m) => [m.id, m]),
  )
  const magneten = basis.magneten.map((m) => {
    const o = opgeslagen.get(m.id)
    return o ? { ...m, x: o.x, y: o.y } : m
  })
  const lijnen = (Array.isArray(r.lijnen) ? r.lijnen : [])
    .filter((l): l is Stiftlijn => !!l && typeof l === 'object' && (l as Stiftlijn).kleur in STIFT && Array.isArray((l as Stiftlijn).p) && (l as Stiftlijn).p.every(tussen) && (l as Stiftlijn).p.length % 2 === 0)
    .slice(-40)
    .map((l) => ({ kleur: l.kleur, p: l.p.slice(0, 600) }))
  return { magneten, lijnen }
}

/**
 * Teken het hele bord: aluminium kader, wit bord, het veld in blauwe stift, de stiftlijnen en de
 * magneetjes (wij in de clubkleur, zij in grijs, de bal geel).
 */
export function tekenTactiekbord(g: CanvasRenderingContext2D, w: number, h: number, t: Tactiek, kleur: { wij: string; tekstWij: string }): void {
  const rand = Math.round(Math.min(w, h) * 0.035)
  g.fillStyle = '#b8bec6'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#d7dbe0'
  g.fillRect(rand * 0.35, rand * 0.35, w - rand * 0.7, h - rand * 0.7)
  g.fillStyle = '#fbfbf8'
  g.fillRect(rand, rand, w - 2 * rand, h - 2 * rand)
  // Wat vegen van eerder uitgewist werk.
  g.fillStyle = 'rgba(29,78,216,.04)'
  g.fillRect(w * 0.12, h * 0.2, w * 0.3, h * 0.1)
  // Het veld, met een marge rondom.
  const vx = rand + w * 0.05
  const vy = rand + h * 0.12
  const vw = w - 2 * rand - w * 0.1
  const vh = h - 2 * rand - h * 0.2
  const X = (f: number) => vx + f * vw
  const Yp = (f: number) => vy + f * vh
  g.strokeStyle = '#1d4ed8'
  g.lineWidth = Math.max(2, w * 0.004)
  g.lineCap = 'round'
  g.strokeRect(vx, vy, vw, vh)
  g.fillStyle = 'rgba(29,78,216,.07)'
  g.fillRect(vx, vy, (VELD.doelA / VELD.L) * vw, vh)
  g.fillRect(X(VELD.doelB / VELD.L), vy, ((VELD.L - VELD.doelB) / VELD.L) * vw, vh)
  for (const f of [VELD.doelA, VELD.doelB, VELD.doelA + 4, VELD.doelB - 4, VELD.L / 2]) {
    g.beginPath()
    g.moveTo(X(f / VELD.L), vy)
    g.lineTo(X(f / VELD.L), vy + vh)
    g.stroke()
  }
  g.fillStyle = '#1d4ed8'
  g.font = `700 ${Math.round(h * 0.055)}px "Comic Sans MS", "Segoe Print", cursive`
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText('TACTIEK', rand + w * 0.02, rand + h * 0.06)
  g.textAlign = 'right'
  g.fillStyle = '#dc2626'
  g.fillText('WIJ ←  → ZIJ', w - rand - w * 0.02, rand + h * 0.06)
  // Stiftlijnen.
  for (const l of t.lijnen) {
    if (l.p.length < 4) continue
    g.strokeStyle = STIFT[l.kleur]
    g.lineWidth = Math.max(2, w * 0.005)
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(X(l.p[0]), Yp(l.p[1]))
    for (let i = 2; i < l.p.length; i += 2) g.lineTo(X(l.p[i]), Yp(l.p[i + 1]))
    g.stroke()
    // Een pijlpunt op het einde.
    const n = l.p.length
    const ax = X(l.p[n - 2])
    const ay = Yp(l.p[n - 1])
    const hoek = Math.atan2(ay - Yp(l.p[n - 3]), ax - X(l.p[n - 4]))
    const k = w * 0.018
    g.beginPath()
    g.moveTo(ax, ay)
    g.lineTo(ax - Math.cos(hoek - 0.45) * k, ay - Math.sin(hoek - 0.45) * k)
    g.moveTo(ax, ay)
    g.lineTo(ax - Math.cos(hoek + 0.45) * k, ay - Math.sin(hoek + 0.45) * k)
    g.stroke()
  }
  // Magneetjes, met een schaduwtje.
  const r = Math.min(w, h) * 0.045
  for (const m of t.magneten) {
    const x = X(m.x)
    const y = Yp(m.y)
    const rr = m.ploeg === 'bal' ? r * 0.7 : r
    g.fillStyle = 'rgba(0,0,0,.25)'
    g.beginPath()
    g.arc(x + rr * 0.15, y + rr * 0.2, rr, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = m.ploeg === 'wij' ? kleur.wij : m.ploeg === 'zij' ? '#6b7280' : '#facc15'
    g.beginPath()
    g.arc(x, y, rr, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,.35)'
    g.beginPath()
    g.arc(x - rr * 0.3, y - rr * 0.35, rr * 0.35, 0, Math.PI * 2)
    g.fill()
    if (m.ploeg !== 'bal') {
      g.fillStyle = m.ploeg === 'wij' ? kleur.tekstWij : '#ffffff'
      g.font = `900 ${Math.round(rr * 1.1)}px Inter, system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(m.nr), x, y + rr * 0.05)
    }
  }
}

/** Waar het veld op het bord ligt (zelfde marges als tekenTactiekbord), voor het slepen. */
export function veldOpBord(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const rand = Math.round(Math.min(w, h) * 0.035)
  return { x: rand + w * 0.05, y: rand + h * 0.12, w: w - 2 * rand - w * 0.1, h: h - 2 * rand - h * 0.2 }
}
