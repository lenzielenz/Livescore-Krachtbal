import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, inPoort, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { canvasTex, rnd, rondLogo } from './stadion'

// De buitenkant van het stadion: zodat wie rondkijkt of rondwandelt het gevoel heeft dat dit zíjn
// stadion is. Een gevel rondom met lamellen in de clubkleuren en een doorlopende ledband met de
// clubnaam, een hoofdingang met luifel, draaihekken, ticketkiosken en "STADION <club>", het
// clublogo op de gevels, een plein met vlaggen, lantaarns en supporters die naar binnen stappen,
// een clubhuis, een parking en bomen.
//
// Zelfde regels als binnen (zie stadion.ts): herhaalde dingen zijn InstancedMeshes, vaste
// bouwdelen samengevoegde geometrie, beweging (vlaggen, wandelaars) gebeurt in de vertex-shader.

export type Omgeving = {
  update: (seconden: number) => void
  obstakels: Rechthoek[]
  /** Waar "Buiten" begint: op het plein, met de hoofdingang voor je. */
  start: { x: number; z: number; yaw: number }
}

type PuntOpGevel = { x: number; z: number; nx: number; nz: number; s: number }

/** De omtrek van de gevel als punten om de `stap` meter, met de normaal naar buiten. */
function gevelOmtrek(stap: number): PuntOpGevel[] {
  const { A, B, R } = GEVEL
  const pts: PuntOpGevel[] = []
  const add = (x: number, z: number, nx: number, nz: number) => pts.push({ x, z, nx, nz, s: 0 })
  const lijn = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / stap))
    for (let i = 0; i < n; i++) add(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, nx, nz)
  }
  const boog = (cx: number, cz: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.round((R * Math.abs(a1 - a0)) / stap))
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      add(cx + R * Math.cos(a), cz + R * Math.sin(a), Math.cos(a), Math.sin(a))
    }
  }
  lijn(0, B, A - R, B, 0, 1)
  boog(A - R, B - R, Math.PI / 2, 0)
  lijn(A, B - R, A, -(B - R), 1, 0)
  boog(A - R, -(B - R), 0, -Math.PI / 2)
  lijn(A - R, -B, -(A - R), -B, 0, -1)
  boog(-(A - R), -(B - R), -Math.PI / 2, -Math.PI)
  lijn(-A, -(B - R), -A, B - R, -1, 0)
  boog(-(A - R), B - R, Math.PI, Math.PI / 2)
  lijn(-(A - R), B, 0, B, 0, 1)
  let s = 0
  pts.forEach((p, i) => {
    if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z)
    p.s = s
  })
  return pts
}

/** Een doos tussen twee punten op de grond (voor muurstukken). */
function muurStuk(a: { x: number; z: number }, b: { x: number; z: number }, y0: number, y1: number, dik: number): THREE.BufferGeometry {
  const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.05
  const g = new THREE.BoxGeometry(len, y1 - y0, dik)
  g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x))
  g.translate((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2)
  return g
}

function tekstCanvas(w: number, h: number, teken: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  return c
}

/** Laat elke instantie langs haar eigen +z heen en weer (wandelen) of in de wind (vlaggen) bewegen. */
function metTijd(mat: THREE.Material, tijd: { value: number }, code: string): THREE.Material {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTijd = tijd
    sh.vertexShader = 'uniform float uTijd;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`)
  }
  return mat
}

