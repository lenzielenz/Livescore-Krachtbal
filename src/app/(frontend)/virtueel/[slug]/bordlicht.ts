import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Eigen verlichting per bord in de gangen, zoals in een museum of een clubhuis met allure:
//  • een slanke schilderijlamp boven het bord, met een felle lichtlijn aan de onderkant;
//  • een lichtwaaier op de muur en een zachte lichtval bovenaan op het bord zelf;
//  • een gloed achter het bord in de kleur van het bord (goud, zilver, clubkleur, live-rood …);
//  • een lichtbundel van de lamp naar het bord, en een lichtplas op de vloer ervoor.
// Geen echte lichten (die kosten per bord een render-pass): alles is additief "nep-licht" met
// gedeelde texturen, en elk onderdeel is één InstancedMesh voor alle borden samen.
//
// Lokaal assenstelsel per bord: het midden van het bord op de muur, het bord kijkt naar +z.

export type BordPlek = {
  /** Midden van het bord, tegen de muur (wereldcoördinaten). */
  pos: THREE.Vector3
  /** Draaiing zodat lokaal +z van de muur weg wijst. */
  rot: THREE.Quaternion
  b: number
  h: number
  kleur: string
  /** Een lichtplas op de vloer ervoor (niet voor een bovenste rij). */
  vloer?: boolean
}

export type Bordlicht = { kleur: (i: number, kleur: string) => void; update: (seconden: number) => void }

function tex(w: number, h: number, teken: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  return new THREE.CanvasTexture(c)
}

/** Een gloed die van de rand van een rechthoek zacht uitloopt (voor achter het bord). */
const haloTex = () =>
  tex(128, 128, (g) => {
    for (let r = 0; r < 26; r++) {
      g.strokeStyle = `rgba(255,255,255,${0.16 * (1 - r / 26) ** 1.4})`
      g.lineWidth = 2
      g.beginPath()
      g.roundRect(28 - r, 28 - r, 72 + 2 * r, 72 + 2 * r, 6 + r)
      g.stroke()
    }
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.fillRect(28, 28, 72, 72)
  })

/** Een lichtwaaier: smal en fel bovenaan, breder en zwakker naar onder. */
const waaierTex = () =>
  tex(128, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256)
    gr.addColorStop(0, 'rgba(255,255,255,.75)')
    gr.addColorStop(0.45, 'rgba(255,255,255,.22)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(44, 0)
    g.lineTo(84, 0)
    g.lineTo(128, 256)
    g.lineTo(0, 256)
    g.closePath()
    g.fill()
    // Zachte zijkanten.
    g.globalCompositeOperation = 'destination-out'
    for (const [x0, x1] of [[0, 34], [128, 94]]) {
      const zij = g.createLinearGradient(x0, 0, x1, 0)
      zij.addColorStop(0, 'rgba(0,0,0,1)')
      zij.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = zij
      g.fillRect(Math.min(x0, x1), 0, 34, 256)
    }
  })

/** Lichtval op het bord: bovenaan wat helderder, naar het midden toe weg. */
const valTex = () =>
  tex(8, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128)
    gr.addColorStop(0, 'rgba(255,255,255,.2)')
    gr.addColorStop(0.55, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 8, 128)
  })

/** Een bundel: helder bij de lamp, uitdovend naar het bord. */
const bundelTex = () =>
  tex(8, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128)
    gr.addColorStop(0, 'rgba(255,255,255,.22)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 8, 128)
  })

const plasTex = () =>
  tex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,255,255,.5)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  })

const additief = (map: THREE.Texture, opacity = 1) =>
  new THREE.MeshBasicMaterial({ map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })

