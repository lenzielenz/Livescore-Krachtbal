// Rekenwerk voor de interactieve analyse uit de krachtbal-analyse-app (2D-veld, 3D-arena, spelers).
// Puur en zonder DOM, zodat het los te testen is.
//
// Assenstelsel van de app: x over de LENGTE (0 = achterlijn A), y over de BREEDTE, in meter. De
// heatmap is een raster van `raster` m: heat[rij = y / raster][kolom = x / raster].

export type XY = { x: number; y: number }

export interface AppVeld {
  lengte: number
  breedte: number
  doellijn_a: number
  doellijn_b: number
  vwl_a?: number
  vwl_b?: number
  middenlijn?: number
  raster?: number
}

export interface AppWorp {
  possessionId?: string
  worpnummer?: number
  team?: number
  type?: string | null
  uitkomst?: string | null
  punten?: number | null
  afstand?: number | null
  worpSnelheid?: number | null
  vluchttijd?: number | null
  tophoogte?: number | null
  richting?: string | null
  hoek_graden?: number | null
  zekerheid?: number | null
  tijd_s?: number | null
  identiteit?: string | null
  vangerIdentiteit?: string | null
  rugnummer?: number | null
  opzetplaats?: XY | null
  landingspunt?: XY | null
}

export interface AppSpeler {
  id: string
  naam: string
  rugnummer?: number | null
  team: number
  rol?: string | null
  rolnaam?: string | null
  heat?: number[][]
  pad?: [number, number, number][]
  afstand_per_minuut?: number[]
  snelheid_per_minuut?: number[]
  passen_naar?: Record<string, number>
  passen_van?: Record<string, number>
  stats?: Record<string, unknown> & {
    worpen?: number
    punten?: number
    goals?: number
    vangsten?: number
    nek?: number
    rug?: number
    onderschept?: number
    buiten?: number
    passen_gegeven?: number
    passen_ontvangen?: number
    gem_worpafstand?: number | null
    max_worpafstand?: number | null
    max_worpsnelheid?: number | null
    werprichtingen?: Record<string, number>
  }
  fysiek?: {
    afstand_m?: number | null
    max_snelheid_ms?: number | null
    n_sprints?: number | null
    sprint_afstand_m?: number | null
    zichtbaar_s?: number | null
    afstand_per_min?: number | null
    gem_snelheid_kmu?: number | null
    n_versnellingen?: number | null
    pct_vooruit?: number | null
    pct_achteruit?: number | null
    pct_zijwaarts?: number | null
    pct_stilstand?: number | null
  } | null
}

export interface AppPas {
  van?: string
  naar?: string
  team?: number
  tijd_s?: number | null
  tijd_eind_s?: number | null
  van_xy?: [number, number] | null
  naar_xy?: [number, number] | null
  afstand?: number | null
  betrouwbaar?: boolean
  soort?: string | null
}

type Verdeling = Record<string, { n: number; pct: number }>

export interface AppTactiek {
  naam?: string
  werpen?: {
    n?: number
    type?: Verdeling
    afstand_gem?: number | null
    afstand_klassen?: Verdeling
    boog?: Verdeling
    richting?: Verdeling
    uitkomst?: Verdeling
    zones?: Verdeling
  }
  [k: string]: unknown
}

export interface AppData {
  wedstrijd?: string
  duur_s?: number
  kalibratie_rms?: number | null
  veld: AppVeld
  ploegen?: { id: number; naam: string; thuis?: boolean }[]
  spelers?: Record<string, AppSpeler>
  worpen?: AppWorp[]
  passen?: AppPas[]
  balpad?: [number, number | null, number | null, string?][]
  tactiek?: Record<string, AppTactiek>
  verwachte_goals?: { per_team?: Record<string, { n?: number; verwacht?: number; goals?: number }> }
  dekking_samenvatting?: Record<string, { n?: number; open?: number; gedekt?: number; onzeker?: number; goals_toegestaan?: number }>
  meetdefinities?: Record<string, string>
}

