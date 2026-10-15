import * as THREE from 'three'

import { bouwBundels, bouwDamp, bouwMist, samen } from './atmosfeer'
import { rondeDoos } from './rond'

// De hamam: een Turks stoombad achteraan de sauna. Een marmeren ruimte onder een koepel met
// sterren-daklichtjes, waar het licht in bundels door de stoom valt; in het midden de warme
// marmeren steen (göbek taşı) om op te liggen, langs de wanden nissen met marmeren bekkens en
// koperen kranen, Iznik-tegels in blauw en turkoois, en koperen lantaarns. De ruimte hangt vol damp:
// eens binnen zie je amper een paar meter ver (de mist zelf zet de viewer, via mist()).

export type Hamam = {
  obstakels: { x0: number; x1: number; z0: number; z1: number }[]
  /** Hoe diep je in de damp zit (0 = erbuiten, 1 = midden in de hamam). */
  mist: (x: number, z: number) => number
  update: (seconden: number) => void
}

const tex = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void, herhaal = true) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Wit marmer met grijze en goudachtige aders. */
function marmer(zaad: number) {
  let s = zaad
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  return tex(512, 512, (g) => {
    g.fillStyle = '#efe9df'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(${r() < 0.2 ? '170,140,90' : '120,115,110'},${0.12 + r() * 0.25})`
      g.lineWidth = 0.6 + r() * 2.2
      g.beginPath()
      let x = r() * 512
      let y = r() * 512
      g.moveTo(x, y)
      for (let k = 0; k < 12; k++) {
        x += (r() - 0.3) * 70
        y += (r() - 0.5) * 70
        g.lineTo(x, y)
      }
      g.stroke()
    }
  })
}

/** Iznik-tegels: blauw-turkoois-wit, met een bloem- en stermotief. */
function iznik() {
  return tex(256, 256, (g) => {
    for (let ty = 0; ty < 2; ty++)
      for (let tx = 0; tx < 2; tx++) {
        const x = tx * 128
        const y = ty * 128
        g.fillStyle = '#f4f1ea'
        g.fillRect(x, y, 128, 128)
        g.strokeStyle = '#0e4c92'
        g.lineWidth = 6
        g.strokeRect(x + 3, y + 3, 122, 122)
        // Een achtpuntige ster.
        g.fillStyle = '#1d6fb8'
        g.beginPath()
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          const rr = i % 2 ? 22 : 44
          g.lineTo(x + 64 + Math.cos(a) * rr, y + 64 + Math.sin(a) * rr)
        }
        g.fill()
        g.fillStyle = '#2ab3b1'
        g.beginPath()
        g.arc(x + 64, y + 64, 14, 0, Math.PI * 2)
        g.fill()
        // Tulpjes in de hoeken.
        g.fillStyle = '#c0392b'
        for (const [cx, cy] of [
          [x + 14, y + 14],
          [x + 114, y + 14],
          [x + 14, y + 114],
          [x + 114, y + 114],
        ]) {
          g.beginPath()
          g.ellipse(cx, cy, 6, 9, Math.PI / 4, 0, Math.PI * 2)
          g.fill()
        }
      }
  })
}

export function bouwHamam(ouder: THREE.Group, opt: { Y: number; x0: number; x1: number; z0: number; z1: number; licht: boolean }): Hamam {
  const { Y, x0, x1, z0, z1, licht } = opt
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const B = x1 - x0
  const D = z1 - z0
  const WH = 3.2 // hoogte van de wanden, daarboven de koepel
  const groep = new THREE.Group()
  ouder.add(groep)
  const obstakels: Hamam['obstakels'] = []
  const marmerTex = marmer(17)
  marmerTex.repeat.set(2, 1)
  const marmerMat = new THREE.MeshStandardMaterial({ map: marmerTex, roughness: 0.18, metalness: 0.02, color: '#fffaf2' })
  const vloerTex = marmer(41)
  vloerTex.repeat.set(B / 3, D / 3)
  const vloerMat = new THREE.MeshStandardMaterial({ map: vloerTex, roughness: 0.08, metalness: 0.05, color: '#f2ece2' })
  const tegelTex = iznik()
  const koper = new THREE.MeshStandardMaterial({ color: '#b87333', metalness: 0.9, roughness: 0.28 })
  const warm = new THREE.MeshBasicMaterial({ color: '#ffd59a', toneMapped: false })
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, Y + y, z)
    groep.add(m)
    return m
  }

  // ---------- vloer, wanden, koepel ----------
  deel(new THREE.PlaneGeometry(B, D).rotateX(-Math.PI / 2), vloerMat, cx, 0.015, cz)
  // De wanden: marmer, met onderaan een band Iznik-tegels. De noordwand heeft een boogpoort.
  const poortB = 2.4
  const wand = (ax: number, az: number, bx: number, bz: number, poort: boolean) => {
    const lang = Math.hypot(bx - ax, bz - az)
    const stuk = (a: number, b: number) => {
      if (b - a < 0.05) return
      const mx = ax + ((bx - ax) * (a + b)) / 2 / lang
      const mz = az + ((bz - az) * (a + b)) / 2 / lang
      const ry = Math.atan2(-(bz - az), bx - ax)
      const w = b - a
      const m = deel(new THREE.BoxGeometry(w, WH, 0.3), marmerMat, mx, WH / 2, mz)
      m.rotation.y = ry
      const t = tegelTex.clone()
      t.repeat.set(w / 0.6, 2)
      t.needsUpdate = true
      const tegels = deel(new THREE.BoxGeometry(w, 1.2, 0.32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 }), mx, 0.6, mz)
      tegels.rotation.y = ry
      const dx = Math.abs(bx - ax) > 0.01
      obstakels.push(dx ? { x0: Math.min(ax, bx) + a, x1: Math.min(ax, bx) + b, z0: az - 0.2, z1: az + 0.2 } : { x0: ax - 0.2, x1: ax + 0.2, z0: Math.min(az, bz) + a, z1: Math.min(az, bz) + b })
    }
    if (!poort) stuk(0, lang)
    else {
      stuk(0, lang / 2 - poortB / 2)
      stuk(lang / 2 + poortB / 2, lang)
    }
  }
  wand(x0, z0, x1, z0, true)
  wand(x0, z1, x1, z1, false)
  wand(x0, z0, x0, z1, false)
  wand(x1, z0, x1, z1, false)
  // De boog boven de poort, met een koperen lantaarn.
  const boog = deel(new THREE.TorusGeometry(poortB / 2, 0.18, 10, 24, Math.PI), marmerMat, cx, 2.3, z0)
  boog.scale.set(1, 1.1, 1)
  deel(new THREE.BoxGeometry(poortB + 0.4, WH - 2.3 - 0.1, 0.3), marmerMat, cx, (WH + 2.3 + 1.0) / 2 + 0.05, z0)
  // Een bordje boven de boog.
  const bordje = deel(
    new THREE.PlaneGeometry(2.2, 0.5),
    new THREE.MeshBasicMaterial({
      map: tex(
        512,
        116,
        (g) => {
          g.fillStyle = '#0e4c92'
          g.fillRect(0, 0, 512, 116)
          g.strokeStyle = '#d4a63a'
          g.lineWidth = 8
          g.strokeRect(6, 6, 500, 104)
          g.fillStyle = '#f8e7c0'
          g.font = '800 58px Georgia, serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText('HAMAM · 48°', 256, 62)
        },
        false,
      ),
      toneMapped: false,
    }),
    cx,
    WH - 0.35,
    z0 - 0.17,
  )
  bordje.rotation.y = Math.PI
  // De koepel: een halve bol over de hele ruimte, met sterretjes waar het daglicht door valt.
  const koepelH = 3.4
  const koepel = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: marmer(5), roughness: 0.6, side: THREE.BackSide, color: '#efe6d8' }))
  koepel.scale.set(B / 2, koepelH, D / 2)
  koepel.position.set(cx, Y + WH, cz)
  groep.add(koepel)
  // Van buiten: dezelfde koepel, in grijzer, ruwer marmer (zo zie je de sterretjes enkel binnen).
  const buiten = new THREE.Mesh(koepel.geometry, new THREE.MeshStandardMaterial({ map: marmer(9), roughness: 0.7, color: '#cfc6b8' }))
  buiten.scale.set(B / 2 + 0.15, koepelH + 0.12, D / 2 + 0.15)
  buiten.position.copy(koepel.position)
  groep.add(buiten)
  // De rand van de koepel (een kroonlijst).
  const lijst = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 64), koper)
  lijst.rotation.x = Math.PI / 2
  lijst.scale.set(B / 2 - 0.02, D / 2 - 0.02, 1)
  lijst.position.set(cx, Y + WH, cz)
  groep.add(lijst)
  const sterren: THREE.Vector3[] = []
  const sterMat = new THREE.MeshBasicMaterial({ color: '#fff7df', toneMapped: false })
  const sterVorm = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const r = i % 2 ? 0.07 : 0.17
    if (i === 0) sterVorm.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else sterVorm.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const sterGeo = new THREE.ShapeGeometry(sterVorm)
  for (let ring = 1; ring <= 3; ring++) {
    const n = ring * 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring
      const f = ring / 4.2
      const px = cx + Math.cos(a) * (B / 2) * f
      const pz = cz + Math.sin(a) * (D / 2) * f
      const py = Y + WH + koepelH * Math.sqrt(Math.max(0, 1 - f * f)) - 0.02
      const s = new THREE.Mesh(sterGeo, sterMat)
      s.position.set(px, py, pz)
      s.lookAt(cx, Y, cz)
      groep.add(s)
      sterren.push(new THREE.Vector3(px, py, pz))
    }
  }
  // Een gloed in de top van de koepel.
  deel(new THREE.CircleGeometry(0.8, 24).rotateX(Math.PI / 2), sterMat, cx, WH + koepelH - 0.06, cz)

  // ---------- de warme steen in het midden ----------
  const steenR = Math.min(B, D) * 0.2
  const steen = deel(new THREE.CylinderGeometry(steenR, steenR + 0.06, 0.5, 8), marmerMat, cx, 0.25, cz)
  steen.rotation.y = Math.PI / 8
  deel(new THREE.CylinderGeometry(steenR + 0.08, steenR + 0.08, 0.04, 8), koper, cx, 0.52, cz).rotation.y = Math.PI / 8
  obstakels.push({ x0: cx - steenR - 0.1, x1: cx + steenR + 0.1, z0: cz - steenR - 0.1, z1: cz + steenR + 0.1 })
  // Een paar handdoeken (peştemal) op de steen.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4
    const h = deel(
      new THREE.BoxGeometry(0.6, 0.02, 1.4),
      new THREE.MeshStandardMaterial({
        map: tex(64, 128, (g) => {
          g.fillStyle = ['#c0392b', '#0e4c92', '#2ab3b1'][i]
          g.fillRect(0, 0, 64, 128)
          g.fillStyle = '#f4f1ea'
          for (let y = 8; y < 128; y += 22) g.fillRect(0, y, 64, 5)
        }),
        roughness: 0.95,
      }),
      cx + Math.cos(a) * steenR * 0.55,
      0.54,
      cz + Math.sin(a) * steenR * 0.55,
    )
    h.rotation.y = -a
  }

  // ---------- nissen met marmeren bekkens (kurna) en koperen kranen ----------
  const kurnas: THREE.Vector3[] = []
  const nis = (x: number, z: number, ry: number) => {
    const g = new THREE.Group()
    g.position.set(x, Y, z)
    g.rotation.y = ry
    groep.add(g)
    const kom = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), marmerMat)
    kom.position.set(0, 0.85, 0.35)
    const voet = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.62, 12), marmerMat)
    voet.position.set(0, 0.42, 0.35)
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.29, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9ad7e8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8 }))
    water.position.set(0, 0.8, 0.35)
    const kraan = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI), koper)
    kraan.position.set(0, 1.25, 0.2)
    kraan.rotation.z = Math.PI
    const knop = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), koper)
    knop.position.set(0, 1.35, 0.17)
    // Een koperen schaaltje (tas) op de rand.
    const tas = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.05, 16, 1, true), koper)
    tas.position.set(0.22, 0.87, 0.5)
    // Een boogvormige nis in de wand erachter (iets donkerder).
    const achter = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), new THREE.MeshStandardMaterial({ color: '#d9cfbf', roughness: 0.4 }))
    achter.position.set(0, 1.3, 0.02)
    const boogje = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20, 0, Math.PI), achter.material)
    boogje.position.set(0, 2.1, 0.02)
    g.add(kom, voet, water, kraan, knop, tas, achter, boogje)
    kurnas.push(new THREE.Vector3().copy(g.position).add(new THREE.Vector3(Math.sin(ry) * 0.35, 1.0, Math.cos(ry) * 0.35)))
  }
  const nWand = Math.max(2, Math.floor(B / 3.2))
  for (let i = 0; i < nWand; i++) nis(x0 + ((i + 0.5) * B) / nWand, z1 - 0.16, Math.PI)
  const nZij = Math.max(1, Math.floor(D / 3.4))
  for (let i = 0; i < nZij; i++) {
    nis(x0 + 0.16, z0 + ((i + 0.5) * D) / nZij + 0.6, Math.PI / 2)
    nis(x1 - 0.16, z0 + ((i + 0.5) * D) / nZij + 0.6, -Math.PI / 2)
  }
  // Marmeren banken langs de wanden.
  for (const [bx, bz, bw, bd] of [
    [cx, z1 - 1.1, B - 2.2, 0.55],
    [x0 + 0.9, cz + 0.6, 0.55, D - 4],
    [x1 - 0.9, cz + 0.6, 0.55, D - 4],
  ]) {
    deel(rondeDoos(bw, 0.45, bd, 0.05), marmerMat, bx, 0.225, bz)
    obstakels.push({ x0: bx - bw / 2, x1: bx + bw / 2, z0: bz - bd / 2, z1: bz + bd / 2 })
  }
  // Koperen lantaarns aan de wanden, warm gloeiend in de stoom.
  const lantaarns: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const op = i < 3
    const x = op ? x0 + 0.35 : x1 - 0.35
    const z = z0 + 2 + (i % 3) * ((D - 4) / 2)
    deel(new THREE.CylinderGeometry(0.12, 0.09, 0.32, 8), koper, x, 2.55, z)
    lantaarns.push(deel(new THREE.SphereGeometry(0.09, 10, 8), warm.clone(), x, 2.52, z))
    deel(new THREE.ConeGeometry(0.15, 0.16, 8), koper, x, 2.8, z)
    const plas = deel(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb766', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }), x + (op ? 1 : -1), 0.03, z)
    plas.renderOrder = 1
  }

  // ---------- de stoom: bundels uit de sterren, dikke damp en lagen mist ----------
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const bundels = bouwBundels(
    sterren
      .filter((_, i) => i % (licht ? 4 : 2) === 0)
      .map((s) => ({ van: s.clone(), naar: V(s.x + (cx - s.x) * 0.15, Y + 0.1, s.z + (cz - s.z) * 0.15), straalVan: 0.12, straalNaar: 0.7, kleur: '#fff6e0', sterkte: 0.2 })),
  )
  const damp = bouwDamp(
    [
      { x: cx, y: Y + 0.6, z: cz, straal: steenR + 1.2, hoogte: 3.6, aantal: licht ? 40 : 90, kleur: '#fffaf2', grootte: 3, sterkte: 0.3, duur: 8 },
      ...kurnas.map((k) => ({ x: k.x, y: k.y - 0.1, z: k.z, straal: 0.5, hoogte: 2.4, aantal: licht ? 6 : 14, kleur: '#fff7ec', grootte: 1.8, sterkte: 0.22, duur: 7 })),
      // Stoom die door de poort naar buiten kruipt.
      { x: cx, y: Y + 1.6, z: z0 - 0.4, straal: 1.0, hoogte: 1.8, aantal: licht ? 10 : 24, kleur: '#fffaf2', grootte: 2, sterkte: 0.18, duur: 7 },
    ],
    { schaal: licht ? 0.6 : 1 },
  )
  const mist = bouwMist(
    [0.3, 1.1, 1.9, 2.7].map((y) => ({ x: cx, y: Y + y, z: cz, b: B - 0.4, d: D - 0.4, kleur: '#f7f1e8', sterkte: 0.22, lagen: licht ? 2 : 3 })),
  )
  const lucht = samen(bundels, damp, mist)
  groep.add(lucht.groep)

  return {
    obstakels,
    mist(x, z) {
      // Binnen: vol; in de poort: halfweg; daarbuiten niets.
      if (x > x0 && x < x1 && z > z0 && z < z1) return Math.min(1, 0.55 + Math.min(z - z0, 3) / 6.5)
      if (Math.abs(x - cx) < poortB && z > z0 - 2 && z <= z0) return 0.4 * (1 - (z0 - z) / 2)
      return 0
    },
    update(seconden) {
      if (!ouder.visible) return
      lucht.update(seconden)
      lantaarns.forEach((l, i) => (l.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.8 + Math.sin(seconden * 7 + i * 1.7) * 0.06, 0.55))
    },
  }
}
