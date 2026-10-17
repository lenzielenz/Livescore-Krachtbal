import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'
import { artikelVan, STANDAARD_OUTFIT, type Artikel, type Outfit } from '@/lib/virtueel-fanshop'
import { krachtbalGeometrie, krachtbalTextuur } from './krachtbal'

// Jijzelf, als supporter: standaard een thuisshirt in clubkleur, een jeans, witte sneakers, een pet
// en een gestreepte clubsjaal met franjes. In de fanshop koop je andere kledij (zie
// lib/virtueel-fanshop.ts); kleedAan() trekt die aan. Je ziet jezelf enkel in een spiegel: de
// figuur staat op een eigen laag (AVATAR_LAAG) die de gewone camera niet tekent, maar de camera
// van de spiegel wel. Andere supporters (meerdere spelers) en de paskamer gebruiken dezelfde
// figuur op een andere laag.

export const AVATAR_LAAG = 1
/** Wat je zelf vasthoudt, in eerste persoon: enkel de gewone camera tekent het, niet de spiegels. */
export const EIGEN_LAAG = 2

export type Avatar = {
  groep: THREE.Group
  /** Zet de figuur op jouw plek: voeten op `vloerY`, kijkend in `yaw`; `tempo` (m/s) voor de pas. */
  update: (x: number, vloerY: number, z: number, yaw: number, pitch: number, tempo: number, seconden: number) => void
  zichtbaar: (aan: boolean) => void
  /** Zwaaien als je stilstaat (enkel voor de spiegel: in het spel zelf sta je gewoon stil). */
  zwaai: (aan: boolean) => void
  /** Iets in je linkerhand (bv. een doosje popcorn), of null om niets vast te houden. */
  houdVast: (iets: THREE.Object3D | null) => void
  /** Trek een outfit aan (artikel-id's per soort; wat ontbreekt blijft standaard). */
  kleedAan: (outfit: Partial<Outfit>) => void
  dispose: () => void
}

let logoCache: HTMLImageElement | null = null
/** Het BAKMAN-logo (public/virtueel/bakman-logo.webp), één keer geladen. */
const bakmanLogo = () => {
  if (!logoCache) {
    logoCache = new Image()
    logoCache.src = '/virtueel/bakman-logo.webp'
  }
  return logoCache
}

