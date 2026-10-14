import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, gevelAfstand, opVloer, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { VERDIEPEN } from '@/lib/virtueel-lift'
import { gevelOmtrek } from './omgeving'
import { canvasTex, rnd } from './stadion'

// De ringwandeling op het dak: een houten loopbrug bovenop de zwevende dakrand, helemaal rond het
// stadion. Met de lift kom je boven in een glazen paviljoen; een brug brengt je naar de ring.
//  • aan de binnenkant kijk je van hoog over de tribunes op het veld, aan de buitenkant over het
//    plein, de parking en de bomen;
//  • glazen balustrades met een handgreep, een ledlijn in clubkleur langs de rand, lichtjes in
//    de vloer;
//  • banken om te blijven kijken, muntverrekijkers, vlaggen in clubkleur op de hoeken.

export const RING = { y: VERDIEPEN[VERDIEPEN.length - 1].y, binnen: -3.2, buiten: 0.8 }

export type Ring = {
  /** Mag je hier staan op het dak? */
  mag: (x: number, z: number) => boolean
  update: (seconden: number) => void
}

export function bouwRing(scene: THREE.Scene, opt: { thema: StadionThema; licht: boolean; liftX: number; liftZ: number }): Ring {
  const { thema, licht } = opt
  const Y = RING.y
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)
  const toeval = rnd(2468)
  const punten = gevelOmtrek(1)
  const L = punten[punten.length - 1].s + Math.hypot(punten[0].x - punten[punten.length - 1].x, punten[0].z - punten[punten.length - 1].z)
  const brug = { x0: opt.liftX - 1.5, x1: opt.liftX + 1.5, z0: opt.liftZ - 0.05, z1: GEVEL.B + RING.binnen + 0.6 }
  const inBrugOpening = (x: number, z: number) => z > GEVEL.B - 6 && x > brug.x0 - 0.05 && x < brug.x1 + 0.05

  /** Een band langs de ring op offset off0→off1 (vanaf de gevellijn, + = buiten), op hoogte y0→y1. */
  const band = (off0: number, off1: number, y0: number, y1: number, uvLang = 0, overslaan?: (x: number, z: number) => boolean) => {
    const pos: number[] = []
    const uv: number[] = []
    punten.forEach((a, i) => {
      const b = punten[(i + 1) % punten.length]
      if (overslaan?.((a.x + b.x) / 2 + a.nx * off0, (a.z + b.z) / 2 + a.nz * off0)) return
      const sb = i + 1 < punten.length ? b.s : L
      const p = (q: typeof a, o: number, y: number) => [q.x + q.nx * o, y, q.z + q.nz * o]
      const [a0, a1, b0, b1] = [p(a, off0, y0), p(a, off1, y1), p(b, off0, y0), p(b, off1, y1)]
      pos.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1)
      const ua = uvLang ? a.s / uvLang : 0
      const ub = uvLang ? sb / uvLang : 1
      uv.push(ua, 0, ub, 0, ua, 1, ub, 0, ub, 1, ua, 1)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeVertexNormals()
    return g
  }

  // ---------- het dek ----------
  const plankC = document.createElement('canvas')
  plankC.width = 256
  plankC.height = 256
  {
    const g = plankC.getContext('2d')!
    for (let y = 0; y < 256; y += 32) {
      const v = 120 + Math.floor(toeval() * 30)
      g.fillStyle = `rgb(${v},${Math.floor(v * 0.72)},${Math.floor(v * 0.48)})`
      g.fillRect(0, y, 256, 32)
      g.fillStyle = 'rgba(0,0,0,.35)'
      g.fillRect(0, y, 256, 2)
      for (let k = 0; k < 18; k++) {
        g.fillStyle = `rgba(60,35,15,${0.05 + toeval() * 0.12})`
        g.fillRect(toeval() * 256, y + 4 + toeval() * 24, 30 + toeval() * 80, 1)
      }
    }
  }
  const plankTex = canvasTex(plankC)
  plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping
  // v loopt over de breedte van het dek (4 m) → 1 tegel = 4 m breed, de lengte om de 4 m.
  const dek = new THREE.Mesh(band(RING.binnen, RING.buiten, Y, Y, 4), new THREE.MeshLambertMaterial({ map: plankTex, side: THREE.DoubleSide }))
  const onder = new THREE.Mesh(band(RING.binnen, RING.buiten, Y - 0.28, Y - 0.28), new THREE.MeshLambertMaterial({ color: '#d7dbe2', side: THREE.DoubleSide }))
  const randBinnen = new THREE.Mesh(band(RING.binnen, RING.binnen, Y - 0.28, Y), new THREE.MeshLambertMaterial({ color: '#1f2937', side: THREE.DoubleSide }))
  const randBuiten = new THREE.Mesh(band(RING.buiten, RING.buiten, Y - 0.28, Y), new THREE.MeshLambertMaterial({ color: '#1f2937', side: THREE.DoubleSide }))
  // Een ledlijn in clubkleur langs de binnenrand: van beneden zie je de ring als een lichtende cirkel.
  const ledBinnen = new THREE.Mesh(band(RING.binnen - 0.01, RING.binnen - 0.01, Y - 0.2, Y - 0.1), new THREE.MeshBasicMaterial({ color: primair, toneMapped: false, side: THREE.DoubleSide }))
  scene.add(dek, onder, randBinnen, randBuiten, ledBinnen)

  // ---------- balustrades ----------
  const glas = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.18, metalness: 0.2, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
  const staal = new THREE.MeshStandardMaterial({ color: '#c8ccd1', metalness: 0.8, roughness: 0.3, emissive: '#30343a', emissiveIntensity: 0.5 })
  const BH = 1.1
  scene.add(
    new THREE.Mesh(band(RING.binnen + 0.06, RING.binnen + 0.06, Y, Y + BH, 0, inBrugOpening), glas),
    new THREE.Mesh(band(RING.buiten - 0.06, RING.buiten - 0.06, Y, Y + BH), glas),
  )
  const leuning = (off: number, overslaan?: (x: number, z: number) => boolean) => {
    const top = band(off - 0.04, off + 0.04, Y + BH + 0.03, Y + BH + 0.03, 0, overslaan)
    const zij = band(off, off, Y + BH - 0.02, Y + BH + 0.03, 0, overslaan)
    return [top, zij]
  }
  const staalGeo: THREE.BufferGeometry[] = [...leuning(RING.binnen + 0.06, inBrugOpening), ...leuning(RING.buiten - 0.06)]
  for (const p of gevelOmtrek(2)) {
    for (const off of [RING.binnen + 0.06, RING.buiten - 0.06]) {
      const x = p.x + p.nx * off
      const z = p.z + p.nz * off
      if (off < 0 && inBrugOpening(x, z)) continue
      staalGeo.push(new THREE.BoxGeometry(0.05, BH, 0.05).translate(x, Y + BH / 2, z).toNonIndexed())
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(staalGeo), staal))
  // Lichtjes in de vloer, om de 3 m langs beide randen.
  const lichtjes = gevelOmtrek(3).flatMap((p) => [
    [p.x + p.nx * (RING.binnen + 0.35), p.z + p.nz * (RING.binnen + 0.35)],
    [p.x + p.nx * (RING.buiten - 0.3), p.z + p.nz * (RING.buiten - 0.3)],
  ])
  const vloerLicht = new THREE.InstancedMesh(new THREE.CircleGeometry(0.06, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff1c4', toneMapped: false }), lichtjes.length)
  const m4 = new THREE.Matrix4()
  lichtjes.forEach(([x, z], i) => {
    m4.makeTranslation(x, Y + 0.012, z)
    vloerLicht.setMatrixAt(i, m4)
  })
  scene.add(vloerLicht)

  // ---------- banken, verrekijkers en vlaggen ----------
  const meubels: Rechthoek[] = []
  const hout = new THREE.MeshLambertMaterial({ color: '#8a5a32' })
  const donker = new THREE.MeshLambertMaterial({ color: '#1f2937' })
  const bankGeo = mergeGeometries([
    new THREE.BoxGeometry(2.0, 0.08, 0.5).translate(0, 0.46, 0),
    new THREE.BoxGeometry(2.0, 0.42, 0.06).translate(0, 0.72, -0.24),
    new THREE.BoxGeometry(0.08, 0.46, 0.45).translate(-0.9, 0.23, 0),
    new THREE.BoxGeometry(0.08, 0.46, 0.45).translate(0.9, 0.23, 0),
  ])
  const zetten: { x: number; z: number; ry: number }[] = []
  const kijkers: { x: number; z: number; ry: number }[] = []
  // Op de rechte stukken: om de ~14 m een bank tegen de buitenbalustrade, met zicht naar binnen.
  for (const p of gevelOmtrek(14)) {
    if (Math.abs(p.nx) + Math.abs(p.nz) !== 1) continue
    const x = p.x + p.nx * (RING.buiten - 0.45)
    const z = p.z + p.nz * (RING.buiten - 0.45)
    if (Math.hypot(x - opt.liftX, z - GEVEL.B) < 6) continue
    zetten.push({ x, z, ry: Math.atan2(-p.nx, -p.nz) })
  }
  // Verrekijkers: midden op de vier zijden, aan de binnenrand, gericht op het veld.
  for (const [x, z, ry] of [
    [0, -GEVEL.B, 0],
    [GEVEL.A, 0, -Math.PI / 2],
    [-GEVEL.A, 0, Math.PI / 2],
    [8, GEVEL.B, Math.PI],
  ] as const) {
    const n = { x: Math.sign(x) * (Math.abs(x) === GEVEL.A ? 1 : 0), z: Math.sign(z) * (Math.abs(z) === GEVEL.B ? 1 : 0) }
    kijkers.push({ x: x + n.x * (RING.binnen + 0.6), z: z + n.z * (RING.binnen + 0.6), ry })
  }
  const bankMesh = new THREE.InstancedMesh(bankGeo, hout, zetten.length)
  const q = new THREE.Quaternion()
  const Yas = new THREE.Vector3(0, 1, 0)
  const een = new THREE.Vector3(1, 1, 1)
  zetten.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, Y, b.z), q.setFromAxisAngle(Yas, b.ry), een)
    bankMesh.setMatrixAt(i, m4)
    const dwars = Math.abs(Math.sin(b.ry)) > 0.5
    meubels.push(dwars ? { x0: b.x - 0.3, x1: b.x + 0.3, z0: b.z - 1.05, z1: b.z + 1.05 } : { x0: b.x - 1.05, x1: b.x + 1.05, z0: b.z - 0.3, z1: b.z + 0.3 })
  })
  scene.add(bankMesh)
  const kijkerGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.06, 0.09, 1.0, 10).translate(0, 0.5, 0),
    new THREE.BoxGeometry(0.3, 0.22, 0.42).translate(0, 1.15, 0.05),
    new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2).translate(-0.07, 1.17, 0.32),
    new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2).translate(0.07, 1.17, 0.32),
  ])
  for (const k of kijkers) {
    const m = new THREE.Mesh(kijkerGeo, new THREE.MeshStandardMaterial({ color: primair, metalness: 0.5, roughness: 0.35 }))
    m.position.set(k.x, Y, k.z)
    m.rotation.y = k.ry
    scene.add(m)
    meubels.push({ x0: k.x - 0.3, x1: k.x + 0.3, z0: k.z - 0.3, z1: k.z + 0.3 })
  }
  // Vlaggen op de vier hoeken, wapperend in clubkleur.
  const vlagMat = new THREE.MeshLambertMaterial({ color: primair, side: THREE.DoubleSide, emissive: primair, emissiveIntensity: 0.2 })
  const vlagMat2 = new THREE.MeshLambertMaterial({ color: secundair, side: THREE.DoubleSide, emissive: secundair, emissiveIntensity: 0.2 })
  const vlaggen: THREE.Mesh[] = []
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const n = new THREE.Vector3(sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2)
    const c = new THREE.Vector3(sx * (GEVEL.A - GEVEL.R), 0, sz * (GEVEL.B - GEVEL.R)).addScaledVector(n, GEVEL.R + RING.buiten - 0.35)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 6, 8), staal)
    mast.position.set(c.x, Y + 3, c.z)
    const vlag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4, 12, 1).translate(1.2, 0, 0), sx * sz > 0 ? vlagMat : vlagMat2)
    vlag.position.set(c.x, Y + 5.2, c.z)
    scene.add(mast, vlag)
    vlaggen.push(vlag)
    meubels.push({ x0: c.x - 0.2, x1: c.x + 0.2, z0: c.z - 0.2, z1: c.z + 0.2 })
  }

  // ---------- de brug en het paviljoen bij de lift ----------
  const bx = (brug.x0 + brug.x1) / 2
  const bl = brug.z1 - brug.z0
  const bz = (brug.z0 + brug.z1) / 2
  const brugTex = plankTex.clone()
  brugTex.repeat.set(3 / 4, bl / 4)
  brugTex.needsUpdate = true
  const brugDek = new THREE.Mesh(new THREE.BoxGeometry(3, 0.28, bl), [donker, donker, new THREE.MeshLambertMaterial({ map: brugTex }), donker, donker, donker])
  brugDek.position.set(bx, Y - 0.14, bz)
  scene.add(brugDek)
  for (const sx of [-1, 1]) {
    const x = bx + sx * 1.44
    const ruit = new THREE.Mesh(new THREE.PlaneGeometry(bl, BH), glas)
    ruit.position.set(x, Y + BH / 2, bz)
    ruit.rotation.y = Math.PI / 2
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, bl), staal)
    hand.position.set(x, Y + BH + 0.03, bz)
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, bl), new THREE.MeshBasicMaterial({ color: primair, toneMapped: false }))
    led.position.set(x, Y + 0.05, bz)
    scene.add(ruit, hand, led)
  }
  // Paviljoen: een glazen luifel boven de liftuitgang, met een bord.
  const pav = { z0: opt.liftZ, z1: opt.liftZ + 3.2 }
  const luifel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, pav.z1 - pav.z0 + 0.3), new THREE.MeshStandardMaterial({ color: '#dbeafe', transparent: true, opacity: 0.35, metalness: 0.3, roughness: 0.1, depthWrite: false }))
  luifel.position.set(bx, Y + 2.95, (pav.z0 + pav.z1) / 2)
  scene.add(luifel)
  for (const [x, z] of [
    [bx - 1.7, pav.z1],
    [bx + 1.7, pav.z1],
  ]) {
    const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), staal)
    paal.position.set(x, Y + 1.45, z)
    scene.add(paal)
  }
  const bordC = document.createElement('canvas')
  bordC.width = 1024
  bordC.height = 160
  {
    const g = bordC.getContext('2d')!
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 1024, 160)
    g.fillStyle = thema.primair
    g.fillRect(0, 148, 1024, 12)
    g.fillStyle = '#ffffff'
    g.font = '900 64px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('DAK · RINGWANDELING', 512, 64, 980)
    g.font = '600 30px Inter, system-ui, sans-serif'
    g.fillStyle = 'rgba(226,232,240,.85)'
    g.fillText(`${thema.naam} · 15 m boven het veld`, 512, 122, 980)
  }
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.53), new THREE.MeshBasicMaterial({ map: canvasTex(bordC), toneMapped: false, side: THREE.DoubleSide }))
  bord.position.set(bx, Y + 2.62, pav.z1 + 0.16)
  scene.add(bord)

  return {
    mag(x, z) {
      const d = gevelAfstand(GEVEL, x, z)
      const opRing = d > RING.binnen + 0.35 && d < RING.buiten - 0.35
      const opBrug = x > brug.x0 + 0.3 && x < brug.x1 - 0.3 && z > brug.z0 && z < brug.z1 + 0.6
      if (!opRing && !opBrug) return false
      return opVloer([{ x0: -1e4, x1: 1e4, z0: -1e4, z1: 1e4 }], meubels, x, z)
    },
    update(seconden) {
      // De vlaggen wapperen: een golf door de hoekpunten van het doek.
      if (licht) return
      for (const [i, v] of vlaggen.entries()) {
        const pos = v.geometry.attributes.position as THREE.BufferAttribute
        for (let k = 0; k < pos.count; k++) {
          const x = pos.getX(k)
          pos.setZ(k, Math.sin(seconden * 4 + x * 2.2 + i) * 0.12 * (x / 2.4))
        }
        pos.needsUpdate = true
        v.rotation.y = Math.sin(seconden * 0.3 + i) * 0.4
      }
    },
  }
}
