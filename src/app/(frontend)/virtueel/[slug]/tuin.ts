import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, inPoort, type Rechthoek } from '@/lib/virtueel'
import { bijSpelersgebouwen } from './kleedkamer'
import { gevelOmtrek, type Omgeving } from './omgeving'
import { canvasTex, rnd } from './stadion'
import { lichtBron } from './lichtkaart'

// De tuinafwerking rond het stadion, in de stijl van een verzorgd huis bij avond: geen kale tegels
// tegen de gevel, maar een plantenborder rondom.
//  • een lage boordsteen van natuursteen (ronde keien in het voegwerk) die de border afboordt;
//  • struiken in verschillende groenen, hier en daar een rode esdoorn of witte hortensia, met
//    bloemen in rood, roze, wit, geel en paars ervoor en erop;
//  • licht: de grondspots voor de gevel (omgeving.ts) staan nu tussen de planten en lichten ze warm
//    aan; om de zoveel meter een tuinlampje in de boordsteen met een warme lichtplas op het plein;
//  • op het plein ronde bloemeneilanden met een boompje tussen de lantaarns; op de parking een haag
//    met boordsteen en bomen, witte belijning, een zachte schaduw onder elke auto en lantaarns;
//  • schaduw: de border is donker tegen de muur en lichter naar voren, de struiken onderaan donker,
//    en een zachte schaduwrand op de tegels langs de boordsteen. Alles vooraf "gebakken" in kleuren
//    en verlopen: geen echte lichten of schaduwkaarten, dus het kost bijna niets per beeld.
// Vlot: een handvol tekenopdrachten voor de hele border (alles is samengevoegd of een InstancedMesh),
// en binnen in het stadion valt hij weg (zone in de viewer).

/** Afstand tot de gevellijn (de muur ligt op 0,6 m, de lamellen tot ± 1,5 m). */
const BINNEN = 1.6
const RAND = 3.3
const BUITEN = 3.62
const KANT_H = 0.38
const AARDE_H = 0.16

const GROEN = ['#2f5d34', '#3b6e3a', '#4a7d3f', '#2c4f3a', '#56803c', '#355e45']
const BLOEM = ['#e0283a', '#ff5f97', '#fff3e0', '#ffc83d', '#9b5cff', '#ff8a3d', '#d81b60']
const WARM = new THREE.Color('#ffc98a')

export type Tuin = { obstakels: Rechthoek[] }

