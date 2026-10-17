// Hoe vlot loopt het virtuele stadion bij de bezoekers? Elke browser houdt onzichtbaar bij hoe snel
// de beelden komen, per plek (gang, plein, kelder…), en stuurt af en toe een samenvatting door
// (zie virtueel/[slug]/meter.ts). Eén record per bezoek, anoniem: geen naam, geen account, enkel het
// toestel (grafische kaart, browser, scherm) en de cijfers. Achteraf leest een beheerder het
// overzicht uit (GET /api/virtueel/meting) om gericht te optimaliseren.
//
// Hier: wat de server aanneemt (alles opgeschoond en begrensd: een client kan alles sturen) en hoe
// een stapel metingen samengevat wordt.

export type MetingPlek = {
  /** Seconden op deze plek. */
  s: number
  beelden: number
  /** Beelden die te laat kwamen (> 36 ms: een zichtbare schok). */
  schokken: number
  /** Beelden van meer dan 100 ms (een echte hapering). */
  haperingen: number
  /** Frametijd in ms: mediaan, 95e en 99e percentiel. */
  p50: number
  p95: number
  p99: number
  /** Gemiddeld per beeld: tekenopdrachten en driehoeken. */
  calls: number
  tris: number
  /**
   * Gemiddeld per beeld: hoelang de processor ermee bezig was (logica + tekenopdrachten doorgeven,
   * ms). Veel kleiner dan de frametijd: de grafische kaart is de rem. 0 bij oudere metingen.
   */
  cpu: number
}

export type Meting = {
  sessie: string
  toestel: {
    gpu: string
    browser: string
    os: string
    cores: number
    geheugen: number
    /** Breedte, hoogte (css-pixels) en schaalfactor van het venster. */
    scherm: [number, number, number]
    licht: boolean
    mobiel: boolean
  }
  /** Tijd tot het eerste beeld en tot de shaders klaarstonden (ms). */
  laden: { eersteBeeld: number; shaders: number }
  /** Totale gemeten tijd (s). */
  duur: number
  plekken: Record<string, MetingPlek>
  /** Hoe de automatische bijsturing ingreep. */
  bijsturing: { ratio: number; nabewerking: boolean; schaduw: number; stappen: { t: number; wat: string }[] }
  /** De ergste beelden van het bezoek. */
  ergste: { ms: number; plek: string; t: number }[]
  /** Welke versie van de site (commit) dit mat — gezet door de server, nooit door de browser. */
  versie?: string
  /** De dag van de meting (JJJJ-MM-DD) — gezet door de server bij het uitlezen. */
  dag?: string
}

const getal = (v: unknown, min: number, max: number, standaard = 0): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : standaard
  return Math.round(Math.max(min, Math.min(max, n)) * 100) / 100
}
const tekst = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '')
const object = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Een plek-naam: kort, enkel letters, cijfers, streepjes en een dubbelpunt (bv. "kelder:Zwembad"). */
const PLEK = /^[\p{L}\p{N} :&_-]{1,40}$/u
export const MAX_PLEKKEN = 40

/** Schoon een meting op zoals een browser ze stuurt; null als ze onbruikbaar is. */
export function leesMeting(ruw: unknown): Meting | null {
  const w = object(ruw)
  const sessie = tekst(w.sessie, 40)
  if (!/^[a-z0-9-]{8,40}$/i.test(sessie)) return null
  const t = object(w.toestel)
  const scherm = Array.isArray(t.scherm) ? t.scherm : []
  const plekken: Record<string, MetingPlek> = {}
  for (const [naam, waarde] of Object.entries(object(w.plekken)).slice(0, MAX_PLEKKEN)) {
    if (!PLEK.test(naam)) continue
    const p = object(waarde)
    plekken[naam] = {
      s: getal(p.s, 0, 86400),
      beelden: Math.round(getal(p.beelden, 0, 1e7)),
      schokken: Math.round(getal(p.schokken, 0, 1e7)),
      haperingen: Math.round(getal(p.haperingen, 0, 1e7)),
      p50: getal(p.p50, 0, 1000),
      p95: getal(p.p95, 0, 1000),
      p99: getal(p.p99, 0, 1000),
      calls: Math.round(getal(p.calls, 0, 1e5)),
      tris: Math.round(getal(p.tris, 0, 1e8)),
      cpu: getal(p.cpu, 0, 1000),
    }
  }
  const b = object(w.bijsturing)
  const l = object(w.laden)
  return {
    sessie,
    toestel: {
      gpu: tekst(t.gpu, 120) || 'onbekend',
      browser: tekst(t.browser, 40) || 'onbekend',
      os: tekst(t.os, 30) || 'onbekend',
      cores: Math.round(getal(t.cores, 0, 256)),
      geheugen: getal(t.geheugen, 0, 1024),
      scherm: [Math.round(getal(scherm[0], 0, 20000)), Math.round(getal(scherm[1], 0, 20000)), getal(scherm[2], 0, 10)],
      licht: t.licht === true,
      mobiel: t.mobiel === true,
    },
    laden: { eersteBeeld: Math.round(getal(l.eersteBeeld, 0, 600000)), shaders: Math.round(getal(l.shaders, 0, 600000)) },
    duur: getal(w.duur, 0, 86400),
    plekken,
    bijsturing: {
      ratio: getal(b.ratio, 0, 10),
      nabewerking: b.nabewerking === true,
      schaduw: Math.round(getal(b.schaduw, 0, 16384)),
      stappen: (Array.isArray(b.stappen) ? b.stappen : []).slice(0, 20).map((x) => ({ t: getal(object(x).t, 0, 86400), wat: tekst(object(x).wat, 40) })),
    },
    ergste: (Array.isArray(w.ergste) ? w.ergste : []).slice(0, 10).map((x) => {
      const e = object(x)
      const plek = tekst(e.plek, 40)
      return { ms: Math.round(getal(e.ms, 0, 60000)), plek: PLEK.test(plek) ? plek : '?', t: getal(e.t, 0, 86400) }
    }),
  }
}