export const UITKOMST: Record<string, string> = {
  goal: 'Doelpunt',
  own_goal: 'Eigen doelpunt',
  eigen_doelpunt: 'Eigen doelpunt',
  caught: 'Gevangen',
  intercepted: 'Onderschept',
  out_side: 'Buiten (zijlijn)',
  out_back: 'Buiten (achterlijn)',
  out: 'Buiten',
  grond: 'Op de grond',
  buiten: 'Buiten',
}

/** Kleur per afloop: doelpunt groen, gevangen amber, grond grijs, buiten rood. */
export function uitkomstKleur(u?: string | null): string {
  if (u === 'goal') return '#22c55e'
  if (u === 'own_goal' || u === 'eigen_doelpunt') return '#a855f7'
  if (u === 'caught' || u === 'intercepted') return '#f59e0b'
  if (u && (u.startsWith('out') || u === 'buiten')) return '#ef4444'
  return '#d4d4d8'
}

export function uitkomstLabel(u?: string | null): string {
  return UITKOMST[u ?? ''] ?? (u ? u : 'Worp')
}

/** Is dit een gelukte worp voor de werper (doelpunt)? */
export const isDoelpunt = (w: AppWorp) => Number(w.punten ?? 0) > 0

/** Thuisploeg-id volgens de app. */
export function thuisId(data: AppData): number {
  return data.ploegen?.find((p) => p.thuis)?.id ?? 0
}

/** Score per kant volgens de app: de punten van haar worpen. */
export function score(data: AppData): { thuis: number; uit: number } {
  const th = thuisId(data)
  let thuis = 0
  let uit = 0
  for (const w of data.worpen ?? []) {
    const p = Number(w.punten ?? 0)
    if (!p) continue
    if (w.team === th) thuis += p
    else uit += p
  }
  return { thuis, uit }
}

/** Lijnen van het veld (in app-meters), voor 2D en 3D. Dwarslijnen staan op een x-positie. */
export function veldLijnen(v: AppVeld): { x: number; soort: 'achter' | 'doel' | 'vwl' | 'midden' }[] {
  const uit: { x: number; soort: 'achter' | 'doel' | 'vwl' | 'midden' }[] = [
    { x: 0, soort: 'achter' },
    { x: v.lengte, soort: 'achter' },
    { x: v.doellijn_a, soort: 'doel' },
    { x: v.doellijn_b, soort: 'doel' },
  ]
  if (v.vwl_a != null) uit.push({ x: v.vwl_a, soort: 'vwl' })
  if (v.vwl_b != null) uit.push({ x: v.vwl_b, soort: 'vwl' })
  uit.push({ x: v.middenlijn ?? v.lengte / 2, soort: 'midden' })
  return uit
}

/**
 * Hoogte van de bal langs een worp: s = 0 bij het loslaten, s = 1 bij de landing. Een parabool door
 * de werphoogte en de landingshoogte, met de top (zoals de app hem mat) in het midden.
 */
export function boogHoogte(s: number, top: number, start = 2.0, einde = 0): number {
  const basis = start + (einde - start) * s
  const extra = Math.max(0, top - (start + einde) / 2)
  return basis + 4 * extra * s * (1 - s)
}

/** Punten langs de boog van een worp, in app-meters: [x, y, hoogte]. */
export function worpBoog(w: AppWorp, n = 32): [number, number, number][] {
  const a = w.opzetplaats
  const b = w.landingspunt
  if (!a || !b) return []
  const top = Number.isFinite(w.tophoogte as number) ? (w.tophoogte as number) : 3
  const einde = w.uitkomst === 'caught' || w.uitkomst === 'intercepted' ? 1.4 : 0
  const pts: [number, number, number][] = []
  for (let i = 0; i <= n; i++) {
    const s = i / n
    pts.push([a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, boogHoogte(s, top, 2.0, einde)])
  }
  return pts
}