export function bouwBordlicht(scene: THREE.Scene, borden: BordPlek[], opt: { licht?: string } = {}): Bordlicht {
  const n = borden.length
  if (n === 0) return { kleur() {}, update() {} }
  const warm = new THREE.Color(opt.licht ?? '#ffe7b8')
  // Alle onderdelen hebben eenheidsmaten; de schaal per bord zit in de instantiematrix.
  const lamp = new THREE.InstancedMesh(
    mergeGeometries([
      // Armpje van de muur naar voor, en de lampbehuizing over (bijna) de hele breedte.
      new THREE.BoxGeometry(0.04, 0.04, 0.36).translate(0, 0, 0.18),
      new THREE.CylinderGeometry(0.055, 0.055, 1, 16).rotateZ(Math.PI / 2).translate(0, 0, 0.38),
    ]),
    // Messing; een vleugje eigen gloed zodat het ook in een donkere hoek als messing leest.
    new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.7, roughness: 0.35, emissive: '#6b4e12', emissiveIntensity: 0.6 }),
    n,
  )
  const lens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.02, 0.05).translate(0, -0.05, 0.4), new THREE.MeshBasicMaterial({ color: '#fffaf0', toneMapped: false }), n)
  const waaier = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0), additief(waaierTex(), 0.8), n)
  const val = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), additief(valTex()), n)
  // De gloed gewoon gemengd (niet additief): zo blijft de kleur ook zichtbaar op de lichte muur.
  const halo = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    n,
  )
  const bundel = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 1, 1, 24, 1, true).translate(0, -0.5, 0), additief(bundelTex(), 0.45), n)
  ;(bundel.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide
  const plassen = borden.filter((b) => b.vloer)
  const plas = plassen.length ? new THREE.InstancedMesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), additief(plasTex(), 0.55), plassen.length) : null

  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  const s = new THREE.Vector3()
  const lokaal = (b: BordPlek, x: number, y: number, z: number) => v.set(x, y, z).applyQuaternion(b.rot).add(b.pos).clone()
  const kantel = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.15)
  borden.forEach((b, i) => {
    const top = b.h / 2 + 0.3
    m.compose(lokaal(b, 0, top, 0), b.rot, s.set(b.b * 0.62, 1, 1))
    lamp.setMatrixAt(i, m)
    lens.setMatrixAt(i, m)
    // De waaier op de muur, net achter het bord: zichtbaar boven en naast het kader.
    m.compose(lokaal(b, 0, top - 0.05, 0.012), b.rot, s.set(b.b + 1.3, b.h + 1.0, 1))
    waaier.setMatrixAt(i, m)
    // De lichtval op het bord zelf, net ervoor.
    m.compose(lokaal(b, 0, 0, 0.076), b.rot, s.set(b.b, b.h, 1))
    val.setMatrixAt(i, m)
    // De gloed achter het bord.
    m.compose(lokaal(b, 0, 0, 0.004), b.rot, s.set(b.b * 1.6, b.h * 1.75, 1))
    halo.setMatrixAt(i, m)
    halo.setColorAt(i, new THREE.Color(b.kleur))
    // De bundel: van de lamp schuin naar het bord.
    m.compose(lokaal(b, 0, top - 0.06, 0.4), b.rot.clone().multiply(kantel), s.set(b.b * 0.42, b.h * 0.65, 0.3))
    bundel.setMatrixAt(i, m)
    for (const mesh of [waaier, val, bundel]) mesh.setColorAt(i, warm)
  })
  plassen.forEach((b, i) => {
    const p = lokaal(b, 0, 0, 1.3)
    p.y = 0.036
    m.compose(p, new THREE.Quaternion(), s.set(b.b * 0.62, 1, 0.9))
    plas!.setMatrixAt(i, m)
    plas!.setColorAt(i, warm.clone().lerp(new THREE.Color(b.kleur), 0.35))
  })
  scene.add(halo, waaier, val, bundel, lamp, lens)
  if (plas) scene.add(plas)

  return {
    kleur(i, kleur) {
      if (i >= n) return
      halo.setColorAt(i, new THREE.Color(kleur))
      if (halo.instanceColor) halo.instanceColor.needsUpdate = true
    },
    update(seconden) {
      // Héél zacht ademen, zodat de gang leeft zonder te flikkeren.
      ;(halo.material as THREE.MeshBasicMaterial).opacity = 0.84 + 0.06 * Math.sin(seconden * 0.9)
    },
  }
}
