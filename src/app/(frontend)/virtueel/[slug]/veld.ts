import * as THREE from 'three'

import type { Veld } from '@/lib/virtueel'

// Het krachtbalveld als één textuur, getekend op een canvas (geen bestanden). De maten en de
// lijnen komen rechtstreeks uit de reconstructie (`Veld`): zijlijnen, achterlijnen, de
// doellijnen met de doelgebieden erachter, de vrijeworplijnen (4 m voor het doel) en de
// middellijn. Niets daarvan verandert hier; wat er bijkomt is het gras:
//  • maaibanen van 4 m, afwisselend met en tegen de kijkrichting (de ene baan vangt het licht,
//    de andere niet), met een zachte overgang in plaats van een harde rand;
//  • vezel en kleurverloop: kleine en grote plekken, zodat het veld niet als een effen vlak oogt;
//  • slijtage waar gespeeld wordt: in de doelgebieden, voor de vrijeworplijn en in het midden
//    (waar het meest gelopen en geworpen wordt) kale, iets bruinere plekken;
//  • de lijnen zelf zijn kalkwit, met een zachte rand (geen harde pixeltrap).
// De tweede textuur (ruwheid) laat de banen en de kale plekken anders glanzen onder de masten:
// pas gemaaid gras glimt, kale grond niet.

export type VeldTexturen = { kleur: THREE.CanvasTexture; ruwheid: THREE.CanvasTexture }

/** Pixels per meter: 40 geeft op een veld van ± 36 × 20 m een textuur van ± 1760 × 1100. */
const PXM = 40

