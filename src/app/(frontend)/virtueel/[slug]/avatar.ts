import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'
import { artikelVan, STANDAARD_OUTFIT, type Artikel, type Outfit } from '@/lib/virtueel-fanshop'

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
  /** Iets in je linkerhand (bv. een doosje popcorn), of null om niets vast te houden. */
  houdVast: (iets: THREE.Object3D | null) => void
  /** Trek een outfit aan (artikel-id's per soort; wat ontbreekt blijft standaard). */
  kleedAan: (outfit: Partial<Outfit>) => void
  dispose: () => void
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
  const zwaaien = opt.zwaaien ?? true
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
  // Benen, in een groep per been om te kunnen stappen.
  const benen = [-0.1, 0.1].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 0.92, 0)
    deel(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 10), broek, 0, -0.24, 0, g)
    deel(new THREE.CylinderGeometry(0.075, 0.07, 0.42, 10), onderbeen, 0, -0.66, 0, g)
    deel(new THREE.BoxGeometry(0.12, 0.08, 0.27), schoen, 0, -0.88, 0.05, g)
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
  // Extra's: een vlag op je rug, een toeter in je rechterhand, een zonnebril.
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

  const kleedAan = (outfit: Partial<Outfit>) => {
    const o = { ...STANDAARD_OUTFIT, ...outfit }
    const art = (id: string, standaard: string) => artikelVan(id) ?? artikelVan(standaard)!
    // Shirt.
    const sh = art(o.shirt, STANDAARD_OUTFIT.shirt)
    shirt.map?.dispose()
    shirt.map = shirtTex(sh)
    shirt.needsUpdate = true
    mouw.color.set(kleur(sh.stijl.kleur, thema.primair))
    shirt2.color.set(kleur(sh.stijl.kleur2, thema.secundair))
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
    broek.needsUpdate = true
    const kort = br.stijl.vorm === 'kort'
    onderbeen.map = kort ? null : broek.map
    onderbeen.color.copy(kort ? huid.color : broek.color)
    onderbeen.needsUpdate = true
    // Schoenen.
    schoen.color.set(kleur(art(o.schoenen, STANDAARD_OUTFIT.schoenen).stijl.kleur, '#f8fafc'))
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
    sjaalGroep.visible = sj.stijl.vorm !== 'geen'
    if (sjaalGroep.visible) {
      const a1 = kleur(sj.stijl.kleur, thema.primair)
      const a2 = kleur(sj.stijl.kleur2, thema.secundair)
      sjaal.map?.dispose()
      sjaal.map = textuur(64, 256, (g) => {
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
    }
    zetLaag(groep)
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
