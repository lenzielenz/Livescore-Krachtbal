import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, lichtshow, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { gevelOmtrek } from './omgeving'
import { bijSpelersgebouwen } from './kleedkamer'
import { canvasTex, rnd } from './stadion'

// De buitenkant afgewerkt tot in de details, bovenop de gevel uit omgeving.ts:
//  • een zwevende dakrand rondom: een slanke luifel boven de kroonlijst met downlights eronder en een
//    witte lichtlijn langs de rand — het silhouet van een modern stadion;
//  • glazen traptorens in de vier hoeken, met verlichte trappen erin en een kroon in clubkleur;
//  • verlichte portalen bij elke ingang met een bord (letter + naam);
//  • twee fonteinen bij de hoofdingang: waterstralen en druppels, met licht in de clubkleur;
//  • verlichte paaltjes langs de paden, banken en plantenbakken op het plein.
// Vlot: herhaalde onderdelen zijn InstancedMeshes; enkel de fonteindruppels bewegen per beeld.

export function bouwBuitenkant(
  scene: THREE.Scene,
  opt: { thema: StadionThema; licht: boolean },
): { obstakels: Rechthoek[]; bakken: { x: number; z: number; w: number; y: number }[]; update: (seconden: number) => void } {
  const { thema, licht } = opt
  const { A, B, R, hoogte: H } = GEVEL
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)
  const wit = new THREE.Color('#fff7e6')
  const obstakels: Rechthoek[] = []
  const toeval = rnd(777)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const een = new THREE.Vector3(1, 1, 1)
  const metaal = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.75, roughness: 0.3, emissive: '#1f2937', emissiveIntensity: 0.4 })
  const donkerMetaal = new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.6, roughness: 0.45 })
  const lichtWit = new THREE.MeshBasicMaterial({ color: '#f8fafc', toneMapped: false })
  const clubLicht = new THREE.MeshBasicMaterial({ color: primair, toneMapped: false })
  const lijn = (pts: { x: number; z: number; nx: number; nz: number }[], off0: number, off1: number, y0: number, y1: number) => {
    // Een band langs de omtrek, van (off0, y0) tot (off1, y1) loodrecht op de gevel.
    const pos: number[] = []
    const idx: number[] = []
    pts.concat([pts[0]]).forEach((p, i) => {
      pos.push(p.x + p.nx * off0, y0, p.z + p.nz * off0, p.x + p.nx * off1, y1, p.z + p.nz * off1)
      if (i > 0) {
        const k = i * 2
        idx.push(k - 2, k, k - 1, k - 1, k, k + 1)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }

  // ---------- zwevende dakrand ----------
  const rand = gevelOmtrek(1)
  const dakY = H + 1.15
  scene.add(
    // Bovenkant en onderkant van de luifel (licht hellend naar buiten), en de opstaande rand.
    new THREE.Mesh(lijn(rand, -0.2, 3.4, dakY + 0.25, dakY + 0.55), new THREE.MeshLambertMaterial({ color: '#273140', side: THREE.DoubleSide })),
    new THREE.Mesh(lijn(rand, -0.2, 3.4, dakY, dakY + 0.3), new THREE.MeshLambertMaterial({ color: '#d7dbe2', side: THREE.DoubleSide })),
    new THREE.Mesh(lijn(rand, 3.4, 3.42, dakY + 0.3, dakY + 0.78), new THREE.MeshLambertMaterial({ color: '#111827', side: THREE.DoubleSide })),
    // Witte lichtlijn langs de onderrand, en een fijne lijn in clubkleur bovenaan.
    new THREE.Mesh(lijn(rand, 3.43, 3.44, dakY + 0.26, dakY + 0.36), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, side: THREE.DoubleSide })),
    new THREE.Mesh(lijn(rand, 3.43, 3.44, dakY + 0.66, dakY + 0.72), new THREE.MeshBasicMaterial({ color: primair, toneMapped: false, side: THREE.DoubleSide })),
  )
  // Downlights onder de luifel.
  const dlPunten = gevelOmtrek(2.5)
  const downlights = new THREE.InstancedMesh(new THREE.CircleGeometry(0.16, 12).rotateX(Math.PI / 2), lichtWit, dlPunten.length)
  dlPunten.forEach((p, i) => {
    m4.makeTranslation(p.x + p.nx * 2.3, dakY + 0.17, p.z + p.nz * 2.3)
    downlights.setMatrixAt(i, m4)
  })
  scene.add(downlights)

  // ---------- glazen traptorens in de hoeken ----------
  const glas = new THREE.MeshStandardMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.28, metalness: 0.4, roughness: 0.08, depthWrite: false, side: THREE.DoubleSide })
  const binnenLicht = new THREE.MeshBasicMaterial({ color: '#ffd58a', toneMapped: false })
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const n = new THREE.Vector3(sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2)
    const c = new THREE.Vector3(sx * (A - R) + n.x * (R + 3.9), 0, sz * (B - R) + n.z * (R + 3.9))
    const r = 3
    const th = H + 2.2
    const toren = new THREE.Group()
    toren.position.copy(c)
    toren.rotation.y = Math.atan2(n.x, n.z)
    // De glazen schacht met stijlen, een donkere kern en zigzagtrappen die van binnen oplichten.
    const schacht = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, 36, 1, true), glas)
    schacht.position.y = th / 2
    const kern = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.6, r - 0.6, th, 24), new THREE.MeshLambertMaterial({ color: '#2a2f3a' }))
    kern.position.y = th / 2
    const stijlen: THREE.BufferGeometry[] = []
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      stijlen.push(new THREE.BoxGeometry(0.08, th, 0.08).translate(Math.cos(a) * r, th / 2, Math.sin(a) * r))
    }
    for (let y = 2.5; y < th; y += 2.5) stijlen.push(new THREE.TorusGeometry(r, 0.04, 6, 36).rotateX(Math.PI / 2).translate(0, y, 0))
    const trappen: THREE.BufferGeometry[] = []
    for (let v = 0; v < 6; v++) {
      const y0 = v * 2.5
      const a0 = v % 2 ? 0.5 : -0.5
      // Een schuine lichtende trapstrook langs de glazen wand, telkens de andere kant op.
      const strook = new THREE.BoxGeometry(2.6, 0.08, 0.35)
      strook.rotateZ(v % 2 ? 0.75 : -0.75)
      strook.translate(0, y0 + 1.25, 0)
      strook.translate(Math.sin(a0) * 0.2, 0, r - 0.5)
      trappen.push(strook)
      trappen.push(new THREE.BoxGeometry(2.4, 0.06, 0.6).translate(0, y0 + 0.02, r - 0.6))
    }
    const kroon = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.15, r + 0.15, 0.7, 36, 1, true), clubLicht)
    kroon.position.y = th + 0.1
    const dak = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.25, r + 0.25, 0.25, 36), donkerMetaal)
    dak.position.y = th + 0.55
    toren.add(kern, schacht, new THREE.Mesh(mergeGeometries(stijlen), metaal), new THREE.Mesh(mergeGeometries(trappen), binnenLicht), kroon, dak)
    scene.add(toren)
    obstakels.push({ x0: c.x - r - 0.3, x1: c.x + r + 0.3, z0: c.z - r - 0.3, z1: c.z + r + 0.3 })
  }

  // ---------- verlichte portalen en borden bij de ingangen ----------
  const ingangen: { naam: string; letter: string; x: number; z: number; ry: number; breed: number }[] = [
    { naam: 'HOOFDINGANG', letter: 'A', x: 0, z: B, ry: 0, breed: 14 },
    { naam: 'INGANG OOST', letter: 'B', x: A, z: 0, ry: Math.PI / 2, breed: 6 },
    { naam: 'INGANG NOORD', letter: 'C', x: 0, z: -B, ry: Math.PI, breed: 6 },
    { naam: 'INGANG WEST', letter: 'D', x: -A, z: 0, ry: -Math.PI / 2, breed: 6 },
  ]
  const POORT_H = 5.5
  const portaalMat = new THREE.MeshBasicMaterial({ color: primair, toneMapped: false })
  for (const ing of ingangen) {
    const g = new THREE.Group()
    g.position.set(ing.x, 0, ing.z)
    g.rotation.y = ing.ry
    const b = ing.breed
    // Een lichtkader rond de opening, net voor de gevel.
    const kader = mergeGeometries([
      new THREE.BoxGeometry(0.22, POORT_H, 0.12).translate(-b / 2 - 0.11, POORT_H / 2, 0.68),
      new THREE.BoxGeometry(0.22, POORT_H, 0.12).translate(b / 2 + 0.11, POORT_H / 2, 0.68),
      new THREE.BoxGeometry(b + 0.44, 0.22, 0.12).translate(0, POORT_H + 0.11, 0.68),
    ])
    g.add(new THREE.Mesh(kader, portaalMat))
    // Het bord: letter in een vak, naam ernaast. Bij de hoofdingang hangt al het grote bord; daar
    // enkel de letter naast de poort.
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 160
    const tg = c.getContext('2d')!
    tg.fillStyle = '#0b1220'
    tg.fillRect(0, 0, 1024, 160)
    tg.fillStyle = thema.primair
    tg.fillRect(0, 0, 160, 160)
    tg.fillStyle = thema.tekstOpPrimair
    tg.font = '900 120px Inter, system-ui, sans-serif'
    tg.textAlign = 'center'
    tg.textBaseline = 'middle'
    tg.fillText(ing.letter, 80, 86)
    tg.fillStyle = '#ffffff'
    tg.font = '800 74px Inter, system-ui, sans-serif'
    tg.textAlign = 'left'
    tg.fillText(ing.naam, 196, 84, 800)
    const bordB = ing.letter === 'A' ? 4.2 : Math.min(b + 1, 6.6)
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(bordB, (bordB * 160) / 1024), new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false }))
    if (ing.letter === 'A') bord.position.set(-b / 2 - 2.6, 3.6, 0.7)
    else bord.position.set(0, POORT_H + 0.75, 0.7)
    g.add(bord)
    scene.add(g)
  }

  // ---------- fonteinen bij de hoofdingang ----------
  const waterMat = new THREE.MeshStandardMaterial({ color: '#0b3a5c', metalness: 0.3, roughness: 0.08, emissive: primair, emissiveIntensity: 0.25 })
  const randMat = new THREE.MeshLambertMaterial({ color: '#cbd5e1' })
  const straalTex = new THREE.CanvasTexture(
    (() => {
      const c = document.createElement('canvas')
      c.width = 8
      c.height = 128
      const g = c.getContext('2d')!
      const gr = g.createLinearGradient(0, 0, 0, 128)
      gr.addColorStop(0, 'rgba(255,255,255,0)')
      gr.addColorStop(0.3, 'rgba(220,240,255,.75)')
      gr.addColorStop(1, 'rgba(220,240,255,.35)')
      g.fillStyle = gr
      g.fillRect(0, 0, 8, 128)
      return c
    })(),
  )
  const straalMat = new THREE.MeshBasicMaterial({ map: straalTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const druppelN = licht ? 40 : 110
  const fonteinen: { c: THREE.Vector3; stralen: THREE.Mesh[]; druppels: { a: number; r: number; v: number; t0: number }[]; water: THREE.MeshStandardMaterial }[] = []
  const druppelMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#e0f2fe', toneMapped: false }), druppelN * 2)
  druppelMesh.frustumCulled = false
  for (const fx of [-17, 17]) {
    const c = new THREE.Vector3(fx, 0, B + 17)
    const bak = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.35, 0.55, 40, 1, true), randMat)
    bak.position.set(c.x, 0.275, c.z)
    const boord = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.13, 8, 40).rotateX(Math.PI / 2), randMat)
    boord.position.set(c.x, 0.56, c.z)
    const water = waterMat.clone()
    const opp = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40).rotateX(-Math.PI / 2), water)
    opp.position.set(c.x, 0.42, c.z)
    const sokkel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.9, 16), randMat)
    sokkel.position.set(c.x, 0.45, c.z)
    scene.add(bak, boord, opp, sokkel)
    const stralen = [0, 1, 2, 3, 4].map((k) => {
      const a = (k / 5) * Math.PI * 2
      const rr = k === 0 ? 0 : 1.6
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 1, 8, 1, true).translate(0, 0.5, 0), straalMat)
      s.position.set(c.x + Math.cos(a) * rr * (k ? 1 : 0), k ? 0.42 : 0.9, c.z + Math.sin(a) * rr * (k ? 1 : 0))
      scene.add(s)
      return s
    })
    fonteinen.push({
      c,
      stralen,
      water,
      druppels: Array.from({ length: druppelN }, () => ({ a: toeval() * Math.PI * 2, r: 0.2 + toeval() * 1.6, v: 3.2 + toeval() * 2.2, t0: toeval() * 2 })),
    })
    obstakels.push({ x0: c.x - 3.4, x1: c.x + 3.4, z0: c.z - 3.4, z1: c.z + 3.4 })
  }
  scene.add(druppelMesh)

  // ---------- plein: verlichte paaltjes, banken en plantenbakken ----------
  const paaltjePunten = gevelOmtrek(5).filter((p) => !(p.nz > 0.5 && Math.abs(p.x) < 10) && !bijSpelersgebouwen(p.x + p.nx * 7.5, p.z + p.nz * 7.5))
  const paaltjes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 10).translate(0, 0.45, 0), donkerMetaal, paaltjePunten.length)
  const kapjes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.095, 0.095, 0.12, 10).translate(0, 0.84, 0), lichtWit, paaltjePunten.length)
  const paalGloedC = document.createElement('canvas')
  paalGloedC.width = paalGloedC.height = 64
  {
    const g = paalGloedC.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,240,210,.55)')
    gr.addColorStop(1, 'rgba(255,240,210,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  }
  const gloedjes = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1.1, 16).rotateX(-Math.PI / 2).translate(0, 0.03, 0),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(paalGloedC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    paaltjePunten.length,
  )
  paaltjePunten.forEach((p, i) => {
    m4.makeTranslation(p.x + p.nx * 7.5, 0, p.z + p.nz * 7.5)
    paaltjes.setMatrixAt(i, m4)
    kapjes.setMatrixAt(i, m4)
    gloedjes.setMatrixAt(i, m4)
  })
  scene.add(paaltjes, kapjes, gloedjes)

  // Banken rond de fonteinen en plantenbakken met een boompje langs de toegang.
  const bankGeo = mergeGeometries([
    new THREE.BoxGeometry(2.2, 0.08, 0.5).translate(0, 0.46, 0),
    new THREE.BoxGeometry(2.2, 0.45, 0.06).translate(0, 0.72, -0.24),
    new THREE.BoxGeometry(0.08, 0.46, 0.45).translate(-1.0, 0.23, 0),
    new THREE.BoxGeometry(0.08, 0.46, 0.45).translate(1.0, 0.23, 0),
  ])
  const banken = new THREE.InstancedMesh(bankGeo, new THREE.MeshLambertMaterial({ color: '#7c5a3a' }), 8)
  let bi = 0
  for (const fx of [-17, 17]) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      const x = fx + Math.cos(a) * 4.6
      const z = B + 17 + Math.sin(a) * 4.6
      m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(Y, Math.atan2(fx - x, B + 17 - z)), een)
      banken.setMatrixAt(bi++, m4)
    }
  }
  scene.add(banken)
  const bakPos: [number, number][] = [
    [-7.8, B + 12],
    [7.8, B + 12],
    [-7.8, B + 20],
    [7.8, B + 20],
  ]
  for (const [x, z] of bakPos) {
    const bak = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.6), new THREE.MeshLambertMaterial({ color: '#374151' }))
    bak.position.set(x, 0.35, z)
    const rand2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 1.7), new THREE.MeshLambertMaterial({ color: '#9ca3af' }))
    rand2.position.set(x, 0.72, z)
    const stam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 6), new THREE.MeshLambertMaterial({ color: '#5b3a1e' }))
    stam.position.set(x, 1.5, z)
    const kruin = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), new THREE.MeshLambertMaterial({ color: '#2f6b3a' }))
    kruin.position.set(x, 2.6, z)
    scene.add(bak, rand2, stam, kruin)
    obstakels.push({ x0: x - 0.9, x1: x + 0.9, z0: z - 0.9, z1: z + 0.9 })
  }

  const p = new THREE.Vector3()
  const kleur = new THREE.Color()
  return {
    obstakels,
    // Waar de plantenbakken staan: tuin.ts zet er bloemen in.
    bakken: bakPos.map(([x, z]) => ({ x, z, w: 1.6, y: 0.72 })),
    update(seconden) {
      const show = lichtshow(seconden)
      // Portalen en torenkronen ademen in de clubkleur, en flitsen mee tijdens de lichtshow.
      const adem = 0.75 + 0.25 * Math.sin(seconden * 1.4)
      kleur.copy(show >= 0 ? (Math.floor(seconden * 8) % 2 ? primair : wit) : primair).multiplyScalar(show >= 0 ? 1.2 : adem)
      portaalMat.color.copy(kleur)
      clubLicht.color.copy(kleur)
      // Fonteinen: de stralen deinen, de druppels vallen in een boog terug, het water kleurt mee.
      let di = 0
      fonteinen.forEach((f, fi) => {
        f.stralen.forEach((s, k) => {
          const h = k === 0 ? 2.6 + Math.sin(seconden * 1.3 + fi) * 0.6 + (show >= 0 ? 1.5 : 0) : 1.4 + Math.sin(seconden * 2 + k + fi) * 0.35
          s.scale.set(1, h, 1)
        })
        f.water.emissive.copy(show >= 0 ? secundair : primair)
        f.water.emissiveIntensity = 0.2 + 0.12 * Math.sin(seconden * 0.9 + fi)
        for (const d of f.druppels) {
          const t = (seconden + d.t0) % 1.4
          const hoogte = 0.9 + d.v * t - 4.9 * t * t
          if (hoogte < 0.42) {
            m4.makeScale(0, 0, 0)
          } else {
            p.set(f.c.x + Math.cos(d.a) * d.r * (t / 1.4) * 1.6, hoogte, f.c.z + Math.sin(d.a) * d.r * (t / 1.4) * 1.6)
            m4.makeTranslation(p.x, p.y, p.z)
          }
          druppelMesh.setMatrixAt(di++, m4)
        }
      })
      druppelMesh.instanceMatrix.needsUpdate = true
    },
  }
}