/** Een eenvoudige, deterministische ruis met twee frequenties (geen bibliotheek nodig). */
function ruis(zaad: number): (x: number, y: number) => number {
  const hash = (ix: number, iy: number) => {
    let h = (ix * 374761393 + iy * 668265263 + zaad * 1013904223) | 0
    h = ((h ^ (h >>> 13)) * 1274126177) | 0
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }
  const glad = (x: number, y: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = hash(ix, iy)
    const b = hash(ix + 1, iy)
    const c = hash(ix, iy + 1)
    const d = hash(ix + 1, iy + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
  return (x, y) => 0.6 * glad(x, y) + 0.3 * glad(x * 2.7 + 11, y * 2.7 + 7) + 0.1 * glad(x * 7.1 + 3, y * 7.1 + 5)
}

export function veldTexturen(f: Veld, marge: number): VeldTexturen {
  const L = f.length_m
  const W = f.width_m
  const w = Math.round((L + 2 * marge) * PXM)
  const h = Math.round((W + 2 * marge) * PXM)
  const X = (x: number) => (x + marge) * PXM
  const Y = (y: number) => (y + marge) * PXM
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const r = document.createElement('canvas')
  r.width = w
  r.height = h
  const rg = r.getContext('2d')!

  // ---------- het gras, pixel per pixel ----------
  const beeld = g.createImageData(w, h)
  const d = beeld.data
  const ruwBeeld = rg.createImageData(w, h)
  const rd = ruwBeeld.data
  const groot = ruis(7)
  const fijn = ruis(13)
  // Waar het veld het meest te lijden heeft: de doelgebieden, de zone voor elke vrijeworplijn en
  // het midden. `slijtage` is 0 (gaaf) tot 1 (kaal).
  const midX = (f.goal_a + f.goal_b) / 2
  const slijtageOp = (x: number, y: number) => {
    const inBreedte = y > 0 && y < W
    if (!inBreedte) return 0
    let s = 0
    // De doelgebieden: hier wordt gevangen, gevallen en opgezet.
    if (x < f.goal_a + 1.2 && x > -0.5) s = Math.max(s, 0.55 * (1 - Math.abs(y - W / 2) / (W * 0.55)))
    if (x > f.goal_b - 1.2 && x < L + 0.5) s = Math.max(s, 0.55 * (1 - Math.abs(y - W / 2) / (W * 0.55)))
    // Voor de vrijeworplijnen: de werpplaats van de doelworpen.
    for (const vx of [f.goal_a + 4, f.goal_b - 4]) s = Math.max(s, 0.42 * Math.max(0, 1 - Math.hypot((x - vx) / 2.4, (y - W / 2) / 3.2)))
    // Het midden: de opzet van elke aanval.
    s = Math.max(s, 0.3 * Math.max(0, 1 - Math.hypot((x - midX) / 3.5, (y - W / 2) / 2.4)))
    return s
  }
  for (let py = 0; py < h; py++) {
    const y = py / PXM - marge
    for (let px = 0; px < w; px++) {
      const x = px / PXM - marge
      const i = (py * w + px) * 4
      // Maaibanen van 4 m langs de lengte, zacht overgaand, de ene lichter dan de andere.
      const baan = Math.sin((x / 4) * Math.PI)
      const licht = 0.5 + 0.5 * Math.tanh(baan * 4)
      const n1 = groot(x * 0.35, y * 0.35)
      const n2 = fijn(x * 3, y * 3)
      const buiten = x < 0 || x > L || y < 0 || y > W
      const slijt = slijtageOp(x, y) * (0.75 + 0.5 * n2)
      // Basiskleur: gezond gras, de lichte baan iets geler, de donkere iets blauwer; grote plekken
      // verschuiven de tint, fijne vezel de helderheid.
      let rr = 0.17 + 0.06 * licht + 0.04 * (n1 - 0.5)
      let gg = 0.5 + 0.09 * licht + 0.06 * (n1 - 0.5)
      let bb = 0.2 + 0.02 * (1 - licht) + 0.03 * (n1 - 0.5)
      const vezel = 0.88 + 0.24 * n2
      rr *= vezel
      gg *= vezel
      bb *= vezel
      // Kale plekken: naar bruinig zand, met wat korrel.
      rr = rr + (0.42 - rr) * slijt
      gg = gg + (0.35 - gg) * slijt
      bb = bb + (0.2 - bb) * slijt
      // Buiten de lijnen: dezelfde grasmat, iets donkerder (minder belicht, minder gemaaid).
      if (buiten) {
        rr *= 0.72
        gg *= 0.72
        bb *= 0.74
      }
      d[i] = Math.max(0, Math.min(255, rr * 255))
      d[i + 1] = Math.max(0, Math.min(255, gg * 255))
      d[i + 2] = Math.max(0, Math.min(255, bb * 255))
      d[i + 3] = 255
      // Ruwheid: pas gemaaid gras glimt (lage ruwheid), kale grond en de randen niet.
      const ruw = 0.62 + 0.18 * (1 - licht) + 0.25 * slijt + (buiten ? 0.1 : 0) + 0.06 * (n2 - 0.5)
      const rv = Math.max(0, Math.min(255, ruw * 255))
      rd[i] = rv
      rd[i + 1] = rv
      rd[i + 2] = rv
      rd[i + 3] = 255
    }
  }
  g.putImageData(beeld, 0, 0)
  rg.putImageData(ruwBeeld, 0, 0)

  // ---------- de doelgebieden en de lijnen ----------
  // Doelgebieden achter de doellijnen: een zachte, koele waas (zoals het geschilderde vak in de
  // zaal), met de slijtage eronder nog zichtbaar.
  for (const [a, e] of [[0, f.goal_a], [f.goal_b, L]] as const) {
    g.fillStyle = 'rgba(29,104,140,.5)'
    g.fillRect(X(a), Y(0), (e - a) * PXM, W * PXM)
  }
  // Lijnen in kalkwit, met een zachte rand: eerst een bredere halfdoorzichtige, dan de kern.
  const lijn = (x0: number, y0: number, x1: number, y1: number, dik = 0.1) => {
    for (const [extra, alfa] of [[0.06, 0.35], [0, 0.96]] as const) {
      g.fillStyle = `rgba(246,250,247,${alfa})`
      const dk = (dik + extra) * PXM
      if (x0 === x1) g.fillRect(X(x0) - dk / 2, Y(Math.min(y0, y1)) - dk / 2, dk, Math.abs(y1 - y0) * PXM + dk)
      else g.fillRect(X(Math.min(x0, x1)) - dk / 2, Y(y0) - dk / 2, Math.abs(x1 - x0) * PXM + dk, dk)
    }
  }
  lijn(0, 0, L, 0)
  lijn(0, W, L, W)
  lijn(0, 0, 0, W)
  lijn(L, 0, L, W)
  // De doellijnen lopen een halve meter door, zoals op het echte veld.
  for (const x of [f.goal_a, f.goal_b]) lijn(x, -0.5, x, W + 0.5)
  // De vrijeworplijnen en de middellijn.
  for (const x of [f.goal_a + 4, f.goal_b - 4, midX]) lijn(x, 0, x, W)
  // Op de lijnen is het oppervlak glad (de kalk glimt licht).
  rg.fillStyle = 'rgba(120,120,120,.9)'
  for (const [x0, y0, x1, y1] of [[0, 0, L, 0], [0, W, L, W], [0, 0, 0, W], [L, 0, L, W], [f.goal_a, -0.5, f.goal_a, W + 0.5], [f.goal_b, -0.5, f.goal_b, W + 0.5], [f.goal_a + 4, 0, f.goal_a + 4, W], [f.goal_b - 4, 0, f.goal_b - 4, W], [midX, 0, midX, W]] as const) {
    const dk = 0.1 * PXM
    if (x0 === x1) rg.fillRect(X(x0) - dk / 2, Y(Math.min(y0, y1)), dk, Math.abs(y1 - y0) * PXM)
    else rg.fillRect(X(Math.min(x0, x1)), Y(y0) - dk / 2, Math.abs(x1 - x0) * PXM, dk)
  }

  const kleur = new THREE.CanvasTexture(c)
  kleur.colorSpace = THREE.SRGBColorSpace
  kleur.anisotropy = 8
  const ruwheid = new THREE.CanvasTexture(r)
  ruwheid.anisotropy = 4
  return { kleur, ruwheid }
}

/** Het materiaal van het veld: de grasmat met de ruwheidskaart, voor een lichte glans onder de masten. */
export function veldMateriaal(t: VeldTexturen): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: t.kleur, roughnessMap: t.ruwheid, roughness: 1, metalness: 0 })
}
