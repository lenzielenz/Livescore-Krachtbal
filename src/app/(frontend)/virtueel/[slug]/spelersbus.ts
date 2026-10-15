import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import type { Rechthoek, StadionThema } from '@/lib/virtueel'
import { canvasTex, rondLogo } from './stadion'

// De spelersbus naast de kleedkamers: een luxe touringcar in clubkleuren, met geblindeerde ramen.
// Je kan instappen (de voordeur staat open) en binnen rondwandelen: VIP-zetels in een 1+1-opstelling
// met een middengang, een sterrenhemel in het plafond, ledstrips in clubkleur, bagagerekken, en
// achteraan een lounge met zetels in U-vorm, een tafel en een koelkast. Aan het plafond hangen
// schermen die de wedstrijd in het stadion live tonen: een tv-camera boven het veld volgt de bal,
// en dat beeld komt op de schermen (enkel getekend als je in de bus zit).
//
// Gebouwd in een eigen assenstelsel: de bus ligt langs x (de neus naar -x), de deurkant is -z.
// De groep staat op (x, z) in de wereld.

export type Spelersbus = {
  obstakels: Rechthoek[]
  /** Hoe hoog je hier staat (de vloer van de bus, met de treden aan de deur), 0 buiten. */
  vloer: (x: number, z: number) => number
  /** Sta je in de bus? */
  binnen: (x: number, z: number) => boolean
  /** Het tv-beeld van de wedstrijd: tekent de scène vanuit de tv-camera op de schermen. */
  tv: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, kijk: THREE.Vector3) => void
  update: (seconden: number) => void
}

const L = 13.2 // lengte
const B = 2.55 // breedte
const H = 3.75 // hoogte
const F = 1.05 // vloer binnen
const BODEM = 0.38
const RAAM = { y0: 1.7, y1: 2.95 }
const DEUR = { x0: -6.3, x1: -5.25 }
const RIJEN = 6
const RIJ0 = -4.0
const PITCH = 1.05

