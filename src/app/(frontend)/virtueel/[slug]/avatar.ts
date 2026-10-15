import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'

// Jijzelf, als supporter: een thuisshirt in clubkleur, een jeans, witte sneakers, een pet en een
// gestreepte clubsjaal met franjes. Je ziet jezelf enkel in een spiegel: de figuur staat op een
// eigen laag (AVATAR_LAAG) die de gewone camera niet tekent, maar de camera van de spiegel wel.

export const AVATAR_LAAG = 1
/** Wat je zelf vasthoudt, in eerste persoon: enkel de gewone camera tekent het, niet de spiegels. */
export const EIGEN_LAAG = 2

export type Avatar = {
  /** Zet de figuur op jouw plek: voeten op `vloerY`, kijkend in `yaw`; `tempo` (m/s) voor de pas. */
  update: (x: number, vloerY: number, z: number, yaw: number, pitch: number, tempo: number, seconden: number) => void
  zichtbaar: (aan: boolean) => void
  /** Iets in je linkerhand (bv. een doosje popcorn), of null om niets vast te houden. */
  houdVast: (iets: THREE.Object3D | null) => void
}

export function bouwAvatar(scene: THREE.Scene, thema: StadionThema): Avatar {
  const groep = new THREE.Group()
  const shirt = new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.7 })
  const shirt2 = new THREE.MeshStandardMaterial({ color: thema.secundair, roughness: 0.7 })
  const jeans = new THREE.MeshStandardMaterial({ color: '#2c3e63', roughness: 0.85 })
  const huid = new THREE.MeshStandardMaterial({ color: '#e7c3a0', roughness: 0.8 })
  const schoen = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 })
  const haar = new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 0.9 })
  // De sjaal: strepen in de twee clubkleuren.
  const sjaalC = document.createElement('canvas')
  sjaalC.width = 64
  sjaalC.height = 256
  {
    const g = sjaalC.getContext('2d')!
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = (y / 32) % 2 ? thema.secundair : thema.primair
      g.fillRect(0, y, 64, 32)
    }
  }
  const sjaalTex = new THREE.CanvasTexture(sjaalC)
  sjaalTex.colorSpace = THREE.SRGBColorSpace
  sjaalTex.wrapS = sjaalTex.wrapT = THREE.RepeatWrapping
  const sjaal = new THREE.MeshStandardMaterial({ map: sjaalTex, roughness: 0.9, side: THREE.DoubleSide })

  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ouder: THREE.Object3D = groep) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    ouder.add(m)
    return m
  }
  // Benen (jeans en sneakers), in een groep per been om te kunnen stappen.
  const benen = [-0.1, 0.1].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 0.92, 0)
    deel(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 10), jeans, 0, -0.24, 0, g)
    deel(new THREE.CylinderGeometry(0.075, 0.07, 0.42, 10), jeans, 0, -0.66, 0, g)
    deel(new THREE.BoxGeometry(0.12, 0.08, 0.27), schoen, 0, -0.88, 0.05, g)
    groep.add(g)
    return g
  })
  // Romp: het shirt met een band in de tweede clubkleur.
  const romp = deel(new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), shirt, 0, 1.24, 0)
  romp.scale.set(1, 1, 0.72)
  deel(new THREE.CylinderGeometry(0.215, 0.215, 0.07, 16), shirt2, 0, 1.12, 0).scale.set(1, 1, 0.72)
  // Armen.
  const armen = [-0.28, 0.28].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 1.48, 0)
    deel(new THREE.CylinderGeometry(0.058, 0.052, 0.3, 8), shirt, 0, -0.15, 0, g)
    deel(new THREE.CylinderGeometry(0.046, 0.04, 0.3, 8), huid, 0, -0.45, 0, g)
    deel(new THREE.SphereGeometry(0.05, 8, 6), huid, 0, -0.62, 0, g)
    groep.add(g)
    return g
  })
  // Hoofd met haar en een pet in clubkleur (klep naar voren).
  const hoofd = new THREE.Group()
  hoofd.position.set(0, 1.62, 0)
  deel(new THREE.SphereGeometry(0.12, 18, 14), huid, 0, 0.06, 0, hoofd)
  deel(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), haar, 0, 0.075, -0.01, hoofd)
  deel(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), shirt, 0, 0.1, 0, hoofd)
  deel(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), shirt2, 0, 0.12, 0.09, hoofd)
  // Oogjes, zodat je ziet wat de voorkant is.
  for (const x of [-0.04, 0.04]) deel(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#1f2937' }), x, 0.08, 0.112, hoofd)
  deel(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), huid, 0, -0.03, 0, hoofd)
  groep.add(hoofd)
  // De sjaal: een rol rond de hals, en twee afhangende uiteinden met franjes over de borst.
  const rol = deel(new THREE.TorusGeometry(0.12, 0.05, 10, 22), sjaal, 0, 1.56, 0.0)
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
    groep.add(eind)
    for (let k = 0; k < 5; k++) {
      const franje = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.008), shirt2)
      franje.position.set(-0.045 + k * 0.022, -lang - 0.03, 0)
      eind.add(franje)
    }
  }
  groep.traverse((o) => {
    o.layers.set(AVATAR_LAAG)
    o.frustumCulled = false
  })
  groep.visible = false
  scene.add(groep)

  // Wat je vasthoudt, zit in de linkerhand (de arm buigt dan naar voren, zoals je een doosje draagt).
  const hand = new THREE.Group()
  hand.position.set(0, -0.6, 0.02)
  armen[0].add(hand)
  let vast: THREE.Object3D | null = null

  let fase = 0
  return {
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
      armen[1].rotation.x = tempo < 0.2 ? -2.6 : zwaai * 0.8
      armen[1].rotation.z = tempo < 0.2 ? 0.35 + Math.sin(seconden * 6) * 0.35 : 0
      hoofd.rotation.x = -pitch * 0.6
      romp.position.y = 1.24 + Math.abs(Math.sin(fase)) * 0.02 * Math.min(1, tempo)
    },
    zichtbaar(aan) {
      groep.visible = aan
    },
    houdVast(iets) {
      if (vast) hand.remove(vast)
      vast = iets
      if (iets) {
        iets.position.set(0, -0.06, 0.06)
        iets.traverse((o) => {
          o.layers.set(AVATAR_LAAG)
          o.frustumCulled = false
        })
        hand.add(iets)
      }
    },
  }
}
