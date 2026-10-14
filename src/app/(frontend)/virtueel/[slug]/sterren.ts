import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, type EreSter, type StadionThema } from '@/lib/virtueel'
import { canvasTex } from './stadion'

// De Walk of Fame van je club: elke keer iemand van je club een referendumprijs won, krijgt die een
// ster in de vloer van de Hall of Fame-gang — zoals op Hollywood Boulevard. Een tegel van donkere
// terrazzo met een roze ster in een messing rand, de naam in messing letters, en in het medaillon de
// prijs en het jaar. Een zachte glans glijdt af en toe over de sterren.
// Vlot: alle sterren delen één textuur-atlas en zijn één mesh.

const KOL = 4
const CEL = 512
const TEGEL = 1.7

function tekenSter(g: CanvasRenderingContext2D, x0: number, y0: number, s: EreSter, thema: StadionThema): void {
  const c = CEL / 2
  // Terrazzo: donker met fijne steenkorrels.
  g.fillStyle = '#2b2a2e'
  g.fillRect(x0, y0, CEL, CEL)
  let zaad = s.naam.length * 97 + s.jaar.length * 13
  const r = () => ((zaad = (zaad * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 900; i++) {
    const t = r()
    g.fillStyle = t < 0.5 ? 'rgba(255,255,255,.07)' : t < 0.8 ? 'rgba(0,0,0,.25)' : 'rgba(214,170,120,.12)'
    g.fillRect(x0 + r() * CEL, y0 + r() * CEL, 2 + r() * 3, 2 + r() * 3)
  }
  // Messing voegen rond de tegel.
  g.strokeStyle = '#b08d57'
  g.lineWidth = 6
  g.strokeRect(x0 + 3, y0 + 3, CEL - 6, CEL - 6)
  // De ster: roze terrazzo met een messing rand.
  const ster = (rBuiten: number, rBinnen: number) => {
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? rBinnen : rBuiten
      g.lineTo(x0 + c + Math.cos(a) * rr, y0 + c + 14 + Math.sin(a) * rr)
    }
    g.closePath()
  }
  ster(228, 92)
  g.fillStyle = '#c9a063'
  g.fill()
  ster(214, 84)
  const roze = g.createRadialGradient(x0 + c, y0 + c, 20, x0 + c, y0 + c, 230)
  roze.addColorStop(0, '#f2a7a9')
  roze.addColorStop(1, '#d4787d')
  g.fillStyle = roze
  g.fill()
  // Naam bovenaan in messing letters, op de ster.
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#7a5a26'
  let px = 46
  do {
    g.font = `900 ${px}px Georgia, 'Times New Roman', serif`
    px -= 2
  } while (g.measureText(s.naam.toUpperCase()).width > 300 && px > 18)
  g.fillText(s.naam.toUpperCase(), x0 + c, y0 + c - 24)
  // Messing medaillon met een bal-embleem, de prijs en het jaar.
  g.fillStyle = '#c9a063'
  g.beginPath()
  g.arc(x0 + c, y0 + c + 70, 54, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#e8c98e'
  g.beginPath()
  g.arc(x0 + c, y0 + c + 70, 46, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#7a5a26'
  g.lineWidth = 4
  g.beginPath()
  g.arc(x0 + c, y0 + c + 70, 20, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  g.moveTo(x0 + c - 20, y0 + c + 70)
  g.lineTo(x0 + c + 20, y0 + c + 70)
  g.moveTo(x0 + c, y0 + c + 50)
  g.lineTo(x0 + c, y0 + c + 90)
  g.stroke()
  // Onder de ster: de prijs en het jaar, in de clubkleur.
  g.fillStyle = thema.primair
  g.font = '800 30px Inter, system-ui, sans-serif'
  g.fillText(`${s.prijs} · ${s.jaar}`, x0 + c, y0 + CEL - 34, CEL - 40)
}

export function bouwSterren(scene: THREE.Scene, opt: { thema: StadionThema; sterren: EreSter[]; tribuneZ: number; vrij: (x: number, z: number) => boolean }): { update: (seconden: number) => void } {
  const { B } = GEVEL
  // Plaatsen: een rij langs de gevelkant van de gang, en zo nodig een tweede langs de tribune.
  const plekken: { x: number; z: number }[] = []
  for (const z of [B - 2.4, opt.tribuneZ + 1.6]) {
    for (let x = -33; x <= 33.01; x += 2.6) {
      if (Math.abs(x) < 2.8) continue
      if (opt.vrij(x, z)) plekken.push({ x, z })
    }
  }
  // Het dichtst bij de hoofdingang eerst (afwisselend links en rechts), eerst langs de gevel.
  const rij = (p: { z: number }) => (p.z === B - 2.4 ? 0 : 1)
  plekken.sort((a, b) => rij(a) - rij(b) || Math.abs(a.x) - Math.abs(b.x) || a.x - b.x)
  const sterren = opt.sterren.slice(0, plekken.length)
  if (sterren.length === 0) return { update() {} }

  const rijen = Math.ceil(sterren.length / KOL)
  const c = document.createElement('canvas')
  c.width = KOL * CEL
  c.height = rijen * CEL
  const g = c.getContext('2d')!
  sterren.forEach((s, i) => tekenSter(g, (i % KOL) * CEL, Math.floor(i / KOL) * CEL, s, opt.thema))
  const tex = canvasTex(c)
  const vlakken = sterren.map((_, i) => {
    const vlak = new THREE.PlaneGeometry(TEGEL, TEGEL)
    const u0 = (i % KOL) / KOL
    const u1 = u0 + 1 / KOL
    const v1 = 1 - Math.floor(i / KOL) / rijen
    const v0 = v1 - 1 / rijen
    vlak.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
    // Leesbaar voor wie vanuit de hoofdingang de gang in loopt (naam naar de gevel toe).
    vlak.rotateX(-Math.PI / 2)
    vlak.translate(plekken[i].x, 0.028, plekken[i].z)
    return vlak
  })
  const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.28, polygonOffset: true, polygonOffsetFactor: -3, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 })
  scene.add(new THREE.Mesh(mergeGeometries(vlakken), mat))

  // Een glansstreep die af en toe over de rij sterren glijdt.
  const glansC = document.createElement('canvas')
  glansC.width = 256
  glansC.height = 16
  const gg = glansC.getContext('2d')!
  const gr = gg.createLinearGradient(0, 0, 256, 0)
  gr.addColorStop(0, 'rgba(255,240,210,0)')
  gr.addColorStop(0.5, 'rgba(255,240,210,.5)')
  gr.addColorStop(1, 'rgba(255,240,210,0)')
  gg.fillStyle = gr
  gg.fillRect(0, 0, 256, 16)
  const glans = new THREE.Mesh(
    new THREE.PlaneGeometry(3, TEGEL).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glansC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  glans.position.y = 0.035
  scene.add(glans)
  return {
    update(seconden) {
      // Om de 9 s loopt de glans in 3 s over de sterren van één rij.
      const fase = (seconden % 9) / 3
      const rij = Math.floor(seconden / 9) % 2 === 0 ? plekken[0].z : plekken[plekken.length - 1].z
      glans.visible = fase < 1
      glans.position.set(-34 + fase * 68, 0.035, rij)
    },
  }
}