export function bouwSpelersbus(scene: THREE.Scene, opt: { thema: StadionThema; x: number; z: number; renderer: THREE.WebGLRenderer; logo: Promise<HTMLImageElement | null>; licht: boolean }): Spelersbus {
  const { thema } = opt
  const groep = new THREE.Group()
  groep.position.set(opt.x, 0, opt.z)
  scene.add(groep)
  let omgeving: THREE.Texture | null = null
  try {
    const pm = new THREE.PMREMGenerator(opt.renderer)
    omgeving = pm.fromScene(new RoomEnvironment(), 0.04).texture
    pm.dispose()
  } catch {
    omgeving = null
  }
  const primair = new THREE.Color(thema.primair)
  const donkerPrimair = primair.clone().multiplyScalar(0.45)
  const mat = {
    lak: new THREE.MeshStandardMaterial({ color: '#0d0f14', metalness: 0.6, roughness: 0.22, envMap: omgeving, envMapIntensity: 1.2 }),
    glas: new THREE.MeshStandardMaterial({ color: '#05070b', metalness: 0.9, roughness: 0.06, envMap: omgeving, envMapIntensity: 1.6, transparent: true, opacity: 0.86, side: THREE.DoubleSide }),
    voorruit: new THREE.MeshStandardMaterial({ color: '#0b1220', metalness: 0.9, roughness: 0.05, envMap: omgeving, envMapIntensity: 1.4, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
    chroom: new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 1, roughness: 0.15, envMap: omgeving, envMapIntensity: 1.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.85 }),
    zwart: new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.6 }),
    leder: new THREE.MeshStandardMaterial({ color: donkerPrimair, roughness: 0.42, envMap: omgeving, envMapIntensity: 0.35, emissive: donkerPrimair, emissiveIntensity: 0.25 }),
    lederZwart: new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.45, envMap: omgeving, envMapIntensity: 0.3, emissive: '#0a0b0e', emissiveIntensity: 0.4 }),
    led: new THREE.MeshBasicMaterial({ color: primair, toneMapped: false }),
    wit: new THREE.MeshBasicMaterial({ color: '#fff6e0', toneMapped: false }),
    binnenWand: new THREE.MeshStandardMaterial({ color: '#1c1f26', roughness: 0.7, emissive: '#0d0f13', emissiveIntensity: 0.6, side: THREE.DoubleSide }),
  }
  const tekst = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    teken(c.getContext('2d')!)
    return canvasTex(c)
  }
  const doos = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, ouder: THREE.Object3D = groep) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    ouder.add(mesh)
    return mesh
  }
  /** Een vlak op een zijkant, met de uv's van dat stuk binnen de hele zijkant (voor de belettering). */
  const zijVlak = (x0: number, x1: number, y0: number, y1: number, kant: -1 | 1, m: THREE.Material, uvY: [number, number] = [BODEM, RAAM.y0]) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) {
      const u = (x0 + uv.getX(i) * (x1 - x0) + L / 2) / L
      const v = (y0 + uv.getY(i) * (y1 - y0) - uvY[0]) / (uvY[1] - uvY[0])
      // De deurkant (-z) kijkt de andere kant op: daar loopt de tekst gespiegeld in u.
      uv.setXY(i, kant < 0 ? 1 - u : u, v)
    }
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (kant * B) / 2)
    mesh.rotation.y = kant < 0 ? Math.PI : 0
    groep.add(mesh)
    return mesh
  }

  // ================= buitenkant =================
  // De belettering op de flanken: clubkleur, een zwierige streep, de clubnaam en het logo.
  const flankC = document.createElement('canvas')
  flankC.width = 2048
  flankC.height = 256
  const flankTex = canvasTex(flankC)
  flankTex.anisotropy = 8
  const tekenFlank = (logo: HTMLImageElement | null) => {
    const g = flankC.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 2048, 0)
    gr.addColorStop(0, '#08090c')
    gr.addColorStop(0.35, thema.primair)
    gr.addColorStop(1, '#08090c')
    g.fillStyle = gr
    g.fillRect(0, 0, 2048, 256)
    // Een zwierige streep in de tweede clubkleur, met een gouden lijntje.
    for (const [dy, kleur, dikte] of [
      [0, thema.secundair, 22],
      [26, '#d4af37', 5],
    ] as const) {
      g.strokeStyle = kleur
      g.lineWidth = dikte
      g.beginPath()
      g.moveTo(0, 210 + dy)
      g.bezierCurveTo(600, 230 + dy, 900, 40 + dy, 2048, 60 + dy)
      g.stroke()
    }
    g.fillStyle = '#ffffff'
    g.font = '900 108px Inter, "Arial Black", system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.shadowColor = 'rgba(0,0,0,.5)'
    g.shadowBlur = 10
    g.fillText(thema.naam.toUpperCase(), 520, 120, 1300)
    g.shadowBlur = 0
    g.fillStyle = '#d4af37'
    g.font = '800 34px Inter, system-ui, sans-serif'
    g.fillText('TEAM BUS  ·  KRACHTBAL', 528, 196)
    rondLogo(g, logo, thema, 300, 128, 100)
    flankTex.needsUpdate = true
  }
  tekenFlank(null)
  const flank = new THREE.MeshStandardMaterial({ map: flankTex, metalness: 0.45, roughness: 0.25, envMap: omgeving, envMapIntensity: 1.0 })
  // Onderste deel van de flanken (met de deuropening aan de -z-kant), de ramen, de bovenrand.
  zijVlak(-L / 2, L / 2, BODEM, RAAM.y0, 1, flank)
  zijVlak(-L / 2, DEUR.x0, BODEM, RAAM.y0, -1, flank)
  zijVlak(DEUR.x1, L / 2, BODEM, RAAM.y0, -1, flank)
  for (const kant of [-1, 1] as const) {
    const ramen = kant < 0 ? [[DEUR.x1 + 0.05, L / 2 - 0.35]] : [[-L / 2 + 1.1, L / 2 - 0.35]]
    for (const [a, b] of ramen) zijVlak(a, b, RAAM.y0, RAAM.y1, kant, mat.glas)
    // De bovenrand: zwart gelakt, met een dun gouden lijntje.
    zijVlak(kant < 0 ? DEUR.x0 : -L / 2, L / 2, RAAM.y1, H - 0.05, kant, mat.lak)
    doos(L - 0.4, 0.025, 0.02, 0.1, RAAM.y1 + 0.06, (kant * B) / 2 + kant * 0.012, new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 1, roughness: 0.25, envMap: omgeving }))
    // Raamstijlen.
    for (let x = -L / 2 + 2.6; x < L / 2 - 0.5; x += 1.55) if (kant > 0 || x > DEUR.x1 + 0.2) doos(0.07, RAAM.y1 - RAAM.y0, 0.02, x, (RAAM.y0 + RAAM.y1) / 2, (kant * B) / 2 + kant * 0.012, mat.lak)
    // Achterste zijruitje, dicht.
    zijVlak(L / 2 - 0.35, L / 2, RAAM.y0, RAAM.y1, kant, mat.lak)
  }
  // De zijkant bij de chauffeur (+z, vooraan): een klein raam.
  zijVlak(-L / 2, -L / 2 + 1.1, RAAM.y0, RAAM.y1, 1, mat.voorruit)
  // Boven de deur.
  zijVlak(DEUR.x0, DEUR.x1, 2.95, RAAM.y1, -1, mat.lak)
  zijVlak(-L / 2, DEUR.x0, RAAM.y0, RAAM.y1, -1, mat.voorruit)
  // Dak met een airco-bult.
  doos(L - 0.1, 0.1, B - 0.04, 0, H - 0.05, 0, mat.lak)
  doos(3.2, 0.22, 1.5, 1.8, H + 0.1, 0, mat.lak)
  // De neus: een grote, licht getinte voorruit, de grille met ledkoplampen, het logo.
  const voorkant = new THREE.Group()
  voorkant.position.x = -L / 2
  voorkant.rotation.y = -Math.PI / 2
  groep.add(voorkant)
  const vr = new THREE.Mesh(new THREE.PlaneGeometry(B - 0.12, 1.75), mat.voorruit)
  vr.position.set(0, 2.45, 0.02)
  vr.rotation.x = -0.06
  voorkant.add(vr)
  const neusC = tekst(512, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256)
    gr.addColorStop(0, thema.primair)
    gr.addColorStop(1, '#08090c')
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 256)
    g.fillStyle = '#0b0c10'
    g.beginPath()
    g.roundRect(70, 120, 372, 90, 18)
    g.fill()
    g.strokeStyle = '#9ca3af'
    g.lineWidth = 3
    for (let y = 135; y < 205; y += 12) {
      g.beginPath()
      g.moveTo(90, y)
      g.lineTo(422, y)
      g.stroke()
    }
  })
  const neus = new THREE.Mesh(new THREE.PlaneGeometry(B, 1.2), new THREE.MeshStandardMaterial({ map: neusC, metalness: 0.4, roughness: 0.3, envMap: omgeving }))
  neus.position.set(0, BODEM + 0.6, 0.01)
  voorkant.add(neus)
  for (const sx of [-1, 1]) {
    const kop = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.12), mat.wit)
    kop.position.set(sx * 0.92, BODEM + 0.48, 0.03)
    voorkant.add(kop)
    const dagrij = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.025), mat.wit)
    dagrij.position.set(sx * 0.92, BODEM + 0.58, 0.03)
    voorkant.add(dagrij)
  }
  // Het bestemmingsbord boven de voorruit: oranje leds.
  const bestemming = tekst(1024, 128, (g) => {
    g.fillStyle = '#050505'
    g.fillRect(0, 0, 1024, 128)
    g.fillStyle = '#ffae00'
    g.font = '900 72px "Courier New", ui-monospace, monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(`★ ${thema.naam.toUpperCase()} ★`, 512, 68, 990)
    g.fillStyle = 'rgba(0,0,0,.5)'
    for (let x = 0; x < 1024; x += 5) g.fillRect(x, 0, 1.5, 128)
    for (let y = 0; y < 128; y += 5) g.fillRect(0, y, 1024, 1.5)
  })
  const best = new THREE.Mesh(new THREE.PlaneGeometry(B - 0.3, 0.26), new THREE.MeshBasicMaterial({ map: bestemming, toneMapped: false }))
  best.position.set(0, H - 0.28, 0.03)
  voorkant.add(best)
  const neusLogo = tekst(256, 256, (g) => rondLogo(g, null, thema, 128, 128, 120))
  const nl = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), new THREE.MeshBasicMaterial({ map: neusLogo, transparent: true }))
  nl.position.set(0, BODEM + 0.95, 0.03)
  voorkant.add(nl)
  // Spiegels in "ramshoorn"-vorm.
  for (const sz of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-L / 2 + 0.05, 3.1, (sz * B) / 2 - sz * 0.15), new THREE.Vector3(-L / 2 - 0.35, 3.2, (sz * B) / 2 + sz * 0.1), new THREE.Vector3(-L / 2 - 0.45, 2.75, (sz * B) / 2 + sz * 0.2)]), 12, 0.03, 6),
      mat.lak,
    )
    groep.add(arm)
    doos(0.12, 0.42, 0.24, -L / 2 - 0.47, 2.55, (sz * B) / 2 + sz * 0.2, mat.lak)
  }
  // De achterkant: logo, de clubnaam en achterlichten.
  const achterC = tekst(512, 512, (g) => {
    g.fillStyle = '#08090c'
    g.fillRect(0, 0, 512, 512)
    rondLogo(g, null, thema, 256, 200, 130)
    g.fillStyle = '#ffffff'
    g.font = '900 46px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText(thema.naam.toUpperCase(), 256, 400, 480)
  })
  const achter = new THREE.Mesh(new THREE.PlaneGeometry(B, H - BODEM - 0.1), new THREE.MeshStandardMaterial({ map: achterC, metalness: 0.4, roughness: 0.3, envMap: omgeving }))
  achter.position.set(L / 2, (H + BODEM) / 2, 0)
  achter.rotation.y = Math.PI / 2
  groep.add(achter)
  for (const sz of [-1, 1]) doos(0.03, 0.9, 0.12, L / 2 + 0.01, 1.2, sz * (B / 2 - 0.12), new THREE.MeshBasicMaterial({ color: '#dc2626', toneMapped: false }))
  // Bodemrok, wielkasten en wielen (vooraan één as, achteraan een dubbele).
  doos(L - 0.3, 0.2, B - 0.06, 0, BODEM - 0.1, 0, mat.zwart)
  const band = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 28).rotateX(Math.PI / 2)
  const velg = new THREE.CylinderGeometry(0.32, 0.32, 0.34, 20).rotateX(Math.PI / 2)
  for (const x of [-L / 2 + 2.3, L / 2 - 3.6, L / 2 - 2.3])
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(band, mat.rubber)
      w.position.set(x, 0.52, sz * (B / 2 - 0.2))
      const v = new THREE.Mesh(velg, mat.chroom)
      v.position.copy(w.position)
      v.position.z += sz * 0.01
      const kast = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.02, 24, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), mat.zwart)
      kast.position.set(x, 0.52, (sz * B) / 2 + sz * 0.005)
      groep.add(w, v, kast)
    }
  // De voordeur: opengeklapte glazen deurbladen, en treden.
  for (const [x, ry] of [
    [DEUR.x0 + 0.05, 0.25],
    [DEUR.x1 - 0.05, -0.25],
  ]) {
    const blad = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.45), mat.glas)
    blad.position.set(x, BODEM + 1.25, -B / 2 - 0.2)
    blad.rotation.y = Math.PI / 2 + ry
    groep.add(blad)
  }
  for (let k = 0; k < 3; k++) {
    const y = BODEM + 0.02 + k * ((F - BODEM) / 3)
    doos(DEUR.x1 - DEUR.x0, 0.06, 0.32, (DEUR.x0 + DEUR.x1) / 2, y, -B / 2 + 0.16 + k * 0.22, mat.zwart)
    doos(DEUR.x1 - DEUR.x0, 0.012, 0.02, (DEUR.x0 + DEUR.x1) / 2, y + 0.035, -B / 2 + 0.02 + k * 0.22, mat.led)
  }
  // Een rode loper voor de deur.
  const loper = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8b0e1e', roughness: 0.95 }))
  loper.position.set((DEUR.x0 + DEUR.x1) / 2, 0.012, -B / 2 - 1.7)
  groep.add(loper)

  // ================= binnenkant =================
  const binnenB = B - 0.12
  // Vloer: donkere houten planken, met een ledlijn langs de gang.
  const vloerC = tekst(256, 256, (g) => {
    for (let y = 0; y < 256; y += 32) {
      const v = 40 + ((y * 7) % 30)
      g.fillStyle = `rgb(${v + 20},${v + 8},${v})`
      g.fillRect(0, y, 256, 31)
      g.fillStyle = 'rgba(0,0,0,.25)'
      g.fillRect(0, y + 31, 256, 1)
      g.fillRect(((y * 37) % 256) | 0, y, 1, 32)
    }
  })
  vloerC.wrapS = vloerC.wrapT = THREE.RepeatWrapping
  vloerC.repeat.set(L / 2, B / 2)
  const vloer = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.1, binnenB).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: vloerC, roughness: 0.5, envMap: omgeving, envMapIntensity: 0.3, emissive: '#1a120a', emissiveIntensity: 0.4 }))
  vloer.position.y = F
  groep.add(vloer)
  for (const sz of [-1, 1]) doos(L - 2, 0.01, 0.02, 0.4, F + 0.006, sz * 0.5, mat.led)
  // Binnenwanden (onder de ramen) en het plafond met een sterrenhemel.
  for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, RAAM.y0 - F), mat.binnenWand)
    w.position.set(0, (F + RAAM.y0) / 2, sz * (B / 2 - 0.04))
    groep.add(w)
  }
  const sterren = tekst(1024, 256, (g) => {
    g.fillStyle = '#05060a'
    g.fillRect(0, 0, 1024, 256)
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 1024
      const y = Math.random() * 256
      const r = Math.random() * 1.6 + 0.4
      g.fillStyle = `rgba(255,248,230,${0.4 + Math.random() * 0.6})`
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
  })
  const plafond = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, 1.3).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: sterren, toneMapped: false }))
  plafond.position.y = H - 0.18
  groep.add(plafond)
  // Bagagerekken met een ledstrip in clubkleur eronder.
  for (const sz of [-1, 1]) {
    doos(L - 2.2, 0.05, 0.5, 0.3, H - 0.55, sz * (B / 2 - 0.3), mat.lederZwart)
    doos(L - 2.2, 0.3, 0.03, 0.3, H - 0.4, sz * (B / 2 - 0.55), mat.lederZwart)
    doos(L - 2.2, 0.015, 0.02, 0.3, H - 0.585, sz * (B / 2 - 0.54), mat.led)
    const plafondRand = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.2, 0.5).rotateX(Math.PI / 2), mat.binnenWand)
    plafondRand.position.set(0, H - 0.2, sz * (B / 2 - 0.25))
    groep.add(plafondRand)
  }
  // De chauffeurscabine: stoel, stuur en dashboard, achter een tussenwand.
  doos(0.9, 0.5, binnenB * 0.5, -L / 2 + 0.75, F + 0.55, 0.55, mat.zwart)
  const stuur = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 28), mat.zwart)
  stuur.position.set(-L / 2 + 0.85, F + 0.95, 0.6)
  stuur.rotation.y = Math.PI / 2
  stuur.rotation.x = 0.5
  groep.add(stuur)
  doos(0.55, 0.5, 0.55, -L / 2 + 1.45, F + 0.25, 0.6, mat.lederZwart)
  doos(0.12, 0.75, 0.55, -L / 2 + 1.7, F + 0.75, 0.6, mat.lederZwart)
  doos(0.05, 1.4, binnenB / 2 + 0.1, -5.15, F + 0.7, 0.62, mat.lederZwart)
  // De VIP-zetels: 1+1, in leder in clubkleur, met een hoofdsteun met het logo.
  const hoofdC = tekst(128, 128, (g) => {
    g.fillStyle = '#f5f5f4'
    g.fillRect(0, 0, 128, 128)
    rondLogo(g, null, thema, 64, 64, 40)
  })
  const hoofdMat = new THREE.MeshStandardMaterial({ map: hoofdC, roughness: 0.8 })
  const zetel = (x: number, z: number) => {
    const g = new THREE.Group()
    g.position.set(x, F, z)
    doos(0.62, 0.14, 0.6, 0, 0.42, 0, mat.leder, g)
    doos(0.5, 0.36, 0.08, 0, 0.18, 0.0, mat.chroom, g).scale.set(0.2, 1, 1)
    const rug = doos(0.14, 0.8, 0.6, 0.3, 0.88, 0, mat.leder, g)
    rug.rotation.z = -0.18
    const hoofd = doos(0.1, 0.24, 0.42, 0.37, 1.38, 0, mat.leder, g)
    hoofd.rotation.z = -0.18
    const hoes = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), hoofdMat)
    hoes.position.set(0.31, 1.38, 0)
    hoes.rotation.y = -Math.PI / 2
    hoes.rotation.x = 0
    hoes.rotateX(0)
    g.add(hoes)
    for (const sz of [-1, 1]) doos(0.5, 0.06, 0.07, 0.02, 0.62, sz * 0.32, mat.lederZwart, g)
    groep.add(g)
  }
  for (let r = 0; r < RIJEN; r++)
    for (const sz of [-1, 1]) zetel(RIJ0 + r * PITCH, sz * 0.86)
  // De lounge achteraan: zetels in U-vorm, een tafel, een koelkast en een sfeerlicht.
  const LX0 = RIJ0 + RIJEN * PITCH + 0.35
  for (const sz of [-1, 1]) {
    doos(L / 2 - LX0 - 0.6, 0.42, 0.62, (LX0 + L / 2 - 0.6) / 2, F + 0.21, sz * (binnenB / 2 - 0.31), mat.lederZwart)
    doos(L / 2 - LX0 - 0.6, 0.55, 0.14, (LX0 + L / 2 - 0.6) / 2, F + 0.6, sz * (binnenB / 2 - 0.07), mat.lederZwart)
  }
  doos(0.62, 0.42, binnenB - 0.1, L / 2 - 0.45, F + 0.21, 0, mat.lederZwart)
  doos(0.14, 0.55, binnenB - 0.1, L / 2 - 0.19, F + 0.6, 0, mat.lederZwart)
  const tafelX = (LX0 + L / 2 - 0.8) / 2 + 0.3
  doos(0.9, 0.04, 0.6, tafelX, F + 0.72, 0, new THREE.MeshStandardMaterial({ color: '#2b1a0e', roughness: 0.25, envMap: omgeving, envMapIntensity: 0.6 }))
  doos(0.08, 0.7, 0.08, tafelX, F + 0.36, 0, mat.chroom)
  for (let k = 0; k < 3; k++) {
    const fles = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), new THREE.MeshStandardMaterial({ color: ['#22c55e', '#38bdf8', '#f97316'][k], transparent: true, opacity: 0.85, roughness: 0.1, envMap: omgeving }))
    fles.position.set(tafelX - 0.2 + k * 0.2, F + 0.84, -0.1 + k * 0.08)
    groep.add(fles)
  }
  doos(0.5, 0.85, 0.45, LX0 + 0.25, F + 0.43, -(binnenB / 2 - 0.25), mat.zwart)
  doos(0.36, 0.6, 0.01, LX0 + 0.25, F + 0.5, -(binnenB / 2 - 0.48), new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.55, toneMapped: false }))
  // Ledstrips in clubkleur langs de vloer van de lounge.
  for (const sz of [-1, 1]) doos(L / 2 - LX0 - 0.6, 0.01, 0.02, (LX0 + L / 2 - 0.6) / 2, F + 0.005, sz * (binnenB / 2 - 0.65), mat.led)

  // ================= de schermen met de wedstrijd =================
  const tvRT = new THREE.WebGLRenderTarget(opt.licht ? 384 : 640, opt.licht ? 216 : 360, { colorSpace: THREE.SRGBColorSpace })
  const tvCam = new THREE.PerspectiveCamera(26, 16 / 9, 0.5, 400)
  const scherm = (x: number, y: number, z: number, ry: number, b: number) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.rotation.y = ry
    doos(b + 0.06, (b * 9) / 16 + 0.06, 0.05, 0, 0, -0.03, mat.zwart, g)
    const beeld = new THREE.Mesh(new THREE.PlaneGeometry(b, (b * 9) / 16), new THREE.MeshBasicMaterial({ map: tvRT.texture, toneMapped: false }))
    g.add(beeld)
    const balk = new THREE.Mesh(new THREE.PlaneGeometry(b * 0.5, b * 0.05), new THREE.MeshBasicMaterial({ map: liveBalk, transparent: true, toneMapped: false }))
    balk.position.set(-b * 0.22, ((b * 9) / 16) * 0.4, 0.004)
    g.add(balk)
    groep.add(g)
  }
  const liveBalk = tekst(512, 52, (g) => {
    g.fillStyle = 'rgba(8,10,16,.85)'
    g.beginPath()
    g.roundRect(0, 0, 512, 52, 10)
    g.fill()
    g.fillStyle = '#ef4444'
    g.beginPath()
    g.arc(26, 26, 10, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = '800 28px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText(`LIVE · ${thema.naam}`, 48, 28, 450)
  })
  // Vooraan boven de gang (naar achter gericht), twee aan het plafond, en één in de lounge.
  scherm(-4.85, F + 2.15, 0, Math.PI / 2, 1.0)
  scherm(-1.4, F + 2.2, 0, Math.PI / 2, 0.72)
  scherm(1.8, F + 2.2, 0, Math.PI / 2, 0.72)
  scherm(L / 2 - 0.12, F + 1.75, 0, -Math.PI / 2, 1.1)
  for (const x of [-1.4, 1.8]) doos(0.03, 0.2, 0.03, x - 0.02, F + 2.48, 0, mat.chroom)

  void opt.logo.then((logo) => {
    tekenFlank(logo)
    for (const [tex, w, h, r, cy] of [
      [neusLogo, 256, 256, 120, 128],
      [hoofdC, 128, 128, 40, 64],
    ] as const) {
      const g = (tex.image as HTMLCanvasElement).getContext('2d')!
      if (tex === hoofdC) {
        g.fillStyle = '#f5f5f4'
        g.fillRect(0, 0, w, h)
      } else g.clearRect(0, 0, w, h)
      rondLogo(g, logo, thema, w / 2, cy, r)
      tex.needsUpdate = true
    }
    const g = (achterC.image as HTMLCanvasElement).getContext('2d')!
    rondLogo(g, logo, thema, 256, 200, 130)
    achterC.needsUpdate = true
  })

  // ================= botsingen, vloer =================
  const lokaal: Rechthoek[] = [
    // De wanden: de deurkant met een opening, de andere kant, de neus en de achterkant.
    { x0: -L / 2, x1: DEUR.x0, z0: -B / 2 - 0.02, z1: -B / 2 + 0.04 },
    { x0: DEUR.x1, x1: L / 2, z0: -B / 2 - 0.02, z1: -B / 2 + 0.04 },
    { x0: -L / 2, x1: L / 2, z0: B / 2 - 0.04, z1: B / 2 + 0.02 },
    { x0: -L / 2 - 0.05, x1: -L / 2 + 0.05, z0: -B / 2, z1: B / 2 },
    { x0: L / 2 - 0.05, x1: L / 2 + 0.05, z0: -B / 2, z1: B / 2 },
    // De chauffeur en zijn tussenwand.
    { x0: -L / 2, x1: -5.15, z0: -0.15, z1: B / 2 },
    // De zetels (per kant één blok), de lounge en de tafel.
    { x0: RIJ0 - 0.32, x1: RIJ0 + (RIJEN - 1) * PITCH + 0.45, z0: -B / 2, z1: -0.55 },
    { x0: RIJ0 - 0.32, x1: RIJ0 + (RIJEN - 1) * PITCH + 0.45, z0: 0.55, z1: B / 2 },
    { x0: LX0, x1: L / 2, z0: -B / 2, z1: -(binnenB / 2 - 0.62) },
    { x0: LX0, x1: L / 2, z0: binnenB / 2 - 0.62, z1: B / 2 },
    { x0: L / 2 - 0.76, x1: L / 2, z0: -B / 2, z1: B / 2 },
    { x0: tafelX - 0.45, x1: tafelX + 0.45, z0: -0.3, z1: 0.3 },
  ]
  // Wielen en spiegels houden je buiten tegen (de bus zelf doen de wanden).
  const obstakels = lokaal.map((r) => ({ x0: r.x0 + opt.x, x1: r.x1 + opt.x, z0: r.z0 + opt.z, z1: r.z1 + opt.z }))
  const binnenLok = (x: number, z: number) => Math.abs(x) < L / 2 && Math.abs(z) < B / 2
  let tvTel = 0
  return {
    obstakels,
    binnen: (x, z) => binnenLok(x - opt.x, z - opt.z),
    vloer(wx, wz) {
      const x = wx - opt.x
      const z = wz - opt.z
      if (Math.abs(x) > L / 2 + 0.2) return 0
      // De treden aan de deur: van de stoep (z = -B/2 - 0.3) tot de vloer (z = -B/2 + 0.7).
      if (x > DEUR.x0 - 0.2 && x < DEUR.x1 + 0.2 && z < -B / 2 + 0.7 && z > -B / 2 - 0.3) return Math.max(0, Math.min(F, ((z + B / 2 + 0.3) / 1.0) * F))
      return binnenLok(x, z) ? F : 0
    },
    tv(renderer, sc, kijk) {
      // Om het andere beeld is genoeg (het blijft vloeiend genoeg voor een tv in een bus).
      if (++tvTel % 2) return
      // Een hoge camera boven de hoofdtribune, die de bal volgt (zoals een echte tv-regie).
      tvCam.position.set(kijk.x * 0.6 - 3, 10.5, 16.5)
      tvCam.lookAt(kijk.x, 0.8, kijk.z)
      const vorig = renderer.getRenderTarget()
      const zichtbaar = groep.visible
      groep.visible = false
      renderer.setRenderTarget(tvRT)
      renderer.render(sc, tvCam)
      renderer.setRenderTarget(vorig)
      groep.visible = zichtbaar
    },
    update(seconden) {
      if (!groep.visible) return
      mat.led.color.copy(primair).multiplyScalar(0.75 + 0.25 * Math.sin(seconden * 1.4))
    },
  }
}
