import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Rechthoek, StadionThema } from '@/lib/virtueel'
import { MUUR_H, muurLengte, tekenMuurBasis, tekenStreek, type Tag } from '@/lib/virtueel-graffiti'
import { tekenTactiekbord, type Tactiek } from '@/lib/virtueel-tactiek'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { AVATAR_LAAG } from './avatar'
import { canvasTex, rnd, rondLogo } from './stadion'

// Het spelersgebouw, vastgebouwd aan de westgevel van het stadion, naast de westpoort:
//  • een kleedkamer om binnen te wandelen, helemaal in de clubkleuren: banken met shirts aan de
//    haken, een kist ballen, en een whiteboard met een krachtbalveld en magneetjes voor de tactiek
//    (op je gsm kan je de magneetjes verschuiven en looplijnen tekenen);
//  • de douches: tegels met een band in clubkleur, douchekoppen met stromend water en damp;
//  • de spelersdeur: een korte tunnel door de gevel, rechtstreeks de westgang van het stadion in
//    (de opening zit in GEVEL.poorten);
//  • de graffitimuur: de noordgevel van het gebouw, recht naar de westpoort gekeerd. Hij begint aan
//    het stadion en groeit als vrijstaande muur verder naar het westen naarmate er meer getagd wordt
//    (zie lib/virtueel-graffiti.ts). Kijkend naar de muur loopt hij van links (het stadion) naar rechts.

export const KLEED = { x0: -68, x1: -50, z0: 6, z1: 18, px: -62, h: 4.4 }
const DEUR = { z0: 9, z1: 11 }
const DOORGANG = { z0: 11.8, z1: 13.4 }
const PPM = 80

/** Plekken rond de spelersgebouwen en het clubhuis waar geen paaltjes, lantaarns of bomen mogen. */
export function bijSpelersgebouwen(x: number, z: number): boolean {
  return (x > -89 && x < -48.5 && z > 0.5 && z < 19.5) || (x > -82 && x < -54 && z > -21 && z < -7)
}

export type Kleedkamer = {
  obstakels: Rechthoek[]
  update: (seconden: number) => void
  zetTactiek: (t: Tactiek) => void
  zetTags: (tags: Tag[], lengte: number) => void
  /** Waar het bord en de muur staan, om de knop "tactiekbord"/"spuit op de muur" te tonen. */
  bijBord: (x: number, z: number) => boolean
  bijMuur: (x: number, z: number) => boolean
  /** Staat dit punt in de kleedkamer (dan kan je jezelf in de spiegel zien)? */
  binnen: (x: number, z: number) => boolean
  /** De spiegel aan/uit: hij tekent de scène een tweede keer, dus enkel als je in de kleedkamer bent. */
  spiegel: (aan: boolean) => void
}