export function bouwOmgeving(scene: THREE.Scene, opt: { thema: StadionThema; licht: boolean; logo: Promise<HTMLImageElement | null> }): Omgeving {
  const { thema, licht } = opt
  const { A, B, hoogte: H } = GEVEL
  const toeval = rnd(9090)
  const tijd = { value: 0 }
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)
  const obstakels: Rechthoek[] = []

  const gevelMat = new THREE.MeshLambertMaterial({ color: '#1e2633' })
  const betonMat = new THREE.MeshLambertMaterial({ color: '#6b7280' })
  const metaal = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.6, roughness: 0.4 })

  // ---------- grond: plein, toegangsweg, straat en parking ----------
  const tegels = tekstCanvas(256, 256, (g) => {
    g.fillStyle = '#3f4652'
    g.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 256; y += 32)
      for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
        const v = 58 + Math.floor(toeval() * 14)
        g.fillStyle = `rgb(${v},${v + 4},${v + 12})`
        g.fillRect(x + 1, y + 1, 30, 30)
      }
  })
  const tegelTex = canvasTex(tegels)
  tegelTex.wrapS = tegelTex.wrapT = THREE.RepeatWrapping
  const pleinB = 2 * (A + 20)
  const pleinD = 2 * (B + 22)
  tegelTex.repeat.set(pleinB / 8, pleinD / 8)
  const plein = new THREE.Mesh(new THREE.PlaneGeometry(pleinB, pleinD), new THREE.MeshLambertMaterial({ map: tegelTex }))
  plein.rotation.x = -Math.PI / 2
  plein.position.y = -0.01
  plein.receiveShadow = !licht
  scene.add(plein)

  const asfalt = new THREE.MeshLambertMaterial({ color: '#23272e' })
  const straatTex = canvasTex(
    tekstCanvas(64, 512, (g) => {
      g.fillStyle = '#23272e'
      g.fillRect(0, 0, 64, 512)
      g.fillStyle = '#e5e7eb'
      for (let y = 0; y < 512; y += 128) g.fillRect(29, y, 6, 64)
    }),
  )
  straatTex.wrapS = straatTex.wrapT = THREE.RepeatWrapping
  straatTex.repeat.set(1, 30)
  const straat = new THREE.Mesh(new THREE.PlaneGeometry(9, 320), new THREE.MeshLambertMaterial({ map: straatTex }))
  straat.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
  straat.position.set(0, 0, B + 30)
  scene.add(straat)
  // Parking aan de oostkant.
  const pX0 = A + 24
  const parking = new THREE.Mesh(new THREE.PlaneGeometry(40, 60), asfalt)
  parking.rotation.x = -Math.PI / 2
  parking.position.set(pX0 + 20, 0.005, -4)
  scene.add(parking)

  // ---------- de gevel ----------
  const omtrek = gevelOmtrek(2)
  const muren: THREE.BufferGeometry[] = []
  const POORT_H = 5.5
  for (let i = 0; i < omtrek.length; i++) {
    const a = omtrek[i]
    const b = omtrek[(i + 1) % omtrek.length]
    const mx = (a.x + b.x) / 2
    const mz = (a.z + b.z) / 2
    // In een poort enkel de latei erboven; elders de volle muur.
    muren.push(muurStuk(a, b, inPoort(GEVEL, mx + a.nx * 0.1, mz + a.nz * 0.1) ? POORT_H : 0, H + 0.4, 1.2))
  }
  const gevel = new THREE.Mesh(mergeGeometries(muren), gevelMat)
  scene.add(gevel)

  // Lamellen voor de muur, in de clubkleuren (3 × primair, 1 × secundair), zacht oplichtend.
  const lamelPunten = gevelOmtrek(1.5).filter((p) => !inPoort(GEVEL, p.x + p.nx, p.z + p.nz))
  const lamelGeo = new THREE.BoxGeometry(0.3, H - 3.2, 0.9).translate(0, (H - 3.2) / 2 + 0.2, 0)
  const lamellen = new THREE.InstancedMesh(lamelGeo, new THREE.MeshLambertMaterial({ emissive: primair, emissiveIntensity: 0.18 }), lamelPunten.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const een = new THREE.Vector3(1, 1, 1)
  lamelPunten.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.nx, p.nz))
    m4.compose(new THREE.Vector3(p.x + p.nx * 1.0, 0, p.z + p.nz * 1.0), q, een)
    lamellen.setMatrixAt(i, m4)
    lamellen.setColorAt(i, i % 4 === 3 ? secundair : primair)
  })
  scene.add(lamellen)

  // Doorlopende ledband bovenaan met de clubnaam, als één lint rond het hele stadion.
  const bandTekst = `${thema.naam.toUpperCase()}   ★   `
  const bandC = tekstCanvas(2048, 128, (g) => {
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 2048, 128)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 84px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    const w = g.measureText(bandTekst).width
    const herhaal = Math.max(1, Math.floor(2048 / w))
    const ruimte = 2048 / herhaal
    for (let i = 0; i < herhaal; i++) g.fillText(bandTekst, i * ruimte + (ruimte - w) / 2, 70)
  })
  const bandTex = canvasTex(bandC)
  bandTex.wrapS = THREE.RepeatWrapping
  const bandPunten = gevelOmtrek(1)
  const bandLengte = bandPunten.at(-1)!.s + 1
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const y0 = H - 2.6
  const y1 = H - 0.4
  // Een geheel aantal herhalingen rond het stadion, anders is er een naad waar het lint sluit.
  const perHerhaling = bandLengte / Math.max(1, Math.round(bandLengte / 34))
  bandPunten.concat([{ ...bandPunten[0], s: bandLengte }]).forEach((p, i) => {
    const x = p.x + p.nx * 1.5
    const z = p.z + p.nz * 1.5
    pos.push(x, y0, z, x, y1, z)
    const u = p.s / perHerhaling
    uv.push(u, 0, u, 1)
    if (i > 0) {
      const k = i * 2
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1)
    }
  })
  const bandGeo = new THREE.BufferGeometry()
  bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  bandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  bandGeo.setIndex(idx)
  const band = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({ map: bandTex, toneMapped: false, side: THREE.DoubleSide }))
  scene.add(band)

  // Binnenkant: een warme lichtlijn langs de gevel, zodat de gangen achter de tribunes niet in het
  // donker liggen.
  const lijnPos: number[] = []
  const lijnIdx: number[] = []
  bandPunten.concat([bandPunten[0]]).forEach((p, i) => {
    const x = p.x - p.nx * 0.65
    const z = p.z - p.nz * 0.65
    lijnPos.push(x, 4.3, z, x, 4.6, z)
    if (i > 0) {
      const k = i * 2
      lijnIdx.push(k - 2, k, k - 1, k - 1, k, k + 1)
    }
  })
  const lijnGeo = new THREE.BufferGeometry()
  lijnGeo.setAttribute('position', new THREE.Float32BufferAttribute(lijnPos, 3))
  lijnGeo.setIndex(lijnIdx)
  scene.add(new THREE.Mesh(lijnGeo, new THREE.MeshBasicMaterial({ color: '#ffe6b0', toneMapped: false, side: THREE.DoubleSide })))


  // ---------- hoofdingang (zuid) ----------
  const luifel = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 7), gevelMat)
  luifel.position.set(0, POORT_H + 0.3, B + 3.6)
  const luifelLicht = new THREE.Mesh(new THREE.PlaneGeometry(19, 6.4), new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false }))
  luifelLicht.rotation.x = Math.PI / 2
  luifelLicht.position.set(0, POORT_H + 0.04, B + 3.6)
  const luifelRand = new THREE.Mesh(new THREE.BoxGeometry(20.2, 0.6, 0.3), new THREE.MeshBasicMaterial({ color: primair, toneMapped: false }))
  luifelRand.position.set(0, POORT_H + 0.3, B + 7.15)
  scene.add(luifel, luifelLicht, luifelRand)
  for (const x of [-9.4, 9.4]) {
    const zuil = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, POORT_H, 10), metaal)
    zuil.position.set(x, POORT_H / 2, B + 6.8)
    scene.add(zuil)
  }
  // Draaihekken in de poort.
  const hekGeo = mergeGeometries([new THREE.BoxGeometry(0.35, 1.1, 1.2).translate(0, 0.55, 0), new THREE.BoxGeometry(0.9, 0.05, 0.05).translate(0.5, 0.95, 0)])
  const hekken = new THREE.InstancedMesh(hekGeo, metaal, 9)
  for (let i = 0; i < 9; i++) {
    m4.makeTranslation(-6 + i * 1.5, 0, B)
    hekken.setMatrixAt(i, m4)
  }
  scene.add(hekken)

  // Het grote bord boven de ingang: logo + "STADION <club>"; logo's op de andere gevels.
  const bordC = document.createElement('canvas')
  bordC.width = 1024
  bordC.height = 256
  const bordTex = canvasTex(bordC)
  const tekenBord = (logo: HTMLImageElement | null) => {
    const g = bordC.getContext('2d')!
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 1024, 256)
    g.fillStyle = thema.primair
    g.fillRect(0, 226, 1024, 30)
    rondLogo(g, logo, thema, 128, 116, 92)
    g.fillStyle = 'rgba(255,255,255,.7)'
    g.font = '800 38px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('STADION', 248, 70)
    g.fillStyle = '#ffffff'
    g.font = '900 88px Inter, system-ui, sans-serif'
    g.fillText(thema.naam.toUpperCase(), 248, 150, 750)
    bordTex.needsUpdate = true
  }
  tekenBord(null)
  const ingangBord = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), new THREE.MeshBasicMaterial({ map: bordTex, toneMapped: false }))
  ingangBord.position.set(0, POORT_H + 3.1, B + 0.75)
  scene.add(ingangBord)

  const logoC = document.createElement('canvas')
  logoC.width = logoC.height = 512
  const logoTex = canvasTex(logoC)
  const tekenLogo = (logo: HTMLImageElement | null) => {
    const g = logoC.getContext('2d')!
    g.clearRect(0, 0, 512, 512)
    rondLogo(g, logo, thema, 256, 256, 240)
    logoTex.needsUpdate = true
  }
  tekenLogo(null)
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false })
  for (const [x, z, ry, r] of [[0, -B - 1.6, Math.PI, 5], [A + 1.6, 9, Math.PI / 2, 3.6], [-A - 1.6, 9, -Math.PI / 2, 3.6]] as const) {
    const schijf = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r), logoMat)
    schijf.position.set(x, 6.4, z)
    schijf.rotation.y = ry
    scene.add(schijf)
  }
  void opt.logo.then((logo) => {
    tekenBord(logo)
    tekenLogo(logo)
  })

  // Ticketkiosken naast de ingang.
  const kioskC = tekstCanvas(256, 64, (g) => {
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 256, 64)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 40px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('TICKETS', 128, 34)
  })
  const kioskBord = new THREE.MeshBasicMaterial({ map: canvasTex(kioskC), toneMapped: false })
  for (const x of [-14, 14]) {
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 2.4), new THREE.MeshLambertMaterial({ color: '#e5e7eb' }))
    kiosk.position.set(x, 1.4, B + 3)
    const raam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1), new THREE.MeshBasicMaterial({ color: '#fde68a', toneMapped: false }))
    raam.position.set(x, 1.5, B + 4.21)
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), kioskBord)
    bord.position.set(x, 2.55, B + 4.22)
    scene.add(kiosk, raam, bord)
    obstakels.push({ x0: x - 1.7, x1: x + 1.7, z0: B + 1.8, z1: B + 4.2 })
  }

  // ---------- vlaggen in de clubkleuren langs de toegang ----------
  const vlagC = tekstCanvas(256, 160, (g) => {
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 256, 160)
    g.fillStyle = thema.secundair
    g.fillRect(0, 60, 256, 40)
    g.fillStyle = thema.primair
    g.font = '900 34px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(thema.kort, 128, 82)
  })
  const vlagPos: [number, number][] = []
  for (let z = B + 10; z <= B + 24; z += 7) for (const x of [-11, 11]) vlagPos.push([x, z])
  for (const x of [-30, -22, 22, 30]) vlagPos.push([x, B + 9])
  const vlagGeo = new THREE.PlaneGeometry(2.6, 1.6, 12, 4).translate(1.3, 0, 0)
  const vlagMat = metTijd(
    new THREE.MeshLambertMaterial({ map: canvasTex(vlagC), side: THREE.DoubleSide }),
    tijd,
    `float golfV = sin(uTijd * 3.2 + position.x * 2.1 + instanceMatrix[3][0]) * 0.22 * (position.x / 2.6);
     transformed.z += golfV; transformed.y -= (position.x / 2.6) * 0.08;`,
  )
  const vlaggen = new THREE.InstancedMesh(vlagGeo, vlagMat, vlagPos.length)
  const masten = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 6).translate(0, 4.5, 0), metaal, vlagPos.length)
  vlagPos.forEach(([x, z], i) => {
    m4.makeTranslation(x, 7.9, z)
    vlaggen.setMatrixAt(i, m4)
    m4.makeTranslation(x, 0, z)
    masten.setMatrixAt(i, m4)
  })
  vlaggen.frustumCulled = false
  scene.add(vlaggen, masten)

  // ---------- lantaarns rond het plein ----------
  const lampPos: [number, number][] = []
  const lampOmtrek = gevelOmtrek(16)
  for (const p of lampOmtrek) {
    const x = p.x + p.nx * 12
    const z = p.z + p.nz * 12
    // Niet midden in de toegang naar de hoofdingang.
    if (!(z > B && Math.abs(x) < 14)) lampPos.push([x, z])
  }
  for (let x = -140; x <= 140; x += 20) lampPos.push([x, B + 35.5])
  const palen = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 6).translate(0, 3, 0), new THREE.MeshLambertMaterial({ color: '#374151' }), lampPos.length)
  const kappen = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8).translate(0, 6.05, 0), new THREE.MeshBasicMaterial({ color: '#fff1c4', toneMapped: false }), lampPos.length)
  const gloedPos = new Float32Array(lampPos.length * 3)
  lampPos.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z)
    palen.setMatrixAt(i, m4)
    kappen.setMatrixAt(i, m4)
    gloedPos.set([x, 6.05, z], i * 3)
  })
  const gloedC = tekstCanvas(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,236,190,.9)')
    gr.addColorStop(1, 'rgba(255,236,190,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  })
  const gloedGeo = new THREE.BufferGeometry()
  gloedGeo.setAttribute('position', new THREE.BufferAttribute(gloedPos, 3))
  const gloed = new THREE.Points(gloedGeo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(gloedC), size: 4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  scene.add(palen, kappen, gloed)
  // Een warme lichtplas onder elke lantaarn (geen echte lampen: die zijn duur), op het plein.
  const plasGeo = new THREE.CircleGeometry(4.5, 24)
  plasGeo.rotateX(-Math.PI / 2)
  const plasC = tekstCanvas(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,220,160,.35)')
    gr.addColorStop(1, 'rgba(255,220,160,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  })
  const plassen = new THREE.InstancedMesh(plasGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(plasC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), lampPos.length)
  lampPos.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0.02, z)
    plassen.setMatrixAt(i, m4)
  })
  scene.add(plassen)

  // ---------- supporters die naar de ingang stappen ----------
  const aantal = licht ? 70 : 170
  const wandelGeo = mergeGeometries([new THREE.CylinderGeometry(0.17, 0.2, 0.75, 7).translate(0, 1.0, 0), new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5).translate(0.09, 0.35, 0), new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5).translate(-0.09, 0.35, 0)])
  const hoofdGeo = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.52, 0)
  // Elke wandelaar loopt langs zijn eigen +z, 34 m lang, en begint dan opnieuw achteraan.
  const wandel = `float faseW = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    float afstand = mod(uTijd * (1.1 + faseW * 0.5) + faseW * 34.0, 34.0);
    transformed.z += afstand;
    transformed.y += abs(sin(uTijd * 7.0 + faseW * 6.28)) * 0.06;`
  const lijven = new THREE.InstancedMesh(wandelGeo, metTijd(new THREE.MeshLambertMaterial(), tijd, wandel), aantal)
  const hoofden = new THREE.InstancedMesh(hoofdGeo, metTijd(new THREE.MeshLambertMaterial(), tijd, wandel), aantal)
  const neutraal = ['#1f2937', '#e5e7eb', '#374151', '#0f172a', '#334155'].map((c) => new THREE.Color(c))
  const huid = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'].map((c) => new THREE.Color(c))
  for (let i = 0; i < aantal; i++) {
    // Start op de straat, richting de hoofdingang (naar -z): rotatie π laat +z naar -z wijzen.
    const x = (toeval() - 0.5) * 22
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + (toeval() - 0.5) * 0.12)
    m4.compose(new THREE.Vector3(x, 0, B + 36), q, new THREE.Vector3(1, 0.9 + toeval() * 0.2, 1))
    lijven.setMatrixAt(i, m4)
    hoofden.setMatrixAt(i, m4)
    const k = toeval()
    lijven.setColorAt(i, k < 0.6 ? primair : k < 0.8 ? secundair : neutraal[Math.floor(toeval() * neutraal.length)])
    hoofden.setColorAt(i, huid[Math.floor(toeval() * huid.length)])
  }
  lijven.frustumCulled = false
  hoofden.frustumCulled = false
  scene.add(lijven, hoofden)

  // ---------- clubhuis (west) ----------
  const chX = -A - 22
  const chZ = 14
  const clubhuis = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 11), new THREE.MeshLambertMaterial({ color: '#d6d3d1' }))
  clubhuis.position.set(chX, 2.5, chZ)
  const dak = new THREE.Mesh(new THREE.BoxGeometry(21, 0.5, 12), gevelMat)
  dak.position.set(chX, 5.25, chZ)
  const ramenC = tekstCanvas(512, 64, (g) => {
    g.fillStyle = '#1f2937'
    g.fillRect(0, 0, 512, 64)
    for (let x = 8; x < 512; x += 64) {
      g.fillStyle = '#fcd34d'
      g.fillRect(x, 8, 52, 48)
      g.fillStyle = 'rgba(120,53,15,.35)'
      g.fillRect(x + 30, 8, 22, 48)
    }
  })
  const ramen = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.4), new THREE.MeshBasicMaterial({ map: canvasTex(ramenC), toneMapped: false }))
  ramen.position.set(chX + 10.01, 2.2, chZ)
  ramen.rotation.y = Math.PI / 2
  const chBordC = tekstCanvas(1024, 160, (g) => {
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 1024, 160)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 70px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(`CLUBHUIS ${thema.naam.toUpperCase()}`, 512, 84, 980)
  })
  const chBord = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.5), new THREE.MeshBasicMaterial({ map: canvasTex(chBordC), toneMapped: false }))
  chBord.position.set(chX + 10.3, 4.25, chZ)
  chBord.rotation.y = Math.PI / 2
  scene.add(clubhuis, dak, ramen, chBord)
  obstakels.push({ x0: chX - 10, x1: chX + 10, z0: chZ - 5.5, z1: chZ + 5.5 })
  // Terras met parasols in clubkleur.
  const parasol = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 0.8, 8).translate(0, 2.6, 0), new THREE.MeshLambertMaterial(), 4)
  const stok = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5).translate(0, 1.3, 0), metaal, 4)
  const tafels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 12).translate(0, 0.75, 0), new THREE.MeshLambertMaterial({ color: '#e5e7eb' }), 4)
  for (let i = 0; i < 4; i++) {
    m4.makeTranslation(chX + 13.5, 0, chZ - 6 + i * 4)
    parasol.setMatrixAt(i, m4)
    stok.setMatrixAt(i, m4)
    tafels.setMatrixAt(i, m4)
    parasol.setColorAt(i, i % 2 ? secundair : primair)
  }
  scene.add(parasol, stok, tafels)

  // ---------- parking met auto's ----------
  const autoGeo = mergeGeometries([new THREE.BoxGeometry(1.8, 0.7, 4.2).translate(0, 0.55, 0), new THREE.BoxGeometry(1.6, 0.55, 2.2).translate(0, 1.15, -0.2)])
  const plaatsen: [number, number, number][] = []
  for (let rij = 0; rij < 4; rij++)
    for (let i = 0; i < 11; i++) if (toeval() < (licht ? 0.5 : 0.8)) plaatsen.push([pX0 + 4 + rij * 10 + (rij % 2) * 4.5, -28 + i * 5.3, rij % 2 ? Math.PI : 0])
  const autos = new THREE.InstancedMesh(autoGeo, new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.35 }), plaatsen.length)
  const autoKleuren = ['#e5e7eb', '#111827', '#9ca3af', '#1d4ed8', '#b91c1c', '#065f46', '#78350f', '#f8fafc'].map((c) => new THREE.Color(c))
  plaatsen.forEach(([x, z, r], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r + Math.PI / 2)
    m4.compose(new THREE.Vector3(x, 0, z), q, een)
    autos.setMatrixAt(i, m4)
    autos.setColorAt(i, autoKleuren[Math.floor(toeval() * autoKleuren.length)])
  })
  scene.add(autos)
  for (const [x, z] of plaatsen) obstakels.push({ x0: x - 2.2, x1: x + 2.2, z0: z - 1, z1: z + 1 })

  // ---------- bomen ----------
  const boomPos: [number, number, number][] = []
  while (boomPos.length < (licht ? 70 : 150)) {
    const a = toeval() * Math.PI * 2
    const r = 95 + toeval() * 45
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.8
    if (Math.abs(z - (B + 30)) < 8) continue
    boomPos.push([x, z, 0.8 + toeval() * 0.7])
  }
  for (let x = -130; x <= 130; x += 13) boomPos.push([x, B + 41, 0.9])
  const stammen = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 3, 6).translate(0, 1.5, 0), new THREE.MeshLambertMaterial({ color: '#4b3621' }), boomPos.length)
  const kruinen = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.6, 0), new THREE.MeshLambertMaterial({ flatShading: true }), boomPos.length)
  const groen = ['#1f5130', '#24603a', '#2f6b3a', '#1b4429'].map((c) => new THREE.Color(c))
  boomPos.forEach(([x, z, s], i) => {
    m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), toeval() * 6), new THREE.Vector3(s, s, s))
    stammen.setMatrixAt(i, m4)
    kruinen.setMatrixAt(i, m4)
    kruinen.setColorAt(i, groen[Math.floor(toeval() * groen.length)])
  })
  scene.add(stammen, kruinen)
  for (const [x, z] of boomPos) obstakels.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 })

  // Gevel- en betonmateriaal maar één keer gebruikt per mesh; betonMat voor de stoepranden.
  const stoep = new THREE.Mesh(new THREE.BoxGeometry(320, 0.15, 0.4), betonMat)
  stoep.position.set(0, 0.07, B + 25.3)
  scene.add(stoep)

  return {
    obstakels,
    start: { x: 0, z: B + 26, yaw: Math.PI },
    update(seconden) {
      tijd.value = seconden
      bandTex.offset.x = -(seconden * 0.04) % 1
    },
  }
}
