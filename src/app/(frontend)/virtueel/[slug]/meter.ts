import type * as THREE from 'three'

import type { Meting, MetingPlek } from '@/lib/virtueel-meting'

// De onzichtbare meter: hoe vlot loopt het stadion bij deze bezoeker? Per plek (gang, plein,
// kelder…) houden we bij hoeveel beelden er kwamen, hoe vaak een beeld te laat kwam (een schok) en
// hoeveel er per beeld getekend werd. Niets op het scherm; elke minuut en bij het sluiten van de
// pagina gaat een samenvatting naar /api/virtueel/meting (zie lib/virtueel-meting.ts), anoniem.
// Achteraf leest de federatie het overzicht uit, om gericht te optimaliseren.

/** Frametijden tot zoveel ms houden we per milliseconde bij (voor de percentielen). */
const BAKJES = 250
const STUUR_ELKE_MS = 60_000
const ADRES = '/api/virtueel/meting'

type Plek = { s: number; beelden: number; schokken: number; haperingen: number; bakjes: Uint32Array; calls: number; tris: number; tellingen: number; werk: number }

export type Meter = {
  /**
   * Na elk getekend beeld: de echte tijd sinds het vorige (ms), waar je bent, en hoelang de
   * processor met dit beeld bezig was (logica + tekenopdrachten doorgeven, ms). Is dat laatste
   * veel kleiner dan de frametijd, dan wacht de browser op de grafische kaart.
   */
  beeld: (ms: number, plek: string, werk: number) => void
  /** De automatische bijsturing greep in (bv. "pixels 1", "nabewerking uit"). */
  stap: (wat: string) => void
  zet: (o: { ratio?: number; nabewerking?: boolean; schaduw?: number; eersteBeeld?: number; shaders?: number }) => void
  dispose: () => void
}

function browserVan(ua: string): { browser: string; os: string } {
  const v = (re: RegExp) => ua.match(re)?.[1]
  const browser = v(/Edg\/(\d+)/)
    ? `Edge ${v(/Edg\/(\d+)/)}`
    : v(/OPR\/(\d+)/)
      ? `Opera ${v(/OPR\/(\d+)/)}`
      : v(/Firefox\/(\d+)/)
        ? `Firefox ${v(/Firefox\/(\d+)/)}`
        : v(/Chrome\/(\d+)/)
          ? `Chrome ${v(/Chrome\/(\d+)/)}`
          : v(/Version\/(\d+)[\d.]* .*Safari/)
            ? `Safari ${v(/Version\/(\d+)/)}`
            : 'Andere'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Ander'
  return { browser, os }
}

function gpuVan(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const naam = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return String(naam ?? 'onbekend').slice(0, 120)
  } catch {
    return 'onbekend'
  }
}