export function bouwTuin(
  scene: THREE.Scene,
  opt: { bestaand: Rechthoek[]; bakken?: { x: number; z: number; w: number; y: number }[]; parking?: Omgeving['parking'] },
): Tuin {
  const toeval = rnd(4242)
  const obstakels: Rechthoek[] = []
  const pts = gevelOmtrek(0.5)
  // Waar de grondspots staan (zelfde berekening als in omgeving.ts): daar licht de border op.
  const spots = gevelOmtrek(3)
    .filter((p) => !inPoort(GEVEL, p.x + p.nx, p.z + p.nz))
    .map((p) => ({ x: p.x + p.nx * 1.75, z: p.z + p.nz * 1.75 }))

  // Een border hoort niet in een poort (met wat marge), niet bij de glazen traptorens in de hoeken,
  // niet bij de spelersgebouwen en niet waar al iets staat.
  const mag = (p: (typeof pts)[number]) => {
    const tx = -p.nz
    const tz = p.nx
    for (const k of [-3, -1.5, 0, 1.5, 3]) if (inPoort(GEVEL, p.x + p.nx + tx * k, p.z + p.nz + tz * k)) return false
    if (Math.abs(p.nx) > 0.34 && Math.abs(p.nz) > 0.34) return false
    const mx = p.x + p.nx * ((BINNEN + BUITEN) / 2)
    const mz = p.z + p.nz * ((BINNEN + BUITEN) / 2)
    if (bijSpelersgebouwen(mx, mz) || bijSpelersgebouwen(p.x + p.nx * BUITEN, p.z + p.nz * BUITEN)) return false
    return !opt.bestaand.some((o) => mx > o.x0 - 1 && mx < o.x1 + 1 && mz > o.z0 - 1 && mz < o.z1 + 1 && !(o.x0 < -GEVEL.A + 2 && o.x1 > GEVEL.A - 2))
  }
  const in_ = pts.map(mag)

  // ---------- texturen ----------
  const keien = document.createElement('canvas')
  keien.width = 256
  keien.height = 64
  {
    const g = keien.getContext('2d')!
    g.fillStyle = '#4a4540'
    g.fillRect(0, 0, 256, 64)
    for (let i = 0; i < 70; i++) {
      const x = toeval() * 256
      const y = toeval() * 64
      const rx = 9 + toeval() * 10
      const ry = 6 + toeval() * 6
      const l = 120 + toeval() * 70
      const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 1, x, y, rx)
      gr.addColorStop(0, `rgb(${l + 30},${l + 22},${l + 10})`)
      gr.addColorStop(1, `rgb(${l - 40},${l - 46},${l - 52})`)
      g.fillStyle = gr
      g.beginPath()
      g.ellipse(x, y, rx, ry, toeval() * 0.6 - 0.3, 0, Math.PI * 2)
      g.fill()
      // Ook over de rand, zodat de textuur naadloos herhaalt.
      if (x < rx) g.ellipse(x + 256, y, rx, ry, 0, 0, Math.PI * 2)
    }
  }
  const keiTex = canvasTex(keien)
  keiTex.wrapS = THREE.RepeatWrapping
  const aarde = document.createElement('canvas')
  aarde.width = aarde.height = 64
  {
    const g = aarde.getContext('2d')!
    g.fillStyle = '#3a2a1e'
    g.fillRect(0, 0, 64, 64)
    for (let i = 0; i < 260; i++) {
      const l = 30 + toeval() * 50
      g.fillStyle = `rgb(${l + 18},${l + 6},${l - 6})`
      g.fillRect(toeval() * 64, toeval() * 64, 1 + toeval() * 2, 1 + toeval() * 2)
    }
  }
  const aardeTex = canvasTex(aarde)
  aardeTex.wrapS = aardeTex.wrapT = THREE.RepeatWrapping
  const verloop = document.createElement('canvas')
  verloop.width = 4
  verloop.height = 64
  {
    const g = verloop.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 0, 64)
    gr.addColorStop(0, 'rgba(0,0,0,.55)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 4, 64)
  }
  const plas = document.createElement('canvas')
  plas.width = plas.height = 64
  {
    const g = plas.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,214,160,.7)')
    gr.addColorStop(0.5, 'rgba(255,190,120,.22)')
    gr.addColorStop(1, 'rgba(255,190,120,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  }
  const plasTex = new THREE.CanvasTexture(plas)

  // ---------- boordsteen, aarde en schaduwrand: één geometrie per soort ----------
  const kant = { pos: [] as number[], uv: [] as number[], kl: [] as number[] }
  const bed = { pos: [] as number[], uv: [] as number[], kl: [] as number[] }
  const rand = { pos: [] as number[], uv: [] as number[] }
  const quad = (
    d: { pos: number[]; uv: number[]; kl?: number[] },
    a: number[],
    b: number[],
    c: number[],
    e: number[],
    uv: number[][],
    kl?: number[],
  ) => {
    // a-b onder, e-c boven (tegenwijzerzin vanaf de zichtkant)
    d.pos.push(...a, ...b, ...c, ...a, ...c, ...e)
    for (const i of [0, 1, 2, 0, 2, 3]) d.uv.push(...uv[i])
    if (kl && d.kl) for (const i of [0, 1, 2, 0, 2, 3]) d.kl.push(kl[i], kl[i], kl[i])
  }
  const op = (p: (typeof pts)[number], af: number, y: number) => [p.x + p.nx * af, y, p.z + p.nz * af]
  let lengte = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (!in_[i] || !in_[(i + 1) % pts.length]) continue
    const d = Math.hypot(b.x - a.x, b.z - a.z)
    if (d > 1) continue
    const u0 = lengte / 1.8
    const u1 = (lengte + d) / 1.8
    lengte += d
    // De boordsteen: buitenkant, bovenkant, binnenkant (boven de aarde uit). Onderaan donkerder.
    quad(kant, op(a, BUITEN, 0), op(b, BUITEN, 0), op(b, BUITEN, KANT_H), op(a, BUITEN, KANT_H), [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [0.45, 0.45, 1, 1])
    quad(kant, op(a, BUITEN, KANT_H), op(b, BUITEN, KANT_H), op(b, RAND, KANT_H), op(a, RAND, KANT_H), [[u0, 0.75], [u1, 0.75], [u1, 1], [u0, 1]], [1.1, 1.1, 1.1, 1.1])
    quad(kant, op(a, RAND, KANT_H), op(b, RAND, KANT_H), op(b, RAND, AARDE_H), op(a, RAND, AARDE_H), [[u0, 1], [u1, 1], [u1, 0.5], [u0, 0.5]], [0.9, 0.9, 0.5, 0.5])
    // De aarde: donker tegen de muur (daar komt geen licht), lichter naar de boordsteen.
    quad(bed, op(a, RAND, AARDE_H), op(b, RAND, AARDE_H), op(b, BINNEN - 0.3, AARDE_H), op(a, BINNEN - 0.3, AARDE_H), [[u0 * 2, 0], [u1 * 2, 0], [u1 * 2, 1.2], [u0 * 2, 1.2]], [0.95, 0.95, 0.35, 0.35])
    // Een zachte schaduw op de tegels langs de boordsteen.
    quad(rand, op(a, BUITEN + 0.9, 0.025), op(b, BUITEN + 0.9, 0.025), op(b, BUITEN, 0.025), op(a, BUITEN, 0.025), [[0, 0], [0, 0], [0, 1], [0, 1]])
  }
  const geo = (d: { pos: number[]; uv: number[]; kl?: number[] }) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2))
    if (d.kl) g.setAttribute('color', new THREE.Float32BufferAttribute(d.kl, 3))
    g.computeVertexNormals()
    return g
  }
  // Waar een border ophoudt, loopt de boordsteen dwars tot tegen de gevel: een afgewerkt einde.
  const eindes: THREE.BufferGeometry[] = []
  pts.forEach((p, i) => {
    const vorige = in_[(i - 1 + pts.length) % pts.length]
    const volgende = in_[(i + 1) % pts.length]
    if (!in_[i] || (vorige && volgende)) return
    const diep = BUITEN - BINNEN + 0.3
    const af = (BUITEN + BINNEN - 0.3) / 2
    const t = vorige ? 1 : -1
    const b = new THREE.BoxGeometry(0.3, KANT_H, diep)
    const kl = new Float32Array(b.attributes.position.count * 3).fill(0.85)
    b.setAttribute('color', new THREE.BufferAttribute(kl, 3))
    b.rotateY(Math.atan2(p.nx, p.nz))
    b.translate(p.x + p.nx * af - p.nz * 0.15 * t, KANT_H / 2, p.z + p.nz * af + p.nx * 0.15 * t)
    eindes.push(b)
  })
  // ---------- planten ----------
  type Plant = { x: number; y: number; z: number; r: number; kleur: THREE.Color; bloeit: boolean }
  const planten: Plant[] = []
  type Bloem = { x: number; y: number; z: number; s: number; kleur: THREE.Color }
  const bloemen: Bloem[] = []
  const tint = new THREE.Color()
  // Gebakken licht: dicht bij een grondspot (of een bak met licht) krijgt een plant warm licht.
  const lichtOp = (x: number, z: number, kleur: THREE.Color) => {
    let best = 99
    for (const s of spots) {
      const d = (s.x - x) ** 2 + (s.z - z) ** 2
      if (d < best) best = d
    }
    const warm = Math.exp(-best / 1.6)
    return kleur.multiplyScalar(0.7 + warm * 0.7).lerp(tint.copy(WARM).multiply(kleur).multiplyScalar(2.6), warm * 0.5)
  }
  const bloemKleur = () => new THREE.Color(BLOEM[Math.floor(toeval() * BLOEM.length)])
  const zetBloemen = (cx: number, cy: number, cz: number, r: number, n: number, kleur?: THREE.Color) => {
    const k = kleur ?? bloemKleur()
    for (let j = 0; j < n; j++) {
      // Op de bovenste helft van de struik.
      const a = toeval() * Math.PI * 2
      const h = 0.25 + toeval() * 0.7
      const rr = Math.sqrt(1 - h * h) * r * 0.98
      bloemen.push({ x: cx + Math.cos(a) * rr, y: cy + h * r * 0.78, z: cz + Math.sin(a) * rr, s: 0.8 + toeval() * 0.5, kleur: lichtOp(cx, cz, k.clone()) })
    }
  }

  let stuk: { x0: number; x1: number; z0: number; z1: number } | null = null
  let stukLengte = 0
  const sluitStuk = () => {
    if (stuk) obstakels.push(stuk)
    stuk = null
    stukLengte = 0
  }
  let volgende = 0
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const b = pts[(i + 1) % pts.length]
    const d = Math.hypot(b.x - p.x, b.z - p.z)
    if (!in_[i]) {
      sluitStuk()
      continue
    }
    s += d
    // Obstakels per stuk van ± 3 m: de rechthoek rond dat stuk border.
    for (const af of [BINNEN, BUITEN]) {
      const x = p.x + p.nx * af
      const z = p.z + p.nz * af
      stuk = stuk ? { x0: Math.min(stuk.x0, x), x1: Math.max(stuk.x1, x), z0: Math.min(stuk.z0, z), z1: Math.max(stuk.z1, z) } : { x0: x, x1: x, z0: z, z1: z }
    }
    stukLengte += d
    if (stukLengte > 3) sluitStuk()

    if (s < volgende) continue
    volgende = s + 0.75 + toeval() * 0.5
    // Achteraan een grotere struik, vooraan een kleinere of een bosje bloemen.
    for (const rij of [0, 1]) {
      const af = rij === 0 ? 2.15 + toeval() * 0.2 : 2.85 + toeval() * 0.15
      const schuif = (toeval() - 0.5) * 0.5
      const x = p.x + p.nx * af - p.nz * schuif
      const z = p.z + p.nz * af + p.nx * schuif
      // Niet bovenop een grondspot.
      if (spots.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 0.4)) continue
      if (rij === 1 && toeval() < 0.6) {
        // Een laag bosje bloemen voor de struiken.
        const k = bloemKleur()
        for (let j = 0; j < 11; j++) {
          bloemen.push({ x: x + (toeval() - 0.5) * 0.55, y: AARDE_H + 0.12 + toeval() * 0.18, z: z + (toeval() - 0.5) * 0.55, s: 0.9 + toeval() * 0.4, kleur: lichtOp(x, z, k.clone()) })
        }
        continue
      }
      const r = rij === 0 ? 0.45 + toeval() * 0.22 : 0.3 + toeval() * 0.12
      const soort = toeval()
      // Hier en daar een rode esdoorn of een witte hortensia, zoals in een verzorgde voortuin.
      const kleur = soort < 0.05 ? new THREE.Color('#8a2a2a') : soort < 0.14 ? new THREE.Color('#e8e2d2') : new THREE.Color(GROEN[Math.floor(toeval() * GROEN.length)])
      planten.push({ x, y: AARDE_H + r * 0.55, z, r, kleur: lichtOp(x, z, kleur), bloeit: soort >= 0.14 && toeval() < 0.7 })
    }
  }
  sluitStuk()

  // De plantenbakken op het plein (buitenkant.ts): aarde bovenin, en een krans bloemen rond de boom.
  if (opt.bakken?.length) {
    const aardeBak = mergeGeometries(opt.bakken.map((bak) => new THREE.PlaneGeometry(bak.w - 0.12, bak.w - 0.12).rotateX(-Math.PI / 2).translate(bak.x, bak.y + 0.035, bak.z)))
    scene.add(new THREE.Mesh(aardeBak, new THREE.MeshLambertMaterial({ map: aardeTex, color: '#8a7a6a' })))
  }
  for (const bak of opt.bakken ?? []) {
    const k = bloemKleur()
    for (let j = 0; j < 34; j++) {
      const a = (j / 34) * Math.PI * 2
      const r = bak.w * (0.3 + toeval() * 0.14)
      bloemen.push({ x: bak.x + Math.cos(a) * r, y: bak.y + 0.1 + toeval() * 0.14, z: bak.z + Math.sin(a) * r, s: 0.7 + toeval() * 0.25, kleur: k.clone().multiplyScalar(0.95) })
    }
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2 + 0.4
      planten.push({ x: bak.x + Math.cos(a) * bak.w * 0.28, y: bak.y + 0.12, z: bak.z + Math.sin(a) * bak.w * 0.28, r: 0.24, kleur: new THREE.Color(GROEN[j % GROEN.length]), bloeit: false })
    }
  }

  // ---------- plein: bloemeneilanden tussen de lantaarns ----------
  // De lantaarns staan om de 16 m langs de gevel, 12 m ervoor (omgeving.ts). Halverwege twee
  // lantaarns komt een rond eiland: boordsteen, aarde, struiken, bloemen en een boompje dat warm
  // aangelicht wordt. Zo krijgt het plein het ritme van een boulevard.
  const extraPlassen: { x: number; z: number; s: number }[] = []
  const stammen: { x: number; z: number; h: number }[] = []
  const vrij = (x: number, z: number, r: number) =>
    !opt.bestaand.some((o) => x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1) &&
    !obstakels.some((o) => x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1)
  const boom = (x: number, z: number, h: number, kroon: number) => {
    stammen.push({ x, z, h })
    const k = new THREE.Color(GROEN[Math.floor(toeval() * 3)]).multiplyScalar(1.1).lerp(tint.copy(WARM).multiplyScalar(0.55), 0.18)
    planten.push({ x, y: h + kroon * 0.45, z, r: kroon, kleur: k, bloeit: false })
    planten.push({ x: x + kroon * 0.35, y: h + kroon * 0.95, z: z - kroon * 0.2, r: kroon * 0.65, kleur: k.clone().multiplyScalar(1.12), bloeit: false })
    extraPlassen.push({ x, z, s: 1.9 })
  }
  const eiland = (cx: number, cz: number, R: number) => {
    const N = 20
    const Ro = R + 0.28
    const H = KANT_H * 0.85
    const P = (r: number, a: number, y: number) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]
    const C = [cx, AARDE_H, cz]
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2
      const a1 = ((k + 1) / N) * Math.PI * 2
      const u0 = (a0 * Ro) / 1.8
      const u1 = (a1 * Ro) / 1.8
      quad(kant, P(Ro, a0, 0), P(Ro, a1, 0), P(Ro, a1, H), P(Ro, a0, H), [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [0.45, 0.45, 1, 1])
      quad(kant, P(Ro, a0, H), P(Ro, a1, H), P(R, a1, H), P(R, a0, H), [[u0, 0.75], [u1, 0.75], [u1, 1], [u0, 1]], [1.1, 1.1, 1.1, 1.1])
      quad(kant, P(R, a0, H), P(R, a1, H), P(R, a1, AARDE_H), P(R, a0, AARDE_H), [[u0, 1], [u1, 1], [u1, 0.5], [u0, 0.5]], [0.9, 0.9, 0.5, 0.5])
      quad(bed, P(R, a1, AARDE_H), P(R, a0, AARDE_H), C, C, [[u1, 0], [u0, 0], [u0, 1], [u1, 1]], [0.95, 0.95, 0.45, 0.45])
      quad(rand, P(Ro + 0.9, a1, 0.025), P(Ro + 0.9, a0, 0.025), P(Ro, a0, 0.025), P(Ro, a1, 0.025), [[0, 0], [0, 0], [0, 1], [0, 1]])
    }
    // Een krans struiken, bloemen ervoor, en het boompje in het midden.
    const n = 7
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + toeval() * 0.4
      const rr = 0.38 + toeval() * 0.14
      const x = cx + Math.cos(a) * R * 0.6
      const z = cz + Math.sin(a) * R * 0.6
      const kleur = new THREE.Color(GROEN[Math.floor(toeval() * GROEN.length)]).multiplyScalar(0.95)
      planten.push({ x, y: AARDE_H + rr * 0.55, z, r: rr, kleur, bloeit: toeval() < 0.6 })
    }
    const k = bloemKleur()
    for (let j = 0; j < 30; j++) {
      const a = (j / 30) * Math.PI * 2
      const rr = R * (0.84 + toeval() * 0.08)
      bloemen.push({ x: cx + Math.cos(a) * rr, y: AARDE_H + 0.1 + toeval() * 0.12, z: cz + Math.sin(a) * rr, s: 0.85 + toeval() * 0.3, kleur: (j % 10 < 7 ? k : bloemKleur()).clone() })
    }
    boom(cx, cz, 2.3, 1.15)
    obstakels.push({ x0: cx - Ro, x1: cx + Ro, z0: cz - Ro, z1: cz + Ro })
  }
  // Kandidaten om de meter langs de gevel, 12 m ervoor; een eiland komt waar het ver genoeg van een
  // lantaarn (zelfde plaatsing als omgeving.ts), een poort en het vorige eiland staat.
  const lantaarnPlek = gevelOmtrek(16).map((p) => ({ x: p.x + p.nx * 12, z: p.z + p.nz * 12 }))
  const eilanden: { x: number; z: number }[] = []
  for (const p of gevelOmtrek(1)) {
    if (Math.abs(p.nx) > 0.34 && Math.abs(p.nz) > 0.34) continue
    if ([-6, 0, 6].some((k) => inPoort(GEVEL, p.x + p.nx - p.nz * k, p.z + p.nz + p.nx * k))) continue
    const x = p.x + p.nx * 12
    const z = p.z + p.nz * 12
    // De toegang naar de hoofdingang (fonteinen, bakken, standen) blijft vrij.
    if (z > GEVEL.B && Math.abs(x) < 26) continue
    if (lantaarnPlek.some((l) => Math.hypot(l.x - x, l.z - z) < 5.5)) continue
    if (eilanden.some((e) => Math.hypot(e.x - x, e.z - z) < 14)) continue
    if (bijSpelersgebouwen(x, z) || !vrij(x, z, 3.2)) continue
    eilanden.push({ x, z })
    eiland(x, z, 1.9)
    lichtBron(x, z, 5, '#ffc27a', 0.6)
  }

  // ---------- parking: hagen met boordsteen, belijning, schaduw onder de auto's, lantaarns ----------
  const blokken: THREE.BufferGeometry[] = []
  const kantBlok = (cx: number, cz: number, lx: number, lz: number, h: number) => {
    const g = new THREE.BoxGeometry(lx, h, lz).toNonIndexed()
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (Math.max(lx, lz) / 1.8))
    const pos = g.attributes.position
    const kl = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) kl.fill(pos.getY(i) > 0 ? 1 : 0.5, i * 3, i * 3 + 3)
    g.setAttribute('color', new THREE.BufferAttribute(kl, 3))
    g.translate(cx, h / 2, cz)
    blokken.push(g)
  }
  const lantaarns: { x: number; z: number }[] = []
  // Een haag in een smalle border langs z, van z0 tot z1 (x0..x1 is de buitenkant van de boordsteen).
  const haag = (x0: number, x1: number, z0: number, z1: number, metBomen: boolean) => {
    const H = KANT_H * 0.85
    const d = 0.22
    kantBlok(x0 + d / 2, (z0 + z1) / 2, d, z1 - z0, H)
    kantBlok(x1 - d / 2, (z0 + z1) / 2, d, z1 - z0, H)
    kantBlok((x0 + x1) / 2, z0 + d / 2, x1 - x0 - 2 * d, d, H)
    kantBlok((x0 + x1) / 2, z1 - d / 2, x1 - x0 - 2 * d, d, H)
    const a = [x0 + d, AARDE_H, z1 - d]
    const b = [x1 - d, AARDE_H, z1 - d]
    const c = [x1 - d, AARDE_H, z0 + d]
    const e = [x0 + d, AARDE_H, z0 + d]
    quad(bed, a, b, c, e, [[0, 0], [1, 0], [1, (z1 - z0) / 2], [0, (z1 - z0) / 2]], [0.8, 0.8, 0.8, 0.8])
    const mx = (x0 + x1) / 2
    const breed = x1 - x0
    for (let z = z0 + 0.6; z < z1 - 0.5; z += 0.7) {
      const rr = Math.min(0.55, breed * 0.42) * (0.92 + toeval() * 0.16)
      const kleur = new THREE.Color(GROEN[toeval() < 0.7 ? 1 : 3]).multiplyScalar(0.9 + toeval() * 0.15)
      planten.push({ x: mx + (toeval() - 0.5) * 0.1, y: AARDE_H + rr * 0.6, z, r: rr, kleur, bloeit: toeval() < 0.12 })
    }
    if (metBomen) for (let z = z0 + 6; z < z1 - 3; z += 12) boom(mx, z, 2.6, 1.3)
    for (let z = z0 + 12; z < z1 - 3; z += 15) lantaarns.push({ x: mx, z: z - 6 })
    obstakels.push({ x0, x1, z0, z1 })
  }
  const pk = opt.parking
  const lijnen: THREE.Matrix4[] = []
  const autoSchaduw: THREE.Matrix4[] = []
  if (pk && pk.rijen.length >= 3) {
    // Tussen de twee middelste rijen (de auto's staan er met hun neus naar elkaar).
    const hx = (pk.rijen[1] + pk.rijen[2]) / 2
    haag(hx - 0.5, hx + 0.5, pk.z0 + 3, pk.z1 - 3, true)
    // Langs de pleinkant, met twee doorgangen.
    for (const [z0, z1] of [
      [pk.z0 + 2, -12],
      [-6, 10],
      [16, pk.z1 - 2],
    ] as const) {
      const x1 = pk.x0 - 0.3
      if (vrij(x1 - 0.7, (z0 + z1) / 2, 0.6)) haag(x1 - 1.3, x1, z0, z1, false)
    }
    // Witte belijning tussen de plaatsen, en een zachte schaduw onder elke auto.
    for (const rx of pk.rijen) for (let i = 0; i <= 11; i++) lijnen.push(new THREE.Matrix4().makeTranslation(rx, 0.012, -28 + i * 5.3 - 2.65))
    for (const [x, z, ry] of pk.autos) autoSchaduw.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.018, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)))
  }

  for (const p of planten) if (p.bloeit) zetBloemen(p.x, p.y, p.z, p.r, 8 + Math.floor(toeval() * 8))

  if (kant.pos.length) {
    const keiMat = new THREE.MeshLambertMaterial({ map: keiTex, vertexColors: true, side: THREE.DoubleSide })
    scene.add(new THREE.Mesh(eindes.length || blokken.length ? mergeGeometries([geo(kant), ...eindes.map((e) => e.toNonIndexed()), ...blokken]) : geo(kant), keiMat))
    scene.add(new THREE.Mesh(geo(bed), new THREE.MeshLambertMaterial({ map: aardeTex, vertexColors: true })))
    const schaduw = new THREE.Mesh(geo(rand), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(verloop), color: '#000', transparent: true, depthWrite: false }))
    schaduw.renderOrder = -1
    scene.add(schaduw)
  }


  // Struiken: een zacht afgeronde bol met wat reliëf, onderaan donker (gebakken schaduw), en per
  // struik een kleur.
  const struikGeo = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute('normal').deleteAttribute('uv'))
  {
    const pos = struikGeo.attributes.position
    const kl: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const ruw = 0.88 + ((Math.sin(pos.getX(i) * 7.1 + pos.getZ(i) * 5.3) + 1) / 2) * 0.22
      pos.setXYZ(i, pos.getX(i) * ruw, y * 0.78 * ruw, pos.getZ(i) * ruw)
      const l = 0.32 + 0.85 * Math.pow((y + 1) / 2, 0.8)
      kl.push(l, l, l)
    }
    struikGeo.setAttribute('color', new THREE.Float32BufferAttribute(kl, 3))
    struikGeo.computeVertexNormals()
  }
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const v = new THREE.Vector3()
  const schaal = new THREE.Vector3()
  if (planten.length) {
    const struiken = new THREE.InstancedMesh(struikGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), planten.length)
    planten.forEach((p, i) => {
      m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(Y, toeval() * 6.28), schaal.setScalar(p.r))
      struiken.setMatrixAt(i, m4)
      struiken.setColorAt(i, p.kleur)
    })
    scene.add(struiken)
  }
  // Bloemen: kleine sterretjes in volle kleur (onbelicht: ze lichten op in het spotlicht).
  if (bloemen.length) {
    const bloemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.085, 0), new THREE.MeshBasicMaterial(), bloemen.length)
    bloemen.forEach((b, i) => {
      m4.compose(v.set(b.x, b.y, b.z), q.setFromAxisAngle(Y, toeval() * 6.28), schaal.set(b.s, b.s * 0.6, b.s))
      bloemMesh.setMatrixAt(i, m4)
      bloemMesh.setColorAt(i, b.kleur)
    })
    scene.add(bloemMesh)
  }

  // ---------- warm licht: lichtplassen op de border en tuinlampjes in de boordsteen ----------
  const plasMat = new THREE.MeshBasicMaterial({ map: plasTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const bedSpots = spots.filter((sp) => pts.some((p, i) => in_[i] && (p.x + p.nx * 1.75 - sp.x) ** 2 + (p.z + p.nz * 1.75 - sp.z) ** 2 < 0.3))
  const lampjes = pts.filter((p, i) => in_[i] && i % 12 === 6 && in_[(i + 2) % pts.length] && in_[(i - 2 + pts.length) % pts.length])
  const plassen = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), plasMat, bedSpots.length + lampjes.length + extraPlassen.length + lantaarns.length)
  bedSpots.forEach((sp, i) => {
    m4.compose(v.set(sp.x, AARDE_H + 0.01, sp.z), q.identity(), schaal.set(1.7, 1, 1.7))
    plassen.setMatrixAt(i, m4)
  })
  const lampGeo = new THREE.BoxGeometry(0.22, 0.07, 0.03)
  const lampMesh = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: '#ffe2b0', toneMapped: false }), Math.max(1, lampjes.length))
  lampMesh.count = lampjes.length
  for (const p of lampjes) lichtBron(p.x + p.nx * (BUITEN + 0.9), p.z + p.nz * (BUITEN + 0.9), 3.4, '#ffd9a0', 0.5)
  for (const l of lantaarns) lichtBron(l.x, l.z, 8.5, '#ffb45e', 0.95)
  lampjes.forEach((p, i) => {
    q.setFromAxisAngle(Y, Math.atan2(p.nx, p.nz))
    m4.compose(v.set(p.x + p.nx * (BUITEN + 0.012), KANT_H * 0.55, p.z + p.nz * (BUITEN + 0.012)), q, schaal.setScalar(1))
    lampMesh.setMatrixAt(i, m4)
    m4.compose(v.set(p.x + p.nx * (BUITEN + 0.9), 0.03, p.z + p.nz * (BUITEN + 0.9)), q, schaal.set(1.6, 1, 1.2))
    plassen.setMatrixAt(bedSpots.length + i, m4)
  })
  let pi = bedSpots.length + lampjes.length
  for (const e of extraPlassen) {
    m4.compose(v.set(e.x, AARDE_H + 0.012, e.z), q.identity(), schaal.set(e.s, 1, e.s))
    plassen.setMatrixAt(pi++, m4)
  }
  for (const l of lantaarns) {
    m4.compose(v.set(l.x, 0.03, l.z), q.identity(), schaal.set(4.2, 1, 4.2))
    plassen.setMatrixAt(pi++, m4)
  }
  scene.add(plassen, lampMesh)

  // Stammen van de boompjes, en de lantaarns op de parking (een paal met een warme kop; het licht
  // is de plas eronder, geen echte lamp).
  if (stammen.length) {
    const stamMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 1, 7).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#5a3d26' }), stammen.length)
    stammen.forEach((st, i) => {
      m4.compose(v.set(st.x, AARDE_H, st.z), q.identity(), schaal.set(1, st.h, 1))
      stamMesh.setMatrixAt(i, m4)
    })
    scene.add(stamMesh)
  }
  if (lantaarns.length) {
    const paal = new THREE.InstancedMesh(
      mergeGeometries([new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6).translate(0, 2.3 + AARDE_H, 0), new THREE.BoxGeometry(0.5, 0.12, 0.32).translate(0, 4.62 + AARDE_H, 0)]),
      new THREE.MeshLambertMaterial({ color: '#2b2f36' }),
      lantaarns.length,
    )
    const kop = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.04, 0.26).translate(0, 4.54 + AARDE_H, 0), new THREE.MeshBasicMaterial({ color: '#ffe2b0', toneMapped: false }), lantaarns.length)
    lantaarns.forEach((l, i) => {
      m4.makeTranslation(l.x, 0, l.z)
      paal.setMatrixAt(i, m4)
      kop.setMatrixAt(i, m4)
    })
    scene.add(paal, kop)
  }
  if (lijnen.length) {
    const lijn = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.4, 0.11).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c9ced6' }), lijnen.length)
    lijnen.forEach((m, i) => lijn.setMatrixAt(i, m))
    scene.add(lijn)
  }
  if (autoSchaduw.length) {
    const vlek = document.createElement('canvas')
    vlek.width = 64
    vlek.height = 32
    const g = vlek.getContext('2d')!
    g.filter = 'blur(5px)'
    g.fillStyle = 'rgba(0,0,0,.75)'
    g.fillRect(8, 6, 48, 20)
    const schaduw = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(5.2, 2.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vlek), color: '#000', transparent: true, depthWrite: false }),
      autoSchaduw.length,
    )
    autoSchaduw.forEach((m, i) => schaduw.setMatrixAt(i, m))
    schaduw.renderOrder = -1
    scene.add(schaduw)
  }

  return { obstakels }
}
