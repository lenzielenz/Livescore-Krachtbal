import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, inPoort, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { gevelOmtrek } from './omgeving'

// De afwerking van de wandelgangen, zodat het geen kale hal is:
//  • een ledplint in clubkleur onderaan de binnenwand van de gevel, met een zachte gloed op de vloer;
//  • een dubbele inleglijn in de vloer (clubkleuren) die de hele gang rond loopt;
//  • in de oost- en westgang zitbanken (houten latten op stalen poten) tegenover de fotogalerij, met
//    plantenbakken en vuilbakjes ernaast.
// Alles in een handvol samengevoegde meshes: het kost bijna niets.

export function bouwGangafwerking(
  scene: THREE.Scene,
  opt: { thema: StadionThema; licht: boolean; oost?: Rechthoek; west?: Rechthoek },
): { obstakels: Rechthoek[]; update: (seconden: number) => void } {
  const { thema } = opt
  const obstakels: Rechthoek[] = []
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)

  // ---------- ledplint en inleglijnen, de gevel rond ----------
  const punten = gevelOmtrek(1)
  const strook = (af: number, breed: number, y: number): THREE.BufferGeometry => {
    const pos: number[] = []
    punten.forEach((a, i) => {
      const b = punten[(i + 1) % punten.length]
      if (inPoort(GEVEL, (a.x + b.x) / 2 - a.nx, (a.z + b.z) / 2 - a.nz)) return
      const p = (q: typeof a, d: number) => [q.x - q.nx * d, y, q.z - q.nz * d]
      const [a0, a1, b0, b1] = [p(a, af), p(a, af + breed), p(b, af), p(b, af + breed)]
      pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }
  const wand = (af: number, y0: number, y1: number): THREE.BufferGeometry => {
    const pos: number[] = []
    punten.forEach((a, i) => {
      const b = punten[(i + 1) % punten.length]
      if (inPoort(GEVEL, (a.x + b.x) / 2 - a.nx, (a.z + b.z) / 2 - a.nz)) return
      const ax = a.x - a.nx * af
      const az = a.z - a.nz * af
      const bx = b.x - b.nx * af
      const bz = b.z - b.nz * af
      pos.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y0, bz, bx, y1, bz, ax, y1, az)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }
  // De plint zelf (donker) met daarop een lichtlijn in de clubkleur.
  scene.add(new THREE.Mesh(wand(0.615, 0, 0.14), new THREE.MeshBasicMaterial({ color: '#15171c', side: THREE.DoubleSide })))
  scene.add(new THREE.Mesh(wand(0.62, 0.14, 0.17), new THREE.MeshBasicMaterial({ color: primair, toneMapped: false, side: THREE.DoubleSide })))
  // De gloed van die lichtlijn op de vloer: een strook die naar de gang toe uitdooft.
  const gloedC = document.createElement('canvas')
  gloedC.width = 4
  gloedC.height = 64
  {
    const g = gloedC.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 0, 64)
    gr.addColorStop(0, 'rgba(255,255,255,.55)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 4, 64)
  }
  const gloedGeo = strook(0.62, 0.9, 0.028)
  // UV: v loopt van de wand (0) naar de gang (1).
  const uv: number[] = []
  for (let i = 0; i < gloedGeo.attributes.position.count / 6; i++) uv.push(0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1)
  gloedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  const gloedTex = new THREE.CanvasTexture(gloedC)
  gloedTex.flipY = false
  const gloedMat = new THREE.MeshBasicMaterial({ map: gloedTex, color: primair, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 })
  scene.add(new THREE.Mesh(gloedGeo, gloedMat))
  // Inleglijnen: een brede in de primaire en een smalle in de secundaire kleur.
  const inleg = (af: number, breed: number, kleur: THREE.Color) =>
    scene.add(
      new THREE.Mesh(
        strook(af, breed, 0.022),
        new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.3, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide }),
      ),
    )
  inleg(3.55, 0.12, primair)
  inleg(3.75, 0.05, secundair)

  // ---------- banken, plantenbakken en vuilbakjes in de oost- en westgang ----------
  const hout = new THREE.MeshStandardMaterial({ color: '#a8743f', roughness: 0.6 })
  const staal = new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.7, roughness: 0.35 })
  const bak = new THREE.MeshStandardMaterial({ color: '#3f3f46', roughness: 0.8 })
  const groen = new THREE.MeshLambertMaterial({ color: '#2f7d3b' })
  const groen2 = new THREE.MeshLambertMaterial({ color: '#1f5f2b' })
  const band = new THREE.MeshBasicMaterial({ color: primair, toneMapped: false })
  const houtG: THREE.BufferGeometry[] = []
  const staalG: THREE.BufferGeometry[] = []
  const bakG: THREE.BufferGeometry[] = []
  const groenG: THREE.BufferGeometry[] = []
  const groen2G: THREE.BufferGeometry[] = []
  const bandG: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const zet = (lijst: THREE.BufferGeometry[], g: THREE.BufferGeometry, x: number, y: number, z: number, ry: number, ox = 0, oz = 0) => {
    // (ox, oz) is een verschuiving in de eigen richting van het meubel.
    const c = Math.cos(ry)
    const s = Math.sin(ry)
    m.makeRotationY(ry).setPosition(x + ox * c + oz * s, y, z - ox * s + oz * c)
    lijst.push(g.clone().applyMatrix4(m))
  }
  const plant = (x: number, z: number) => {
    bakG.push(new THREE.CylinderGeometry(0.32, 0.26, 0.6, 14).translate(x, 0.3, z))
    groenG.push(new THREE.IcosahedronGeometry(0.42, 1).scale(1, 1.25, 1).translate(x, 1.02, z))
    groen2G.push(new THREE.IcosahedronGeometry(0.3, 1).translate(x + 0.12, 1.45, z - 0.08))
    obstakels.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 })
  }
  const vuilbak = (x: number, z: number) => {
    staalG.push(new THREE.CylinderGeometry(0.22, 0.2, 0.85, 14).translate(x, 0.425, z))
    bandG.push(new THREE.CylinderGeometry(0.225, 0.225, 0.08, 14).translate(x, 0.7, z))
    obstakels.push({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25 })
  }
  const bank = (x: number, z: number, ry: number) => {
    // Vier latten op 0,45 m, een rugleuning van twee latten, en twee stalen U-poten.
    for (let k = 0; k < 4; k++) zet(houtG, new THREE.BoxGeometry(2.2, 0.04, 0.09), x, 0.45, z, ry, 0, -0.17 + k * 0.11)
    for (let k = 0; k < 2; k++) zet(houtG, new THREE.BoxGeometry(2.2, 0.09, 0.035), x, 0.68 + k * 0.14, z, ry, 0, -0.27)
    for (const sx of [-0.85, 0.85]) {
      zet(staalG, new THREE.BoxGeometry(0.06, 0.43, 0.06), x, 0.215, z, ry, sx, -0.15)
      zet(staalG, new THREE.BoxGeometry(0.06, 0.43, 0.06), x, 0.215, z, ry, sx, 0.15)
      zet(staalG, new THREE.BoxGeometry(0.06, 0.04, 0.46), x, 0.41, z, ry, sx, -0.02)
      zet(staalG, new THREE.BoxGeometry(0.05, 0.5, 0.05), x, 0.6, z, ry, sx, -0.28)
    }
    const c = Math.abs(Math.cos(ry))
    const hw = c > 0.5 ? 1.15 : 0.35
    const hd = c > 0.5 ? 0.35 : 1.15
    obstakels.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd })
  }
  for (const [tribune, kant] of [
    [opt.oost, 1],
    [opt.west, -1],
  ] as const) {
    if (!tribune) continue
    // Tegenover de foto's op de achterwand van de tribune, met je rug naar de looplijn.
    const wandX = kant > 0 ? tribune.x1 : tribune.x0
    const x = wandX + kant * 1.7
    const ry = kant > 0 ? -Math.PI / 2 : Math.PI / 2
    for (const z of [-15.5, -10, 10, 15.5]) {
      bank(x, z, ry)
      plant(x, z + (z > 0 ? 1.75 : -1.75))
    }
    vuilbak(x, kant > 0 ? 7.6 : -7.6)
    vuilbak(x, kant > 0 ? -7.6 : 7.6)
  }
  const voeg = (lijst: THREE.BufferGeometry[], mat: THREE.Material, schaduw = false) => {
    if (!lijst.length) return
    const mesh = new THREE.Mesh(mergeGeometries(lijst), mat)
    mesh.castShadow = schaduw && !opt.licht
    scene.add(mesh)
  }
  voeg(houtG, hout, true)
  voeg(staalG, staal)
  voeg(bakG, bak)
  voeg(groenG, groen)
  voeg(groen2G, groen2)
  voeg(bandG, band)

  return {
    obstakels,
    update(seconden) {
      // De ledplint ademt heel zacht mee, als een stadion dat wakker is.
      gloedMat.opacity = 0.42 + Math.sin(seconden * 0.8) * 0.08
    },
  }
}
