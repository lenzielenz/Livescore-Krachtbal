import * as THREE from 'three'

import { rondeDoos } from './rond'

// De popcornkraam in de cinema, zoals in een echte bioscoop:
//  • een toog in rood-witte streep met een gouden rand en een verlichte glazen vitrine;
//  • een popcornmachine met een glazen kast, een hangende ketel, een berg verse popcorn en warm licht;
//  • een gestreepte luifel met een geschulpte rand, en een lichtbak met het menu;
//  • stapels gestreepte doosjes, en een rek met bekers.
// Je kan er een doosje popcorn meenemen (bouwPopcornDoosje): je houdt het vast, en dat zie je in de
// spiegels (lift, kleedkamer) en onderaan je eigen beeld.

const STREEP_ROOD = '#d61f2c'

/** Een textuur met verticale rood-witte strepen (zoals een popcorndoosje). */
function streepTextuur(n = 8, rood = STREEP_ROOD) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#fff8ee' : rood
    g.fillRect((i * 128) / n, 0, 128 / n + 1, 64)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Een popcornkorrel: een onregelmatig klontje, crèmewit met een botergele zweem. */
function korrelGeometrie() {
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const p = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const ruis = 0.75 + 0.35 * Math.abs(Math.sin(v.x * 5.1 + v.y * 3.7) * Math.cos(v.z * 4.3 - v.x * 2.1))
    v.multiplyScalar(ruis)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

const korrelMat = () => new THREE.MeshStandardMaterial({ color: '#fff3c9', roughness: 0.85, emissive: '#5a3a08', emissiveIntensity: 0.25 })

/** Een berg popcorn: veel korrels (instanced) in de vorm van een koepel. */
function popcornBerg(aantal: number, straalX: number, straalZ: number, hoogte: number, korrel: number, zaad = 1) {
  const geo = korrelGeometrie()
  const mesh = new THREE.InstancedMesh(geo, korrelMat(), aantal)
  let s = zaad * 9301
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (let i = 0; i < aantal; i++) {
    const a = rnd() * Math.PI * 2
    const r = Math.sqrt(rnd())
    const x = Math.cos(a) * r * straalX
    const z = Math.sin(a) * r * straalZ
    const y = hoogte * Math.sqrt(Math.max(0, 1 - r * r)) * (0.65 + rnd() * 0.35)
    const k = korrel * (0.7 + rnd() * 0.6)
    e.set(rnd() * 6, rnd() * 6, rnd() * 6)
    m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e), new THREE.Vector3(k, k * 0.9, k))
    mesh.setMatrixAt(i, m)
  }
  return mesh
}

/** Een popcorndoosje (rood-wit gestreept, uitlopend naar boven) met een kop popcorn. Hoogte ± 0.2 m. */
export function bouwPopcornDoosje(schaal = 1): THREE.Group {
  const g = new THREE.Group()
  const tex = streepTextuur(10)
  const zij = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })
  // Vier zijden die naar boven uitlopen: een afgeknotte piramide (cilinder met 4 segmenten).
  const bak = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.062, 0.17, 4, 1, true), zij)
  bak.rotation.y = Math.PI / 4
  bak.position.y = 0.085
  g.add(bak)
  const bodem = new THREE.Mesh(new THREE.CircleGeometry(0.062, 4), new THREE.MeshStandardMaterial({ color: '#fff8ee' }))
  bodem.rotation.set(-Math.PI / 2, 0, Math.PI / 4)
  bodem.position.y = 0.002
  g.add(bodem)
  // Een klein label op de voorkant.
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.05),
    new THREE.MeshBasicMaterial({
      map: (() => {
        const c = document.createElement('canvas')
        c.width = 128
        c.height = 96
        const x = c.getContext('2d')!
        x.fillStyle = '#facc15'
        x.beginPath()
        x.ellipse(64, 48, 60, 42, 0, 0, Math.PI * 2)
        x.fill()
        x.fillStyle = '#b91c1c'
        x.font = '900 30px Inter, sans-serif'
        x.textAlign = 'center'
        x.textBaseline = 'middle'
        x.fillText('POP', 64, 36)
        x.fillText('CORN', 64, 64)
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        return t
      })(),
      transparent: true,
    }),
  )
  label.position.set(0, 0.09, 0.075)
  label.rotation.x = -0.13
  g.add(label)
  const kop = popcornBerg(46, 0.08, 0.08, 0.07, 0.016, 7)
  kop.position.y = 0.16
  g.add(kop)
  g.scale.setScalar(schaal)
  return g
}