/** Positie op tijdstip t uit een pad [[t, x, y], …] (lineair, null buiten het pad of over een gat > 2 s). */
export function positieOp(pad: [number, number, number][] | undefined, t: number): XY | null {
  if (!pad || pad.length === 0) return null
  if (t < pad[0][0] || t > pad[pad.length - 1][0]) return null
  let lo = 0
  let hi = pad.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pad[mid][0] <= t) lo = mid
    else hi = mid
  }
  const [t0, x0, y0] = pad[lo]
  const [t1, x1, y1] = pad[hi]
  if (t1 - t0 > 2) return t - t0 < t1 - t ? { x: x0, y: y0 } : { x: x1, y: y1 }
  const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f }
}

/** Waar is de bal op tijdstip t? In de lucht volgens de boog van de worp, anders uit het balpad. */
export function balOp(data: AppData, t: number): { x: number; y: number; h: number } | null {
  for (const w of data.worpen ?? []) {
    const start = w.tijd_s
    const duur = w.vluchttijd
    if (start == null || duur == null || duur <= 0) continue
    if (t >= start && t <= start + duur && w.opzetplaats && w.landingspunt) {
      const s = (t - start) / duur
      const top = Number.isFinite(w.tophoogte as number) ? (w.tophoogte as number) : 3
      const einde = w.uitkomst === 'caught' || w.uitkomst === 'intercepted' ? 1.4 : 0
      return {
        x: w.opzetplaats.x + (w.landingspunt.x - w.opzetplaats.x) * s,
        y: w.opzetplaats.y + (w.landingspunt.y - w.opzetplaats.y) * s,
        h: boogHoogte(s, top, 2.0, einde),
      }
    }
  }
  const pad = data.balpad ?? []
  if (pad.length === 0) return null
  let lo = 0
  let hi = pad.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pad[mid][0] <= t) lo = mid
    else hi = mid
  }
  const kandidaten = [pad[lo], pad[hi]]
    .filter((p) => p && p[1] != null && p[2] != null && Math.abs(p[0] - t) < 0.5)
    .sort((a, b) => Math.abs(a[0] - t) - Math.abs(b[0] - t))
  const p = kandidaten[0]
  return p ? { x: p[1] as number, y: p[2] as number, h: 1.1 } : null
}

/** Heatmaps optellen (bv. een hele ploeg) en normaliseren naar 0..1. */
export function somHeat(lagen: (number[][] | undefined)[]): { raster: number[][]; max: number } {
  const geldig = lagen.filter((l): l is number[][] => Array.isArray(l) && l.length > 0)
  if (geldig.length === 0) return { raster: [], max: 0 }
  const rijen = Math.max(...geldig.map((l) => l.length))
  const kolommen = Math.max(...geldig.map((l) => Math.max(...l.map((r) => r.length))))
  const raster = Array.from({ length: rijen }, () => new Array<number>(kolommen).fill(0))
  let max = 0
  for (const l of geldig) {
    for (let r = 0; r < l.length; r++) {
      for (let k = 0; k < l[r].length; k++) {
        raster[r][k] += l[r][k] || 0
        if (raster[r][k] > max) max = raster[r][k]
      }
    }
  }
  return { raster, max }
}

/** Kleur van een heatmapcel (0..1): transparant blauw → groen → geel → rood, zoals sportanalyse doet. */
export function heatKleur(f: number): [number, number, number, number] {
  // Wortel: de drukke plekken blijven rood, maar ook waar een speler maar even stond, wordt zichtbaar.
  const ruw = Math.max(0, Math.min(1, f))
  if (ruw <= 0) return [0, 0, 0, 0]
  const v = Math.sqrt(ruw)
  const stops: [number, [number, number, number]][] = [
    [0, [37, 99, 235]],
    [0.35, [34, 197, 94]],
    [0.65, [250, 204, 21]],
    [1, [239, 68, 68]],
  ]
  let i = 0
  while (i < stops.length - 2 && v > stops[i + 1][0]) i++
  const [f0, c0] = stops[i]
  const [f1, c1] = stops[i + 1]
  const g = (v - f0) / (f1 - f0 || 1)
  const kleur = c0.map((c, j) => Math.round(c + (c1[j] - c) * g)) as [number, number, number]
  return [kleur[0], kleur[1], kleur[2], Math.round(90 + 150 * v)]
}

