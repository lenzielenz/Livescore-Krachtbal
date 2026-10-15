import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'

import type { Rechthoek, StadionThema } from '@/lib/virtueel'
import { deurOp, liftStap, liftVerdiep, liftY, nieuweLift, VERDIEPEN, type Lift } from '@/lib/virtueel-lift'
import { AVATAR_LAAG } from './avatar'
import { canvasTex } from './stadion'

// De lift: één schacht van de kelder (-1) tot op het dak (de ringwandeling), achter de Hall of
// Fame-gang. Op elk verdiep schuifdeuren met een verdiepaanduiding en een oproepknop; een kooi met
// spiegelwanden (achteraan en opzij: je ziet jezelf de lift instappen), leuning en een
// knoppenpaneel die meerijdt. In de kooi kies je zelf je verdiep (het paneel
// op je scherm, zie VirtueelViewer); de logica zit (getest) in lib/virtueel-lift.ts.
// Boven het dak van de loges steekt de schacht uit als een slanke toren in clubkleur.

export const LIFT_X = -26

export type Lift3D = {
  x: number
  /** z van de liftdeuren (de kooi ligt ervoor, richting -z). */
  zDeur: number
  /** Staat dit punt in de kooi? */
  binnen: (x: number, z: number) => boolean
  /** De spiegelwanden in de kooi aan/uit (ze tekenen de scène opnieuw: enkel als je in of bij de lift bent). */
  spiegels: (aan: boolean) => void
  /** Sta je in de kooi of er net voor (op het verdiep waar de kooi staat)? */
  bijKooi: (x: number, z: number, verdiep: number) => boolean
  /** Wat de schacht tegenhoudt op dit verdiep (en de deur, als die dicht is). */
  obstakels: (verdiep: number) => Rechthoek[]
  update: (
    dt: number,
    speler: { x: number; z: number; verdiep: number; actief: boolean; keuze: number | null },
  ) => { aangekomen: number | null; vloerY: number | null; keuzeGebruikt: boolean; lift: Lift }
}

