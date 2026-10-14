import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { GEVEL, type EreBord, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { deurOp, liftStap, liftVerdiep, nieuweLift, type Lift } from '@/lib/virtueel-lift'
import { canvasTex, rnd, rondLogo } from './stadion'

// Het verdiep boven de Hall of Fame-gang (zuid), bereikbaar met een echte lift:
//  • de lift: een schacht met schuifdeuren op beide verdiepen, een kooi die meerijdt (met spiegel,
//    leuning en knoppen) en verdiepnummers boven de deuren die wisselen tijdens de rit;
//  • loges met een glazen gevel boven de zuidtribune: van hogerop naar de wedstrijd kijken, in
//    leren stoelen in clubkleur, met een bar; in twee loges een aquarium met zwemmende visjes;
//  • een erfgoedgang: de eerste prijzen van je club, als oude bekers in alle vormen en maten in
//    een lange vitrine, met vaantjes en archieffoto's aan de muur.
// De logica van de lift zit (getest) in lib/virtueel-lift.ts. Botsingen: per verdiep een eigen lijst.

export const VERDIEP_Y = 7.6
const PLAFOND = 3.4
const LX = -26 // midden van de lift
const LOGE_X0 = -23
const XL = 31

export type Verdiep = {
  obstakels: (verdiep: 0 | 1) => Rechthoek[]
  update: (
    seconden: number,
    dt: number,
    speler: { x: number; z: number; verdiep: 0 | 1; actief: boolean },
  ) => { aangekomen: 0 | 1 | null; vloer: number | null }
  /** Voor de wegwijzers: waar de lift staat (gelijkvloers). */
  lift: { x: number; z: number }
}

function hout(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  const r = rnd(42)
  for (let i = 0; i < 8; i++) {
    const v = 92 + Math.floor(r() * 30)
    g.fillStyle = `rgb(${v + 40},${v + 8},${v - 30})`
    g.fillRect(0, i * 32, 256, 32)
    g.fillStyle = 'rgba(0,0,0,.25)'
    g.fillRect(0, i * 32, 256, 2)
    for (let k = 0; k < 30; k++) {
      g.fillStyle = `rgba(60,30,10,${0.05 + r() * 0.08})`
      g.fillRect(r() * 256, i * 32 + r() * 30, 20 + r() * 80, 1)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function tapijt(thema: StadionThema): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const basis = new THREE.Color(thema.primair).multiplyScalar(0.28)
  g.fillStyle = `#${basis.getHexString()}`
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = 'rgba(255,215,140,.18)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(64, 8)
  g.lineTo(120, 64)
  g.lineTo(64, 120)
  g.lineTo(8, 64)
  g.closePath()
  g.stroke()
  g.fillStyle = 'rgba(255,215,140,.22)'
  g.beginPath()
  g.arc(64, 64, 5, 0, Math.PI * 2)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Een oude beker in een van vijf vormen (lathe-profielen), op een houten voet. */
function oudeBeker(vorm: number, mat: THREE.Material, voetMat: THREE.Material, schaal: number): THREE.Group {
  const g = new THREE.Group()
  const P = (pts: number[][]) => pts.map(([x, y]) => new THREE.Vector2(x, y))
  const profielen = [
    // bokaal
    P([[0, 0], [0.16, 0], [0.16, 0.04], [0.05, 0.08], [0.04, 0.3], [0.1, 0.34], [0.18, 0.42], [0.2, 0.55], [0.19, 0.56]]),
    // amfora met deksel
    P([[0, 0], [0.12, 0], [0.12, 0.03], [0.05, 0.06], [0.06, 0.12], [0.16, 0.28], [0.2, 0.42], [0.17, 0.56], [0.08, 0.64], [0.07, 0.7], [0.11, 0.72], [0.06, 0.78], [0.02, 0.84], [0, 0.85]]),
    // schaal op een voet
    P([[0, 0], [0.14, 0], [0.14, 0.03], [0.03, 0.06], [0.03, 0.22], [0.08, 0.24], [0.3, 0.3], [0.31, 0.32], [0.29, 0.32], [0.07, 0.27]]),
    // hoge dekselbeker
    P([[0, 0], [0.13, 0], [0.13, 0.03], [0.04, 0.07], [0.035, 0.25], [0.09, 0.29], [0.12, 0.45], [0.12, 0.62], [0.1, 0.64], [0.12, 0.66], [0.06, 0.72], [0.02, 0.76], [0.04, 0.8], [0, 0.84]]),
    // kelk met lange steel
    P([[0, 0], [0.15, 0], [0.15, 0.03], [0.03, 0.07], [0.025, 0.45], [0.06, 0.48], [0.17, 0.6], [0.2, 0.74], [0.19, 0.75]]),
  ]
  const profiel = profielen[vorm % profielen.length]
  const beker = new THREE.Mesh(new THREE.LatheGeometry(profiel, 24), mat)
  beker.position.y = 0.12
  g.add(beker)
  if (vorm % 5 === 1 || vorm % 5 === 4) {
    for (const kant of [-1, 1]) {
      const oor = new THREE.Mesh(new THREE.TorusGeometry(vorm % 5 === 4 ? 0.1 : 0.07, 0.012, 6, 16, Math.PI * 1.2), mat)
      oor.position.set(kant * (vorm % 5 === 4 ? 0.22 : 0.19), vorm % 5 === 4 ? 0.74 : 0.55, 0)
      oor.rotation.z = kant === 1 ? -Math.PI / 2 : Math.PI / 2
      g.add(oor)
    }
  }
  const voet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), voetMat)
  voet.position.y = 0.06
  g.add(voet)
  g.scale.setScalar(schaal)
  return g
}

export function bouwVerdiep(
  scene: THREE.Scene,
  opt: { thema: StadionThema; renderer: THREE.WebGLRenderer; licht: boolean; tribuneZ: number; vroeger: EreBord[]; logo: Promise<HTMLImageElement | null> },
): Verdiep {
  const { thema, licht } = opt
  const { B } = GEVEL
  const Y = VERDIEP_Y
  const zF = opt.tribuneZ - 1.2 // glazen gevel van de loges
  const zL = zF + 4.0 // achterwand van de loges
  const zG = B - 0.6 // binnenkant van de gevel
  const Z0 = opt.tribuneZ // achterkant van de liftschacht
  const ZD = opt.tribuneZ + 2.6 // de liftdeuren
  const primair = new THREE.Color(thema.primair)
  const toeval = rnd(8080)

  const mats = {
    beton: new THREE.MeshLambertMaterial({ color: '#c9ccd2' }),
    wand: new THREE.MeshLambertMaterial({ color: '#e7e2d9' }),
    donker: new THREE.MeshLambertMaterial({ color: '#1f2530' }),
    staal: new THREE.MeshStandardMaterial({ color: '#c8ccd1', metalness: 0.85, roughness: 0.3, emissive: '#30343a', emissiveIntensity: 0.4 }),
    club: new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.15 }),
    leer: new THREE.MeshStandardMaterial({ color: primair.clone().multiplyScalar(0.75), roughness: 0.45, metalness: 0.05 }),
    glas: new THREE.MeshStandardMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.16, metalness: 0.3, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    licht: new THREE.MeshBasicMaterial({ color: '#fff4dc', toneMapped: false }),
    hout: new THREE.MeshLambertMaterial({ map: hout() }),
  }
  const doos = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    scene.add(m)
    return m
  }

  // Een kleine studio om in te weerspiegelen (metaal van bekers, staal van de lift).
  let omgeving: THREE.Texture | null = null
  try {
    const pm = new THREE.PMREMGenerator(opt.renderer)
    omgeving = pm.fromScene(new RoomEnvironment(), 0.04).texture
    pm.dispose()
  } catch {
    omgeving = null
  }
  mats.staal.envMap = omgeving

  // ---------- de vloerplaat en het dak ----------
  doos(2 * XL + 0.6, 0.35, zG - zF + 0.3, 0, Y - 0.175, (zF + zG) / 2 - 0.15, mats.beton)
  // Plafond van de gang eronder: licht, met downlights.
  const onder = new THREE.Mesh(new THREE.PlaneGeometry(2 * XL + 0.6, zG - zF + 0.3).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f1efe9' }))
  onder.position.set(0, Y - 0.352, (zF + zG) / 2 - 0.15)
  scene.add(onder)
  const dlOnder: THREE.Matrix4[] = []
  for (let x = -XL + 2; x <= XL - 2; x += 3) for (const z of [opt.tribuneZ + 1.8, (opt.tribuneZ + zG) / 2 + 1.2, zG - 1.6]) dlOnder.push(new THREE.Matrix4().makeTranslation(x, Y - 0.355, z))
  const dl = new THREE.InstancedMesh(new THREE.CircleGeometry(0.13, 12).rotateX(Math.PI / 2), mats.licht, dlOnder.length)
  dlOnder.forEach((m, i) => dl.setMatrixAt(i, m))
  scene.add(dl)
  // Het dak van het verdiep, met een rand in clubkleur.
  doos(2 * XL + 0.8, 0.3, zG - zF + 0.5, 0, Y + PLAFOND + 0.15, (zF + zG) / 2 - 0.2, mats.donker)
  doos(2 * XL + 0.9, 0.5, 0.2, 0, Y + PLAFOND + 0.2, zF - 0.45, mats.club)
  // Plafond binnen met downlights.
  const binnenPlafond = new THREE.Mesh(new THREE.PlaneGeometry(2 * XL, zG - zF).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f5f3ee' }))
  binnenPlafond.position.set(0, Y + PLAFOND - 0.001, (zF + zG) / 2)
  scene.add(binnenPlafond)
  const dlBoven: THREE.Matrix4[] = []
  for (let x = -XL + 1.5; x <= XL - 1.5; x += 2.25) for (const z of [zF + 1.2, zF + 3.0, (zL + zG) / 2]) dlBoven.push(new THREE.Matrix4().makeTranslation(x, Y + PLAFOND - 0.005, z))
  const dl2 = new THREE.InstancedMesh(new THREE.CircleGeometry(0.11, 12).rotateX(Math.PI / 2), mats.licht, dlBoven.length)
  dlBoven.forEach((m, i) => dl2.setMatrixAt(i, m))
  scene.add(dl2)
  // Eindwanden.
  for (const sx of [-1, 1]) doos(0.2, PLAFOND + 0.35, zG - zF, sx * (XL + 0.1), Y + PLAFOND / 2 - 0.175, (zF + zG) / 2, mats.wand)

  // ---------- vloer: tapijt in de gang, parket in de loges ----------
  const tap = tapijt(thema)
  tap.repeat.set((2 * XL) / 1.6, (zG - zF) / 1.6)
  const tapijtVloer = new THREE.Mesh(new THREE.PlaneGeometry(2 * XL, zG - zF).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tap }))
  tapijtVloer.position.set(0, Y + 0.002, (zF + zG) / 2)
  scene.add(tapijtVloer)
  const parketTex = hout()
  parketTex.repeat.set((XL - LOGE_X0) / 2, (zL - zF) / 2)
  const parket = new THREE.Mesh(new THREE.PlaneGeometry(XL - LOGE_X0, zL - zF).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: parketTex }))
  parket.position.set((XL + LOGE_X0) / 2, Y + 0.004, (zF + zL) / 2)
  scene.add(parket)

  // ---------- de glazen gevel van de loges, met een gevelband in clubkleur ----------
  const ruit = new THREE.Mesh(new THREE.PlaneGeometry(2 * XL, PLAFOND), mats.glas)
  ruit.position.set(0, Y + PLAFOND / 2, zF)
  scene.add(ruit)
  const stijlen: THREE.BufferGeometry[] = []
  for (let x = -XL; x <= XL + 0.01; x += 1.55) stijlen.push(new THREE.BoxGeometry(0.06, PLAFOND, 0.08).translate(x, Y + PLAFOND / 2, zF))
  stijlen.push(new THREE.BoxGeometry(2 * XL, 0.07, 0.09).translate(0, Y + 1.0, zF + 0.25))
  stijlen.push(new THREE.BoxGeometry(2 * XL, 0.05, 0.18).translate(0, Y + 1.05, zF + 0.25))
  scene.add(new THREE.Mesh(mergeGeometries(stijlen), mats.staal))
  const bandC = document.createElement('canvas')
  bandC.width = 2048
  bandC.height = 64
  {
    const g = bandC.getContext('2d')!
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 2048, 64)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 40px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    for (let i = 0; i < 4; i++) g.fillText(`VIP LOGES · ${thema.naam.toUpperCase()}`, 256 + i * 512, 34, 480)
  }
  const band = new THREE.Mesh(new THREE.PlaneGeometry(2 * XL + 0.6, 0.62), new THREE.MeshBasicMaterial({ map: canvasTex(bandC), toneMapped: false }))
  band.position.set(0, Y - 0.6, zF - 0.31)
  band.rotation.y = Math.PI
  scene.add(band)
  doos(2 * XL + 0.6, 0.95, 0.12, 0, Y - 0.6, zF - 0.24, mats.donker)
  doos(2 * XL + 0.6, 0.05, 0.05, 0, Y - 0.12, zF - 0.33, mats.licht)

  // ---------- de lift ----------
  const SCHACHT_H = Y + PLAFOND
  const sw = 0.15
  // Zijwanden en achterwand van de schacht (over beide verdiepen), en de voorwand met deuropeningen.
  doos(sw, SCHACHT_H, ZD - Z0, LX - 1.275, SCHACHT_H / 2, (Z0 + ZD) / 2, mats.wand)
  doos(sw, SCHACHT_H, ZD - Z0, LX + 1.275, SCHACHT_H / 2, (Z0 + ZD) / 2, mats.wand)
  doos(2.7, SCHACHT_H, sw, LX, SCHACHT_H / 2, Z0 + sw / 2, mats.wand)
  for (const sx of [-1, 1]) doos(0.75, SCHACHT_H, sw, LX + sx * 0.975, SCHACHT_H / 2, ZD, mats.staal)
  doos(1.2, Y - 2.3, sw, LX, 2.3 + (Y - 2.3) / 2, ZD, mats.staal)
  doos(1.2, PLAFOND - 2.3, sw, LX, Y + 2.3 + (PLAFOND - 2.3) / 2, ZD, mats.staal)
  // Schuifdeuren per verdiep (in de voorwand) en in de kooi.
  const deurMat = new THREE.MeshStandardMaterial({ color: '#d7dbe0', metalness: 0.9, roughness: 0.22, envMap: omgeving })
  const deurGeo = new THREE.BoxGeometry(0.62, 2.3, 0.04)
  const landing: THREE.Mesh[][] = [0, 1].map((v) =>
    [-1, 1].map((sx) => {
      const d = new THREE.Mesh(deurGeo, deurMat)
      d.position.set(LX + sx * 0.31, v * Y + 1.15, ZD - 0.02)
      scene.add(d)
      return d
    }),
  )
  // Verdiepaanduiding boven de deuren (beide verdiepen delen de textuur) en oproepknoppen.
  const aanC = document.createElement('canvas')
  aanC.width = 256
  aanC.height = 96
  const aanTex = canvasTex(aanC)
  let laatsteAan = ''
  const tekenAan = (nummer: number, pijl: '▲' | '▼' | '') => {
    const sleutel = `${nummer}${pijl}`
    if (sleutel === laatsteAan) return
    laatsteAan = sleutel
    const g = aanC.getContext('2d')!
    g.fillStyle = '#05070c'
    g.fillRect(0, 0, 256, 96)
    g.fillStyle = '#ff4d3d'
    g.font = '900 72px "Courier New", ui-monospace, monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(nummer), 150, 52)
    g.font = '900 52px Inter, system-ui, sans-serif'
    g.fillText(pijl, 70, 50)
    aanTex.needsUpdate = true
  }
  tekenAan(0, '')
  const aanMat = new THREE.MeshBasicMaterial({ map: aanTex, toneMapped: false })
  for (const v of [0, 1]) {
    const scherm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), aanMat)
    scherm.position.set(LX, v * Y + 2.55, ZD + 0.08)
    const knop = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16).rotateX(Math.PI / 2), mats.licht)
    knop.position.set(LX + 0.95, v * Y + 1.2, ZD + 0.085)
    const knopPlaat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.02), mats.staal)
    knopPlaat.position.set(LX + 0.95, v * Y + 1.2, ZD + 0.075)
    scene.add(scherm, knopPlaat, knop)
  }
  // Bord naast de lift, beneden en boven.
  const liftBordC = document.createElement('canvas')
  liftBordC.width = 512
  liftBordC.height = 192
  {
    const g = liftBordC.getContext('2d')!
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 512, 192)
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 12, 192)
    g.fillStyle = '#ffffff'
    g.font = '800 46px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('🛗 LIFT', 36, 52)
    g.fillStyle = 'rgba(226,232,240,.85)'
    g.font = '600 30px Inter, system-ui, sans-serif'
    g.fillText('0  Hall of Fame', 36, 110)
    g.fillText('1  Loges · Erfgoed', 36, 152)
  }
  const liftBord = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: canvasTex(liftBordC), toneMapped: false }))
  for (const v of [0, 1]) {
    const b = liftBord.clone()
    b.position.set(LX - 1.9, v * Y + 1.75, ZD + 0.02)
    scene.add(b)
  }
  doos(0.04, SCHACHT_H, 0.6, LX - 1.36, SCHACHT_H / 2, ZD - 0.2, mats.staal)

  // De kooi: rijdt met de speler mee.
  const kooi = new THREE.Group()
  const kw = 2.36
  const kd = ZD - Z0 - 0.3
  const kz = Z0 + 0.15 + kd / 2
  const kooiWand = new THREE.MeshStandardMaterial({ color: '#b9bfc6', metalness: 0.8, roughness: 0.35, envMap: omgeving })
  const spiegel = new THREE.MeshStandardMaterial({ color: '#dfe7ee', metalness: 1, roughness: 0.04, envMap: omgeving })
  const deel = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    kooi.add(mesh)
    return mesh
  }
  deel(kw, 0.06, kd, LX, 0.03, kz, mats.donker)
  deel(0.04, 2.4, kd, LX - kw / 2, 1.2, kz, kooiWand)
  deel(0.04, 2.4, kd, LX + kw / 2, 1.2, kz, kooiWand)
  deel(kw, 2.4, 0.04, LX, 1.2, Z0 + 0.17, spiegel)
  deel(kw, 0.05, kd, LX, 2.42, kz, mats.donker)
  deel(kw - 0.4, 0.02, kd - 0.4, LX, 2.39, kz, mats.licht)
  deel(0.05, 0.05, kd - 0.2, LX - kw / 2 + 0.08, 0.95, kz, mats.staal)
  deel(0.05, 0.05, kd - 0.2, LX + kw / 2 - 0.08, 0.95, kz, mats.staal)
  deel(0.2, 0.5, 0.03, LX + kw / 2 - 0.05, 1.25, ZD - 0.35, mats.staal).rotation.y = Math.PI / 2
  const kooiAan = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), aanMat)
  kooiAan.position.set(LX, 2.6 - 0.25, ZD - 0.16)
  kooiAan.rotation.y = Math.PI
  kooi.add(kooiAan)
  const kooiDeuren = [-1, 1].map((sx) => deel(0.6, 2.3, 0.03, LX + sx * 0.3, 1.15, ZD - 0.13, deurMat))
  scene.add(kooi)

  // ---------- de loges ----------
  const randen: number[] = []
  for (let x = LOGE_X0; x <= XL + 0.01; x += (XL - LOGE_X0) / 6) randen.push(x)
  const logeObst: Rechthoek[] = []
  const stoelGeo = mergeGeometries([
    new THREE.BoxGeometry(0.56, 0.14, 0.52).translate(0, 0.46, 0),
    new THREE.BoxGeometry(0.56, 0.6, 0.12).translate(0, 0.78, 0.24),
    new THREE.BoxGeometry(0.08, 0.22, 0.5).translate(-0.29, 0.6, 0),
    new THREE.BoxGeometry(0.08, 0.22, 0.5).translate(0.29, 0.6, 0),
    new THREE.CylinderGeometry(0.04, 0.12, 0.42, 8).translate(0, 0.2, 0),
  ])
  const stoelMats: THREE.Matrix4[] = []
  const aquaria: { x: number; z: number; lang: number; diep: number }[] = []
  const reclames = thema.reclames.map((r) => r.naam).filter(Boolean)
  for (let i = 0; i < 6; i++) {
    const x0 = randen[i]
    const x1 = randen[i + 1]
    const xc = (x0 + x1) / 2
    // Scheidingswanden en de achterwand met een deur.
    if (i > 0) {
      doos(0.15, PLAFOND, zL - zF, x0, Y + PLAFOND / 2, (zF + zL) / 2, mats.wand)
      logeObst.push({ x0: x0 - 0.08, x1: x0 + 0.08, z0: zF, z1: zL })
    }
    for (const [a, b] of [
      [x0, xc - 0.6],
      [xc + 0.6, x1],
    ]) {
      doos(b - a, PLAFOND, 0.15, (a + b) / 2, Y + PLAFOND / 2, zL, mats.hout)
      logeObst.push({ x0: a, x1: b, z0: zL - 0.08, z1: zL + 0.08 })
    }
    doos(1.2, PLAFOND - 2.35, 0.15, xc, Y + 2.35 + (PLAFOND - 2.35) / 2, zL, mats.hout)
    // Deurkader en naambordje in de gang.
    doos(1.34, 0.08, 0.2, xc, Y + 2.37, zL, mats.staal)
    const naamC = document.createElement('canvas')
    naamC.width = 512
    naamC.height = 128
    {
      const g = naamC.getContext('2d')!
      g.fillStyle = '#0b1220'
      g.fillRect(0, 0, 512, 128)
      g.fillStyle = '#c9a063'
      g.fillRect(0, 0, 512, 6)
      g.fillRect(0, 122, 512, 6)
      g.fillStyle = '#e8c98e'
      g.font = '800 44px Georgia, serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(`LOGE ${i + 1}`, 256, 46)
      g.fillStyle = 'rgba(226,232,240,.8)'
      g.font = '600 28px Inter, system-ui, sans-serif'
      g.fillText(reclames.length ? reclames[i % reclames.length] : thema.naam, 256, 94, 480)
    }
    const naam = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshBasicMaterial({ map: canvasTex(naamC), toneMapped: false }))
    naam.position.set(xc + 1.25, Y + 1.7, zL + 0.085)
    scene.add(naam)
    // Twee rijen leren stoelen naar het veld, met een gangpad in het midden.
    const aquarium = i === 1 || i === 4
    const links0 = aquarium ? x0 + 1.25 : x0 + 0.55
    for (const [rz, ry] of [
      [zF + 1.15, 0],
      [zF + 2.15, 0],
    ]) {
      for (const [a, b] of [
        [links0, xc - 0.85],
        [xc + 0.85, x1 - 0.55],
      ]) {
        const n = Math.max(1, Math.floor((b - a) / 0.68))
        for (let k = 0; k < n; k++) {
          const sx = a + 0.34 + k * ((b - a - 0.68) / Math.max(1, n - 1))
          stoelMats.push(new THREE.Matrix4().compose(new THREE.Vector3(n === 1 ? (a + b) / 2 : sx, Y, rz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)))
        }
        logeObst.push({ x0: a, x1: b, z0: rz - 0.3, z1: rz + 0.32 })
      }
    }
    // Een bar met flessen tegen de achterwand, rechts van de deur.
    doos(x1 - 0.3 - (xc + 1.0), 1.0, 0.55, (xc + 1.0 + x1 - 0.3) / 2, Y + 0.5, zL - 0.4, mats.hout)
    doos(x1 - 0.3 - (xc + 1.0) + 0.1, 0.05, 0.62, (xc + 1.0 + x1 - 0.3) / 2, Y + 1.02, zL - 0.4, mats.beton)
    for (let k = 0; k < 5; k++) {
      const fles = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 8), new THREE.MeshStandardMaterial({ color: ['#14532d', '#7c2d12', '#e5e7eb', '#1e3a8a', '#713f12'][k], roughness: 0.15, metalness: 0.1 }))
      fles.position.set(xc + 1.25 + k * 0.28, Y + 1.19, zL - 0.42)
      scene.add(fles)
    }
    logeObst.push({ x0: xc + 1.0, x1: x1 - 0.3, z0: zL - 0.7, z1: zL - 0.1 })
    // Hanglampen boven de rijen.
    for (const lx of [x0 + 2.2, xc, x1 - 2.2]) {
      const kap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 14, 1, true), mats.donker)
      kap.position.set(lx, Y + PLAFOND - 0.7, zF + 1.7)
      const bol = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mats.licht)
      bol.position.set(lx, Y + PLAFOND - 0.8, zF + 1.7)
      scene.add(kap, bol)
    }
    if (aquarium) aquaria.push({ x: x0 + 0.45, z: zF + 2.5, lang: 2.2, diep: 0.6 })
  }
  const stoelen = new THREE.InstancedMesh(stoelGeo, mats.leer, stoelMats.length)
  stoelMats.forEach((m, i) => stoelen.setMatrixAt(i, m))
  scene.add(stoelen)

  // ---------- aquaria ----------
  const vissen: { mesh: THREE.InstancedMesh; staart: THREE.InstancedMesh; bubbels: THREE.InstancedMesh; a: (typeof aquaria)[number]; params: { w: number; f: number; ry: number; rz: number; y: number }[] }[] = []
  const visGeo = new THREE.SphereGeometry(1, 10, 8).scale(0.035, 0.06, 0.1)
  const staartGeo = new THREE.ConeGeometry(0.05, 0.08, 3).rotateX(Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, -0.12)
  const visKleuren = ['#f97316', '#facc15', '#38bdf8', '#f43f5e', '#a3e635', '#ffffff', '#c084fc'].map((c) => new THREE.Color(c))
  for (const a of aquaria) {
    const kast = new THREE.Mesh(new THREE.BoxGeometry(a.diep + 0.1, 0.85, a.lang + 0.1), mats.donker)
    kast.position.set(a.x, Y + 0.425, a.z)
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(a.diep, 0.95, a.lang),
      new THREE.MeshStandardMaterial({ color: '#2d8fd0', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, depthWrite: false, emissive: '#0b4f7a', emissiveIntensity: 0.6 }),
    )
    water.position.set(a.x, Y + 0.85 + 0.475, a.z)
    const zand = new THREE.Mesh(new THREE.BoxGeometry(a.diep - 0.02, 0.06, a.lang - 0.02), new THREE.MeshLambertMaterial({ color: '#e7d3a1' }))
    zand.position.set(a.x, Y + 0.88, a.z)
    const deksel = new THREE.Mesh(new THREE.BoxGeometry(a.diep + 0.06, 0.08, a.lang + 0.06), mats.donker)
    deksel.position.set(a.x, Y + 1.85, a.z)
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(a.diep - 0.1, a.lang - 0.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d6f1ff', toneMapped: false }))
    lamp.position.set(a.x, Y + 1.805, a.z)
    scene.add(kast, zand, deksel, lamp, water)
    // Planten en stenen.
    for (let k = 0; k < 6; k++) {
      const plant = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3 + toeval() * 0.35, 5), new THREE.MeshLambertMaterial({ color: k % 2 ? '#15803d' : '#4d7c0f' }))
      plant.position.set(a.x + (toeval() - 0.5) * (a.diep - 0.15), Y + 1.05 + toeval() * 0.1, a.z + (toeval() - 0.5) * (a.lang - 0.2))
      const steen = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + toeval() * 0.05, 0), new THREE.MeshLambertMaterial({ color: '#78716c' }))
      steen.position.set(a.x + (toeval() - 0.5) * (a.diep - 0.15), Y + 0.93, a.z + (toeval() - 0.5) * (a.lang - 0.2))
      scene.add(plant, steen)
    }
    const n = licht ? 5 : 9
    const mesh = new THREE.InstancedMesh(visGeo, new THREE.MeshLambertMaterial(), n)
    const staart = new THREE.InstancedMesh(staartGeo, new THREE.MeshLambertMaterial(), n)
    for (let k = 0; k < n; k++) {
      const c = visKleuren[k % visKleuren.length]
      mesh.setColorAt(k, c)
      staart.setColorAt(k, c)
    }
    const bubbels = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.7 }), 14)
    mesh.frustumCulled = staart.frustumCulled = bubbels.frustumCulled = false
    scene.add(mesh, staart, bubbels)
    vissen.push({
      mesh,
      staart,
      bubbels,
      a,
      params: Array.from({ length: n }, () => ({ w: 0.25 + toeval() * 0.35, f: toeval() * 6.28, ry: 0.4 + toeval() * 0.35, rz: 0.6 + toeval() * 0.4, y: 0.2 + toeval() * 0.55 })),
    })
    logeObst.push({ x0: a.x - a.diep / 2 - 0.1, x1: a.x + a.diep / 2 + 0.1, z0: a.z - a.lang / 2 - 0.1, z1: a.z + a.lang / 2 + 0.1 })
  }

  // ---------- de erfgoedgang: oude bekers, vaantjes en archieffoto's ----------
  const metalen = [
    new THREE.MeshStandardMaterial({ color: '#b48a3c', metalness: 1, roughness: 0.42, envMap: omgeving }),
    new THREE.MeshStandardMaterial({ color: '#a7aaa8', metalness: 1, roughness: 0.48, envMap: omgeving }),
    new THREE.MeshStandardMaterial({ color: '#8a5a2e', metalness: 1, roughness: 0.5, envMap: omgeving }),
    new THREE.MeshStandardMaterial({ color: '#c0874f', metalness: 1, roughness: 0.4, envMap: omgeving }),
  ]
  const voetMat = new THREE.MeshLambertMaterial({ color: '#3b2414' })
  const vx0 = -20
  const vx1 = XL - 0.6
  const vz = zG - 0.42
  // De vitrine: houten onderkast, glas, een bovenkast met licht en twee legplanken.
  doos(vx1 - vx0, 0.5, 0.75, (vx0 + vx1) / 2, Y + 0.25, vz, mats.hout)
  doos(vx1 - vx0, 0.22, 0.75, (vx0 + vx1) / 2, Y + 2.71, vz, mats.hout)
  doos(vx1 - vx0, 0.03, 0.6, (vx0 + vx1) / 2, Y + 1.55, vz - 0.02, mats.glas)
  doos(vx1 - vx0 - 0.1, 0.02, 0.5, (vx0 + vx1) / 2, Y + 2.58, vz, mats.licht)
  const vitrineGlas = new THREE.Mesh(new THREE.PlaneGeometry(vx1 - vx0, 2.1), mats.glas)
  vitrineGlas.position.set((vx0 + vx1) / 2, Y + 1.55, vz - 0.38)
  vitrineGlas.rotation.y = Math.PI
  scene.add(vitrineGlas)
  const achterC = document.createElement('canvas')
  achterC.width = 64
  achterC.height = 64
  {
    const g = achterC.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 0, 64)
    gr.addColorStop(0, '#5b1d1d')
    gr.addColorStop(1, '#2a0e0e')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  }
  const achter = new THREE.Mesh(new THREE.PlaneGeometry(vx1 - vx0, 2.1), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(achterC), emissive: '#3a1010', emissiveIntensity: 0.4 }))
  achter.position.set((vx0 + vx1) / 2, Y + 1.55, zG - 0.06)
  achter.rotation.y = Math.PI
  scene.add(achter)
  for (let x = vx0; x <= vx1 + 0.01; x += 4) doos(0.05, 2.1, 0.05, x, Y + 1.55, vz - 0.37, mats.staal)
  // Bekers: de oudste prijzen van je club (met een plaatje), aangevuld met archiefstukken.
  const vroeger = opt.vroeger
  const plekken = Math.floor((vx1 - vx0) / 2.4)
  const plaatC = document.createElement('canvas')
  plaatC.width = 2048
  plaatC.height = Math.max(1, Math.ceil(Math.max(1, vroeger.length) / 8)) * 128
  const pg = plaatC.getContext('2d')!
  vroeger.forEach((b, i) => {
    const x = (i % 8) * 256
    const y = Math.floor(i / 8) * 128
    pg.fillStyle = '#c9a063'
    pg.fillRect(x, y, 256, 128)
    pg.fillStyle = '#e8c98e'
    pg.fillRect(x + 6, y + 6, 244, 116)
    pg.fillStyle = '#3b2a06'
    pg.textAlign = 'center'
    pg.textBaseline = 'middle'
    pg.font = '800 34px Georgia, serif'
    pg.fillText(b.jaar, x + 128, y + 40, 236)
    pg.font = '600 22px Georgia, serif'
    pg.fillText(b.kop === 'KAMPIOEN' ? 'Kampioen' : 'Bekerwinnaar', x + 128, y + 76, 236)
    pg.font = 'italic 18px Georgia, serif'
    pg.fillText(b.tekst, x + 128, y + 104, 236)
  })
  const plaatTex = canvasTex(plaatC)
  const rijenPlaat = Math.max(1, Math.ceil(Math.max(1, vroeger.length) / 8))
  for (let k = 0; k < plekken; k++) {
    const x = vx0 + 1.2 + k * 2.4
    const b = vroeger[k]
    const echt = k < vroeger.length
    const schaal = echt ? 1.1 + ((k * 37) % 5) * 0.12 : 0.75 + ((k * 53) % 5) * 0.1
    const beker = oudeBeker(k, metalen[k % metalen.length], voetMat, schaal)
    beker.position.set(x, Y + 0.51, vz)
    scene.add(beker)
    // Een kleinere beker of medaille op de bovenste plank.
    const klein = oudeBeker(k + 2, metalen[(k + 1) % metalen.length], voetMat, 0.55)
    klein.position.set(x + 0.6, Y + 1.57, vz)
    scene.add(klein)
    if (echt && b) {
      const u0 = (k % 8) / 8
      const v1 = 1 - Math.floor(k / 8) / rijenPlaat
      const vlak = new THREE.PlaneGeometry(0.5, 0.25)
      vlak.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u0 + 1 / 8, v1, u0, v1 - 1 / rijenPlaat, u0 + 1 / 8, v1 - 1 / rijenPlaat], 2))
      const plaat = new THREE.Mesh(vlak, new THREE.MeshStandardMaterial({ map: plaatTex, metalness: 0.5, roughness: 0.4, envMap: omgeving }))
      plaat.position.set(x, Y + 0.28, vz - 0.38)
      plaat.rotation.y = Math.PI
      scene.add(plaat)
    }
  }
  logeObst.push({ x0: vx0, x1: vx1, z0: vz - 0.45, z1: zG })
  // Kop boven de vitrine (vanuit de lift het eerste wat je ziet).
  const kopC = document.createElement('canvas')
  kopC.width = 1024
  kopC.height = 192
  const kopTex = canvasTex(kopC)
  const tekenKop = (logo: HTMLImageElement | null) => {
    const g = kopC.getContext('2d')!
    g.fillStyle = '#1a120b'
    g.fillRect(0, 0, 1024, 192)
    g.strokeStyle = '#c9a063'
    g.lineWidth = 6
    g.strokeRect(6, 6, 1012, 180)
    rondLogo(g, logo, thema, 96, 96, 70)
    g.fillStyle = '#e8c98e'
    g.font = '800 54px Georgia, serif'
    g.textBaseline = 'middle'
    g.fillText('WAAR HET BEGON', 196, 70)
    g.fillStyle = 'rgba(232,201,142,.8)'
    g.font = 'italic 30px Georgia, serif'
    g.fillText(vroeger.length ? `De eerste prijzen van ${thema.naam}` : `Het erfgoed van ${thema.naam}`, 196, 132, 800)
    kopTex.needsUpdate = true
  }
  tekenKop(null)
  void opt.logo.then(tekenKop)
  const kop = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.79), new THREE.MeshBasicMaterial({ map: kopTex, toneMapped: false }))
  kop.position.set(-24.5, Y + 2.5, zG - 0.05)
  kop.rotation.y = Math.PI
  scene.add(kop)
  // Vaantjes en archieffoto's aan de gangkant van de loges, tussen de deuren.
  const fotoC = document.createElement('canvas')
  fotoC.width = 256
  fotoC.height = 200
  {
    const g = fotoC.getContext('2d')!
    g.fillStyle = '#efe6d2'
    g.fillRect(0, 0, 256, 200)
    g.fillStyle = '#b8a27c'
    g.fillRect(14, 14, 228, 150)
    const r = rnd(5)
    for (let k = 0; k < 7; k++) {
      const x = 34 + k * 30
      const y = k % 2 ? 70 : 92
      g.fillStyle = '#5e4b33'
      g.beginPath()
      g.arc(x, y, 9, 0, Math.PI * 2)
      g.fill()
      g.fillRect(x - 11, y + 10, 22, 34 + r() * 6)
    }
    g.fillStyle = '#5e4b33'
    g.font = 'italic 20px Georgia, serif'
    g.textAlign = 'center'
    g.fillText('Ploegfoto · archief', 128, 186)
  }
  const fotoMat = new THREE.MeshLambertMaterial({ map: canvasTex(fotoC) })
  const vaanC = document.createElement('canvas')
  vaanC.width = 128
  vaanC.height = 192
  {
    const g = vaanC.getContext('2d')!
    g.fillStyle = thema.primair
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(128, 0)
    g.lineTo(64, 192)
    g.closePath()
    g.fill()
    g.strokeStyle = thema.secundair
    g.lineWidth = 8
    g.stroke()
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 30px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText(thema.kort, 64, 60)
  }
  const vaanMat = new THREE.MeshLambertMaterial({ map: canvasTex(vaanC), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
  for (let i = 0; i < 6; i++) {
    const x0 = randen[i]
    const xc = (x0 + randen[i + 1]) / 2
    for (const [dx, wat] of [
      [-2.4, 'foto'],
      [-3.6, 'vaan'],
      [2.6, 'foto'],
    ] as const) {
      const x = xc + dx
      if (x < x0 + 0.6) continue
      const m = new THREE.Mesh(wat === 'foto' ? new THREE.PlaneGeometry(0.8, 0.625) : new THREE.PlaneGeometry(0.35, 0.52), wat === 'foto' ? fotoMat : vaanMat)
      m.position.set(x, Y + 1.75, zL + 0.085)
      scene.add(m)
      if (wat === 'foto') doos(0.88, 0.7, 0.03, x, Y + 1.75, zL + 0.07, voetMat)
    }
  }
  // In de lobby bij de lift: twee grote oude bekers op een zuil.
  for (const [x, vorm] of [
    [-30.0, 1],
    [-22.4, 3],
  ] as const) {
    const zuil = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.1, 20), new THREE.MeshLambertMaterial({ color: '#e7e2d9' }))
    zuil.position.set(x, Y + 0.55, zL + 1.0)
    const beker = oudeBeker(vorm, metalen[vorm % metalen.length], voetMat, 1.7)
    beker.position.set(x, Y + 1.1, zL + 1.0)
    scene.add(zuil, beker)
    logeObst.push({ x0: x - 0.45, x1: x + 0.45, z0: zL + 0.55, z1: zL + 1.45 })
  }

  // ---------- botsingen ----------
  const schacht: Rechthoek[] = [
    { x0: LX - 1.36, x1: LX - 1.2, z0: Z0, z1: ZD + 0.08 },
    { x0: LX + 1.2, x1: LX + 1.36, z0: Z0, z1: ZD + 0.08 },
    { x0: LX - 1.36, x1: LX - 0.6, z0: ZD - 0.08, z1: ZD + 0.08 },
    { x0: LX + 0.6, x1: LX + 1.36, z0: ZD - 0.08, z1: ZD + 0.08 },
  ]
  const deurRect: Rechthoek = { x0: LX - 0.6, x1: LX + 0.6, z0: ZD - 0.1, z1: ZD + 0.1 }
  const boven: Rechthoek[] = [
    { x0: -400, x1: -XL + 0.05, z0: -400, z1: 400 },
    { x0: XL - 0.05, x1: 400, z0: -400, z1: 400 },
    { x0: -400, x1: 400, z0: -400, z1: zF + 0.45 },
    { x0: -400, x1: 400, z0: zG - 0.1, z1: 400 },
    { x0: -XL, x1: LX - 1.36, z0: zF, z1: ZD + 0.08 },
    { x0: LX + 1.36, x1: LOGE_X0, z0: zF, z1: ZD + 0.08 },
    { x0: LOGE_X0 - 0.08, x1: LOGE_X0 + 0.08, z0: zF, z1: zL },
    ...logeObst,
  ]

  // ---------- update ----------
  let lift: Lift = nieuweLift()
  const binnenKooi = (x: number, z: number) => Math.abs(x - LX) < 1.05 && z > Z0 + 0.2 && z < ZD - 0.1
  const bijDeur = (x: number, z: number) => Math.abs(x - LX) < 1.9 && z >= ZD && z < ZD + 2.8
  const visM = new THREE.Matrix4()
  const visQ = new THREE.Quaternion()
  const visP = new THREE.Vector3()
  const visS = new THREE.Vector3(1, 1, 1)
  const as = new THREE.Vector3(0, 1, 0)

  return {
    lift: { x: LX, z: ZD + 1 },
    obstakels(verdiep) {
      const dicht = deurOp(lift, verdiep) < 0.95
      return verdiep === 1 ? (dicht ? [...boven, ...schacht, deurRect] : [...boven, ...schacht]) : dicht ? [...schacht, deurRect] : schacht
    },
    update(seconden, dt, speler) {
      const r = liftStap(lift, dt, {
        verdiep: speler.verdiep,
        inKooi: speler.actief && binnenKooi(speler.x, speler.z),
        bijDeur: speler.actief && bijDeur(speler.x, speler.z),
      })
      lift = r.lift
      // Deuren, kooi en verdiepaanduiding.
      for (const v of [0, 1] as const) {
        const o = deurOp(lift, v)
        landing[v][0].position.x = LX - 0.31 - o * 0.62
        landing[v][1].position.x = LX + 0.31 + o * 0.62
      }
      kooi.position.y = lift.hoogte * Y
      const ko = lift.toestand === 'rijden' ? 0 : lift.deur
      kooiDeuren[0].position.x = LX - 0.3 - ko * 0.6
      kooiDeuren[1].position.x = LX + 0.3 + ko * 0.6
      const pijl = lift.toestand === 'rijden' ? (lift.doel === 1 ? '▲' : '▼') : ''
      tekenAan(lift.toestand === 'rijden' ? Math.round(lift.hoogte) : liftVerdiep(lift), pijl)
      // Visjes: zwemmen in lussen door de bak, kijken in hun zwemrichting, met een wiebelende staart.
      for (const v of vissen) {
        v.params.forEach((p, k) => {
          const t = seconden * p.w + p.f
          const x = v.a.x + Math.sin(t * 1.3) * (v.a.diep / 2 - 0.1) * 0.8
          const z = v.a.z + Math.sin(t) * (v.a.lang / 2 - 0.15) * p.rz
          const y = Y + 0.95 + p.y + Math.sin(t * 2.1) * 0.05
          const dx = Math.cos(t * 1.3) * 1.3 * (v.a.diep / 2 - 0.1) * 0.8
          const dz = Math.cos(t) * (v.a.lang / 2 - 0.15) * p.rz
          visQ.setFromAxisAngle(as, Math.atan2(dx, dz) + Math.sin(seconden * 9 + k) * 0.12)
          visP.set(x, y, z)
          visM.compose(visP, visQ, visS)
          v.mesh.setMatrixAt(k, visM)
          visQ.setFromAxisAngle(as, Math.atan2(dx, dz) + Math.sin(seconden * 9 + k + 1) * 0.5)
          visM.compose(visP, visQ, visS)
          v.staart.setMatrixAt(k, visM)
        })
        v.mesh.instanceMatrix.needsUpdate = true
        v.staart.instanceMatrix.needsUpdate = true
        for (let k = 0; k < 14; k++) {
          const t = (seconden * 0.35 + k / 14) % 1
          visM.makeTranslation(v.a.x - v.a.diep / 4 + (k % 3) * 0.02, Y + 0.95 + t * 0.85, v.a.z + v.a.lang / 2 - 0.2 + Math.sin(t * 20 + k) * 0.01)
          v.bubbels.setMatrixAt(k, visM)
        }
        v.bubbels.instanceMatrix.needsUpdate = true
      }
      return { aangekomen: r.aangekomen, vloer: r.spelerHoogte != null ? r.spelerHoogte * Y : null }
    },
  }
}