/** Gemiddelde plaats van een speler (voor het passennetwerk), uit zijn pad. */
export function gemiddeldePlaats(sp: AppSpeler): XY | null {
  const pad = sp.pad ?? []
  if (pad.length === 0) return null
  let sx = 0
  let sy = 0
  for (const [, x, y] of pad) {
    sx += x
    sy += y
  }
  return { x: sx / pad.length, y: sy / pad.length }
}

/** Passennetwerk van één ploeg: knopen op de gemiddelde plaats, lijnen met het aantal passen. */
export function passenNetwerk(data: AppData, team: number) {
  const spelers = Object.values(data.spelers ?? {}).filter((s) => s.team === team)
  const knopen = spelers
    .map((s) => ({ id: s.id, plek: gemiddeldePlaats(s), speler: s }))
    .filter((k): k is { id: string; plek: XY; speler: AppSpeler } => k.plek != null)
  const tel = new Map<string, number>()
  for (const p of data.passen ?? []) {
    if (p.team !== team || !p.van || !p.naar) continue
    const sleutel = [p.van, p.naar].sort().join('|')
    tel.set(sleutel, (tel.get(sleutel) ?? 0) + 1)
  }
  const lijnen = [...tel.entries()].map(([k, n]) => {
    const [a, b] = k.split('|')
    return { van: a, naar: b, n }
  })
  return { knopen, lijnen }
}

/** Naam zoals overal getoond: "#7 Jan". */
export function spelerLabel(sp?: AppSpeler | null, terug = '–'): string {
  if (!sp) return terug
  return `${sp.rugnummer != null ? `#${sp.rugnummer} ` : ''}${sp.naam}`
}

export function tijdLabel(s?: number | null, decimaal = false): string {
  if (s == null || !Number.isFinite(s)) return '–'
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return decimaal ? `${m}:${rest.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(rest)).padStart(2, '0')}`
}

export function getal(v?: number | null, d = 1, eenheid = ''): string {
  return v == null || !Number.isFinite(v) ? '–' : `${v.toFixed(d).replace('.', ',')}${eenheid}`
}

export type CameraStandpunt = 'overzicht' | 'zijkant' | 'boven' | 'achterA' | 'achterB'

/**
 * Waar de 3D-camera staat voor een standpunt, passend op het scherm (beeldverhouding `aspect`,
 * verticale kijkhoek `vfov` in graden). Het middelpunt van het veld ligt op de oorsprong; X = lengte,
 * Z = breedte, Y = hoogte. Op een staande gsm kijkt "overzicht" verhoogd van achter doel A, zodat de
 * lengte van het veld in de diepte ligt in plaats van ver buiten beeld.
 */
export function cameraStandpunt(s: CameraStandpunt, aspect: number, lengte: number, breedte: number, vfov = 42): [number, number, number] {
  const halfV = (vfov * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * Math.max(aspect, 0.2))
  const L = lengte / 2
  const passend = (breed: number) => breed / 2 / Math.tan(halfH) // afstand waarop `breed` meter de breedte vult
  const staand = aspect < 1
  switch (s) {
    case 'overzicht': {
      if (staand) {
        const d = Math.max(passend(breedte + 8) * 0.95, 24)
        return [-L - d * 0.55, d * 0.75, 0]
      }
      const d = passend(lengte + 6)
      return [0, d * 0.55, d * 0.84]
    }
    case 'zijkant': {
      const d = passend(lengte + 4) * (staand ? 0.6 : 1)
      return [0, Math.max(6, d * 0.22), d]
    }
    case 'boven': {
      const nodig = staand ? Math.max(passend(breedte + 4), (lengte + 6) / 2 / Math.tan(halfV)) : Math.max(passend(lengte + 6), (breedte + 6) / 2 / Math.tan(halfV))
      return staand ? [-0.01, nodig, 0] : [0, nodig, 0.01]
    }
    case 'achterA':
      return [-L - (staand ? 18 : 14), staand ? 12 : 8, 0]
    case 'achterB':
      return [L + (staand ? 18 : 14), staand ? 12 : 8, 0]
  }
}