const textuur = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function bouwAvatar(scene: THREE.Scene, thema: StadionThema, opt: { laag?: number; zwaaien?: boolean } = {}): Avatar {
  const laag = opt.laag ?? AVATAR_LAAG
  let zwaaien = opt.zwaaien ?? true
  const kleur = (k: string | undefined, standaard: string) => (k === 'club' ? thema.primair : k === 'club2' ? thema.secundair : (k ?? standaard))
  const groep = new THREE.Group()
  const shirt = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 })
  const mouw = new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.7 })
  const shirt2 = new THREE.MeshStandardMaterial({ color: thema.secundair, roughness: 0.7 })
  const broek = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 })
  const onderbeen = new THREE.MeshStandardMaterial({ color: '#2c3e63', roughness: 0.85 })
  const huid = new THREE.MeshStandardMaterial({ color: '#e7c3a0', roughness: 0.8 })
  const schoen = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 })
  const haar = new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 0.9 })
  const sjaal = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide })
  const franjeMat = new THREE.MeshStandardMaterial({ color: thema.secundair, roughness: 0.9 })

  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ouder: THREE.Object3D = groep) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    ouder.add(m)
    return m
  }
  const laarzen: THREE.Mesh[] = []
  // Benen, in een groep per been om te kunnen stappen.
  const benen = [-0.1, 0.1].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 0.92, 0)
    deel(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 10), broek, 0, -0.24, 0, g)
    deel(new THREE.CylinderGeometry(0.075, 0.07, 0.42, 10), onderbeen, 0, -0.66, 0, g)
    deel(new THREE.BoxGeometry(0.12, 0.08, 0.27), schoen, 0, -0.88, 0.05, g)
    // De schacht van een laars (enkel zichtbaar bij laarzen).
    const schacht = deel(new THREE.CylinderGeometry(0.088, 0.082, 0.34, 12), schoen, 0, -0.7, 0, g)
    schacht.visible = false
    laarzen.push(schacht)
    groep.add(g)
    return g
  })
  // Romp: het shirt (met zijn patroon als textuur) en een band in de tweede kleur.
  const romp = deel(new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), shirt, 0, 1.24, 0)
  romp.scale.set(1, 1, 0.72)
  const band = deel(new THREE.CylinderGeometry(0.215, 0.215, 0.07, 16), shirt2, 0, 1.12, 0)
  band.scale.set(1, 1, 0.72)
  // Armen.
  const armen = [-0.28, 0.28].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 1.48, 0)
    deel(new THREE.CylinderGeometry(0.058, 0.052, 0.3, 8), mouw, 0, -0.15, 0, g)
    deel(new THREE.CylinderGeometry(0.046, 0.04, 0.3, 8), huid, 0, -0.45, 0, g)
    deel(new THREE.SphereGeometry(0.05, 8, 6), huid, 0, -0.62, 0, g)
    groep.add(g)
    return g
  })
  // Hoofd met haar; wat erop staat (pet, muts, hoed, kroon) wisselt.
  const hoofd = new THREE.Group()
  hoofd.position.set(0, 1.62, 0)
  deel(new THREE.SphereGeometry(0.12, 18, 14), huid, 0, 0.06, 0, hoofd)
  deel(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), haar, 0, 0.075, -0.01, hoofd)
  for (const x of [-0.04, 0.04]) deel(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#1f2937' }), x, 0.08, 0.112, hoofd)
  deel(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), huid, 0, -0.03, 0, hoofd)
  groep.add(hoofd)
  const hoofddeksel = new THREE.Group()
  hoofd.add(hoofddeksel)
  // De sjaal: een rol rond de hals, en twee afhangende uiteinden met franjes over de borst.
  const sjaalGroep = new THREE.Group()
  groep.add(sjaalGroep)
  const rol = deel(new THREE.TorusGeometry(0.12, 0.05, 10, 22), sjaal, 0, 1.56, 0.0, sjaalGroep)
  rol.rotation.x = Math.PI / 2 - 0.15
  rol.scale.set(1.1, 1, 1)
  for (const [x, rz, lang] of [
    [-0.07, 0.08, 0.52],
    [0.08, -0.05, 0.44],
  ] as const) {
    const eind = new THREE.Mesh(new THREE.BoxGeometry(0.11, lang, 0.025), sjaal)
    eind.geometry.translate(0, -lang / 2, 0)
    eind.position.set(x, 1.55, 0.17)
    eind.rotation.set(-0.12, 0, rz)
    sjaalGroep.add(eind)
    for (let k = 0; k < 5; k++) {
      const franje = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.008), franjeMat)
      franje.position.set(-0.045 + k * 0.022, -lang - 0.03, 0)
      eind.add(franje)
    }
  }
  // Een kap of een lange jas (hoodie, regenjas), en wat je rond je hals draagt in plaats van een sjaal.
  const jasGroep = new THREE.Group()
  groep.add(jasGroep)
  const halsGroep = new THREE.Group()
  groep.add(halsGroep)
  // Extra's: een vlag op je rug, een toeter in je rechterhand, een zonnebril, ...
  const extra = new THREE.Group()
  groep.add(extra)
  const rechterHand = new THREE.Group()
  rechterHand.position.set(0, -0.62, 0.03)
  armen[1].add(rechterHand)
  const extraHand = new THREE.Group()
  rechterHand.add(extraHand)
  const extraHoofd = new THREE.Group()
  hoofd.add(extraHoofd)

  // Wat je vasthoudt, zit in de linkerhand (de arm buigt dan naar voren, zoals je een doosje draagt).
  const hand = new THREE.Group()
  hand.position.set(0, -0.6, 0.02)
  armen[0].add(hand)
  let vast: THREE.Object3D | null = null

  const leeg = (g: THREE.Group) => {
    for (const c of [...g.children]) {
      g.remove(c)
      c.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    }
  }
  const zetLaag = (o: THREE.Object3D) =>
    o.traverse((x) => {
      x.layers.set(laag)
      x.frustumCulled = false
    })

  const shirtTex = (a: Artikel) => {
    const k1 = kleur(a.stijl.kleur, thema.primair)
    const k2 = kleur(a.stijl.kleur2, thema.secundair)
    return textuur(256, 128, (g) => {
      g.fillStyle = k1
      g.fillRect(0, 0, 256, 128)
      if (a.stijl.patroon === 'strepen') {
        g.fillStyle = k2
        for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 14, 128)
      } else if (a.stijl.patroon === 'retro') {
        g.fillStyle = k2
        g.fillRect(0, 44, 256, 14)
        g.fillRect(0, 64, 256, 6)
      } else if (a.stijl.patroon === 'ster') {
        g.fillStyle = k2
        g.font = '900 34px sans-serif'
        g.textAlign = 'center'
        g.fillText('★', 64, 60)
        g.fillRect(0, 0, 256, 6)
      } else if (a.stijl.patroon === 'hoops') {
        g.fillStyle = k2
        for (let y = 10; y < 128; y += 28) g.fillRect(0, y, 256, 13)
      } else if (a.stijl.patroon === 'bloemen') {
        for (let i = 0; i < 26; i++) {
          const x = (i * 53) % 256
          const y = (i * 37) % 128
          g.fillStyle = i % 3 ? k2 : '#f472b6'
          for (let b = 0; b < 5; b++) {
            const h = (b / 5) * Math.PI * 2
            g.beginPath()
            g.arc(x + Math.cos(h) * 6, y + Math.sin(h) * 6, 5, 0, Math.PI * 2)
            g.fill()
          }
          g.fillStyle = '#ffffff'
          g.beginPath()
          g.arc(x, y, 3, 0, Math.PI * 2)
          g.fill()
        }
      } else if (a.stijl.patroon === 'kerst') {
        g.fillStyle = k2
        for (let x = 0; x < 256; x += 16) {
          g.fillRect(x, 30, 8, 8)
          g.fillRect(x + 8, 96, 8, 8)
        }
        g.font = '900 26px sans-serif'
        g.textAlign = 'center'
        for (const x of [32, 96, 160, 224]) g.fillText(x % 64 ? '🦌' : '❄', x, 74)
      } else if (a.stijl.patroon === 'rits') {
        g.fillStyle = k2
        g.fillRect(60, 0, 8, 128)
        g.fillRect(0, 0, 256, 10)
        g.fillStyle = '#d1d5db'
        for (let y = 0; y < 128; y += 6) g.fillRect(62, y, 4, 3)
      } else if (a.stijl.patroon === 'banen') {
        g.fillStyle = k2
        g.fillRect(0, 0, 16, 128)
        g.fillRect(112, 0, 16, 128)
        g.fillRect(240, 0, 16, 128)
      }
      // Een kraagje en een rugnummer.
      g.fillStyle = k2
      g.fillRect(0, 0, 256, 4)
      g.font = '900 30px Inter, sans-serif'
      g.textAlign = 'center'
      g.fillStyle = a.stijl.patroon === 'strepen' ? '#ffffff' : k2
      g.fillText('12', 192, 66)
    })
  }

  let laatsteOutfit: Partial<Outfit> = {}
  const kleedAan = (outfit: Partial<Outfit>) => {
    laatsteOutfit = outfit
    const o = { ...STANDAARD_OUTFIT, ...outfit }
    const art = (id: string, standaard: string) => artikelVan(id) ?? artikelVan(standaard)!
    // Shirt.
    const sh = art(o.shirt, STANDAARD_OUTFIT.shirt)
    shirt.map?.dispose()
    shirt.map = shirtTex(sh)
    shirt.needsUpdate = true
    mouw.color.set(kleur(sh.stijl.kleur, thema.primair))
    shirt2.color.set(kleur(sh.stijl.kleur2, thema.secundair))
    leeg(jasGroep)
    if (sh.stijl.vorm === 'hoodie' || sh.stijl.vorm === 'jas') {
      const jm = new THREE.MeshStandardMaterial({ color: kleur(sh.stijl.kleur, thema.primair), roughness: sh.stijl.vorm === 'jas' ? 0.35 : 0.85, side: THREE.DoubleSide })
      // De kap in je nek.
      // De kap ligt in je nek, met de opening naar boven en naar voren.
      const kap = deel(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), jm, 0, 1.47, -0.2, jasGroep)
      kap.rotation.x = -2.36
      kap.scale.set(1, 0.8, 1)
      if (sh.stijl.vorm === 'jas') {
        // Een lange jas tot over de heupen, met knopen.
        const pand = deel(new THREE.CylinderGeometry(0.22, 0.27, 0.36, 18, 1, true), jm, 0, 0.92, 0, jasGroep)
        pand.scale.set(1, 1, 0.78)
        for (let k = 0; k < 4; k++) deel(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshStandardMaterial({ color: kleur(sh.stijl.kleur2, '#ca8a04') }), 0, 1.38 - k * 0.15, 0.158, jasGroep)
      } else {
        // Een buidelzak voorop.
        const zak = deel(new THREE.BoxGeometry(0.24, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: kleur(sh.stijl.kleur2, thema.secundair), roughness: 0.85 }), 0, 1.1, 0.155, jasGroep)
        void zak
      }
    }
    // Broek: lang of kort, effen of met banen opzij.
    const br = art(o.broek, STANDAARD_OUTFIT.broek)
    const grond = kleur(br.stijl.kleur, '#2c3e63')
    broek.map?.dispose()
    broek.map = null
    broek.color.set(grond)
    if (br.stijl.patroon === 'banen') {
      const baan = kleur(br.stijl.kleur2, thema.primair)
      broek.map = textuur(64, 16, (g) => {
        g.fillStyle = grond
        g.fillRect(0, 0, 64, 16)
        g.fillStyle = baan
        g.fillRect(12, 0, 4, 16)
        g.fillRect(44, 0, 4, 16)
      })
      broek.color.set('#ffffff')
    }
    if (br.stijl.patroon === 'ruit' || br.stijl.patroon === 'camo') {
      const k2b = kleur(br.stijl.kleur2, '#111827')
      broek.map = textuur(64, 64, (g) => {
        g.fillStyle = grond
        g.fillRect(0, 0, 64, 64)
        if (br.stijl.patroon === 'ruit') {
          g.globalAlpha = 0.55
          g.fillStyle = k2b
          for (let i = 0; i < 64; i += 16) {
            g.fillRect(i, 0, 5, 64)
            g.fillRect(0, i, 64, 5)
          }
          g.globalAlpha = 1
        } else {
          for (let i = 0; i < 14; i++) {
            g.fillStyle = i % 2 ? k2b : '#6b5b3a'
            g.beginPath()
            g.ellipse((i * 23) % 64, (i * 41) % 64, 9, 5, i, 0, Math.PI * 2)
            g.fill()
          }
        }
      })
      broek.color.set('#ffffff')
    }
    const glitter = br.id === 'broek-goud'
    broek.metalness = glitter ? 0.75 : 0
    broek.roughness = glitter ? 0.3 : 0.85
    broek.needsUpdate = true
    const kort = br.stijl.vorm === 'kort'
    onderbeen.map = kort ? null : broek.map
    onderbeen.color.copy(kort ? huid.color : broek.color)
    onderbeen.needsUpdate = true
    // Schoenen.
    const sc = art(o.schoenen, STANDAARD_OUTFIT.schoenen)
    schoen.color.set(kleur(sc.stijl.kleur, '#f8fafc'))
    for (const l of laarzen) l.visible = sc.stijl.vorm === 'laars'
    const goud = schoen.color.getHexString() === 'facc15'
    schoen.metalness = goud ? 0.7 : 0
    schoen.roughness = goud ? 0.3 : 0.5
    // Hoofddeksel.
    leeg(hoofddeksel)
    const p = art(o.pet, STANDAARD_OUTFIT.pet)
    const k1 = new THREE.MeshStandardMaterial({ color: kleur(p.stijl.kleur, thema.primair), roughness: 0.7 })
    const k2 = new THREE.MeshStandardMaterial({ color: kleur(p.stijl.kleur2, thema.secundair), roughness: 0.7 })
    if (p.stijl.vorm === 'pet') {
      deel(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), k1, 0, 0.1, 0, hoofddeksel)
      deel(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), k2, 0, 0.12, 0.09, hoofddeksel)
    } else if (p.stijl.vorm === 'muts') {
      const m = deel(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), k1, 0, 0.09, 0, hoofddeksel)
      m.scale.set(1, 1.25, 1)
      deel(new THREE.CylinderGeometry(0.137, 0.137, 0.05, 18), k2, 0, 0.1, 0, hoofddeksel)
      deel(new THREE.SphereGeometry(0.045, 10, 8), k2, 0, 0.27, 0, hoofddeksel)
    } else if (p.stijl.vorm === 'hoed') {
      deel(new THREE.CylinderGeometry(0.21, 0.21, 0.015, 24), k1, 0, 0.13, 0, hoofddeksel)
      deel(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 20), k1, 0, 0.24, 0, hoofddeksel)
      deel(new THREE.CylinderGeometry(0.122, 0.122, 0.04, 20), k2, 0, 0.16, 0, hoofddeksel)
    } else if (p.stijl.vorm === 'petachter') {
      deel(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), k1, 0, 0.1, 0, hoofddeksel)
      deel(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, Math.PI / 2, Math.PI), k2, 0, 0.12, -0.09, hoofddeksel)
    } else if (p.stijl.vorm === 'bucket') {
      deel(new THREE.CylinderGeometry(0.11, 0.135, 0.11, 20), k1, 0, 0.16, 0, hoofddeksel)
      deel(new THREE.CylinderGeometry(0.135, 0.2, 0.05, 24, 1, true), k1, 0, 0.1, 0, hoofddeksel).material = new THREE.MeshStandardMaterial({ color: k1.color, roughness: 0.8, side: THREE.DoubleSide })
      deel(new THREE.CylinderGeometry(0.113, 0.113, 0.025, 20), k2, 0, 0.13, 0, hoofddeksel)
    } else if (p.stijl.vorm === 'viking') {
      const ijzer = new THREE.MeshStandardMaterial({ color: kleur(p.stijl.kleur, '#9ca3af'), metalness: 0.85, roughness: 0.3 })
      deel(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), ijzer, 0, 0.08, 0, hoofddeksel)
      deel(new THREE.TorusGeometry(0.133, 0.014, 6, 24).rotateX(Math.PI / 2), ijzer, 0, 0.085, 0, hoofddeksel)
      const hoorn = new THREE.MeshStandardMaterial({ color: kleur(p.stijl.kleur2, '#f5f5dc'), roughness: 0.6 })
      for (const k of [-1, 1]) {
        const h = deel(new THREE.ConeGeometry(0.035, 0.2, 12), hoorn, k * 0.15, 0.2, 0, hoofddeksel)
        h.rotation.z = -k * 0.75
      }
    } else if (p.stijl.vorm === 'band') {
      deel(new THREE.TorusGeometry(0.122, 0.022, 8, 24).rotateX(Math.PI / 2), k1, 0, 0.12, 0, hoofddeksel)
    } else if (p.stijl.vorm === 'pruik') {
      // Een dikke krullenbol in clubkleur, met wat plukjes in de tweede kleur.
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2
        const hoog = i % 3 === 0 ? 0.2 : 0.1
        deel(new THREE.SphereGeometry(0.07, 10, 8), i % 4 === 0 ? k2 : k1, Math.sin(a) * 0.13, hoog, Math.cos(a) * 0.12 - 0.02, hoofddeksel)
      }
      deel(new THREE.SphereGeometry(0.15, 14, 10), k1, 0, 0.17, -0.02, hoofddeksel)
    } else if (p.stijl.vorm === 'koptelefoon') {
      deel(new THREE.TorusGeometry(0.135, 0.016, 8, 24, Math.PI), k1, 0, 0.07, 0, hoofddeksel)
      for (const k of [-1, 1]) {
        const schelp = deel(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 16).rotateZ(Math.PI / 2), k1, k * 0.13, 0.06, 0, hoofddeksel)
        void schelp
        deel(new THREE.CylinderGeometry(0.04, 0.04, 0.048, 16).rotateZ(Math.PI / 2), k2, k * 0.135, 0.06, 0, hoofddeksel)
      }
    } else if (p.stijl.vorm === 'cowboy') {
      const rand = deel(new THREE.CylinderGeometry(0.26, 0.26, 0.012, 28), k1, 0, 0.13, 0, hoofddeksel)
      rand.scale.set(1, 1, 0.82)
      deel(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 20), k1, 0, 0.21, 0, hoofddeksel).scale.set(1, 1, 1.15)
      deel(new THREE.CylinderGeometry(0.122, 0.122, 0.03, 20), k2, 0, 0.15, 0, hoofddeksel).scale.set(1, 1, 1.15)
    } else if (p.stijl.vorm === 'feest') {
      const kegel = new THREE.MeshStandardMaterial({
        map: textuur(64, 64, (g) => {
          g.fillStyle = kleur(p.stijl.kleur, thema.primair)
          g.fillRect(0, 0, 64, 64)
          g.fillStyle = kleur(p.stijl.kleur2, thema.secundair)
          for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 7, 64)
        }),
        roughness: 0.6,
      })
      const h = deel(new THREE.ConeGeometry(0.075, 0.24, 18), kegel, 0.03, 0.27, 0, hoofddeksel)
      h.rotation.z = -0.15
      deel(new THREE.SphereGeometry(0.03, 8, 6), k2, 0.05, 0.4, 0, hoofddeksel)
    } else if (p.stijl.vorm === 'kroon') {
      const goudMat = new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.9, roughness: 0.25, emissive: '#7a5a00', emissiveIntensity: 0.3 })
      deel(new THREE.CylinderGeometry(0.12, 0.115, 0.07, 20, 1, true), goudMat, 0, 0.17, 0, hoofddeksel)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const punt = deel(new THREE.ConeGeometry(0.025, 0.07, 6), goudMat, Math.sin(a) * 0.115, 0.235, Math.cos(a) * 0.115, hoofddeksel)
        punt.rotation.y = a
        deel(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ef4444' : '#3b82f6' }), Math.sin(a) * 0.12, 0.17, Math.cos(a) * 0.12, hoofddeksel)
      }
    }
    // Sjaal.
    const sj = art(o.sjaal, STANDAARD_OUTFIT.sjaal)
    const hals = sj.stijl.vorm === 'das' || sj.stijl.vorm === 'medaille' || sj.stijl.vorm === 'ketting'
    sjaalGroep.visible = sj.stijl.vorm !== 'geen' && !hals
    leeg(halsGroep)
    if (hals) {
      const h1 = new THREE.MeshStandardMaterial({ color: kleur(sj.stijl.kleur, thema.primair), roughness: 0.6 })
      const goud = new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.95, roughness: 0.2, emissive: '#5a4300', emissiveIntensity: 0.3 })
      if (sj.stijl.vorm === 'das') {
        deel(new THREE.BoxGeometry(0.05, 0.04, 0.02), h1, 0, 1.52, 0.158, halsGroep)
        const das = deel(new THREE.ConeGeometry(0.045, 0.34, 4), h1, 0, 1.34, 0.16, halsGroep)
        das.rotation.set(Math.PI, Math.PI / 4, 0)
        das.scale.set(1, 1, 0.3)
      } else {
        // Een lint of een ketting rond je nek, met een medaille of een hanger op je borst.
        const lint = deel(new THREE.TorusGeometry(0.15, sj.stijl.vorm === 'ketting' ? 0.01 : 0.018, 6, 28), sj.stijl.vorm === 'ketting' ? goud : new THREE.MeshStandardMaterial({ color: kleur(sj.stijl.kleur2, thema.primair), roughness: 0.7 }), 0, 1.45, 0.06, halsGroep)
        lint.rotation.x = Math.PI / 2 - 0.5
        lint.scale.set(0.9, 1.2, 1)
        const plaat = deel(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 24).rotateX(Math.PI / 2), goud, 0, 1.28, 0.17, halsGroep)
        if (sj.stijl.vorm === 'ketting') plaat.scale.set(0.6, 0.6, 1)
      }
    }
    if (sjaalGroep.visible) {
      const a1 = kleur(sj.stijl.kleur, thema.primair)
      const a2 = kleur(sj.stijl.kleur2, thema.secundair)
      sjaal.map?.dispose()
      sjaal.map = textuur(64, 256, (g) => {
        if (sj.stijl.patroon === 'regenboog') {
          const kl = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6']
          for (let y = 0; y < 256; y += 16) {
            g.fillStyle = kl[(y / 16) % kl.length]
            g.fillRect(0, y, 64, 16)
          }
          return
        }
        if (sj.stijl.patroon === 'blokken') {
          for (let y = 0; y < 256; y += 16) for (let x = 0; x < 64; x += 16) {
            g.fillStyle = (x + y) / 16 % 2 ? a2 : a1
            g.fillRect(x, y, 16, 16)
          }
          return
        }
        for (let y = 0; y < 256; y += 32) {
          g.fillStyle = (y / 32) % 2 ? a2 : a1
          g.fillRect(0, y, 64, 32)
        }
      })
      sjaal.needsUpdate = true
      franjeMat.color.set(a2)
    }
    // Extra.
    leeg(extra)
    leeg(extraHand)
    leeg(extraHoofd)
    const ex = art(o.extra, STANDAARD_OUTFIT.extra)
    if (ex.stijl.vorm === 'vlag') {
      const e1 = kleur(ex.stijl.kleur, thema.primair)
      const e2 = kleur(ex.stijl.kleur2, thema.secundair)
      const vlag = deel(
        new THREE.PlaneGeometry(0.52, 0.62, 6, 6),
        new THREE.MeshStandardMaterial({
          map: textuur(128, 128, (g) => {
            g.fillStyle = e1
            g.fillRect(0, 0, 128, 128)
            g.fillStyle = e2
            g.fillRect(0, 48, 128, 32)
          }),
          side: THREE.DoubleSide,
          roughness: 0.8,
        }),
        0,
        1.18,
        -0.17,
        extra,
      )
      vlag.rotation.x = 0.12
    } else if (ex.stijl.vorm === 'toeter') {
      const t = deel(new THREE.ConeGeometry(0.06, 0.32, 16, 1, true), new THREE.MeshStandardMaterial({ color: kleur(ex.stijl.kleur, thema.primair), side: THREE.DoubleSide, metalness: 0.3, roughness: 0.4 }), 0, -0.05, 0.1, extraHand)
      t.rotation.x = Math.PI / 2
    } else if (ex.stijl.vorm === 'bril') {
      const zwart = new THREE.MeshStandardMaterial({ color: '#0b0f17', metalness: 0.6, roughness: 0.15 })
      for (const x of [-0.042, 0.042]) deel(new THREE.BoxGeometry(0.06, 0.035, 0.01), zwart, x, 0.08, 0.118, extraHoofd)
      deel(new THREE.BoxGeometry(0.03, 0.008, 0.01), zwart, 0, 0.088, 0.12, extraHoofd)
    } else {
      const e1 = new THREE.MeshStandardMaterial({ color: kleur(ex.stijl.kleur, thema.primair), roughness: 0.55 })
      const e2 = new THREE.MeshStandardMaterial({ color: kleur(ex.stijl.kleur2, thema.secundair), roughness: 0.55 })
      if (ex.stijl.vorm === 'trommel') {
        const vel = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 })
        const t = deel(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 24).rotateX(Math.PI / 2), e1, 0, 1.0, 0.3, extra)
        void t
        for (const z of [0.2, 0.4]) deel(new THREE.CylinderGeometry(0.172, 0.172, 0.012, 24).rotateX(Math.PI / 2), vel, 0, 1.0, z, extra)
        const riem = deel(new THREE.TorusGeometry(0.22, 0.012, 6, 24), e2, 0, 1.3, 0.05, extra)
        riem.rotation.set(0.3, 0, 0.6)
        // Een stok in je hand.
        const stok = deel(new THREE.CylinderGeometry(0.008, 0.01, 0.3, 6), new THREE.MeshStandardMaterial({ color: '#d6b26e' }), 0, -0.04, 0.12, extraHand)
        stok.rotation.x = 1.2
      } else if (ex.stijl.vorm === 'schmink') {
        // Twee strepen op elke wang, in de clubkleuren.
        for (const k of [-1, 1])
          for (const [dy, m] of [
            [0.045, e1],
            [0.025, e2],
          ] as const) {
            const st = deel(new THREE.BoxGeometry(0.045, 0.012, 0.005), m, k * 0.06, dy, 0.1, extraHoofd)
            st.rotation.y = k * 0.55
          }
      } else if (ex.stijl.vorm === 'ballon') {
        deel(new THREE.CylinderGeometry(0.003, 0.003, 0.8, 4), new THREE.MeshStandardMaterial({ color: '#e5e7eb' }), 0, 0.4, 0, extraHand)
        const b = deel(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: kleur(ex.stijl.kleur, thema.primair), roughness: 0.25, metalness: 0.1 }), 0.02, 0.95, 0, extraHand)
        b.scale.set(1, 1.18, 1)
      } else if (ex.stijl.vorm === 'vinger') {
        // Een grote schuimhand met een opgestoken wijsvinger en "#1".
        const hand = deel(new THREE.BoxGeometry(0.2, 0.22, 0.07), e1, 0, 0.12, 0.05, extraHand)
        void hand
        deel(new THREE.CapsuleGeometry(0.035, 0.2, 4, 10), e1, -0.05, 0.36, 0.05, extraHand)
        deel(new THREE.CapsuleGeometry(0.03, 0.06, 4, 10).rotateZ(1.2), e1, 0.11, 0.1, 0.05, extraHand)
        const nr = deel(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial({
          map: textuur(128, 96, (g) => {
            g.fillStyle = kleur(ex.stijl.kleur2, thema.secundair)
            g.font = '900 70px Inter, sans-serif'
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText('#1', 64, 52)
          }),
          transparent: true,
        }), 0, 0.12, 0.087, extraHand)
        void nr
      } else if (ex.stijl.vorm === 'rugzak') {
        deel(new THREE.CapsuleGeometry(0.15, 0.2, 6, 12).scale(1, 1, 0.55), e1, 0, 1.22, -0.23, extra)
        deel(new THREE.BoxGeometry(0.22, 0.12, 0.05), e2, 0, 1.08, -0.3, extra)
        for (const k of [-1, 1]) deel(new THREE.BoxGeometry(0.035, 0.42, 0.02), e2, k * 0.1, 1.3, 0.155, extra)
      } else if (ex.stijl.vorm === 'cape') {
        const cape = deel(new THREE.PlaneGeometry(0.62, 0.95, 4, 6), new THREE.MeshStandardMaterial({
          map: textuur(128, 192, (g) => {
            g.fillStyle = kleur(ex.stijl.kleur, thema.primair)
            g.fillRect(0, 0, 128, 192)
            g.fillStyle = kleur(ex.stijl.kleur2, '#facc15')
            g.font = '900 64px Inter, sans-serif'
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText(thema.kort.slice(0, 3), 64, 80)
          }),
          side: THREE.DoubleSide,
          roughness: 0.6,
        }), 0, 1.05, -0.2, extra)
        cape.rotation.set(0.12, Math.PI, 0)
      } else if (ex.stijl.vorm === 'krachtbal') {
        const bal = deel(krachtbalGeometrie(0.14, 0.4), new THREE.MeshStandardMaterial({ map: krachtbalTextuur(kleur(ex.stijl.kleur, '#f97316')), roughness: 0.55 }), 0.06, 0.1, 0.02, extraHand)
        void bal
      } else if (ex.stijl.vorm === 'megafoon') {
        const m = deel(new THREE.CylinderGeometry(0.1, 0.035, 0.3, 18, 1, true), new THREE.MeshStandardMaterial({ color: kleur(ex.stijl.kleur, '#f8fafc'), side: THREE.DoubleSide, roughness: 0.4 }), 0, 0.02, 0.18, extraHand)
        m.rotation.x = Math.PI / 2
        deel(new THREE.TorusGeometry(0.1, 0.012, 6, 20), e2, 0, 0.02, 0.33, extraHand)
      }
    }
    if (ex.stijl.vorm === 'bakman') trekBakmanAan()
    zetLaag(groep)
  }

  // De volledige Bakman-tenue: een blauw spierpak met het BAKMAN-logo, een gele riem, rode laarzen,
  // een rode cape en fluogroene bretellen. Ze vervangt shirt, broek, schoenen, hoofddeksel en sjaal.
  const trekBakmanAan = () => {
    const logo = bakmanLogo()
    shirt.map?.dispose()
    shirt.map = textuur(256, 128, (g) => {
      g.fillStyle = '#1f3fb4'
      g.fillRect(0, 0, 256, 128)
      // Het logo op de borst (de voorkant van de romp ligt rond u = 0,25).
      if (logo.complete && logo.naturalWidth) g.drawImage(logo, 34, 30, 60, 32)
      else {
        g.fillStyle = '#f6c915'
        g.beginPath()
        g.moveTo(38, 32)
        g.lineTo(90, 32)
        g.lineTo(64, 62)
        g.fill()
      }
    })
    shirt.needsUpdate = true
    mouw.color.set('#1f3fb4')
    shirt2.color.set('#f6c915')
    broek.map?.dispose()
    broek.map = null
    broek.color.set('#1f3fb4')
    broek.needsUpdate = true
    onderbeen.map = null
    onderbeen.color.set('#d4202a')
    onderbeen.needsUpdate = true
    schoen.color.set('#16181d')
    for (const l of laarzen) l.visible = true
    leeg(hoofddeksel)
    sjaalGroep.visible = false
    leeg(halsGroep)
    // De cape, met het logo op de rug.
    const cape = deel(
      new THREE.PlaneGeometry(0.6, 1.0, 4, 6),
      new THREE.MeshStandardMaterial({
        map: textuur(128, 216, (g) => {
          g.fillStyle = '#d4202a'
          g.fillRect(0, 0, 128, 216)
          if (logo.complete && logo.naturalWidth) {
            g.save()
            g.translate(128, 0)
            g.scale(-1, 1)
            g.drawImage(logo, 14, 70, 100, 54)
            g.restore()
          }
        }),
        side: THREE.DoubleSide,
        roughness: 0.6,
      }),
      0,
      1.02,
      -0.21,
      extra,
    )
    cape.rotation.set(0.14, Math.PI, 0)
    // Fluogroene bretellen in een V over de borst.
    const fluo = new THREE.MeshStandardMaterial({ color: '#b6f22c', roughness: 0.5 })
    for (const k of [-1, 1]) {
      const pad = new THREE.CatmullRomCurve3([new THREE.Vector3(k * 0.07, 1.52, 0.05), new THREE.Vector3(k * 0.09, 1.34, 0.155), new THREE.Vector3(k * 0.04, 1.06, 0.15), new THREE.Vector3(0, 0.88, 0.1)])
      deel(new THREE.TubeGeometry(pad, 16, 0.008, 5), fluo, 0, 0, 0, extra)
    }
    // Pas het logo geladen is, opnieuw aankleden (eenmalig).
    if (!(logo.complete && logo.naturalWidth)) logo.addEventListener('load', () => kleedAan(laatsteOutfit), { once: true })
  }
  kleedAan({})
  zetLaag(groep)
  groep.visible = false
  scene.add(groep)

  let fase = 0
  return {
    groep,
    update(x, vloerY, z, yaw, pitch, tempo, seconden) {
      groep.position.set(x, vloerY, z)
      groep.rotation.y = yaw
      fase += Math.min(0.1, tempo * 0.05) * 7
      const zwaai = Math.sin(fase) * Math.min(0.8, tempo / 4.5)
      benen[0].rotation.x = zwaai
      benen[1].rotation.x = -zwaai
      // Stilstaan: een klein zwaaitje naar jezelf in de spiegel; stappen: de armen gaan mee.
      armen[0].rotation.x = vast ? -1.15 + zwaai * 0.08 : -zwaai * 0.8
      armen[0].rotation.z = vast ? -0.25 : 0
      hand.rotation.x = vast ? 1.15 : 0
      const zwaait = zwaaien && tempo < 0.2
      armen[1].rotation.x = zwaait ? -2.6 : zwaai * 0.8
      armen[1].rotation.z = zwaait ? 0.35 + Math.sin(seconden * 6) * 0.35 : 0
      hoofd.rotation.x = -pitch * 0.6
      romp.position.y = 1.24 + Math.abs(Math.sin(fase)) * 0.02 * Math.min(1, tempo)
      extra.position.y = Math.abs(Math.sin(fase)) * 0.02 * Math.min(1, tempo)
    },
    zichtbaar(aan) {
      groep.visible = aan
    },
    zwaai(aan) {
      zwaaien = aan
    },
    houdVast(iets) {
      if (vast) hand.remove(vast)
      vast = iets
      if (iets) {
        iets.position.set(0, -0.06, 0.06)
        zetLaag(iets)
        hand.add(iets)
      }
    },
    kleedAan,
    dispose() {
      scene.remove(groep)
      groep.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    },
  }
}
