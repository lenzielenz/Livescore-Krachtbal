import * as THREE from 'three'

import { rondeDoos } from './rond'

// De kluis in de kelder: een ronde, stalen kluisdeur in de muur van de boulevard, met een
// stuurwiel, grendels, een cijferklavier en een lampje. Erboven staat hoeveel gouden ballen je nog
// nodig hebt. Met alle twaalf gaat hij open (de deur zwaait open, het stuurwiel draait), en
// binnen ligt, gloeiend op een fluwelen kussen, de sleutel van de clubhelikopter op het dak.

export type Kluis = {
  bij: (x: number, z: number) => boolean
  obstakel: { x0: number; x1: number; z0: number; z1: number }
  /** Hoeveel ballen je hebt (voor het bord), en of de kluis al open is (en de sleutel weg). */
  zet: (ballen: number, totaal: number, open: boolean) => void
  /** De deur gaat open (met animatie). */
  open: () => void
  update: (seconden: number, dt: number) => void
}

export function bouwKluis(ouder: THREE.Group, opt: { x: number; y: number; z: number; ry: number; primair: string }): Kluis {
  const g = new THREE.Group()
  g.position.set(opt.x, opt.y, opt.z)
  g.rotation.y = opt.ry
  // Een stukje uit de muur, zodat de kluisruimte (tot 0,3 m diep) vóór het muurvlak ligt.
  g.position.add(new THREE.Vector3(Math.sin(opt.ry), 0, Math.cos(opt.ry)).multiplyScalar(0.32))
  ouder.add(g)
  // (In de kelder is het licht vooral nep: wat gloed in het staal houdt de kluis leesbaar.)
  const staal = new THREE.MeshStandardMaterial({ color: '#b6bec8', metalness: 0.55, roughness: 0.3, emissive: '#4a5260', emissiveIntensity: 0.55 })
  const donker = new THREE.MeshStandardMaterial({ color: '#3a414c', metalness: 0.5, roughness: 0.4, emissive: '#1b2028', emissiveIntensity: 0.6 })
  const goud = new THREE.MeshStandardMaterial({ color: '#d4a63a', metalness: 0.95, roughness: 0.25, emissive: '#3a2600', emissiveIntensity: 0.3 })
  // Het kader in de muur (lokaal: de muur is z = 0, de kluis kijkt naar +z).
  const kader = new THREE.Mesh(rondeDoos(2.9, 2.9, 0.3, 0.12), donker)
  kader.position.set(0, 1.5, 0.12)
  g.add(kader)
  // De kluisruimte erachter: een donkere nis met een plankje en de sleutel.
  const nis = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.6, 40, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a3226', side: THREE.BackSide, metalness: 0.3, roughness: 0.6, emissive: '#5a3e14', emissiveIntensity: 0.6 }))
  nis.position.set(0, 1.5, 0.0)
  g.add(nis)
  const achter = new THREE.Mesh(new THREE.CircleGeometry(1.08, 40), new THREE.MeshStandardMaterial({ color: '#2a2418', metalness: 0.3, roughness: 0.7, emissive: '#4a3410', emissiveIntensity: 0.7 }))
  achter.position.set(0, 1.5, -0.3)
  g.add(achter)
  const kussen = new THREE.Mesh(rondeDoos(0.6, 0.12, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.95 }))
  kussen.position.set(0, 1.12, -0.05)
  g.add(kussen)
  // De sleutel: een sleutelhanger in clubkleur met een zilveren baard.
  const sleutel = new THREE.Group()
  sleutel.position.set(0, 1.35, -0.05)
  g.add(sleutel)
  const hanger = new THREE.Mesh(rondeDoos(0.14, 0.2, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: opt.primair, roughness: 0.4, emissive: opt.primair, emissiveIntensity: 0.25 }))
  const baard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.015), staal)
  baard.position.y = -0.19
  const tand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.015), staal)
  tand.position.set(0.04, -0.24, 0)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 16), goud)
  ring.position.y = 0.14
  sleutel.add(hanger, baard, tand, ring)
  const gloed = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: (() => {
        const c = document.createElement('canvas')
        c.width = c.height = 64
        const x = c.getContext('2d')!
        const r = x.createRadialGradient(32, 32, 0, 32, 32, 32)
        r.addColorStop(0, 'rgba(255,230,150,1)')
        r.addColorStop(1, 'rgba(255,200,80,0)')
        x.fillStyle = r
        x.fillRect(0, 0, 64, 64)
        return new THREE.CanvasTexture(c)
      })(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  gloed.scale.set(0.9, 0.9, 1)
  sleutel.add(gloed)

  // De deur: een dikke stalen schijf die rond een scharnier links openzwaait.
  const scharnier = new THREE.Group()
  scharnier.position.set(-1.05, 1.5, 0.3)
  g.add(scharnier)
  const deur = new THREE.Group()
  deur.position.set(1.05, 0, 0)
  scharnier.add(deur)
  const schijf = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.32, 48).rotateX(Math.PI / 2), staal)
  deur.add(schijf)
  // Concentrische ringen en grendels op de voorkant.
  for (const r of [0.95, 0.7]) {
    const rr = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 8, 48), donker)
    rr.position.z = 0.17
    deur.add(rr)
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12).rotateX(Math.PI / 2), donker)
    b.position.set(Math.cos(a) * 0.83, Math.sin(a) * 0.83, 0.18)
    deur.add(b)
  }
  // Het stuurwiel.
  const wiel = new THREE.Group()
  wiel.position.z = 0.3
  deur.add(wiel)
  wiel.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 40), staal))
  wiel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 20).rotateX(Math.PI / 2), goud))
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.84, 8), staal)
    s.rotation.z = (i / 3) * Math.PI
    wiel.add(s)
    for (const k of [-1, 1]) {
      const knop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), goud)
      knop.position.set(Math.sin((i / 3) * Math.PI) * 0.47 * k, Math.cos((i / 3) * Math.PI) * 0.47 * k, 0)
      wiel.add(knop)
    }
  }
  // Een cijferklavier en een lampje rechts van de deur.
  const klavier = new THREE.Mesh(rondeDoos(0.24, 0.34, 0.06, 0.02), donker)
  klavier.position.set(1.15, 1.45, 0.3)
  g.add(klavier)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: '#ef4444', toneMapped: false }))
  lamp.position.set(1.15, 1.67, 0.33)
  g.add(lamp)
  // Een spotje van boven op de deur, en een lichtplas ervoor.
  const plas = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }))
  plas.position.set(0, 0.03, 1.4)
  plas.renderOrder = 1
  g.add(plas)
  // Het bord erboven.
  const bordC = document.createElement('canvas')
  bordC.width = 768
  bordC.height = 160
  const bordTex = new THREE.CanvasTexture(bordC)
  bordTex.colorSpace = THREE.SRGBColorSpace
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.58), new THREE.MeshBasicMaterial({ map: bordTex, toneMapped: false }))
  bord.position.set(0, 3.3, 0.06)
  g.add(bord)
  const tekenBord = (ballen: number, totaal: number, open: boolean) => {
    const x = bordC.getContext('2d')!
    x.fillStyle = '#07090d'
    x.fillRect(0, 0, 768, 160)
    x.strokeStyle = open ? '#4ade80' : '#d4a63a'
    x.lineWidth = 8
    x.strokeRect(4, 4, 760, 152)
    x.fillStyle = '#ffffff'
    x.font = '900 54px Inter, system-ui, sans-serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(open ? '🔓 DE KLUIS IS OPEN' : '🔒 DE KLUIS', 384, 56)
    x.font = '700 34px Inter, system-ui, sans-serif'
    x.fillStyle = open ? '#86efac' : '#fde68a'
    x.fillText(open ? 'Jij hebt de sleutel van de helikopter!' : ballen >= totaal ? 'Je hebt alle ballen: open hem!' : `Nog ${totaal - ballen} gouden ballen voor de sleutel`, 384, 118, 740)
    bordTex.needsUpdate = true
  }
  tekenBord(0, 12, false)

  const wereld = new THREE.Vector3(opt.x, 0, opt.z)
  const voor = new THREE.Vector3(Math.sin(opt.ry), 0, Math.cos(opt.ry))
  const staPlek = wereld.clone().addScaledVector(voor, 2.0)
  let openT = -1
  let isOpen = false
  let sleutelWeg = false
  return {
    bij: (x, z) => Math.hypot(x - staPlek.x, z - staPlek.z) < 1.8,
    obstakel: (() => {
      const a = new THREE.Vector3(1.5, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), opt.ry)
      const b = new THREE.Vector3(0, 0, 0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), opt.ry)
      const xs = [opt.x - a.x, opt.x + a.x, opt.x + b.x]
      const zs = [opt.z - a.z, opt.z + a.z, opt.z + b.z]
      return { x0: Math.min(...xs) - 0.1, x1: Math.max(...xs) + 0.1, z0: Math.min(...zs) - 0.1, z1: Math.max(...zs) + 0.1 }
    })(),
    zet(ballen, totaal, open) {
      tekenBord(ballen, totaal, open)
      if (open && !isOpen) {
        // Al open (vroeger geopend): meteen open, sleutel al weg.
        isOpen = true
        sleutelWeg = true
        openT = -100
      }
      ;(lamp.material as THREE.MeshBasicMaterial).color.set(open ? '#22c55e' : ballen >= totaal ? '#facc15' : '#ef4444')
    },
    open() {
      if (isOpen) return
      isOpen = true
      openT = performance.now() / 1000
    },
    update(seconden) {
      if (!ouder.visible) return
      const t = openT < -50 ? 99 : openT < 0 ? 0 : performance.now() / 1000 - openT
      // Eerst draait het wiel, dan zwaait de deur open (ruim 100°).
      wiel.rotation.z = -Math.min(1, t / 1.4) * Math.PI * 2
      const zwaai = Math.max(0, Math.min(1, (t - 1.4) / 1.8))
      scharnier.rotation.y = -(1 - Math.pow(1 - zwaai, 3)) * 1.9
      // De sleutel zweeft en draait; na het openen vliegt hij naar jou toe en is hij weg.
      sleutel.visible = !sleutelWeg
      if (!sleutelWeg) {
        sleutel.rotation.y = seconden * 1.4
        sleutel.position.y = 1.35 + Math.sin(seconden * 2) * 0.03
        if (t > 3.4) {
          const v = Math.min(1, (t - 3.4) / 0.8)
          sleutel.position.z = -0.05 + v * 1.4
          sleutel.position.y = 1.35 + v * 0.25
          sleutel.scale.setScalar(1 - v * 0.7)
          if (v >= 1) sleutelWeg = true
        }
      }
    },
  }
}