export function bouwLift(scene: THREE.Scene, opt: { thema: StadionThema; renderer: THREE.WebGLRenderer; tribuneZ: number; licht?: boolean }): Lift3D {
  const { thema } = opt
  const LX = LIFT_X
  const Z0 = opt.tribuneZ // achterkant van de schacht
  const ZD = opt.tribuneZ + 2.6 // de liftdeuren
  const ONDER = VERDIEPEN[0].y - 0.4
  const BOVEN = VERDIEPEN[VERDIEPEN.length - 1].y + 3.4
  const DAK_LOGES = VERDIEPEN[2].y + 3.75
  const primair = new THREE.Color(thema.primair)

  let omgeving: THREE.Texture | null = null
  try {
    const pm = new THREE.PMREMGenerator(opt.renderer)
    omgeving = pm.fromScene(new RoomEnvironment(), 0.04).texture
    pm.dispose()
  } catch {
    omgeving = null
  }
  const mats = {
    wand: new THREE.MeshLambertMaterial({ color: '#e7e2d9' }),
    toren: new THREE.MeshLambertMaterial({ color: '#1f2530' }),
    club: new THREE.MeshBasicMaterial({ color: primair, toneMapped: false }),
    donker: new THREE.MeshLambertMaterial({ color: '#1f2530' }),
    staal: new THREE.MeshStandardMaterial({ color: '#c8ccd1', metalness: 0.85, roughness: 0.3, emissive: '#30343a', emissiveIntensity: 0.4, envMap: omgeving }),
    licht: new THREE.MeshBasicMaterial({ color: '#fff4dc', toneMapped: false }),
  }
  const doos = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, ouder: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    ouder.add(m)
    return m
  }

  // ---------- de schacht ----------
  const sw = 0.15
  // Binnen (kelder tot het dak van de loges) lichte wanden; daarboven een donkere toren.
  for (const [y0, y1, mat] of [
    [ONDER, DAK_LOGES, mats.wand],
    [DAK_LOGES, BOVEN, mats.toren],
  ] as const) {
    const h = y1 - y0
    const y = (y0 + y1) / 2
    doos(sw, h, ZD - Z0, LX - 1.275, y, (Z0 + ZD) / 2, mat)
    doos(sw, h, ZD - Z0, LX + 1.275, y, (Z0 + ZD) / 2, mat)
    doos(2.7, h, sw, LX, y, Z0 + sw / 2, mat)
  }
  // De torenkop: een dak, een lichtband in clubkleur en het woord LIFT.
  doos(3.0, 0.3, ZD - Z0 + 0.3, LX, BOVEN + 0.15, (Z0 + ZD) / 2, mats.donker)
  doos(2.82, 0.12, ZD - Z0 + 0.12, LX, BOVEN - 0.25, (Z0 + ZD) / 2, mats.club)
  for (const sx of [-1, 1]) doos(0.04, BOVEN - DAK_LOGES - 0.6, 0.12, LX + sx * 1.36, (DAK_LOGES + BOVEN) / 2 - 0.3, Z0 + 0.3, mats.club)
  // Voorwand: stijlen over de hele hoogte, en per verdiep een latei boven de deur tot het volgende.
  for (const sx of [-1, 1]) doos(0.75, BOVEN - ONDER, sw, LX + sx * 0.975, (ONDER + BOVEN) / 2, ZD, mats.staal)
  VERDIEPEN.forEach((v, i) => {
    const y0 = v.y + 2.3
    const y1 = i + 1 < VERDIEPEN.length ? VERDIEPEN[i + 1].y : BOVEN
    doos(1.2, y1 - y0, sw, LX, (y0 + y1) / 2, ZD, mats.staal)
  })
  doos(1.2, 0.2, sw, LX, ONDER + 0.1, ZD, mats.staal)

  // ---------- schuifdeuren, verdiepaanduiding, knoppen en bord per verdiep ----------
  const deurMat = new THREE.MeshStandardMaterial({ color: '#d7dbe0', metalness: 0.9, roughness: 0.22, envMap: omgeving })
  const deurGeo = new THREE.BoxGeometry(0.62, 2.3, 0.04)
  const landing = VERDIEPEN.map((v) =>
    [-1, 1].map((sx) => {
      const d = new THREE.Mesh(deurGeo, deurMat)
      d.position.set(LX + sx * 0.31, v.y + 1.15, ZD - 0.02)
      scene.add(d)
      return d
    }),
  )
  const aanC = document.createElement('canvas')
  aanC.width = 256
  aanC.height = 96
  const aanTex = canvasTex(aanC)
  let laatsteAan = ''
  const tekenAan = (label: string, pijl: '▲' | '▼' | '') => {
    const sleutel = `${label}${pijl}`
    if (sleutel === laatsteAan) return
    laatsteAan = sleutel
    const g = aanC.getContext('2d')!
    g.fillStyle = '#05070c'
    g.fillRect(0, 0, 256, 96)
    g.fillStyle = '#ff4d3d'
    g.font = '900 72px "Courier New", ui-monospace, monospace'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(label, 160, 52)
    g.font = '900 52px Inter, system-ui, sans-serif'
    g.fillText(pijl, 60, 50)
    aanTex.needsUpdate = true
  }
  tekenAan('0', '')
  const aanMat = new THREE.MeshBasicMaterial({ map: aanTex, toneMapped: false })
  // Het bord naast de lift: alle verdiepen, met wat je er vindt.
  const bordC = document.createElement('canvas')
  bordC.width = 512
  bordC.height = 320
  {
    const g = bordC.getContext('2d')!
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 512, 320)
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 12, 320)
    g.fillStyle = '#ffffff'
    g.font = '800 46px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('🛗 LIFT', 36, 46)
    ;[...VERDIEPEN].reverse().forEach((v, i) => {
      const y = 112 + i * 56
      g.fillStyle = thema.primair
      g.beginPath()
      g.roundRect(34, y - 20, 52, 40, 8)
      g.fill()
      g.fillStyle = thema.tekstOpPrimair
      g.font = '900 28px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(v.label, 60, y + 1)
      g.textAlign = 'left'
      g.fillStyle = 'rgba(226,232,240,.92)'
      g.font = '700 28px Inter, system-ui, sans-serif'
      g.fillText(v.naam, 102, y + 1, 390)
    })
  }
  const bordMat = new THREE.MeshBasicMaterial({ map: canvasTex(bordC), toneMapped: false })
  for (const v of VERDIEPEN) {
    const scherm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), aanMat)
    scherm.position.set(LX, v.y + 2.55, ZD + 0.08)
    const knop = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16).rotateX(Math.PI / 2), mats.licht)
    knop.position.set(LX + 0.95, v.y + 1.2, ZD + 0.085)
    const knopPlaat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.02), mats.staal)
    knopPlaat.position.set(LX + 0.95, v.y + 1.2, ZD + 0.075)
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), bordMat)
    bord.position.set(LX - 1.95, v.y + 1.75, ZD + 0.02)
    scene.add(scherm, knopPlaat, knop, bord)
  }

  // ---------- de kooi ----------
  const kooi = new THREE.Group()
  const kw = 2.36
  const kd = ZD - Z0 - 0.3
  const kz = Z0 + 0.15 + kd / 2
  const kooiWand = new THREE.MeshStandardMaterial({ color: '#b9bfc6', metalness: 0.8, roughness: 0.35, envMap: omgeving })
  const spiegel = new THREE.MeshStandardMaterial({ color: '#dfe7ee', metalness: 1, roughness: 0.04, envMap: omgeving })
  const deel = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => doos(w, h, d, x, y, z, m, kooi)
  deel(kw, 0.06, kd, LX, 0.03, kz, mats.donker)
  deel(0.04, 2.4, kd, LX - kw / 2, 1.2, kz, kooiWand)
  deel(0.04, 2.4, kd, LX + kw / 2, 1.2, kz, kooiWand)
  deel(kw, 2.4, 0.04, LX, 1.2, Z0 + 0.17, spiegel)
  deel(kw, 0.05, kd, LX, 2.42, kz, mats.donker)
  deel(kw - 0.4, 0.02, kd - 0.4, LX, 2.39, kz, mats.licht)
  deel(0.05, 0.05, kd - 0.2, LX - kw / 2 + 0.08, 0.95, kz, mats.staal)
  deel(0.05, 0.05, kd - 0.2, LX + kw / 2 - 0.08, 0.95, kz, mats.staal)
  deel(kw - 0.2, 0.05, 0.05, LX, 0.95, Z0 + 0.3, mats.staal)
  // De spiegelwanden: achteraan over de hele breedte, en opzij. Echte weerspiegelingen (ook van
  // jezelf, de figuur op de avatarlaag), die elkaar ook weer weerspiegelen. Omdat elke spiegel de
  // scène opnieuw tekent, staan ze enkel aan als je in of bij de lift bent (zie spiegels()).
  const pr = Math.min(2, window.devicePixelRatio || 1) * (opt.licht ? 0.55 : 0.85)
  const spiegelVlak = (b: number, h: number) => {
    const sp = new Reflector(new THREE.PlaneGeometry(b, h), {
      textureWidth: Math.round(b * 260 * pr),
      textureHeight: Math.round(h * 260 * pr),
      color: new THREE.Color('#cfd6dd'),
      clipBias: 0.003,
    })
    sp.camera.layers.enable(AVATAR_LAAG)
    sp.visible = false
    kooi.add(sp)
    return sp
  }
  const SPH = 2.1
  const SPY = 1.25
  const achter = spiegelVlak(kw - 0.16, SPH)
  achter.position.set(LX, SPY, Z0 + 0.195)
  const links = spiegelVlak(kd - 0.5, SPH)
  links.position.set(LX - kw / 2 + 0.025, SPY, kz - 0.1)
  links.rotation.y = Math.PI / 2
  const rechts = spiegelVlak(kd - 0.5, SPH)
  rechts.position.set(LX + kw / 2 - 0.025, SPY, kz - 0.1)
  rechts.rotation.y = -Math.PI / 2
  // Op een zwak toestel enkel de achterwand (drie spiegels = drie keer extra tekenen).
  const spiegelLijst = opt.licht ? [achter] : [achter, links, rechts]
  // Geborstelde stalen lijsten rond de spiegels.
  for (const [b, x, z, ry] of [
    [kw - 0.16, LX, Z0 + 0.19, 0],
    [kd - 0.5, LX - kw / 2 + 0.022, kz - 0.1, Math.PI / 2],
    [kd - 0.5, LX + kw / 2 - 0.022, kz - 0.1, -Math.PI / 2],
  ] as const) {
    const lijst = new THREE.Group()
    lijst.position.set(x, 0, z)
    lijst.rotation.y = ry
    for (const y of [SPY - SPH / 2, SPY + SPH / 2]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b + 0.06, 0.04, 0.02), mats.staal)
      m.position.y = y
      lijst.add(m)
    }
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, SPH + 0.04, 0.02), mats.staal)
      m.position.x = (sx * (b + 0.02)) / 2
      m.position.y = SPY
      lijst.add(m)
    }
    kooi.add(lijst)
  }
  // Het knoppenpaneel: een knop per verdiep, met het label ernaast.
  const paneelC = document.createElement('canvas')
  paneelC.width = 128
  paneelC.height = 320
  {
    const g = paneelC.getContext('2d')!
    g.fillStyle = '#9aa1a9'
    g.fillRect(0, 0, 128, 320)
    ;[...VERDIEPEN].reverse().forEach((v, i) => {
      const y = 46 + i * 72
      g.fillStyle = '#e5e7eb'
      g.beginPath()
      g.arc(64, y, 26, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = thema.primair
      g.lineWidth = 4
      g.stroke()
      g.fillStyle = '#111827'
      g.font = '900 26px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(v.label, 64, y + 1)
    })
  }
  const paneel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(paneelC), toneMapped: false }))
  paneel.position.set(LX + kw / 2 - 0.03, 1.25, ZD - 0.42)
  paneel.rotation.y = -Math.PI / 2
  kooi.add(paneel)
  const kooiAan = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), aanMat)
  kooiAan.position.set(LX, 2.6 - 0.25, ZD - 0.16)
  kooiAan.rotation.y = Math.PI
  kooi.add(kooiAan)
  const kooiDeuren = [-1, 1].map((sx) => deel(0.6, 2.3, 0.03, LX + sx * 0.3, 1.15, ZD - 0.13, deurMat))
  scene.add(kooi)

  // ---------- botsingen ----------
  const schacht: Rechthoek[] = [
    { x0: LX - 1.36, x1: LX - 1.2, z0: Z0, z1: ZD + 0.08 },
    { x0: LX + 1.2, x1: LX + 1.36, z0: Z0, z1: ZD + 0.08 },
    { x0: LX - 1.36, x1: LX - 0.6, z0: ZD - 0.08, z1: ZD + 0.08 },
    { x0: LX + 0.6, x1: LX + 1.36, z0: ZD - 0.08, z1: ZD + 0.08 },
    { x0: LX - 1.36, x1: LX + 1.36, z0: Z0 - 0.2, z1: Z0 + 0.15 },
  ]
  const deurRect: Rechthoek = { x0: LX - 0.6, x1: LX + 0.6, z0: ZD - 0.1, z1: ZD + 0.1 }

  let lift: Lift = nieuweLift()
  const binnen = (x: number, z: number) => Math.abs(x - LX) < 1.05 && z > Z0 + 0.2 && z < ZD - 0.1
  const bijDeur = (x: number, z: number) => Math.abs(x - LX) < 1.9 && z >= ZD && z < ZD + 2.8
  return {
    x: LX,
    zDeur: ZD,
    binnen,
    spiegels(aan) {
      for (const sp of spiegelLijst) sp.visible = aan
    },
    bijKooi: (x, z, verdiep) => binnen(x, z) || (Math.round(lift.hoogte) === verdiep && lift.toestand !== 'rijden' && Math.abs(x - LX) < 2.2 && z >= ZD - 0.2 && z < ZD + 4),
    obstakels(verdiep) {
      return deurOp(lift, verdiep) < 0.95 ? [...schacht, deurRect] : schacht
    },
    update(dt, speler) {
      const r = liftStap(lift, dt, {
        verdiep: speler.verdiep,
        inKooi: speler.actief && binnen(speler.x, speler.z),
        bijDeur: speler.actief && bijDeur(speler.x, speler.z),
        keuze: speler.keuze,
      })
      lift = r.lift
      VERDIEPEN.forEach((v, i) => {
        const o = deurOp(lift, v.nr)
        landing[i][0].position.x = LX - 0.31 - o * 0.62
        landing[i][1].position.x = LX + 0.31 + o * 0.62
      })
      kooi.position.y = liftY(lift.hoogte)
      const ko = lift.toestand === 'rijden' ? 0 : lift.deur
      kooiDeuren[0].position.x = LX - 0.3 - ko * 0.6
      kooiDeuren[1].position.x = LX + 0.3 + ko * 0.6
      const rijdt = lift.toestand === 'rijden'
      const pijl = rijdt ? (lift.doel > lift.van ? '▲' : '▼') : ''
      const nu = VERDIEPEN.find((v) => v.nr === liftVerdiep(lift))
      tekenAan(nu?.label ?? '', pijl)
      return { aangekomen: r.aangekomen, vloerY: r.spelerHoogte != null ? liftY(r.spelerHoogte) : null, keuzeGebruikt: r.keuzeGebruikt, lift }
    },
  }
}
