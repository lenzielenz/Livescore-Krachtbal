import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, inPoort, type EreBord, type StadionThema } from '@/lib/virtueel'
import { gevelOmtrek } from './omgeving'
import { canvasTex, rondLogo } from './stadion'

// De hall of fame in de gangen achter de tribunes: de erelijst van je club op verlichte borden
// aan de binnenkant van de gevel, recentste prijs het dichtst bij de hoofdingang, en een groot
// kopbord recht tegenover de ingang. Een nieuwe manier om de erelijst te ontdekken: al
// wandelend door je eigen stadion.
//
// Ook de gangen zelf krijgen licht: een spot en een warme lichtbaan boven elk bord, en
// lichtplassen op de vloer. Alles samen een handvol tekenopdrachten: de borden delen één
// textuur-atlas en zijn één samengevoegde mesh, kaders/spots/lichtplassen zijn InstancedMeshes.

const BORD_B = 3.2
const BORD_H = 2.0
const KOLOMMEN = 4
const RIJEN = 6
const CEL_B = 512
const CEL_H = 340

function kaderKleur(soort: EreBord['soort'], thema: StadionThema): string {
  return soort === 'titel' ? '#fcd34d' : soort === 'beker' ? '#e2e8f0' : thema.primair
}
const ICOON: Record<EreBord['soort'], string> = { titel: '🏆', beker: '🥇', referendum: '⭐' }

/** Tekst op één regel passend maken (kleiner lettertype tot het past). */
function past(g: CanvasRenderingContext2D, tekst: string, max: number, grootte: number, gewicht = 900): void {
  let px = grootte
  do {
    g.font = `${gewicht} ${px}px Inter, system-ui, sans-serif`
    px -= 2
  } while (g.measureText(tekst).width > max && px > 14)
}