/** Gemiddelde beelden per seconde over alle plekken (0 als er niets gemeten is). */
export function fpsVan(m: Pick<Meting, 'plekken'>): number {
  let beelden = 0
  let s = 0
  for (const p of Object.values(m.plekken)) {
    beelden += p.beelden
    s += p.s
  }
  return s > 0 ? Math.round((beelden / s) * 10) / 10 : 0
}

export type PlekSamenvatting = {
  plek: string
  minuten: number
  sessies: number
  fps: number
  /** Gewogen gemiddelde (naar tijd) van de 95e percentiel frametijd, in ms. */
  p95: number
  schokkenPerMinuut: number
  haperingenPerMinuut: number
  calls: number
  tris: number
  /** Gewogen gemiddelde processortijd per beeld (ms); 0 als geen enkele meting het had. */
  cpu: number
}

export type ToestelSamenvatting = { gpu: string; sessies: number; minuten: number; fps: number; schokkenPerMinuut: number; licht: number }

export type Samenvatting = {
  sessies: number
  minuten: number
  fps: number
  schokkenPerMinuut: number
  /** Per plek, de traagste eerst. */
  plekken: PlekSamenvatting[]
  /** Per grafische kaart, de traagste eerst. */
  toestellen: ToestelSamenvatting[]
  /** Hoe vaak de bijsturing ingreep, per soort stap. */
  bijsturing: Record<string, number>
  laden: { eersteBeeldMediaan: number; shadersMediaan: number }
  ergste: { ms: number; plek: string; gpu: string }[]
  /** Per versie van de site, de oudste eerst: zo zie je wat een optimalisatie opleverde. */
  versies: { versie: string; sessies: number; minuten: number; fps: number; schokkenPerMinuut: number; van: string; tot: string }[]
  /** Per dag, de oudste eerst. */
  dagen: { dag: string; sessies: number; minuten: number; fps: number; schokkenPerMinuut: number }[]
}

