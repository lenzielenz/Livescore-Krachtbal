import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { GEVEL, inPoort, type EreBord, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { gevelOmtrek } from './omgeving'
import { canvasTex, rondLogo } from './stadion'

// De hall of fame in de gangen achter de tribunes: de erelijst van je club, al wandelend te
// ontdekken.
//  • Titels en bekers hangen als plaquettes aan de binnenkant van de gevel: lint met de soort
//    prijs, lauwerkrans, het seizoen, de reeks en wat de prijs bijzonder maakt ("3de titel in …").
//  • Een persoonlijke prijs (referendum) krijgt een eigen, staand portretbord met een gouden
//    dubbelkader, een silhouet, de naam van de speler en een gouden gloed eromheen.
//  • De recentste titels en bekers staan als echte bekers in glazen vitrines op sokkels in de gang
//    tegenover de hoofdingang: ze draaien traag rond, met een spot en een naamplaatje, en je kan
//    er rond wandelen.
//  • Een groot kopbord tegenover de ingang, en licht in de gangen (lichtwand + lichtplassen).
//
// Vlot: plaquettes en portretten delen elk één textuur-atlas en zijn één mesh per soort; kaders
// zijn samengevoegd; spots, lichtbanen, gloed en lichtplassen zijn InstancedMeshes.

const PLAQ = { b: 3.4, h: 2.4, celB: 512, celH: 360, kol: 4, y: 2.55 }
const PORT = { b: 2.4, h: 3.4, celB: 360, celH: 512, kol: 6, y: 2.45 }

export type Eregalerij = { obstakels: Rechthoek[]; update: (seconden: number) => void }

function kaderKleur(soort: EreBord['soort'], thema: StadionThema): string {
  return soort === 'titel' ? '#fcd34d' : soort === 'beker' ? '#e2e8f0' : thema.primair
}

/** Tekst op één regel passend maken (kleiner lettertype tot het past). */
function past(g: CanvasRenderingContext2D, tekst: string, max: number, grootte: number, gewicht = 900, stijl = ''): void {
  let px = grootte
  do {
    g.font = `${stijl} ${gewicht} ${px}px Inter, system-ui, sans-serif`
    px -= 1
  } while (g.measureText(tekst).width > max && px > 12)
}

/** Een lauwerkrans: blaadjes langs twee bogen rond (cx, cy). */
function lauwerkrans(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, kleur: string): void {
  g.save()
  g.fillStyle = kleur
  for (const kant of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 + kant * (0.35 + i * 0.27)
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      g.save()
      g.translate(x, y)
      g.rotate(a + (kant * Math.PI) / 2.4)
      g.beginPath()
      g.ellipse(0, 0, r * 0.2, r * 0.08, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
  }
  g.restore()
}

/** Een lint met ingesneden uiteinden, met tekst erin. */
function lint(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kleur: string, tekst: string): void {
  g.fillStyle = kleur
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(x + w, y)
  g.lineTo(x + w - h * 0.35, y + h / 2)
  g.lineTo(x + w, y + h)
  g.lineTo(x, y + h)
  g.lineTo(x + h * 0.35, y + h / 2)
  g.closePath()
  g.fill()
  g.fillStyle = '#0b1220'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  past(g, tekst, w - h * 1.2, h * 0.58)
  g.fillText(tekst, x + w / 2, y + h / 2 + 2)
}

function tekenPlaquette(g: CanvasRenderingContext2D, x: number, y: number, b: EreBord, thema: StadionThema, logo: HTMLImageElement | null, eigen: boolean): void {
  const { celB: W, celH: H } = PLAQ
  const kader = kaderKleur(b.soort, thema)
  const bg = g.createLinearGradient(x, y, x, y + H)
  bg.addColorStop(0, '#1a2740')
  bg.addColorStop(1, '#0a0f1a')
  g.fillStyle = bg
  g.fillRect(x, y, W, H)
  // Fijne diagonale streepjes, zoals geborsteld metaal.
  g.save()
  g.beginPath()
  g.rect(x, y, W, H)
  g.clip()
  g.strokeStyle = 'rgba(255,255,255,.035)'
  g.lineWidth = 2
  for (let d = -H; d < W; d += 9) {
    g.beginPath()
    g.moveTo(x + d, y + H)
    g.lineTo(x + d + H, y)
    g.stroke()
  }
  g.restore()
  g.strokeStyle = kader
  g.lineWidth = 12
  g.strokeRect(x + 6, y + 6, W - 12, H - 12)
  g.strokeStyle = 'rgba(252,211,77,.5)'
  g.lineWidth = 2
  g.strokeRect(x + 20, y + 20, W - 40, H - 40)

  lint(g, x + 40, y + 28, W - 80, 50, kader, `${b.soort === 'titel' ? '🏆' : '🥇'}  ${b.kop}`)
  lauwerkrans(g, x + W / 2, y + 140, 54, kader)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
  g.fillText(b.soort === 'titel' ? '🏆' : '🏅', x + W / 2, y + 140)
  g.fillStyle = '#ffffff'
  past(g, b.jaar, W - 90, 56)
  g.fillText(b.jaar, x + W / 2, y + 224)
  g.fillStyle = 'rgba(226,232,240,.92)'
  past(g, b.tekst, W - 90, 30, 700)
  g.fillText(b.tekst, x + W / 2, y + 266)
  if (b.extra) {
    g.fillStyle = kader
    past(g, b.extra, W - 150, 19, 600, 'italic')
    g.fillText(b.extra, x + W / 2, y + 306)
  }
  if (eigen) {
    rondLogo(g, logo, thema, x + 48, y + H - 46, 18)
    rondLogo(g, logo, thema, x + W - 48, y + H - 46, 18)
  }
}

function tekenPortret(g: CanvasRenderingContext2D, x: number, y: number, b: EreBord, thema: StadionThema, logo: HTMLImageElement | null): void {
  const { celB: W, celH: H } = PORT
  const bg = g.createRadialGradient(x + W / 2, y + 170, 10, x + W / 2, y + 220, H * 0.75)
  bg.addColorStop(0, '#3a2a0c')
  bg.addColorStop(0.5, '#141b2c')
  bg.addColorStop(1, '#070b14')
  g.fillStyle = bg
  g.fillRect(x, y, W, H)
  // Dubbel gouden kader.
  g.strokeStyle = '#fcd34d'
  g.lineWidth = 14
  g.strokeRect(x + 7, y + 7, W - 14, H - 14)
  g.strokeStyle = '#b45309'
  g.lineWidth = 3
  g.strokeRect(x + 22, y + 22, W - 44, H - 44)
  g.strokeStyle = '#fde68a'
  g.lineWidth = 2
  g.strokeRect(x + 28, y + 28, W - 56, H - 56)
  // Kop.
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fcd34d'
  past(g, `⭐ ${b.kop}`, W - 70, 26)
  g.fillText(`⭐ ${b.kop}`, x + W / 2, y + 62)
  // Silhouet in een medaillon in clubkleur.
  const cx = x + W / 2
  const cy = y + 180
  const r = 82
  const med = g.createLinearGradient(cx, cy - r, cx, cy + r)
  med.addColorStop(0, thema.primair)
  med.addColorStop(1, '#0b1220')
  g.fillStyle = med
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = 'rgba(255,255,255,.82)'
  g.beginPath()
  g.arc(cx, cy - 18, 30, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.ellipse(cx, cy + 70, 62, 52, 0, Math.PI, 0)
  g.fill()
  g.restore()
  g.strokeStyle = '#fcd34d'
  g.lineWidth = 6
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.stroke()
  // Naam, jaar en wat het bijzonder maakt.
  g.fillStyle = '#ffffff'
  past(g, b.tekst, W - 70, 42)
  g.fillText(b.tekst, cx, y + 310)
  g.fillStyle = '#fcd34d'
  past(g, b.jaar, W - 70, 56)
  g.fillText(b.jaar, cx, y + 366)
  // Wat het bijzonder maakt: elk deel op een eigen regel, zodat het smalle bord leesbaar blijft.
  g.fillStyle = 'rgba(253,230,138,.85)'
  ;(b.extra ?? '').split(' · ').slice(0, 2).forEach((regel, i) => {
    past(g, regel, W - 76, 19, 600, 'italic')
    g.fillText(regel, cx, y + 404 + i * 24)
  })
  rondLogo(g, logo, thema, cx, y + 470, 20)
}

export function bouwEregalerij(
  scene: THREE.Scene,
  opt: { thema: StadionThema; logo: Promise<HTMLImageElement | null>; kopbordZ: number; renderer: THREE.WebGLRenderer; licht: boolean },
): Eregalerij {
  const zaal = opt.thema.erezaal
  const { thema } = opt
  const { B } = GEVEL
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const een = new THREE.Vector3(1, 1, 1)
  const obstakels: Rechthoek[] = []

  // ---------- licht in de gangen: lichtplassen op de vloer langs de hele gevel ----------
  const plasC = document.createElement('canvas')
  plasC.width = plasC.height = 128
  const pg = plasC.getContext('2d')!
  const gr = pg.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,226,170,.42)')
  gr.addColorStop(1, 'rgba(255,226,170,0)')
  pg.fillStyle = gr
  pg.fillRect(0, 0, 128, 128)
  const plasTex = new THREE.CanvasTexture(plasC)
  const plasMat = new THREE.MeshBasicMaterial({ map: plasTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const plasPunten = gevelOmtrek(6)
  const plassen = new THREE.InstancedMesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), plasMat, plasPunten.length)
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
    if (inPoort(GEVEL, (a.x + b.x) / 2 - a.nx, (a.z + b.z) / 2 - a.nz)) return
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

  if (!zaal || zaal.borden.length === 0) return { obstakels, update() {} }

  // ---------- plaatsen aan de binnenkant van de gevel ----------
  // Om de ~4,6 m, enkel op de rechte stukken en niet in een poort; het dichtst bij de hoofdingang
  // eerst, zodat wie binnenkomt meteen de recentste prijzen ziet.
  const plekken = gevelOmtrek(4.6)
    .filter((p) => Math.abs(p.nx) + Math.abs(p.nz) === 1)
    .filter((p) => {
      const langs = { x: -p.nz, z: p.nx }
      return [-1, 0, 1].every((k) => !inPoort(GEVEL, p.x - p.nx + langs.x * k * (PLAQ.b / 2 + 0.8), p.z - p.nz + langs.z * k * (PLAQ.b / 2 + 0.8)))
    })
    .sort((a, b) => Math.hypot(a.x, a.z - B) - Math.hypot(b.x, b.z - B))

  const borden = zaal.borden.slice(0, Math.min(24, plekken.length))
  const plaquettes = borden.map((b, i) => ({ b, plek: plekken[i] })).filter((x) => x.b.soort !== 'referendum')
  const portretten = borden.map((b, i) => ({ b, plek: plekken[i] })).filter((x) => x.b.soort === 'referendum')

  // ---------- de twee atlassen ----------
  const maakAtlas = (aantal: number, s: typeof PLAQ) => {
    const c = document.createElement('canvas')
    c.width = s.kol * s.celB
    c.height = Math.max(1, Math.ceil(aantal / s.kol)) * s.celH
    return { c, tex: canvasTex(c), rijen: Math.max(1, Math.ceil(aantal / s.kol)) }
  }
  const atlasP = maakAtlas(plaquettes.length, PLAQ)
  const atlasR = maakAtlas(portretten.length, PORT)
  const tekenAtlassen = (logo: HTMLImageElement | null) => {
    const gp = atlasP.c.getContext('2d')!
    plaquettes.forEach(({ b }, i) => tekenPlaquette(gp, (i % PLAQ.kol) * PLAQ.celB, Math.floor(i / PLAQ.kol) * PLAQ.celH, b, thema, logo, zaal.eigen))
    atlasP.tex.needsUpdate = true
    const gr2 = atlasR.c.getContext('2d')!
    portretten.forEach(({ b }, i) => tekenPortret(gr2, (i % PORT.kol) * PORT.celB, Math.floor(i / PORT.kol) * PORT.celH, b, thema, logo))
    atlasR.tex.needsUpdate = true
  }
  tekenAtlassen(null)

  // ---------- borden, kaders, spots, lichtbanen ----------
  const naarMuur = (p: (typeof plekken)[number], y: number) => {
    const pos = new THREE.Vector3(p.x - p.nx * 0.66, y, p.z - p.nz * 0.66)
    q.setFromAxisAngle(Y, Math.atan2(-p.nx, -p.nz))
    return { pos, rot: q.clone(), m: new THREE.Matrix4().compose(pos, q, een) }
  }
  const vlakken = (lijst: typeof plaquettes, s: typeof PLAQ, rijen: number) =>
    lijst.map(({ plek }, i) => {
      const vlak = new THREE.PlaneGeometry(s.b, s.h)
      const u0 = (i % s.kol) / s.kol
      const u1 = u0 + 1 / s.kol
      const v1 = 1 - Math.floor(i / s.kol) / rijen
      const v0 = v1 - 1 / rijen
      vlak.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
      vlak.translate(0, 0, 0.07)
      vlak.applyMatrix4(naarMuur(plek, s.y).m)
      return vlak
    })
  if (plaquettes.length) scene.add(new THREE.Mesh(mergeGeometries(vlakken(plaquettes, PLAQ, atlasP.rijen)), new THREE.MeshBasicMaterial({ map: atlasP.tex, toneMapped: false })))
  if (portretten.length) scene.add(new THREE.Mesh(mergeGeometries(vlakken(portretten, PORT, atlasR.rijen)), new THREE.MeshBasicMaterial({ map: atlasR.tex, toneMapped: false })))

  const kaderGeos: THREE.BufferGeometry[] = []
  for (const { plek } of plaquettes) kaderGeos.push(new THREE.BoxGeometry(PLAQ.b + 0.2, PLAQ.h + 0.2, 0.1).applyMatrix4(naarMuur(plek, PLAQ.y).m))
  for (const { plek } of portretten) kaderGeos.push(new THREE.BoxGeometry(PORT.b + 0.28, PORT.h + 0.28, 0.12).applyMatrix4(naarMuur(plek, PORT.y).m))
  scene.add(new THREE.Mesh(mergeGeometries(kaderGeos), new THREE.MeshLambertMaterial({ color: '#111827' })))

  const alle = [...plaquettes.map((x) => ({ ...x, s: PLAQ })), ...portretten.map((x) => ({ ...x, s: PORT }))]
  const spots = new THREE.InstancedMesh(
    mergeGeometries([new THREE.BoxGeometry(0.06, 0.06, 0.55).translate(0, 0, 0.27), new THREE.CylinderGeometry(0.11, 0.15, 0.22, 10).rotateX(Math.PI / 2.6).translate(0, -0.06, 0.6)]),
    new THREE.MeshLambertMaterial({ color: '#1f2937' }),
    alle.length,
  )
  const lampjes = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.1, 12).rotateX(Math.PI / 2.6 + Math.PI / 2).translate(0, -0.16, 0.67),
    new THREE.MeshBasicMaterial({ color: '#fff7e0', toneMapped: false }),
    alle.length,
  )
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
    new THREE.PlaneGeometry(PLAQ.b + 1.2, 3.2).translate(0, -1.6, 0),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(baanC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    alle.length,
  )
  alle.forEach(({ plek, s }, i) => {
    const { pos, rot } = naarMuur(plek, s.y)
    const boven = new THREE.Matrix4().compose(pos.clone().add(new THREE.Vector3(0, s.h / 2 + 0.32, 0)), rot, een)
    spots.setMatrixAt(i, boven)
    lampjes.setMatrixAt(i, boven)
    banen.setMatrixAt(i, new THREE.Matrix4().compose(pos.clone().add(new THREE.Vector3(-plek.nx * 0.02, s.h / 2 + 0.5, -plek.nz * 0.02)), rot, een))
  })
  scene.add(banen, spots, lampjes)

  // Persoonlijke prijzen: een gouden gloed rond het portret.
  if (portretten.length) {
    const gloedC = document.createElement('canvas')
    gloedC.width = gloedC.height = 128
    const gg = gloedC.getContext('2d')!
    const ggr = gg.createRadialGradient(64, 64, 20, 64, 64, 64)
    ggr.addColorStop(0, 'rgba(252,211,77,.55)')
    ggr.addColorStop(1, 'rgba(252,211,77,0)')
    gg.fillStyle = ggr
    gg.fillRect(0, 0, 128, 128)
    const gloed = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(PORT.b + 2.2, PORT.h + 1.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gloedC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      portretten.length,
    )
    portretten.forEach(({ plek }, i) => {
      const { pos, rot } = naarMuur(plek, PORT.y)
      gloed.setMatrixAt(i, new THREE.Matrix4().compose(pos.clone().add(new THREE.Vector3(plek.nx * 0.025, 0, plek.nz * 0.025)), rot, een))
    })
    scene.add(gloed)
  }

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
    const naam = zaal.kop.replace(/^HALL OF FAME · /, '')
    g.fillStyle = '#ffffff'
    past(g, naam, 1040, 104)
    g.fillText(naam, 430, 196)
    g.fillStyle = 'rgba(255,255,255,.88)'
    past(g, zaal.totaal, 1040, 46, 700)
    g.fillText(zaal.totaal, 430, 292)
    g.fillStyle = 'rgba(255,255,255,.6)'
    g.font = '600 30px Inter, system-ui, sans-serif'
    g.fillText('Wandel door de gangen: elke prijs hangt aan de muur, de bekers staan in de vitrines', 430, 372, 1060)
    kopTex.needsUpdate = true
  }
  tekenKop(null)
  const kop = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 3.06), new THREE.MeshBasicMaterial({ map: kopTex, toneMapped: false }))
  kop.position.set(0, 3.2, opt.kopbordZ + 0.02)
  const kopKader = new THREE.Mesh(new THREE.BoxGeometry(10.9, 3.46, 0.14), new THREE.MeshLambertMaterial({ color: '#111827' }))
  kopKader.position.set(0, 3.2, opt.kopbordZ - 0.06)
  scene.add(kopKader, kop)

  // ---------- bekers in vitrines, in de gang tegenover de ingang ----------
  const vitrineBorden = borden.filter((b) => b.soort !== 'referendum').slice(0, opt.licht ? 2 : 4)
  const vitrineZ = (opt.kopbordZ + B - 0.6) / 2
  const vitrineX = [-12.5, 12.5, -20, 20]
  // Glanzend metaal heeft iets nodig om te weerspiegelen: één keer een kleine studio voorbakken.
  let omgeving: THREE.Texture | null = null
  try {
    const pm = new THREE.PMREMGenerator(opt.renderer)
    omgeving = pm.fromScene(new RoomEnvironment(), 0.04).texture
    pm.dispose()
  } catch {
    omgeving = null
  }
  const goud = new THREE.MeshStandardMaterial({ color: '#e9b824', metalness: 1, roughness: 0.22, envMap: omgeving, envMapIntensity: 1.3 })
  const zilver = new THREE.MeshStandardMaterial({ color: '#d7dde4', metalness: 1, roughness: 0.18, envMap: omgeving, envMapIntensity: 1.3 })
  const kampioensBeker = () => {
    const g = new THREE.Group()
    const profiel = [
      [0, 0], [0.34, 0], [0.34, 0.1], [0.26, 0.13], [0.26, 0.24], [0.2, 0.27], [0.08, 0.33], [0.06, 0.58], [0.1, 0.64],
      [0.18, 0.69], [0.31, 0.8], [0.39, 0.98], [0.42, 1.17], [0.44, 1.3], [0.41, 1.32],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    g.add(new THREE.Mesh(new THREE.LatheGeometry(profiel, 32), goud))
    for (const kant of [-1, 1]) {
      const oor = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 20, Math.PI * 1.1), goud)
      oor.position.set(kant * 0.43, 1.02, 0)
      oor.rotation.z = kant === 1 ? -Math.PI / 2 : Math.PI / 2
      g.add(oor)
    }
    return g
  }
  const bekerMetDeksel = () => {
    const g = new THREE.Group()
    const profiel = [
      [0, 0], [0.3, 0], [0.3, 0.09], [0.22, 0.12], [0.07, 0.2], [0.05, 0.5], [0.1, 0.56], [0.24, 0.66], [0.3, 0.86],
      [0.3, 1.04], [0.26, 1.08], [0.29, 1.1], [0.2, 1.2], [0.06, 1.24], [0.0, 1.25],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    g.add(new THREE.Mesh(new THREE.LatheGeometry(profiel, 32), zilver))
    const knop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), zilver)
    knop.position.y = 1.3
    g.add(knop)
    return g
  }
  const glas = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.1, depthWrite: false, envMap: omgeving })
  const sokkelMat = new THREE.MeshLambertMaterial({ color: '#141a26' })
  const randMat = new THREE.MeshLambertMaterial({ color: thema.primair, emissive: thema.primair, emissiveIntensity: 0.2 })
  const bekers: THREE.Group[] = []
  vitrineBorden.forEach((b, i) => {
    const x = vitrineX[i]
    const z = vitrineZ
    const sokkel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.3), sokkelMat)
    sokkel.position.set(x, 0.5, z)
    const rand = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 1.42), randMat)
    rand.position.set(x, 1.04, z)
    const kast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 1.2), glas)
    kast.position.set(x, 1.93, z)
    const ribben = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.7, 1.2)), new THREE.LineBasicMaterial({ color: '#9ca3af' }))
    ribben.position.copy(kast.position)
    const beker = b.soort === 'titel' ? kampioensBeker() : bekerMetDeksel()
    beker.scale.setScalar(0.92)
    beker.position.set(x, 1.1, z)
    bekers.push(beker)
    // Naamplaatje op de sokkel, aan beide kanten (de gang loopt langs twee kanten).
    const plC = document.createElement('canvas')
    plC.width = 512
    plC.height = 256
    const pg2 = plC.getContext('2d')!
    pg2.fillStyle = '#c99a2e'
    pg2.fillRect(0, 0, 512, 256)
    pg2.fillStyle = '#f5d77a'
    pg2.fillRect(10, 10, 492, 236)
    pg2.fillStyle = '#3b2a06'
    pg2.textAlign = 'center'
    pg2.textBaseline = 'middle'
    past(pg2, b.kop, 460, 40)
    pg2.fillText(b.kop, 256, 52)
    past(pg2, b.jaar, 460, 64)
    pg2.fillText(b.jaar, 256, 120)
    past(pg2, b.tekst, 460, 30, 700)
    pg2.fillText(b.tekst, 256, 176)
    if (b.extra) {
      past(pg2, b.extra.split(' · ')[0], 460, 22, 600, 'italic')
      pg2.fillText(b.extra.split(' · ')[0], 256, 218)
    }
    const plTex = canvasTex(plC)
    for (const kant of [1, -1]) {
      const plaat = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshStandardMaterial({ map: plTex, metalness: 0.6, roughness: 0.35, envMap: omgeving }))
      plaat.position.set(x, 0.55, z + kant * 0.656)
      if (kant === -1) plaat.rotation.y = Math.PI
      scene.add(plaat)
    }
    // Spot en lichtplas.
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32).rotateX(-Math.PI / 2), plasMat)
    pool.position.set(x, 0.035, z)
    const bundel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.85, 1.6, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff3d1', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    bundel.position.set(x, 3.55, z)
    const armatuur = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 12), new THREE.MeshLambertMaterial({ color: '#1f2937' }))
    armatuur.position.set(x, 4.45, z)
    const kabel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2, 4), new THREE.MeshLambertMaterial({ color: '#111827' }))
    kabel.position.set(x, 5.55, z)
    scene.add(sokkel, rand, beker, kast, ribben, pool, bundel, armatuur, kabel)
    obstakels.push({ x0: x - 0.85, x1: x + 0.85, z0: z - 0.85, z1: z + 0.85 })
  })

  void opt.logo.then((logo) => {
    tekenAtlassen(logo)
    tekenKop(logo)
  })

  return {
    obstakels,
    update(seconden) {
      bekers.forEach((b, i) => (b.rotation.y = seconden * 0.45 + i * 1.3))
    },
  }
}