export function bouwEregalerij(
  scene: THREE.Scene,
  opt: { thema: StadionThema; logo: Promise<HTMLImageElement | null>; kopbordZ: number },
): void {
  const zaal = opt.thema.erezaal
  const { thema } = opt
  const { B } = GEVEL

  // ---------- plaatsen aan de binnenkant van de gevel ----------
  // Om de ~4,6 m, enkel op de rechte stukken en niet in een poort; het dichtst bij de hoofdingang
  // eerst, zodat wie binnenkomt meteen de recentste prijzen ziet.
  const plekken = gevelOmtrek(4.6)
    .filter((p) => (p.nx === 0 || p.nz === 0) && Math.abs(p.nx) + Math.abs(p.nz) === 1)
    .filter((p) => {
      const langs = { x: -p.nz, z: p.nx }
      return [-1, 0, 1].every((k) => !inPoort(GEVEL, p.x - p.nx + langs.x * k * (BORD_B / 2 + 0.8), p.z - p.nz + langs.z * k * (BORD_B / 2 + 0.8)))
    })
    .sort((a, b) => Math.hypot(a.x, a.z - B) - Math.hypot(b.x, b.z - B))

  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const een = new THREE.Vector3(1, 1, 1)

  // ---------- licht in de gangen: lichtplassen op de vloer langs de hele gevel ----------
  const plasC = document.createElement('canvas')
  plasC.width = plasC.height = 128
  const pg = plasC.getContext('2d')!
  const gr = pg.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,226,170,.42)')
  gr.addColorStop(1, 'rgba(255,226,170,0)')
  pg.fillStyle = gr
  pg.fillRect(0, 0, 128, 128)
  const plasPunten = gevelOmtrek(6)
  const plasGeo = new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2)
  const plassen = new THREE.InstancedMesh(
    plasGeo,
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(plasC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    plasPunten.length,
  )
  plasPunten.forEach((p, i) => {
    m4.makeTranslation(p.x - p.nx * 2.4, 0.03, p.z - p.nz * 2.4)
    plassen.setMatrixAt(i, m4)
  })
  scene.add(plassen)

  // De binnenwand van de gevel, warm opgelicht door de lichtlijn erboven (licht boven, donkerder
  // naar de vloer). Niet in de poorten: daar moet je door kunnen kijken.
  const wandC = document.createElement('canvas')
  wandC.width = 4
  wandC.height = 128
  const wg = wandC.getContext('2d')!
  const wgr = wg.createLinearGradient(0, 0, 0, 128)
  wgr.addColorStop(0, '#a08868')
  wgr.addColorStop(0.35, '#5b5249')
  wgr.addColorStop(1, '#2a2c33')
  wg.fillStyle = wgr
  wg.fillRect(0, 0, 4, 128)
  const wandTex = new THREE.CanvasTexture(wandC)
  wandTex.colorSpace = THREE.SRGBColorSpace
  const wandPunten = gevelOmtrek(1)
  const wPos: number[] = []
  const wUv: number[] = []
  wandPunten.forEach((a, i) => {
    const b = wandPunten[(i + 1) % wandPunten.length]
    const mx = (a.x + b.x) / 2
    const mz = (a.z + b.z) / 2
    if (inPoort(GEVEL, mx - a.nx, mz - a.nz)) return
    const ax = a.x - a.nx * 0.61
    const az = a.z - a.nz * 0.61
    const bx = b.x - b.nx * 0.61
    const bz = b.z - b.nz * 0.61
    wPos.push(ax, 0, az, bx, 0, bz, ax, 4.3, az, bx, 0, bz, bx, 4.3, bz, ax, 4.3, az)
    wUv.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1)
  })
  const wandGeo = new THREE.BufferGeometry()
  wandGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3))
  wandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2))
  scene.add(new THREE.Mesh(wandGeo, new THREE.MeshBasicMaterial({ map: wandTex, side: THREE.DoubleSide })))

  if (!zaal || zaal.borden.length === 0) return

  const borden = zaal.borden.slice(0, Math.min(KOLOMMEN * RIJEN, plekken.length))

  // ---------- de atlas met alle borden ----------
  const atlas = document.createElement('canvas')
  atlas.width = KOLOMMEN * CEL_B
  atlas.height = RIJEN * CEL_H
  const atlasTex = canvasTex(atlas)
  const tekenAtlas = (logo: HTMLImageElement | null) => {
    const g = atlas.getContext('2d')!
    borden.forEach((b, i) => {
      const x = (i % KOLOMMEN) * CEL_B
      const y = Math.floor(i / KOLOMMEN) * CEL_H
      const kader = kaderKleur(b.soort, thema)
      const bg = g.createLinearGradient(0, y, 0, y + CEL_H)
      bg.addColorStop(0, '#152033')
      bg.addColorStop(1, '#090e18')
      g.fillStyle = bg
      g.fillRect(x, y, CEL_B, CEL_H)
      g.strokeStyle = kader
      g.lineWidth = 10
      g.strokeRect(x + 5, y + 5, CEL_B - 10, CEL_H - 10)
      g.strokeStyle = 'rgba(255,255,255,.12)'
      g.lineWidth = 2
      g.strokeRect(x + 16, y + 16, CEL_B - 32, CEL_H - 32)
      // Kop: icoon + soort prijs.
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
      g.fillText(ICOON[b.soort], x + CEL_B / 2, y + 66)
      g.fillStyle = kader
      past(g, b.kop, CEL_B - 70, 34, 900)
      g.fillText(b.kop, x + CEL_B / 2, y + 124)
      // Het jaar, groot.
      g.fillStyle = '#ffffff'
      past(g, b.jaar, CEL_B - 70, 74, 900)
      g.fillText(b.jaar, x + CEL_B / 2, y + 192)
      // Wat er gewonnen werd (reeks, categorie, of de laureaat).
      g.fillStyle = 'rgba(226,232,240,.9)'
      past(g, b.tekst, CEL_B - 70, 34, 700)
      g.fillText(b.tekst, x + CEL_B / 2, y + 252)
      if (zaal.eigen) {
        rondLogo(g, logo, thema, x + CEL_B - 46, y + CEL_H - 44, 22)
      }
    })
    atlasTex.needsUpdate = true
  }
  tekenAtlas(null)

  // ---------- borden, kaders en spots ----------
  const vlakken: THREE.BufferGeometry[] = []
  const kaders = new THREE.InstancedMesh(new THREE.BoxGeometry(BORD_B + 0.2, BORD_H + 0.2, 0.1), new THREE.MeshLambertMaterial({ color: '#111827' }), borden.length)
  const spots = new THREE.InstancedMesh(
    mergeGeometries([new THREE.BoxGeometry(0.06, 0.06, 0.55).translate(0, 0, 0.27), new THREE.CylinderGeometry(0.11, 0.15, 0.22, 10).rotateX(Math.PI / 2.6).translate(0, -0.06, 0.6)]),
    new THREE.MeshLambertMaterial({ color: '#1f2937' }),
    borden.length,
  )
  const lampjes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 12).rotateX(Math.PI / 2.6 + Math.PI / 2).translate(0, -0.16, 0.67), new THREE.MeshBasicMaterial({ color: '#fff7e0', toneMapped: false }), borden.length)
  const baanC = document.createElement('canvas')
  baanC.width = 64
  baanC.height = 128
  const bgc = baanC.getContext('2d')!
  const bgr = bgc.createLinearGradient(0, 0, 0, 128)
  bgr.addColorStop(0, 'rgba(255,230,180,.55)')
  bgr.addColorStop(1, 'rgba(255,230,180,0)')
  bgc.fillStyle = bgr
  bgc.beginPath()
  bgc.moveTo(22, 0)
  bgc.lineTo(42, 0)
  bgc.lineTo(64, 128)
  bgc.lineTo(0, 128)
  bgc.fill()
  const banen = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(BORD_B + 1.2, 3.2).translate(0, -1.6, 0),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(baanC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    borden.length,
  )

  borden.forEach((_, i) => {
    const p = plekken[i]
    // Op de binnenkant van de muur (die is 1,2 m dik), met de voorkant naar de gang.
    const pos = new THREE.Vector3(p.x - p.nx * 0.66, 2.55, p.z - p.nz * 0.66)
    q.setFromAxisAngle(Y, Math.atan2(-p.nx, -p.nz))
    const naar = new THREE.Matrix4().compose(pos, q, een)

    const vlak = new THREE.PlaneGeometry(BORD_B, BORD_H)
    const u0 = (i % KOLOMMEN) / KOLOMMEN
    const u1 = u0 + 1 / KOLOMMEN
    const v1 = 1 - Math.floor(i / KOLOMMEN) / RIJEN
    const v0 = v1 - 1 / RIJEN
    vlak.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
    vlak.translate(0, 0, 0.07)
    vlak.applyMatrix4(naar)
    vlakken.push(vlak)

    kaders.setMatrixAt(i, naar)
    const boven = new THREE.Matrix4().compose(pos.clone().add(new THREE.Vector3(0, BORD_H / 2 + 0.55, 0)), q, een)
    spots.setMatrixAt(i, boven)
    lampjes.setMatrixAt(i, boven)
    banen.setMatrixAt(i, new THREE.Matrix4().compose(pos.clone().add(new THREE.Vector3(-p.nx * 0.02, BORD_H / 2 + 0.75, -p.nz * 0.02)), q, een))
  })
  const bordenMesh = new THREE.Mesh(mergeGeometries(vlakken), new THREE.MeshBasicMaterial({ map: atlasTex, toneMapped: false }))
  scene.add(kaders, banen, bordenMesh, spots, lampjes)

  // ---------- het kopbord tegenover de hoofdingang ----------
  const kopC = document.createElement('canvas')
  kopC.width = 1536
  kopC.height = 448
  const kopTex = canvasTex(kopC)
  const tekenKop = (logo: HTMLImageElement | null) => {
    const g = kopC.getContext('2d')!
    const bg = g.createLinearGradient(0, 0, 1536, 0)
    bg.addColorStop(0, thema.primair)
    bg.addColorStop(1, '#0b1220')
    g.fillStyle = bg
    g.fillRect(0, 0, 1536, 448)
    g.strokeStyle = '#fcd34d'
    g.lineWidth = 14
    g.strokeRect(7, 7, 1522, 434)
    rondLogo(g, logo, thema, 224, 224, 150)
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillStyle = '#fcd34d'
    g.font = '900 42px Inter, system-ui, sans-serif'
    g.fillText('🏆  HALL OF FAME', 430, 92)
    g.fillStyle = '#ffffff'
    past(g, zaal.kop.replace(/^HALL OF FAME · /, ''), 1040, 104, 900)
    g.fillText(zaal.kop.replace(/^HALL OF FAME · /, ''), 430, 196)
    g.fillStyle = 'rgba(255,255,255,.88)'
    past(g, zaal.totaal, 1040, 46, 700)
    g.fillText(zaal.totaal, 430, 292)
    g.fillStyle = 'rgba(255,255,255,.6)'
    g.font = '600 30px Inter, system-ui, sans-serif'
    g.fillText('Wandel door de gangen: elke prijs hangt aan de muur', 430, 372)
    kopTex.needsUpdate = true
  }
  tekenKop(null)
  const kop = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 3.06), new THREE.MeshBasicMaterial({ map: kopTex, toneMapped: false }))
  kop.position.set(0, 3.2, opt.kopbordZ + 0.02)
  const kopKader = new THREE.Mesh(new THREE.BoxGeometry(10.9, 3.46, 0.14), new THREE.MeshLambertMaterial({ color: '#111827' }))
  kopKader.position.set(0, 3.2, opt.kopbordZ - 0.06)
  scene.add(kopKader, kop)

  void opt.logo.then((logo) => {
    tekenAtlas(logo)
    tekenKop(logo)
  })
}