export function bouwKleedkamer(scene: THREE.Scene, opt: { thema: StadionThema; licht: boolean; logo: Promise<HTMLImageElement | null> }): Kleedkamer {
  const { thema, licht } = opt
  const K = KLEED
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)
  const obstakels: Rechthoek[] = []
  const toeval = rnd(4321)
  const doos = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, obst = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    scene.add(m)
    if (obst) obstakels.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })
    return m
  }

  // ---------- materialen ----------
  const binnenwand = (() => {
    // Onderaan clubkleur, een witte band, bovenaan lichtgrijs.
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#eceae6'
    g.fillRect(0, 0, 8, 256)
    g.fillStyle = thema.primair
    g.fillRect(0, 150, 8, 106)
    g.fillStyle = thema.secundair
    g.fillRect(0, 142, 8, 8)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshLambertMaterial({ map: t })
  })()
  const tegels = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#c9ced4'
    g.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 256; y += 32)
      for (let x = 0; x < 256; x += 32) {
        g.fillStyle = '#f4f5f6'
        g.fillRect(x + 1, y + 1, 30, 30)
      }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  })()
  const tegelWand = new THREE.MeshLambertMaterial({ map: tegels })
  const buitenMat = new THREE.MeshLambertMaterial({ color: '#2b3442' })
  const clubMat = new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.12 })
  const houtMat = new THREE.MeshLambertMaterial({ color: '#b07a45' })
  const staal = new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.85, roughness: 0.25, emissive: '#30343a', emissiveIntensity: 0.4 })
  const lichtMat = new THREE.MeshBasicMaterial({ color: '#f8fbff', toneMapped: false })

  // ---------- muren, dak en vloer ----------
  const t = 0.26
  /** Een wandvlak binnen: `n` = de richting waarin het kijkt; tegels krijgen een echte tegelmaat. */
  const binnenVlak = (x: number, z: number, lang: number, n: 'x+' | 'x-' | 'z+' | 'z-', mat: THREE.Material) => {
    const v = new THREE.PlaneGeometry(lang, K.h - 0.02)
    if (mat === tegelWand) {
      const uv = v.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (lang / 2), uv.getY(i) * ((K.h - 0.02) / 2))
    }
    const m = new THREE.Mesh(v, mat)
    m.position.set(x, K.h / 2, z)
    m.rotation.y = n === 'z+' ? 0 : n === 'z-' ? Math.PI : n === 'x+' ? Math.PI / 2 : -Math.PI / 2
    scene.add(m)
    // Bij tegels: een band in clubkleur op schouderhoogte.
    if (mat === tegelWand) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(lang, 0.22), clubMat)
      b.position.set(x, 1.45, z)
      b.rotation.y = m.rotation.y
      b.position.add(new THREE.Vector3(0, 0, 0.003).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y))
      scene.add(b)
    }
  }
  const wandStuk = (x0: number, z0: number, x1: number, z1: number) => doos(Math.max(t, x1 - x0), K.h, Math.max(t, z1 - z0), (x0 + x1) / 2, K.h / 2, (z0 + z1) / 2, buitenMat, true)
  const e = t / 2 + 0.006
  // Noord- en zuidwand (binnen: douche = tegels, kleedkamer = clubkleuren).
  for (const [z, n] of [
    [K.z0, 'z+'],
    [K.z1, 'z-'],
  ] as const) {
    wandStuk(K.x0, z - t / 2, K.x1, z + t / 2)
    const zi = n === 'z+' ? z + e : z - e
    binnenVlak((K.px + K.x1) / 2, zi, K.x1 - K.px, n, binnenwand)
    binnenVlak((K.x0 + K.px) / 2, zi, K.px - K.x0, n, tegelWand)
  }
  // Westwand (douche).
  wandStuk(K.x0 - t / 2, K.z0, K.x0 + t / 2, K.z1)
  binnenVlak(K.x0 + e, (K.z0 + K.z1) / 2, K.z1 - K.z0, 'x+', tegelWand)
  // Oostwand met de deur.
  wandStuk(K.x1 - t / 2, K.z0, K.x1 + t / 2, DEUR.z0)
  wandStuk(K.x1 - t / 2, DEUR.z1, K.x1 + t / 2, K.z1)
  binnenVlak(K.x1 - e, (K.z0 + DEUR.z0) / 2, DEUR.z0 - K.z0, 'x-', binnenwand)
  binnenVlak(K.x1 - e, (DEUR.z1 + K.z1) / 2, K.z1 - DEUR.z1, 'x-', binnenwand)
  doos(t, K.h - 2.7, DEUR.z1 - DEUR.z0, K.x1, 2.7 + (K.h - 2.7) / 2, (DEUR.z0 + DEUR.z1) / 2, buitenMat)
  // Tussenwand met een doorgang: tegels aan de douchekant, clubkleuren aan de kleedkamerkant.
  for (const [za, zb] of [
    [K.z0, DOORGANG.z0],
    [DOORGANG.z1, K.z1],
  ]) {
    wandStuk(K.px - t / 2, za, K.px + t / 2, zb)
    binnenVlak(K.px - e, (za + zb) / 2, zb - za, 'x-', tegelWand)
    binnenVlak(K.px + e, (za + zb) / 2, zb - za, 'x+', binnenwand)
  }
  doos(t, K.h - 2.4, DOORGANG.z1 - DOORGANG.z0, K.px, 2.4 + (K.h - 2.4) / 2, (DOORGANG.z0 + DOORGANG.z1) / 2, binnenwand)
  // Dak met een rand in clubkleur, plafond met lichtpanelen.
  doos(K.x1 - K.x0 + 0.8, 0.3, K.z1 - K.z0 + 0.8, (K.x0 + K.x1) / 2, K.h + 0.15, (K.z0 + K.z1) / 2, buitenMat)
  doos(K.x1 - K.x0 + 0.9, 0.35, 0.1, (K.x0 + K.x1) / 2, K.h + 0.15, K.z1 + 0.45, clubMat)
  doos(0.1, 0.35, K.z1 - K.z0 + 0.9, K.x0 - 0.45, K.h + 0.15, (K.z0 + K.z1) / 2, clubMat)
  const plafond = new THREE.Mesh(new THREE.PlaneGeometry(K.x1 - K.x0, K.z1 - K.z0).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f3f4f6' }))
  plafond.position.set((K.x0 + K.x1) / 2, K.h - 0.01, (K.z0 + K.z1) / 2)
  scene.add(plafond)
  for (let x = K.x0 + 1.6; x < K.x1; x += 3.2) for (let z = K.z0 + 2; z < K.z1; z += 4) doos(1.2, 0.03, 0.6, x, K.h - 0.03, z, lichtMat)
  // Vloer: rubber in de kleedkamer met het logo, tegels in de douche.
  const vloer = new THREE.Mesh(new THREE.PlaneGeometry(K.x1 - K.px, K.z1 - K.z0).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a2f38' }))
  vloer.position.set((K.px + K.x1) / 2, 0.02, (K.z0 + K.z1) / 2)
  const doucheVloer = new THREE.Mesh(new THREE.PlaneGeometry(K.px - K.x0, K.z1 - K.z0).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#cfd4da' }))
  doucheVloer.position.set((K.x0 + K.px) / 2, 0.02, (K.z0 + K.z1) / 2)
  scene.add(vloer, doucheVloer)
  const logoC = document.createElement('canvas')
  logoC.width = logoC.height = 512
  const logoTex = canvasTex(logoC)
  const tekenLogo = (logo: HTMLImageElement | null) => {
    const g = logoC.getContext('2d')!
    g.clearRect(0, 0, 512, 512)
    g.fillStyle = thema.secundair
    g.beginPath()
    g.arc(256, 256, 250, 0, Math.PI * 2)
    g.fill()
    rondLogo(g, logo, thema, 256, 256, 228)
    logoTex.needsUpdate = true
  }
  tekenLogo(null)
  const vloerLogo = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }))
  vloerLogo.position.set((K.px + K.x1) / 2, 0.025, (K.z0 + K.z1) / 2)
  scene.add(vloerLogo)

  // ---------- de spelersdeur: een tunnel door de gevel, met een bord in de gang ----------
  const gevelBinnen = -47.4
  const tunnelL = gevelBinnen - K.x1
  const tunnelZ = (DEUR.z0 + DEUR.z1) / 2
  const tunnelVloer = new THREE.Mesh(new THREE.PlaneGeometry(tunnelL, DEUR.z1 - DEUR.z0).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a2f38' }))
  tunnelVloer.position.set(K.x1 + tunnelL / 2, 0.02, tunnelZ)
  scene.add(tunnelVloer)
  for (const z of [DEUR.z0 - 0.08, DEUR.z1 + 0.08]) doos(tunnelL, 2.7, 0.16, K.x1 + tunnelL / 2, 1.35, z, clubMat)
  doos(tunnelL, 0.2, DEUR.z1 - DEUR.z0 + 0.32, K.x1 + tunnelL / 2, 2.8, tunnelZ, buitenMat)
  doos(tunnelL - 0.2, 0.02, 0.5, K.x1 + tunnelL / 2, 2.68, tunnelZ, lichtMat)
  // Een kader in clubkleur rond de deur in de gang, en een verlicht bord erboven.
  for (const z of [DEUR.z0 - 0.12, DEUR.z1 + 0.12]) doos(0.08, 2.9, 0.24, gevelBinnen + 0.04, 1.45, z, clubMat)
  doos(0.08, 0.24, DEUR.z1 - DEUR.z0 + 0.48, gevelBinnen + 0.04, 2.9, tunnelZ, clubMat)
  const bordC = document.createElement('canvas')
  bordC.width = 1024
  bordC.height = 192
  const bordTex = canvasTex(bordC)
  const tekenBord = (logo: HTMLImageElement | null) => {
    const g = bordC.getContext('2d')!
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 1024, 192)
    rondLogo(g, logo, thema, 96, 96, 72)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 78px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('KLEEDKAMERS', 196, 80, 800)
    g.font = '700 34px Inter, system-ui, sans-serif'
    g.fillText(`Spelers · ${thema.naam}`, 198, 150, 800)
    bordTex.needsUpdate = true
  }
  tekenBord(null)
  const bordMat = new THREE.MeshBasicMaterial({ map: bordTex, toneMapped: false })
  const bordGang = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), bordMat)
  bordGang.position.set(gevelBinnen + 0.1, 3.45, tunnelZ)
  bordGang.rotation.y = Math.PI / 2
  scene.add(bordGang)
  // Ook buiten, boven de graffitimuur aan de kant van de poort: wie binnenkomt ziet waar het is.
  const bordBuiten = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.825), bordMat)
  bordBuiten.position.set(K.x1 - 3, K.h + 0.75, K.z0 - 0.2)
  bordBuiten.rotation.y = Math.PI
  scene.add(bordBuiten)
  void opt.logo.then((logo) => {
    tekenBord(logo)
    tekenLogo(logo)
  })

  // ---------- de kleedkamer ----------
  // Banken langs de noord- en zuidwand, met een rugplank in clubkleur en shirts aan de haken.
  const bankGeo = mergeGeometries([new THREE.BoxGeometry(1, 0.06, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.45, 0.22, 0), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.45, 0.22, 0)])
  const banken: THREE.Matrix4[] = []
  const shirts: { x: number; z: number; ry: number; nr: number }[] = []
  const rijen: [number, number, number, number][] = [
    // z van de bank, z van de wand, richting (1 = zuid), x-bereik (1 = korter: plaats voor de ballenkist)
    [K.z0 + 0.45, K.z0 + 0.14, 1, 1],
    [K.z1 - 0.45, K.z1 - 0.14, -1, 0],
  ]
  let nr = 1
  for (const [bz, wz, richting, k] of rijen) {
    const xa = K.px + 0.6
    const xb = k === 0 ? K.x1 - 0.6 : K.x1 - 3.2
    for (let x = xa + 0.5; x <= xb - 0.5; x += 1) banken.push(new THREE.Matrix4().makeTranslation(x, 0, bz))
    obstakels.push({ x0: xa, x1: xb, z0: bz - 0.25, z1: bz + 0.25 })
    // Rugplank en kapstok.
    doos(xb - xa, 1.0, 0.04, (xa + xb) / 2, 1.5, wz + richting * 0.03, clubMat)
    doos(xb - xa, 0.05, 0.08, (xa + xb) / 2, 2.1, wz + richting * 0.06, houtMat)
    for (let x = xa + 0.6; x <= xb - 0.4; x += 1.1) shirts.push({ x, z: wz + richting * 0.1, ry: richting === 1 ? 0 : Math.PI, nr: nr++ })
  }
  const bankMesh = new THREE.InstancedMesh(bankGeo, houtMat, banken.length)
  banken.forEach((m, i) => bankMesh.setMatrixAt(i, m))
  scene.add(bankMesh)
  // Shirts: één atlas met nummers.
  const shirtC = document.createElement('canvas')
  shirtC.width = 128 * 8
  shirtC.height = 160 * Math.ceil(shirts.length / 8)
  {
    const g = shirtC.getContext('2d')!
    shirts.forEach((s, i) => {
      const x = (i % 8) * 128
      const y = Math.floor(i / 8) * 160
      g.fillStyle = thema.primair
      g.beginPath()
      g.moveTo(x + 34, y + 10)
      g.lineTo(x + 94, y + 10)
      g.lineTo(x + 124, y + 40)
      g.lineTo(x + 104, y + 62)
      g.lineTo(x + 98, y + 54)
      g.lineTo(x + 98, y + 152)
      g.lineTo(x + 30, y + 152)
      g.lineTo(x + 30, y + 54)
      g.lineTo(x + 24, y + 62)
      g.lineTo(x + 4, y + 40)
      g.closePath()
      g.fill()
      g.fillStyle = thema.secundair
      g.fillRect(x + 30, y + 140, 68, 12)
      g.beginPath()
      g.arc(x + 64, y + 12, 14, 0, Math.PI)
      g.fill()
      g.fillStyle = thema.tekstOpPrimair
      g.font = '900 54px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(s.nr), x + 64, y + 92)
    })
  }
  const shirtTex = canvasTex(shirtC)
  const shirtRijen = Math.ceil(shirts.length / 8)
  const shirtGeos = shirts.map((s, i) => {
    const v = new THREE.PlaneGeometry(0.6, 0.75)
    const u0 = (i % 8) / 8
    const v1 = 1 - Math.floor(i / 8) / shirtRijen
    v.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u0 + 1 / 8, v1, u0, v1 - 1 / shirtRijen, u0 + 1 / 8, v1 - 1 / shirtRijen], 2))
    v.rotateY(s.ry)
    v.translate(s.x, 1.62, s.z)
    return v
  })
  scene.add(new THREE.Mesh(mergeGeometries(shirtGeos), new THREE.MeshLambertMaterial({ map: shirtTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })))
  // Kist met ballen en een tafel met drinkbussen bij de deur.
  doos(1.0, 0.5, 0.7, K.x1 - 1.0, 0.25, K.z0 + 1.0, houtMat, true)
  for (let i = 0; i < 6; i++) {
    const bal = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: '#fde047', roughness: 0.6 }))
    bal.position.set(K.x1 - 1.3 + (i % 3) * 0.3, 0.6 + Math.floor(i / 3) * 0.12, K.z0 + 0.9 + (i % 2) * 0.2)
    scene.add(bal)
  }
  doos(1.4, 0.05, 0.7, K.x1 - 1.0, 0.85, K.z1 - 2.2, houtMat)
  doos(0.06, 0.82, 0.06, K.x1 - 1.6, 0.42, K.z1 - 2.2, staal)
  doos(0.06, 0.82, 0.06, K.x1 - 0.4, 0.42, K.z1 - 2.2, staal)
  obstakels.push({ x0: K.x1 - 1.75, x1: K.x1 - 0.25, z0: K.z1 - 2.6, z1: K.z1 - 1.8 })
  for (let i = 0; i < 6; i++) {
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 10), new THREE.MeshStandardMaterial({ color: i % 2 ? primair : secundair, roughness: 0.3 }))
    bus.position.set(K.x1 - 1.55 + i * 0.22, 1.0, K.z1 - 2.2)
    scene.add(bus)
  }
  // Het tactiekbord op de tussenwand, met een motto erboven.
  const BORD = { x: K.px + 0.16, z: 8.4, b: 2.8, h: 1.75, y: 1.75 }
  const tacC = document.createElement('canvas')
  tacC.width = 1024
  tacC.height = 640
  const tacTex = canvasTex(tacC)
  const tekenBordTactiek = (tt: Tactiek | null) => {
    const g = tacC.getContext('2d')!
    tekenTactiekbord(g, 1024, 640, tt ?? { magneten: [], lijnen: [] }, { wij: thema.primair, tekstWij: thema.tekstOpPrimair })
    tacTex.needsUpdate = true
  }
  const whiteboard = new THREE.Mesh(new THREE.PlaneGeometry(BORD.b, BORD.h), new THREE.MeshBasicMaterial({ map: tacTex, toneMapped: false }))
  whiteboard.position.set(BORD.x, BORD.y, BORD.z)
  whiteboard.rotation.y = Math.PI / 2
  scene.add(whiteboard)
  doos(0.05, 0.06, BORD.b - 0.2, BORD.x + 0.04, BORD.y - BORD.h / 2 - 0.04, BORD.z, staal)
  const mottoC = document.createElement('canvas')
  mottoC.width = 1024
  mottoC.height = 128
  {
    const g = mottoC.getContext('2d')!
    g.fillStyle = thema.secundair
    g.font = '900 84px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('SAMEN STERK', 512, 68, 1000)
  }
  const motto = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(mottoC), transparent: true, toneMapped: false }))
  motto.position.set(K.px + 0.15, 3.0, BORD.z)
  motto.rotation.y = Math.PI / 2
  scene.add(motto)

  // ---------- de spiegel: een echte weerspiegeling, met lampjes eromheen zoals in een loge ----------
  const SP = { x: K.x1 - t / 2 - 0.03, z: 13.4, y: 1.55, b: 1.3, h: 1.9 }
  const pr = Math.min(2, window.devicePixelRatio || 1)
  const spiegel = new Reflector(new THREE.PlaneGeometry(SP.b, SP.h), {
    textureWidth: Math.round(360 * pr * (licht ? 0.7 : 1)),
    textureHeight: Math.round(520 * pr * (licht ? 0.7 : 1)),
    color: new THREE.Color('#c9d1d9'),
    clipBias: 0.003,
  })
  spiegel.position.set(SP.x, SP.y, SP.z)
  spiegel.rotation.y = -Math.PI / 2
  // De spiegel ziet ook jezelf (de figuur op de avatarlaag), de gewone camera niet.
  spiegel.camera.layers.enable(AVATAR_LAAG)
  spiegel.visible = false
  scene.add(spiegel)
  doos(0.06, SP.h + 0.24, SP.b + 0.24, SP.x + 0.05, SP.y, SP.z, clubMat)
  for (let k = 0; k < 6; k++) {
    for (const sz of [-1, 1]) {
      const lampje = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), lichtMat)
      lampje.position.set(SP.x - 0.05, SP.y - SP.h / 2 + 0.15 + k * ((SP.h - 0.3) / 5), SP.z + sz * (SP.b / 2 + 0.06))
      scene.add(lampje)
    }
  }
  doos(0.35, 0.04, SP.b + 0.1, SP.x - 0.17, 0.95, SP.z, houtMat)
  obstakels.push({ x0: SP.x - 0.4, x1: K.x1, z0: SP.z - SP.b / 2 - 0.1, z1: SP.z + SP.b / 2 + 0.1 })

  // ---------- de douches ----------
  const douchePlekken = [8.4, 10.4, 12.4, 14.4, 16.4]
  const waterTex = (() => {
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 64
    const g = c.getContext('2d')!
    for (let y = 0; y < 64; y += 4) {
      g.fillStyle = `rgba(220,240,255,${0.15 + toeval() * 0.45})`
      g.fillRect(toeval() * 12, y, 2 + toeval() * 3, 3)
    }
    const tt = new THREE.CanvasTexture(c)
    tt.wrapS = tt.wrapT = THREE.RepeatWrapping
    tt.repeat.set(2, 3)
    return tt
  })()
  const waterMat = new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const damp: { sp: THREE.Sprite; z: number; f: number }[] = []
  const dampC = document.createElement('canvas')
  dampC.width = dampC.height = 64
  {
    const g = dampC.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  }
  const dampTex = new THREE.CanvasTexture(dampC)
  douchePlekken.forEach((z, i) => {
    const buis = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), staal)
    buis.position.set(K.x0 + 0.2, 1.75, z)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8).rotateZ(Math.PI / 2), staal)
    arm.position.set(K.x0 + 0.35, 2.25, z)
    const kop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.05, 16), staal)
    kop.position.set(K.x0 + 0.52, 2.22, z)
    const kraan = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12).rotateZ(Math.PI / 2), staal)
    kraan.position.set(K.x0 + 0.17, 1.2, z)
    const putje = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2), staal)
    putje.position.set(K.x0 + 0.52, 0.025, z)
    scene.add(buis, arm, kop, kraan, putje)
    if (i % 2 === 0) {
      const straal = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, 2.15, 14, 1, true).translate(0, -1.075, 0), waterMat)
      straal.position.set(K.x0 + 0.52, 2.2, z)
      scene.add(straal)
      for (let k = 0; k < (licht ? 1 : 3); k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dampTex, transparent: true, depthWrite: false, opacity: 0.5 }))
        sp.scale.setScalar(1.6)
        scene.add(sp)
        damp.push({ sp, z, f: toeval() * 4 })
      }
    }
  })
  // Handdoeken aan de tussenwand in de douche.
  for (let k = 0; k < 4; k++) {
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.45), new THREE.MeshLambertMaterial({ color: k % 2 ? primair : '#f8fafc' }))
    hd.position.set(K.px - 0.18, 1.3, 16.8 - k * 0.6)
    scene.add(hd)
  }
  doos(0.06, 0.04, 2.6, K.px - 0.16, 1.68, 15.9, staal)

  // ---------- de graffitimuur ----------
  // De noordgevel van het gebouw (18 m) en, als de muur groeit, vrijstaande betonmuren ernaast
  // (naar het westen). De muur kijkt naar -z: links (u = 0) is de kant van het stadion.
  const muurZ = K.z0 - t / 2 - 0.012
  let lengte = muurLengte(0)
  let tags: Tag[] = []
  const muurC = document.createElement('canvas')
  const muurTex = canvasTex(muurC)
  const muurMat = new THREE.MeshLambertMaterial({ map: muurTex })
  let muurVlak: THREE.Mesh | null = null
  let stukken: THREE.Mesh | null = null
  const betonMat = new THREE.MeshLambertMaterial({ color: '#8b9099' })
  const bouwMuur = () => {
    muurC.width = Math.round(lengte * PPM)
    muurC.height = Math.round(MUUR_H * PPM)
    const g = muurC.getContext('2d')!
    tekenMuurBasis(g, lengte, PPM, { naam: thema.naam, primair: thema.primair, secundair: thema.secundair })
    muurTex.needsUpdate = true
    if (muurVlak) scene.remove(muurVlak)
    muurVlak = new THREE.Mesh(new THREE.PlaneGeometry(lengte, MUUR_H), muurMat)
    muurVlak.position.set(K.x1 - lengte / 2, MUUR_H / 2, muurZ)
    muurVlak.rotation.y = Math.PI
    scene.add(muurVlak)
    if (stukken) scene.remove(stukken)
    stukken = null
    const extra = lengte - (K.x1 - K.x0)
    if (extra > 0) {
      stukken = new THREE.Mesh(new THREE.BoxGeometry(extra, MUUR_H + 0.2, 0.3), betonMat)
      stukken.position.set(K.x0 - extra / 2, (MUUR_H + 0.2) / 2, K.z0)
      scene.add(stukken)
    }
  }
  bouwMuur()
  // Tags tekenen in stukjes, zodat een volle muur het beeld niet laat haperen.
  let tekenTaak = 0
  const tekenTags = (vanaf: number) => {
    const taak = ++tekenTaak
    const g = muurC.getContext('2d')!
    let i = vanaf
    const stap = () => {
      if (taak !== tekenTaak) return
      const einde = Math.min(tags.length, i + 25)
      for (; i < einde; i++) for (const s of tags[i].streken) tekenStreek(g, s, PPM)
      muurTex.needsUpdate = true
      if (i < tags.length) setTimeout(stap, 16)
    }
    stap()
  }
  const muurObst: Rechthoek = { x0: K.x0, x1: K.x0, z0: K.z0 - 0.15, z1: K.z0 + 0.15 }
  obstakels.push(muurObst)

  return {
    obstakels,
    update(seconden) {
      waterTex.offset.y = -(seconden * 2.2) % 1
      for (const d of damp) {
        const f = ((seconden * 0.25 + d.f) % 1)
        d.sp.position.set(K.x0 + 0.9 + f * 0.8, 0.8 + f * 2.2, d.z + Math.sin(seconden + d.f) * 0.2)
        d.sp.material.opacity = 0.45 * Math.sin(f * Math.PI)
      }
    },
    zetTactiek: tekenBordTactiek,
    zetTags(nieuw, nieuweLengte) {
      const groei = nieuweLengte !== lengte
      const alleenErbij = !groei && nieuw.length >= tags.length && nieuw.slice(0, tags.length).every((x, i) => x.id === tags[i].id)
      const vanaf = alleenErbij ? tags.length : 0
      tags = nieuw
      if (groei) {
        lengte = nieuweLengte
        bouwMuur()
        muurObst.x0 = K.x1 - lengte
      } else if (!alleenErbij) {
        tekenMuurBasis(muurC.getContext('2d')!, lengte, PPM, { naam: thema.naam, primair: thema.primair, secundair: thema.secundair })
      }
      tekenTags(groei ? 0 : vanaf)
    },
    bijBord: (x, z) => x > K.px && x < K.px + 2.6 && Math.abs(z - BORD.z) < 2.2,
    binnen: (x, z) => x > K.x0 && x < K.x1 && z > K.z0 && z < K.z1,
    spiegel(aan) {
      spiegel.visible = aan
    },
    bijMuur: (x, z) => x > K.x1 - lengte - 0.5 && x < K.x1 + 0.5 && z < K.z0 && z > K.z0 - 4.5,
  }
}