// ── Acties en fases (stap voor stap door de wedstrijd) ──

export interface Fase {
  naam: string
  t: number
}

export interface Actie {
  id: string
  soort: 'worp' | 'pas'
  t: number
  team?: number
  wie?: string | null
  naar?: string | null
  uitkomst?: string | null
  worp?: AppWorp
  pas?: AppPas
  fasen: Fase[]
}

const AANLOOP_S = 1.5

/**
 * Elke worp en pas als actie, chronologisch, met haar fases: een worp heeft aanloop, loslaten,
 * hoogste punt en landing (of vangst); een pas heeft de pas en de ontvangst. De tijden blijven
 * binnen de wedstrijd (0..duur).
 */
export function acties(data: AppData, worpen: AppWorp[] = data.worpen ?? [], passen: AppPas[] = data.passen ?? []): Actie[] {
  const duur = data.duur_s ?? Infinity
  const binnen = (t: number) => Math.max(0, Math.min(duur, t))
  const uit: Actie[] = []
  worpen.forEach((w, i) => {
    if (w.tijd_s == null || !Number.isFinite(w.tijd_s)) return
    const t = w.tijd_s
    const fasen: Fase[] = [
      { naam: 'Aanloop', t: binnen(t - AANLOOP_S) },
      { naam: 'Loslaten', t: binnen(t) },
    ]
    if (w.vluchttijd != null && w.vluchttijd > 0) {
      fasen.push({ naam: 'Hoogste punt', t: binnen(t + w.vluchttijd / 2) })
      const eind = w.uitkomst === 'caught' || w.uitkomst === 'intercepted' ? 'Vangst' : isDoelpunt(w) ? 'Doelpunt' : 'Landing'
      fasen.push({ naam: eind, t: binnen(t + w.vluchttijd) })
    }
    uit.push({ id: `w${i}`, soort: 'worp', t, team: w.team, wie: w.identiteit, naar: w.vangerIdentiteit, uitkomst: w.uitkomst, worp: w, fasen })
  })
  passen.forEach((p, i) => {
    if (p.tijd_s == null || !Number.isFinite(p.tijd_s)) return
    const fasen: Fase[] = [{ naam: 'Pas', t: binnen(p.tijd_s) }]
    if (p.tijd_eind_s != null && p.tijd_eind_s > p.tijd_s) fasen.push({ naam: 'Ontvangst', t: binnen(p.tijd_eind_s) })
    uit.push({ id: `p${i}`, soort: 'pas', t: p.tijd_s, team: p.team, wie: p.van, naar: p.naar, pas: p, fasen })
  })
  return uit.sort((a, b) => a.t - b.t || (a.soort === 'worp' ? -1 : 1))
}

/** Index van de actie die het dichtst bij (en liefst vóór) tijdstip t ligt. */
export function actieRond(lijst: Actie[], t: number): number {
  if (lijst.length === 0) return -1
  let beste = 0
  for (let i = 0; i < lijst.length; i++) {
    if (lijst[i].fasen[0].t <= t + 1e-6) beste = i
    else break
  }
  return beste
}

/** Het stuk pad van een speler tussen t0 en t1 (voor een spoor achter de speler). */
export function spoor(pad: [number, number, number][] | undefined, t0: number, t1: number): XY[] {
  if (!pad || pad.length === 0 || t1 <= t0) return []
  const uit: XY[] = []
  const begin = positieOp(pad, t0)
  if (begin) uit.push(begin)
  for (const [t, x, y] of pad) if (t > t0 && t < t1) uit.push({ x, y })
  const eind = positieOp(pad, t1)
  if (eind) uit.push(eind)
  return uit
}

// ── Pijlen op het veld (tekeningen bij een notitie) ──

export interface Pijl {
  van: XY
  naar: XY
  kleur: string
}

export const PIJL_KLEUREN = ['#facc15', '#ef4444', '#ffffff', '#38bdf8', '#22c55e'] as const