export function bouwMeter(renderer: THREE.WebGLRenderer, opt: { licht: boolean }): Meter {
  const sessie = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const { browser, os } = browserVan(navigator.userAgent)
  const toestel: Meting['toestel'] = {
    gpu: gpuVan(renderer),
    browser,
    os,
    cores: navigator.hardwareConcurrency ?? 0,
    geheugen: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
    scherm: [window.innerWidth, window.innerHeight, Math.round(window.devicePixelRatio * 100) / 100],
    licht: opt.licht,
    mobiel: window.matchMedia('(pointer: coarse)').matches,
  }
  const plekken = new Map<string, Plek>()
  const ergste: Meting['ergste'] = []
  const bijsturing: Meting['bijsturing'] = { ratio: renderer.getPixelRatio(), nabewerking: !opt.licht, schaduw: 0, stappen: [] }
  const laden = { eersteBeeld: 0, shaders: 0 }
  const start = performance.now()
  let duur = 0
  let teller = 0
  let gestuurd = 0

  const samenvatting = (): Meting => {
    const lijst: Record<string, MetingPlek> = {}
    for (const [naam, p] of plekken) {
      const pct = (f: number) => {
        const doel = p.beelden * f
        let som = 0
        for (let i = 0; i < BAKJES; i++) {
          som += p.bakjes[i]
          if (som >= doel) return i + 0.5
        }
        return BAKJES
      }
      lijst[naam] = {
        s: Math.round(p.s * 10) / 10,
        beelden: p.beelden,
        schokken: p.schokken,
        haperingen: p.haperingen,
        p50: pct(0.5),
        p95: pct(0.95),
        p99: pct(0.99),
        calls: p.tellingen ? Math.round(p.calls / p.tellingen) : 0,
        tris: p.tellingen ? Math.round(p.tris / p.tellingen) : 0,
        cpu: p.beelden ? Math.round((p.werk / p.beelden) * 100) / 100 : 0,
      }
    }
    return { sessie, toestel, laden, duur: Math.round(duur), plekken: lijst, bijsturing, ergste }
  }

  const stuur = (bijSluiten: boolean) => {
    // Enkel als er sinds de vorige keer iets bijkwam, en pas na wat echte speeltijd.
    if (duur < 15 || duur - gestuurd < 5) return
    gestuurd = duur
    const tekst = JSON.stringify(samenvatting())
    try {
      if (bijSluiten && navigator.sendBeacon) navigator.sendBeacon(ADRES, new Blob([tekst], { type: 'application/json' }))
      else void fetch(ADRES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: tekst, keepalive: true }).catch(() => {})
    } catch {
      // Een meting die niet aankomt, is geen ramp.
    }
  }
  const klok = setInterval(() => stuur(false), STUUR_ELKE_MS)
  const weg = () => stuur(true)
  const verborgen = () => {
    if (document.visibilityState === 'hidden') stuur(true)
  }
  window.addEventListener('pagehide', weg)
  document.addEventListener('visibilitychange', verborgen)

  return {
    beeld(ms, naam, werk) {
      // Een tabblad op de achtergrond (of een pauze) is geen trage frame.
      if (!(ms > 0) || ms > 1000 || document.visibilityState === 'hidden') return
      let p = plekken.get(naam)
      if (!p) {
        if (plekken.size >= 40) return
        plekken.set(naam, (p = { s: 0, beelden: 0, schokken: 0, haperingen: 0, bakjes: new Uint32Array(BAKJES), calls: 0, tris: 0, tellingen: 0, werk: 0 }))
      }
      p.s += ms / 1000
      duur += ms / 1000
      p.beelden++
      p.werk += werk > 0 ? Math.min(werk, 1000) : 0
      p.bakjes[Math.min(BAKJES - 1, Math.floor(ms))]++
      if (ms > 36) p.schokken++
      if (ms > 100) {
        p.haperingen++
        // De ergste beelden van het bezoek (top tien).
        if (ergste.length < 10 || ms > ergste[ergste.length - 1].ms) {
          ergste.push({ ms: Math.round(ms), plek: naam, t: Math.round((performance.now() - start) / 100) / 10 })
          ergste.sort((a, b) => b.ms - a.ms)
          ergste.length = Math.min(ergste.length, 10)
        }
      }
      // Hoeveel er per beeld getekend wordt: een steekproef om de 30 beelden is genoeg.
      if (++teller % 30 === 0) {
        p.calls += renderer.info.render.calls
        p.tris += renderer.info.render.triangles
        p.tellingen++
      }
    },
    stap(wat) {
      if (bijsturing.stappen.length < 20) bijsturing.stappen.push({ t: Math.round(duur), wat })
    },
    zet(o) {
      if (o.ratio != null) bijsturing.ratio = Math.round(o.ratio * 100) / 100
      if (o.nabewerking != null) bijsturing.nabewerking = o.nabewerking
      if (o.schaduw != null) bijsturing.schaduw = o.schaduw
      if (o.eersteBeeld != null) laden.eersteBeeld = Math.round(o.eersteBeeld)
      if (o.shaders != null) laden.shaders = Math.round(o.shaders)
    },
    dispose() {
      clearInterval(klok)
      window.removeEventListener('pagehide', weg)
      document.removeEventListener('visibilitychange', verborgen)
      stuur(true)
    },
  }
}
