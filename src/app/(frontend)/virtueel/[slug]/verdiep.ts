import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { GEVEL, VERDIEP_RAMEN, type EreBord, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { VERDIEPEN } from '@/lib/virtueel-lift'
import { rondeDoos } from './rond'
import { canvasTex, rnd, rondLogo } from './stadion'

// Het verdiep boven de Hall of Fame-gang (zuid), bereikbaar met de lift (lift.ts):
//  • loges met een glazen gevel boven de zuidtribune: van hogerop naar de wedstrijd kijken, in
//    leren stoelen in clubkleur, met een bar; in twee loges een aquarium met zwemmende visjes;
//  • een erfgoedgang: de eerste prijzen van je club, als oude bekers in alle vormen en maten in
//    een lange vitrine, met vaantjes en archieffoto's aan de muur; boven elke beker een verlicht
//    museumbordje met groot het jaar en wat er gewonnen werd;
//  • ramen in de gevel om naar buiten te kijken, en een glazen deur naar een klein balkon.

export const VERDIEP_Y = VERDIEPEN[2].y
const PLAFOND = 3.4
const LX = -26 // midden van de lift
const LOGE_X0 = -23
const XL = 31

export type Verdiep = {
  /** Waar je boven niet door kan (muren, loges, meubels); de liftschacht zit in lift.ts. */
  obstakels: Rechthoek[]
  /** Sta je op (of in de deur naar) het balkon? Daar mag je voorbij de gevel. */
  opBalkon: (x: number, z: number) => boolean
  update: (seconden: number) => void
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
  const ZD = opt.tribuneZ + 2.6 // de liftdeuren
  const primair = new THREE.Color(thema.primair)
  const toeval = rnd(8080)

  const mats = {
    beton: new THREE.MeshLambertMaterial({ color: '#c9ccd2' }),
    wand: new THREE.MeshLambertMaterial({ color: '#e7e2d9' }),
    donker: new THREE.MeshLambertMaterial({ color: '#1f2530' }),
    staal: new THREE.MeshStandardMaterial({ color: '#c8ccd1', metalness: 0.85, roughness: 0.3, emissive: '#30343a', emissiveIntensity: 0.4 }),
    club: new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.15 }),
    leer: new THREE.MeshStandardMaterial({ color: primair.clone().multiplyScalar(0.75), roughness: 0.32, metalness: 0.08, emissive: primair.clone().multiplyScalar(0.12) }),
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

  // ---------- de loges ----------
  const ledMat = new THREE.MeshBasicMaterial({ color: thema.primair, toneMapped: false })
  const lichtPlasMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const kleedC = document.createElement('canvas')
  kleedC.width = kleedC.height = 256
  {
    const g = kleedC.getContext('2d')!
    g.fillStyle = '#1b1f27'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = thema.primair
    g.lineWidth = 10
    g.strokeRect(14, 14, 228, 228)
    g.strokeStyle = 'rgba(232,201,142,.5)'
    g.lineWidth = 3
    g.strokeRect(30, 30, 196, 196)
  }
  const kleedMat = new THREE.MeshLambertMaterial({ map: canvasTex(kleedC) })
  const tvC = document.createElement('canvas')
  tvC.width = 512
  tvC.height = 288
  {
    const g = tvC.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 512, 288)
    gr.addColorStop(0, '#0f5132')
    gr.addColorStop(1, '#14532d')
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 288)
    g.strokeStyle = 'rgba(255,255,255,.6)'
    g.lineWidth = 3
    g.strokeRect(40, 40, 432, 208)
    g.beginPath()
    g.moveTo(256, 40)
    g.lineTo(256, 248)
    g.stroke()
    g.fillStyle = '#0b1220'
    g.fillRect(14, 12, 220, 44)
    g.fillStyle = '#ef4444'
    g.fillRect(14, 12, 64, 44)
    g.fillStyle = '#fff'
    g.font = '900 26px Inter, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('LIVE', 22, 35)
    g.fillText(thema.kort, 90, 35)
  }
  const tvMat = new THREE.MeshBasicMaterial({ map: canvasTex(tvC), toneMapped: false })
  const randen: number[] = []
  for (let x = LOGE_X0; x <= XL + 0.01; x += (XL - LOGE_X0) / 6) randen.push(x)
  const logeObst: Rechthoek[] = []
  // Afgeronde leren clubzetels: een dik zitkussen, een hoge rugleuning en armleuningen.
  const zonderUv = (g: THREE.BufferGeometry) => {
    const n = g.index ? g.toNonIndexed() : g
    n.deleteAttribute('uv')
    return n
  }
  const stoelGeo = mergeGeometries(
    [
      // Eén ring in de afronding: met 92 stoelen in de loges (die je vanop het plein door de
      // ramen ziet) was dit ± 115.000 driehoeken; nu een kwart daarvan.
      rondeDoos(0.58, 0.16, 0.54, 0.06, 1).translate(0, 0.47, 0),
      rondeDoos(0.58, 0.66, 0.14, 0.06, 1).translate(0, 0.82, 0.25),
      rondeDoos(0.09, 0.26, 0.52, 0.04, 1).translate(-0.3, 0.6, 0),
      rondeDoos(0.09, 0.26, 0.52, 0.04, 1).translate(0.3, 0.6, 0),
      new THREE.CylinderGeometry(0.04, 0.13, 0.42, 8).translate(0, 0.2, 0),
    ].map(zonderUv),
  )
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
    // De upgrade: een ledlijn in clubkleur langs het plafond, een tapijt onder de zetels, een
    // scherm met de wedstrijd aan de zijwand, champagne op de bar en wandlampjes.
    doos(x1 - x0 - 0.2, 0.04, 0.04, xc, Y + PLAFOND - 0.06, zL - 0.12, ledMat)
    for (const wx of [x0 + 0.1, x1 - 0.1]) doos(0.04, 0.04, zL - zF - 0.3, wx, Y + PLAFOND - 0.06, (zF + zL) / 2, ledMat)
    const kleed = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 1.0, 2.0).rotateX(-Math.PI / 2), kleedMat)
    kleed.position.set(xc, Y + 0.008, zF + 1.65)
    scene.add(kleed)
    if (!aquarium) {
      const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), tvMat)
      tv.position.set(x0 + 0.14, Y + 2.0, zF + 2.4)
      tv.rotation.y = Math.PI / 2
      scene.add(tv)
      doos(0.05, 0.92, 1.58, x0 + 0.08, Y + 2.0, zF + 2.4, mats.donker)
    }
    const emmer = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.24, 18), mats.staal)
    emmer.position.set(x1 - 0.6, Y + 1.17, zL - 0.42)
    const fles = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.34, 10), new THREE.MeshStandardMaterial({ color: '#0f3d1f', roughness: 0.15 }))
    fles.position.set(x1 - 0.6, Y + 1.3, zL - 0.42)
    fles.rotation.z = 0.25
    scene.add(emmer, fles)
    for (let k = 0; k < 2; k++) {
      const glas = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.012, 0.16, 10, 1, true), mats.glas)
      glas.position.set(x1 - 0.9 - k * 0.12, Y + 1.13, zL - 0.35)
      scene.add(glas)
    }
    for (const wx of [xc - 2.4, xc + 2.4]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.licht)
      lamp.position.set(wx, Y + 2.3, zL - 0.09)
      lamp.rotation.x = -Math.PI / 2
      scene.add(lamp)
      const plas = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), lichtPlasMat)
      plas.position.set(wx, Y + 2.25, zL - 0.077)
      plas.rotation.y = Math.PI
      scene.add(plas)
    }
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
  // Bekers: de oudste prijzen van je club (met een bordje), aangevuld met archiefstukken.
  const vroeger = opt.vroeger
  const plekken = Math.floor((vx1 - vx0) / 2.4)
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
      // Een groot museumbordje onder de beker: groot wanneer, en wat er gewonnen werd.
      const lc = document.createElement('canvas')
      lc.width = 768
      lc.height = 220
      const g = lc.getContext('2d')!
      g.fillStyle = 'rgba(16,12,8,.92)'
      g.fillRect(0, 0, 768, 220)
      g.fillStyle = '#c9a063'
      g.fillRect(0, 0, 768, 8)
      g.fillRect(0, 212, 768, 8)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = '#f5d48f'
      g.font = '900 86px Georgia, serif'
      g.fillText(b.jaar, 384, 80, 740)
      g.fillStyle = '#ffffff'
      g.font = '800 46px Inter, system-ui, sans-serif'
      g.fillText(`${b.kop === 'KAMPIOEN' ? '🏆 Kampioen' : '🥇 Bekerwinnaar'}${b.tekst ? ' · ' + b.tekst : ''}`, 384, 168, 740)
      // Op de voorkant van de onderkast, onder de beker: niets staat ervoor.
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.46), new THREE.MeshBasicMaterial({ map: canvasTex(lc), toneMapped: false }))
      label.position.set(x, Y + 0.25, vz - 0.385)
      label.rotation.y = Math.PI
      scene.add(label)
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

  // ---------- ramen in de gevel, en het balkon ----------
  const kader = new THREE.MeshStandardMaterial({ color: '#2a2f38', metalness: 0.7, roughness: 0.35 })
  const ruitGlas = new THREE.MeshStandardMaterial({ color: '#cfe9ff', transparent: true, opacity: 0.12, metalness: 0.2, roughness: 0.04, depthWrite: false, side: THREE.DoubleSide })
  const balkonRaam = VERDIEP_RAMEN.find((r) => r.balkon)!
  for (const r of VERDIEP_RAMEN) {
    const w = r.x1 - r.x0
    const xm = (r.x0 + r.x1) / 2
    const y0 = r.y0
    const y1 = r.y1
    // Het kader rondom (binnen- en buitenkant), en een vensterbank.
    doos(w + 0.24, 0.12, 1.3, xm, y1 + 0.06, B, kader)
    for (const sx of [-1, 1]) doos(0.12, y1 - y0, 1.3, xm + sx * (w / 2 + 0.06), (y0 + y1) / 2, B, kader)
    if (!r.balkon) {
      doos(w + 0.24, 0.08, 1.4, xm, y0 - 0.02, B, mats.beton)
      const glas = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), ruitGlas)
      glas.position.set(xm, (y0 + y1) / 2, B + 0.1)
      scene.add(glas)
      doos(0.05, y1 - y0, 0.06, xm, (y0 + y1) / 2, B + 0.1, kader)
    } else {
      // Een opengeschoven glazen schuifdeur.
      const deur = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, y1 - y0 - 0.05), ruitGlas)
      deur.position.set(r.x0 + w * 0.25 + 0.05, (y0 + y1) / 2, B - 0.45)
      scene.add(deur)
      doos(0.06, y1 - y0, 0.06, r.x0 + w * 0.5 + 0.05, (y0 + y1) / 2, B - 0.45, kader)
      doos(w, 0.04, 1.2, xm, y0 + 0.01, B, mats.beton)
    }
  }
  // Het balkon: een vloerplaat die uit de gevel steekt, met een glazen balustrade en een
  // stalen leuning, een bistrotafeltje met twee stoeltjes en een plant.
  const BX0 = balkonRaam.x0 - 0.5
  const BX1 = balkonRaam.x1 + 0.5
  const BZ0 = B + 0.6
  const BZ1 = B + 2.4
  doos(BX1 - BX0, 0.22, BZ1 - BZ0 + 0.1, (BX0 + BX1) / 2, Y - 0.11, (BZ0 + BZ1) / 2 - 0.05, mats.beton)
  const balkVloer = new THREE.Mesh(new THREE.PlaneGeometry(BX1 - BX0, BZ1 - BZ0).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: (() => {
    const t = hout()
    t.repeat.set(1.5, 1)
    return t
  })() }))
  balkVloer.position.set((BX0 + BX1) / 2, Y + 0.005, (BZ0 + BZ1) / 2)
  scene.add(balkVloer)
  const balustrade = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const glas = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), ruitGlas)
    glas.position.set((ax + bx) / 2, Y + 0.55, (az + bz) / 2)
    glas.rotation.y = -Math.atan2(bz - az, bx - ax)
    scene.add(glas)
    const leuning = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 10).rotateZ(Math.PI / 2), mats.staal)
    leuning.position.set((ax + bx) / 2, Y + 1.08, (az + bz) / 2)
    leuning.rotation.y = -Math.atan2(bz - az, bx - ax)
    scene.add(leuning)
  }
  balustrade(BX0, BZ1, BX1, BZ1)
  balustrade(BX0, BZ0, BX0, BZ1)
  balustrade(BX1, BZ0, BX1, BZ1)
  const tafel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20), mats.staal)
  tafel.position.set(BX1 - 0.6, Y + 0.74, BZ1 - 0.55)
  const poot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.15, 0.74, 10), mats.donker)
  poot.position.set(BX1 - 0.6, Y + 0.37, BZ1 - 0.55)
  scene.add(tafel, poot)
  for (const dx of [-0.45, 0.42]) {
    const st = new THREE.Mesh(rondeDoos(0.4, 0.06, 0.4, 0.03), mats.leer)
    st.position.set(BX1 - 0.6 + dx, Y + 0.46, BZ1 - 0.6)
    const rug = new THREE.Mesh(rondeDoos(0.4, 0.4, 0.05, 0.03), mats.leer)
    rug.position.set(BX1 - 0.6 + dx + Math.sign(dx) * 0.18, Y + 0.68, BZ1 - 0.6)
    rug.rotation.y = Math.PI / 2
    scene.add(st, rug)
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 16), mats.donker)
  pot.position.set(BX0 + 0.35, Y + 0.21, BZ1 - 0.4)
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1).scale(1, 1.4, 1), new THREE.MeshLambertMaterial({ color: '#15803d', emissive: '#052e16', emissiveIntensity: 0.4 }))
  plant.position.set(BX0 + 0.35, Y + 0.8, BZ1 - 0.4)
  scene.add(pot, plant)
  const opBalkon = (x: number, z: number) =>
    (z > zG - 0.5 && z <= BZ0 && x > balkonRaam.x0 + 0.4 && x < balkonRaam.x1 - 0.4) || (z > BZ0 - 0.05 && z < BZ1 - 0.4 && x > BX0 + 0.35 && x < BX1 - 0.35 && !(x > BX1 - 1.3 && z > BZ1 - 1.0))

  // ---------- botsingen (de liftschacht zelf zit in lift.ts) ----------
  const boven: Rechthoek[] = [
    { x0: -400, x1: -XL + 0.05, z0: -400, z1: 400 },
    { x0: XL - 0.05, x1: 400, z0: -400, z1: 400 },
    { x0: -400, x1: 400, z0: -400, z1: zF + 0.45 },
    // De gevelkant, met een doorgang naar het balkon.
    { x0: -400, x1: balkonRaam.x0 + 0.4, z0: zG - 0.1, z1: 400 },
    { x0: balkonRaam.x1 - 0.4, x1: 400, z0: zG - 0.1, z1: 400 },
    { x0: -XL, x1: LX - 1.36, z0: zF, z1: ZD + 0.08 },
    { x0: LX + 1.36, x1: LOGE_X0, z0: zF, z1: ZD + 0.08 },
    { x0: LOGE_X0 - 0.08, x1: LOGE_X0 + 0.08, z0: zF, z1: zL },
    ...logeObst,
  ]

  // ---------- update ----------
  const visM = new THREE.Matrix4()
  const visQ = new THREE.Quaternion()
  const visP = new THREE.Vector3()
  const visS = new THREE.Vector3(1, 1, 1)
  const as = new THREE.Vector3(0, 1, 0)

  return {
    obstakels: boven,
    opBalkon,
    update(seconden) {
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
    },
  }
}