export type Popcornkraam = {
  /** Botsvlakken (wereld-x/z) van de toog. */
  obstakels: { x0: number; x1: number; z0: number; z1: number }[]
  /** Hoogte van het toogblad (wereld-y), voor de wolk popcorn. */
  machineY: number
  update: (seconden: number) => void
}

/**
 * Bouwt de kraam met de voorkant naar -z (de zaal in), het midden van de toog op (x, z), de vloer
 * op `Y`. Alles komt in `ouder`.
 */
export function bouwPopcornkraam(ouder: THREE.Object3D, opt: { x: number; z: number; Y: number; primair: string }): Popcornkraam {
  const groep = new THREE.Group()
  groep.position.set(opt.x, opt.Y, opt.z)
  groep.rotation.y = Math.PI // lokaal +z = de voorkant = wereld -z
  ouder.add(groep)
  const B = 2.8
  const D = 0.8
  const H = 1.05
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = groep) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    p.add(m)
    return m
  }
  const goud = new THREE.MeshStandardMaterial({ color: '#d4a63a', metalness: 0.9, roughness: 0.3, emissive: '#3a2600', emissiveIntensity: 0.3 })
  const chroom = new THREE.MeshStandardMaterial({ color: '#d7dde5', metalness: 1, roughness: 0.18 })
  const glas = new THREE.MeshPhysicalMaterial({ color: '#fff7e0', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false })
  const warm = new THREE.MeshBasicMaterial({ color: '#ffd68a', toneMapped: false })

  // ---------- de toog ----------
  const streep = streepTextuur(14)
  streep.repeat.set(2, 1)
  const toogMat = new THREE.MeshStandardMaterial({ map: streep, roughness: 0.55 })
  deel(rondeDoos(B, H - 0.08, D, 0.04), toogMat, 0, (H - 0.08) / 2, 0)
  // Plint en blad.
  deel(rondeDoos(B + 0.02, 0.1, D + 0.02, 0.03), new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.6 }), 0, 0.05, 0)
  deel(rondeDoos(B + 0.14, 0.06, D + 0.14, 0.03), new THREE.MeshStandardMaterial({ color: '#2a0d10', roughness: 0.25, metalness: 0.2 }), 0, H - 0.03, 0)
  deel(rondeDoos(B + 0.16, 0.02, D + 0.16, 0.01), goud, 0, H - 0.065, 0)
  // Een verlichte vitrine in de voorkant van de toog: warm licht op een berg popcorn achter glas.
  const vitrineTex = (() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 144
    const x = c.getContext('2d')!
    const bg = x.createLinearGradient(0, 0, 0, 144)
    bg.addColorStop(0, '#ffcf73')
    bg.addColorStop(0.55, '#c86b12')
    bg.addColorStop(1, '#5a2606')
    x.fillStyle = bg
    x.fillRect(0, 0, 512, 144)
    // Een berg korrels: kleine wolkjes, onderaan dichter.
    let z = 11
    const r = () => ((z = (z * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < 520; i++) {
      const px = r() * 512
      const py = 144 - Math.pow(r(), 1.8) * 92 - 4
      const k = 4 + r() * 5
      x.fillStyle = `hsl(${42 + r() * 10}, ${60 + r() * 30}%, ${82 + r() * 14}%)`
      x.beginPath()
      for (let b = 0; b < 3; b++) x.arc(px + (r() - 0.5) * k, py + (r() - 0.5) * k, k * (0.5 + r() * 0.4), 0, Math.PI * 2)
      x.fill()
    }
    // Glans van het glas.
    const gl = x.createLinearGradient(0, 0, 512, 144)
    gl.addColorStop(0.2, 'rgba(255,255,255,0)')
    gl.addColorStop(0.32, 'rgba(255,255,255,.22)')
    gl.addColorStop(0.4, 'rgba(255,255,255,0)')
    x.fillStyle = gl
    x.fillRect(0, 0, 512, 144)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  deel(new THREE.PlaneGeometry(1.6, 0.45), new THREE.MeshBasicMaterial({ map: vitrineTex, toneMapped: false }), -0.45, 0.6, D / 2 + 0.006)
  // Een gouden kader rond de vitrine.
  for (const [w, h, x, y] of [
    [1.66, 0.03, -0.45, 0.84],
    [1.66, 0.03, -0.45, 0.36],
    [0.03, 0.51, -1.28, 0.6],
    [0.03, 0.51, 0.38, 0.6],
  ] as const)
    deel(new THREE.BoxGeometry(w, h, 0.02), goud, x, y, D / 2 + 0.01)

  // ---------- de popcornmachine ----------
  const M = new THREE.Group()
  M.position.set(0.55, H, -0.05)
  groep.add(M)
  const MB = 0.9
  const MH = 0.95
  const MD = 0.62
  // Onderkast (rood met gouden letters) en de rode kap bovenop.
  const kast = new THREE.MeshStandardMaterial({ color: '#b3121f', roughness: 0.35, metalness: 0.3 })
  deel(rondeDoos(MB, 0.22, MD, 0.03), kast, 0, 0.11, 0, M)
  deel(rondeDoos(MB + 0.04, 0.2, MD + 0.04, 0.05), kast, 0, 0.22 + MH + 0.1, 0, M)
  deel(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 14), goud, 0, 0.22 + MH + 0.26, 0, M)
  // Het opschrift op de kap.
  const kapTekst = (() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 96
    const x = c.getContext('2d')!
    x.fillStyle = '#b3121f'
    x.fillRect(0, 0, 512, 96)
    x.fillStyle = '#ffd36b'
    x.font = 'italic 900 64px Georgia, serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.shadowColor = '#ffb020'
    x.shadowBlur = 12
    x.fillText('Popcorn', 256, 52)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  deel(new THREE.PlaneGeometry(MB - 0.04, 0.17), new THREE.MeshBasicMaterial({ map: kapTekst, toneMapped: false }), 0, 0.22 + MH + 0.1, MD / 2 + 0.031, M)
  // Het chromen frame van de glazen kast.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    deel(new THREE.BoxGeometry(0.035, MH, 0.035), chroom, (sx * (MB - 0.035)) / 2, 0.22 + MH / 2, (sz * (MD - 0.035)) / 2, M)
  // Het warme licht binnenin: een gloeiende achterwand en een lamp in de kap.
  deel(new THREE.PlaneGeometry(MB - 0.06, MH - 0.04), new THREE.MeshBasicMaterial({ color: '#7a3e08', toneMapped: false }), 0, 0.22 + MH / 2, -MD / 2 + 0.02, M)
  deel(new THREE.BoxGeometry(MB - 0.12, 0.025, 0.05), warm, 0, 0.22 + MH - 0.03, 0, M)
  // De berg popcorn op de bodem, en de ketel die erboven hangt (en af en toe kantelt).
  const berg = popcornBerg(420, MB * 0.45, MD * 0.42, 0.26, 0.022, 3)
  berg.position.y = 0.23
  M.add(berg)
  const ketelG = new THREE.Group()
  ketelG.position.set(0, 0.22 + MH - 0.22, 0)
  M.add(ketelG)
  deel(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), chroom, 0, 0.12, 0, ketelG)
  const ketel = deel(new THREE.CylinderGeometry(0.17, 0.13, 0.15, 24, 1, true), chroom, 0, -0.02, 0, ketelG)
  ;(ketel.material as THREE.Material).side = THREE.DoubleSide
  deel(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 24), chroom, 0, -0.095, 0, ketelG)
  const inKetel = popcornBerg(40, 0.14, 0.14, 0.05, 0.018, 5)
  inKetel.position.y = 0.04
  ketelG.add(inKetel)
  // Vallende korrels uit de ketel (een paar die over de rand wippen).
  const val = new THREE.InstancedMesh(korrelGeometrie(), korrelMat(), 14)
  M.add(val)
  // Het glas (vier wanden), na de inhoud getekend.
  const glasWand = (b: number, x: number, z: number, ry: number) => {
    const w = deel(new THREE.PlaneGeometry(b, MH - 0.02), glas, x, 0.22 + MH / 2, z, M)
    w.rotation.y = ry
    w.renderOrder = 2
  }
  glasWand(MB - 0.04, 0, MD / 2 - 0.018, 0)
  glasWand(MD - 0.04, MB / 2 - 0.018, 0, Math.PI / 2)
  glasWand(MD - 0.04, -MB / 2 + 0.018, 0, -Math.PI / 2)
  // Een schepje en een stapel lege doosjes naast de machine.
  for (let i = 0; i < 4; i++) {
    const d = bouwPopcornDoosje(1)
    d.children.slice(-1)[0].visible = false
    d.position.set(-0.35 - (i % 2) * 0.17, H + 0.02 + Math.floor(i / 2) * 0.12, -0.12 + (i % 2) * 0.05)
    groep.add(d)
  }
  // Twee volle doosjes klaar op de toog, vooraan.
  for (const [x, ry] of [
    [-0.95, 0.3],
    [-0.7, -0.2],
  ] as const) {
    const d = bouwPopcornDoosje(1.1)
    d.position.set(x, H, 0.22)
    d.rotation.y = ry
    groep.add(d)
  }
  // Een rek met bekers (frisdrank) en een kassa.
  const beker = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 })
  for (let i = 0; i < 5; i++) deel(new THREE.CylinderGeometry(0.04, 0.03, 0.12, 12), beker, -1.25 + i * 0.09, H + 0.06, -0.25)
  for (let i = 0; i < 5; i++) deel(new THREE.CylinderGeometry(0.041, 0.041, 0.012, 12), new THREE.MeshStandardMaterial({ color: opt.primair }), -1.25 + i * 0.09, H + 0.12, -0.25)
  const kassa = deel(rondeDoos(0.28, 0.12, 0.22, 0.02), new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4 }), -0.05, H + 0.06, 0.05)
  kassa.rotation.x = -0.25
  deel(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshBasicMaterial({ color: '#22d3ee', toneMapped: false }), -0.05, H + 0.12, 0.13).rotation.x = -0.6

  // ---------- de luifel ----------
  // Twee chromen palen achteraan de toog dragen de luifel.
  for (const x of [-(B / 2) + 0.06, B / 2 - 0.06]) deel(new THREE.CylinderGeometry(0.02, 0.02, 1.72, 10), chroom, x, H + 0.86, -D / 2 + 0.06)
  const L = new THREE.Group()
  L.position.set(0, 2.55, 0.15)
  groep.add(L)
  const luifelTex = streepTextuur(18)
  const luifelMat = new THREE.MeshStandardMaterial({ map: luifelTex, roughness: 0.7, side: THREE.DoubleSide })
  const doek = deel(new THREE.PlaneGeometry(B + 0.4, 0.95), luifelMat, 0, 0, 0, L)
  doek.rotation.x = -Math.PI / 2 + 0.42
  // De geschulpte rand: een rij halve schijfjes in afwisselend rood en wit.
  const schulpen = 14
  for (let i = 0; i < schulpen; i++) {
    const s = deel(new THREE.CircleGeometry(0.11, 14, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: i % 2 ? '#fff8ee' : STREEP_ROOD, roughness: 0.7, side: THREE.DoubleSide }), -(B + 0.4) / 2 + 0.11 + (i * (B + 0.4 - 0.22)) / (schulpen - 1), -0.2, 0.44, L)
    s.rotation.x = -0.05
  }
  // Steunen naar de wand en een rij lampjes onder de luifel.
  const lampjes: THREE.Mesh[] = []
  for (let i = 0; i < 12; i++) {
    lampjes.push(deel(new THREE.SphereGeometry(0.03, 10, 8), warm.clone(), -(B + 0.2) / 2 + (i * (B + 0.2)) / 11, -0.28, 0.42, L))
  }

  // ---------- de lichtbak met het menu, tegen de wand ----------
  const menu = (() => {
    const c = document.createElement('canvas')
    c.width = 768
    c.height = 320
    const x = c.getContext('2d')!
    const bg = x.createLinearGradient(0, 0, 0, 320)
    bg.addColorStop(0, '#1a0608')
    bg.addColorStop(1, '#0b0204')
    x.fillStyle = bg
    x.fillRect(0, 0, 768, 320)
    x.strokeStyle = '#d4a63a'
    x.lineWidth = 6
    x.strokeRect(10, 10, 748, 300)
    x.fillStyle = '#ffd36b'
    x.font = '900 40px Inter, sans-serif'
    x.textAlign = 'left'
    x.textBaseline = 'middle'
    const rijen: [string, string][] = [
      ['🍿 Popcorn zout', 'gratis'],
      ['🍿 Popcorn zoet', 'gratis'],
      ['🥤 Frisdrank', 'gratis'],
      ['🌭 Hotdog', 'uitverkocht'],
    ]
    rijen.forEach(([n, p], i) => {
      const y = 62 + i * 66
      x.fillStyle = '#fff8ee'
      x.fillText(n, 40, y)
      x.textAlign = 'right'
      x.fillStyle = p === 'uitverkocht' ? '#f87171' : '#4ade80'
      x.fillText(p, 728, y)
      x.textAlign = 'left'
    })
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  const menuBord = deel(new THREE.PlaneGeometry(1.7, 0.71), new THREE.MeshBasicMaterial({ map: menu, toneMapped: false }), -0.55, 2.45, -2.13)
  deel(rondeDoos(1.78, 0.79, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }), -0.55, 2.45, -2.17)
  menuBord.renderOrder = 1

  // Botsing: de toog (in wereldcoördinaten; de groep staat 180° gedraaid, dus symmetrisch).
  const obstakels = [{ x0: opt.x - B / 2 - 0.05, x1: opt.x + B / 2 + 0.05, z0: opt.z - D / 2 - 0.05, z1: opt.z + D / 2 + 0.05 }]

  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  return {
    obstakels,
    machineY: opt.Y + H + 0.6,
    update(s) {
      // De ketel schudt zachtjes (de olie sist), en om de zoveel seconden kantelt hij en valt er popcorn.
      const cyclus = s % 9
      const kantel = cyclus > 7 ? Math.sin(((cyclus - 7) / 2) * Math.PI) * 0.9 : 0
      ketelG.rotation.z = kantel + Math.sin(s * 23) * 0.012
      ketelG.position.x = Math.sin(s * 31) * 0.003
      for (let i = 0; i < 14; i++) {
        // Elke korrel: een korte sprong vanuit de ketel naar beneden, telkens op een ander moment.
        const t = (s * 0.9 + i * 0.37) % 1.6
        const vrij = t < 0.9
        const x = Math.sin(i * 2.3) * 0.18 + (vrij ? t * 0.05 : 0)
        const y = vrij ? 0.22 + MH - 0.3 + 0.12 * Math.sin(t * Math.PI) - t * t * 0.55 : -10
        const z = Math.cos(i * 1.7) * 0.12
        e.set(s * 3 + i, s * 2, i)
        const k = 0.02
        m4.compose(new THREE.Vector3(x, Math.max(0.28, y), z), q.setFromEuler(e), new THREE.Vector3(k, k, k))
        if (!vrij || y < 0.28) m4.makeScale(0, 0, 0)
        val.setMatrixAt(i, m4)
      }
      val.instanceMatrix.needsUpdate = true
      // De lampjes onder de luifel lopen als een kermis.
      lampjes.forEach((l, i) => (l.material as THREE.MeshBasicMaterial).color.set((i + Math.floor(s * 4)) % 3 === 0 ? '#fff1c4' : '#9a6a1e'))
    },
  }
}