const mediaan = (l: number[]) => {
  if (!l.length) return 0
  const s = [...l].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const r1 = (n: number) => Math.round(n * 10) / 10

/** Vat een stapel metingen samen: waar en op welke toestellen het stadion het moeilijkst heeft. */
export function vatSamen(metingen: Meting[]): Samenvatting {
  const plekken = new Map<string, { s: number; beelden: number; schokken: number; haperingen: number; p95s: number; calls: number; tris: number; cpus: number; cpuS: number; sessies: number }>()
  type Reeks = { sessies: number; s: number; beelden: number; schokken: number; van: string; tot: string }
  const versies = new Map<string, Reeks>()
  const dagen = new Map<string, Reeks>()
  const telReeks = (lijst: Map<string, Reeks>, sleutel: string, m: Meting, ms: number, mb: number, msch: number) => {
    const r = lijst.get(sleutel) ?? { sessies: 0, s: 0, beelden: 0, schokken: 0, van: m.dag ?? '', tot: m.dag ?? '' }
    r.sessies++
    r.s += ms
    r.beelden += mb
    r.schokken += msch
    if (m.dag && (!r.van || m.dag < r.van)) r.van = m.dag
    if (m.dag && m.dag > r.tot) r.tot = m.dag
    lijst.set(sleutel, r)
  }
  const toestellen = new Map<string, { sessies: number; s: number; beelden: number; schokken: number; licht: number }>()
  const bijsturing: Record<string, number> = {}
  let s = 0
  let beelden = 0
  let schokken = 0
  const ergste: Samenvatting['ergste'] = []
  for (const m of metingen) {
    const gpu = m.toestel.gpu
    const t = toestellen.get(gpu) ?? { sessies: 0, s: 0, beelden: 0, schokken: 0, licht: 0 }
    t.sessies++
    if (m.toestel.licht) t.licht++
    let ms = 0
    let mb = 0
    let msch = 0
    for (const [naam, p] of Object.entries(m.plekken)) {
      const a = plekken.get(naam) ?? { s: 0, beelden: 0, schokken: 0, haperingen: 0, p95s: 0, calls: 0, tris: 0, cpus: 0, cpuS: 0, sessies: 0 }
      a.s += p.s
      a.beelden += p.beelden
      a.schokken += p.schokken
      a.haperingen += p.haperingen
      a.p95s += p.p95 * p.s
      a.calls += p.calls * p.s
      a.tris += p.tris * p.s
      if (p.cpu > 0) {
        a.cpus += p.cpu * p.s
        a.cpuS += p.s
      }
      a.sessies++
      plekken.set(naam, a)
      t.s += p.s
      t.beelden += p.beelden
      t.schokken += p.schokken
      s += p.s
      beelden += p.beelden
      schokken += p.schokken
      ms += p.s
      mb += p.beelden
      msch += p.schokken
    }
    toestellen.set(gpu, t)
    telReeks(versies, m.versie || 'onbekend', m, ms, mb, msch)
    if (m.dag) telReeks(dagen, m.dag, m, ms, mb, msch)
    for (const stap of m.bijsturing.stappen) bijsturing[stap.wat] = (bijsturing[stap.wat] ?? 0) + 1
    for (const e of m.ergste) ergste.push({ ...e, gpu })
  }
  const perMin = (n: number, sec: number) => (sec > 0 ? r1((n / sec) * 60) : 0)
  return {
    sessies: metingen.length,
    minuten: r1(s / 60),
    fps: s > 0 ? r1(beelden / s) : 0,
    schokkenPerMinuut: perMin(schokken, s),
    plekken: [...plekken.entries()]
      .map(([plek, a]) => ({
        plek,
        minuten: r1(a.s / 60),
        sessies: a.sessies,
        fps: a.s > 0 ? r1(a.beelden / a.s) : 0,
        p95: a.s > 0 ? r1(a.p95s / a.s) : 0,
        schokkenPerMinuut: perMin(a.schokken, a.s),
        haperingenPerMinuut: perMin(a.haperingen, a.s),
        calls: a.s > 0 ? Math.round(a.calls / a.s) : 0,
        tris: a.s > 0 ? Math.round(a.tris / a.s) : 0,
        cpu: a.cpuS > 0 ? r1(a.cpus / a.cpuS) : 0,
      }))
      .sort((a, b) => a.fps - b.fps),
    toestellen: [...toestellen.entries()]
      .map(([gpu, t]) => ({ gpu, sessies: t.sessies, minuten: r1(t.s / 60), fps: t.s > 0 ? r1(t.beelden / t.s) : 0, schokkenPerMinuut: perMin(t.schokken, t.s), licht: t.licht }))
      .sort((a, b) => a.fps - b.fps),
    bijsturing,
    laden: { eersteBeeldMediaan: mediaan(metingen.map((m) => m.laden.eersteBeeld).filter((x) => x > 0)), shadersMediaan: mediaan(metingen.map((m) => m.laden.shaders).filter((x) => x > 0)) },
    ergste: ergste.sort((a, b) => b.ms - a.ms).slice(0, 25),
    versies: [...versies.entries()]
      .map(([versie, r]) => ({ versie, sessies: r.sessies, minuten: r1(r.s / 60), fps: r.s > 0 ? r1(r.beelden / r.s) : 0, schokkenPerMinuut: perMin(r.schokken, r.s), van: r.van, tot: r.tot }))
      .sort((a, b) => a.van.localeCompare(b.van) || a.tot.localeCompare(b.tot)),
    dagen: [...dagen.entries()]
      .map(([dag, r]) => ({ dag, sessies: r.sessies, minuten: r1(r.s / 60), fps: r.s > 0 ? r1(r.beelden / r.s) : 0, schokkenPerMinuut: perMin(r.schokken, r.s) }))
      .sort((a, b) => a.dag.localeCompare(b.dag)),
  }
}
