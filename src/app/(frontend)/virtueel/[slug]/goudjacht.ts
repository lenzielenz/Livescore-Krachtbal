import * as THREE from 'three'

import { GOUDEN_BALLEN } from '@/lib/virtueel-sporen'

// De goudjacht: twaalf gouden krachtballen, verstopt in heel het stadion — in de kelder, de
// kleedkamer, de gangen, op het plein, op het verdiep en op het dak. Loop er wandelend tegenaan om
// er een te vinden. Welke je al hebt, onthoudt de server (zie lib/virtueel-sporen.ts); wie ze
// allemaal vindt, komt op het bord van de goudzoekers in de kelder.

export type GoudPlek = { x: number; y: number; z: number; verdiep: number }

export type Goudjacht = {
  /** Welke ballen deze bezoeker al vond (die worden niet meer getoond). Voegt toe. */
  zetGevonden: (nrs: number[]) => void
  /** Sta je bij een bal die je nog niet hebt? Dan is dit zijn nummer (en is hij meteen "gevonden"). */
  raak: (x: number, z: number, verdiep: number) => number | null
  aantal: () => number
  update: (seconden: number, ondergronds: boolean) => void
}

export function bouwGoudjacht(scene: THREE.Scene, kelderGroep: THREE.Group, plekken: GoudPlek[]): Goudjacht {
  const lijst = plekken.slice(0, GOUDEN_BALLEN)
  const gevonden = new Set<number>()
  const glans = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,240,170,1)')
    gr.addColorStop(0.35, 'rgba(250,204,21,.45)')
    gr.addColorStop(1, 'rgba(250,204,21,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  const balGeo = new THREE.SphereGeometry(0.24, 24, 16)
  const balMat = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#b45309', emissiveIntensity: 0.7, metalness: 0.85, roughness: 0.25 })
  const naadMat = new THREE.MeshBasicMaterial({ color: '#78350f' })
  const naadGeo = new THREE.TorusGeometry(0.242, 0.012, 6, 32)
  const ballen = lijst.map((p) => {
    const g = new THREE.Group()
    const bal = new THREE.Mesh(balGeo, balMat)
    const naad1 = new THREE.Mesh(naadGeo, naadMat)
    const naad2 = new THREE.Mesh(naadGeo, naadMat)
    naad2.rotation.y = Math.PI / 2
    const gloed = new THREE.Sprite(new THREE.SpriteMaterial({ map: glans, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    gloed.scale.set(1.4, 1.4, 1)
    g.add(bal, naad1, naad2, gloed)
    g.position.set(p.x, p.y, p.z)
    // In de kelder in de groep van de kelder (die is enkel zichtbaar als je beneden bent).
    if (p.verdiep === -1) kelderGroep.add(g)
    else scene.add(g)
    return { g, p }
  })
  return {
    zetGevonden(nrs) {
      // Erbij, nooit eraf: wat je deze keer al vond (ook zonder login) blijft gevonden.
      for (const n of nrs) gevonden.add(n)
    },
    raak(x, z, verdiep) {
      for (let i = 0; i < ballen.length; i++) {
        if (gevonden.has(i)) continue
        const p = ballen[i].p
        if (p.verdiep === verdiep && Math.hypot(x - p.x, z - p.z) < 1.3) {
          gevonden.add(i)
          return i
        }
      }
      return null
    },
    aantal: () => gevonden.size,
    update(seconden, ondergronds) {
      ballen.forEach(({ g, p }, i) => {
        g.visible = !gevonden.has(i) && (p.verdiep === -1 || !ondergronds)
        if (!g.visible) return
        g.position.y = p.y + Math.sin(seconden * 2 + i) * 0.12
        g.rotation.y = seconden * 1.5 + i
      })
    },
  }
}
