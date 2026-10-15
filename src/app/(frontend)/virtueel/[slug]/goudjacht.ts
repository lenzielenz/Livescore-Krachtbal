import * as THREE from 'three'

import { GOUDEN_BALLEN, warmteVoor, type Warmte } from '@/lib/virtueel-sporen'
import { krachtbalGeometrie, krachtbalTextuur } from './krachtbal'

// De goudjacht: 25 gouden krachtballen, verstopt over het hele terrein — in de kelder, de
// kleedkamer, de gangen, het verdiep, op het dak en het helikopterplatform, op het plein, achter
// het clubhuis, op de parking, in het fandorp en op het oefencomplex. Het is een echte zoektocht:
//  • de ballen zijn zo groot als een echte krachtbal en liggen op de grond (ze zweven niet);
//  • ze gloeien niet van ver: pas als je in de buurt komt (± 14 m) zie je ze liggen, en verder weg
//    verraadt hooguit een korte fonkeling ze, af en toe;
//  • je moet er echt tegenaan lopen (op een meter) om er een te vinden;
//  • de goudradar zegt hoe warm je bent: koud, lauw, warm of heet, enkel voor het verdiep waar je
//    bent; de richting vertelt hij niet.
// Welke je al hebt, onthoudt de server (zie lib/virtueel-sporen.ts); wie ze allemaal vindt, komt
// op het bord van de goudzoekers in de kelder.

export type GoudPlek = { x: number; y: number; z: number; verdiep: number }

export type Goudjacht = {
  /** Welke ballen deze bezoeker al vond (die worden niet meer getoond). Voegt toe. */
  zetGevonden: (nrs: number[]) => void
  /** Sta je bij een bal die je nog niet hebt? Dan is dit zijn nummer (en is hij meteen "gevonden"). */
  raak: (x: number, z: number, verdiep: number) => number | null
  aantal: () => number
  /** De goudradar: hoe dicht je bij een bal bent die je nog niet hebt, op dit verdiep. */
  warmte: (x: number, z: number, verdiep: number) => Warmte
  update: (seconden: number, ondergronds: boolean, kijker: THREE.Vector3) => void
}

const ZICHT = 14
const STRAAL = 0.17

export function bouwGoudjacht(scene: THREE.Scene, kelderGroep: THREE.Group, plekken: GoudPlek[]): Goudjacht {
  const lijst = plekken.slice(0, GOUDEN_BALLEN)
  if (plekken.length !== GOUDEN_BALLEN) console.warn(`Goudjacht: ${plekken.length} plekken voor ${GOUDEN_BALLEN} ballen`)
  const gevonden = new Set<number>()
  const glans = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,248,210,1)')
    gr.addColorStop(0.2, 'rgba(255,230,140,.55)')
    gr.addColorStop(1, 'rgba(250,204,21,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
    // Een sterretje (de fonkeling).
    g.strokeStyle = 'rgba(255,255,255,.9)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(32, 4)
    g.lineTo(32, 60)
    g.moveTo(4, 32)
    g.lineTo(60, 32)
    g.stroke()
    return new THREE.CanvasTexture(c)
  })()
  // Een echte krachtbal (stroken, kapjes en diepe naden; zie krachtbal.ts) op ware grootte, in goud.
  const balGeo = krachtbalGeometrie(STRAAL, 0.4)
  const balMat = new THREE.MeshStandardMaterial({ map: krachtbalTextuur('#f2c230', '#3b2606'), vertexColors: true, emissive: '#a16207', emissiveIntensity: 0.25, metalness: 0.65, roughness: 0.38 })
  const ballen = lijst.map((p, i) => {
    const g = new THREE.Group()
    const bal = new THREE.Mesh(balGeo, balMat)
    bal.rotation.set(i * 1.7, i * 2.3, i * 0.9)
    const fonkel = new THREE.Sprite(new THREE.SpriteMaterial({ map: glans, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
    fonkel.position.set(0.06, 0.1, 0.06)
    g.add(bal, fonkel)
    // Op de grond (of waar de plek hem legt), niet zwevend.
    g.position.set(p.x, p.y, p.z)
    if (p.verdiep === -1) kelderGroep.add(g)
    else scene.add(g)
    return { g, p, fonkel }
  })
  const afstand = (x: number, z: number, verdiep: number) => {
    let min: number | null = null
    ballen.forEach(({ p }, i) => {
      if (gevonden.has(i) || p.verdiep !== verdiep) return
      const d = Math.hypot(x - p.x, z - p.z)
      if (min == null || d < min) min = d
    })
    return min
  }
  const wereld = new THREE.Vector3()
  return {
    zetGevonden(nrs) {
      // Erbij, nooit eraf: wat je deze keer al vond (ook zonder login) blijft gevonden.
      for (const n of nrs) gevonden.add(n)
    },
    raak(x, z, verdiep) {
      for (let i = 0; i < ballen.length; i++) {
        if (gevonden.has(i)) continue
        const p = ballen[i].p
        if (p.verdiep === verdiep && Math.hypot(x - p.x, z - p.z) < 1.15) {
          gevonden.add(i)
          return i
        }
      }
      return null
    },
    aantal: () => gevonden.size,
    warmte: (x, z, verdiep) => warmteVoor(afstand(x, z, verdiep)),
    update(seconden, ondergronds, kijker) {
      ballen.forEach(({ g, p, fonkel }, i) => {
        const zichtbaar = !gevonden.has(i) && (p.verdiep === -1 || !ondergronds)
        if (!zichtbaar) {
          g.visible = false
          return
        }
        g.getWorldPosition(wereld)
        const d = wereld.distanceTo(kijker)
        // Van ver: enkel om de zoveel seconden een korte fonkeling (tot 40 m); dichtbij: de bal zelf.
        const flits = Math.max(0, 1 - Math.abs(((seconden + i * 1.37) % 7) - 0.4) / 0.4)
        g.visible = d < 40
        g.children[0].visible = d < ZICHT
        ;(fonkel.material as THREE.SpriteMaterial).opacity = d < ZICHT ? 0.25 + flits * 0.6 : flits * 0.9
        const s = d < ZICHT ? 0.35 : 0.5 + d * 0.012
        fonkel.scale.set(s, s, 1)
        g.rotation.y = seconden * 0.2 + i
      })
    },
  }
}
