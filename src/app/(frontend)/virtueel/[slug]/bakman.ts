import * as THREE from 'three'

import { GEVEL, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { rondeDoos } from './rond'

// Het standbeeld van Bakman, de held van KBC Sint-Michiels: een beschilderd beeld (glanzende lak,
// zoals een kunststof standbeeld) op een granieten sokkel op het plein voor de hoofdingang.
// Bakman staat breed, in een gespierd blauw superheldenpak met het gele BAKMAN-embleem op de borst,
// een gele riem met een "B", een rood broekje, rode kousen tot onder de knie en sneakers. Fluogroene
// bretellen over de borst, een brilletje, kort opgeborsteld bruin haar en een rode cape die opzij
// wappert (met het embleem op de rug). Met gestrekte armen houdt hij een gele bak Jupiler boven
// zijn hoofd. Op de sokkel: een bronzen plaat, en spots die hem 's avonds aanlichten.
//
// Maten: het beeld is gemodelleerd op ware grootte (1,85 m, voeten op y = 0, kijkend naar +z) en
// staat 1,3 keer vergroot op de sokkel.

/** Het bord met Bakmans foto op de voorgevel (omgeving.ts laat daar de lamellen weg). */
export const BAKMAN_BORD = { x: -28, b: 2.24 }

const tex = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Een balk (een afgeronde, taps toelopende ledemaat) van a naar b. */
const ledemaat = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => {
  const d = b.clone().sub(a)
  const L = d.length()
  const g = new THREE.CylinderGeometry(rb, ra, L, 20, 4)
  g.translate(0, L / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Het embleem: een gele ruit met rode rand, "BAKMAN" erin en een bakje bier. */
function embleem(): THREE.CanvasTexture {
  return tex(512, 384, (g) => {
    g.clearRect(0, 0, 512, 384)
    const ruit = new Path2D()
    ruit.moveTo(60, 40)
    ruit.lineTo(452, 40)
    ruit.lineTo(500, 120)
    ruit.lineTo(256, 370)
    ruit.lineTo(12, 120)
    ruit.closePath()
    g.fillStyle = '#d61f26'
    g.fill(ruit)
    g.save()
    g.translate(256, 205)
    g.scale(0.86, 0.84)
    g.translate(-256, -205)
    g.fillStyle = '#f7d117'
    g.fill(ruit)
    g.restore()
    g.fillStyle = '#d61f26'
    g.font = '900 84px Impact, "Arial Black", Inter, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('BAKMAN', 256, 128, 380)
    // Een bakje bier, zoals op het echte embleem.
    g.fillStyle = '#e8a10c'
    g.fillRect(206, 190, 100, 70)
    g.fillStyle = '#ffffff'
    g.fillRect(214, 208, 84, 30)
    g.fillStyle = '#c8102e'
    g.fillRect(214, 208, 84, 6)
    g.fillStyle = '#111'
    g.font = '900 20px Georgia, serif'
    g.fillText('Jupiler', 256, 226, 80)
    g.fillStyle = '#b45309'
    for (let i = 0; i < 4; i++) g.fillRect(212 + i * 24, 194, 16, 8)
  })
}

/** Het etiket van de bak: wit met rode banden, het schildje en "Jupiler". */
function etiket(): THREE.CanvasTexture {
  return tex(512, 256, (g) => {
    g.fillStyle = '#f8f5ec'
    g.fillRect(0, 0, 512, 256)
    g.fillStyle = '#c8102e'
    g.fillRect(0, 10, 512, 26)
    g.fillRect(0, 214, 512, 14)
    g.fillStyle = '#b8a36a'
    g.fillRect(0, 196, 512, 14)
    // Het schildje met de stier.
    g.fillStyle = '#c8102e'
    g.beginPath()
    g.moveTo(228, 18)
    g.lineTo(284, 18)
    g.lineTo(284, 64)
    g.quadraticCurveTo(256, 92, 228, 64)
    g.closePath()
    g.fill()
    g.strokeStyle = '#d4af37'
    g.lineWidth = 4
    g.stroke()
    g.fillStyle = '#1a1a1a'
    g.font = 'italic 900 112px Georgia, "Times New Roman", serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('Jupiler', 256, 142, 470)
    g.fillStyle = '#7a6a3a'
    g.font = '700 18px Inter, sans-serif'
    g.fillText('BIÈRE · BIER · BEER', 256, 204)
  })
}

export function bouwBakman(scene: THREE.Scene, opt: { thema: StadionThema; licht: boolean; x: number; z: number; ry: number }): { obstakels: Rechthoek[]; plek: { x: number; z: number } } {
  const { thema, licht } = opt
  const groep = new THREE.Group()
  groep.position.set(opt.x, 0, opt.z)
  groep.rotation.y = opt.ry
  scene.add(groep)

  // ---------- de sokkel ----------
  const graniet = new THREE.MeshStandardMaterial({
    map: tex(256, 256, (g) => {
      g.fillStyle = '#4b5059'
      g.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 2600; i++) {
        const k = Math.random()
        g.fillStyle = k < 0.4 ? 'rgba(20,22,26,.55)' : k < 0.75 ? 'rgba(160,165,175,.35)' : 'rgba(230,230,235,.25)'
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
      }
    }),
    roughness: 0.35,
    metalness: 0.1,
  })
  const stap = new THREE.Mesh(rondeDoos(2.6, 0.24, 2.6, 0.05), graniet)
  stap.position.y = 0.12
  const voet = new THREE.Mesh(rondeDoos(2.1, 0.18, 2.1, 0.04), graniet)
  voet.position.y = 0.33
  const zuil = new THREE.Mesh(rondeDoos(1.7, 1.15, 1.7, 0.05), graniet)
  zuil.position.y = 0.995
  const kap = new THREE.Mesh(rondeDoos(1.95, 0.16, 1.95, 0.04), graniet)
  kap.position.y = 1.65
  groep.add(stap, voet, zuil, kap)
  const SOKKEL = 1.73
  // De bronzen plaat op de voorkant.
  const plaat = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.72),
    new THREE.MeshStandardMaterial({
      map: tex(640, 368, (g) => {
        const gr = g.createLinearGradient(0, 0, 640, 368)
        gr.addColorStop(0, '#a8742f')
        gr.addColorStop(0.5, '#d9a75a')
        gr.addColorStop(1, '#8a5a22')
        g.fillStyle = gr
        g.fillRect(0, 0, 640, 368)
        g.strokeStyle = '#5c3a12'
        g.lineWidth = 10
        g.strokeRect(14, 14, 612, 340)
        g.fillStyle = '#3b240a'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.font = '900 104px Impact, "Arial Black", Inter, sans-serif'
        g.fillText('BAKMAN', 320, 120, 560)
        g.font = '700 34px Georgia, serif'
        g.fillText(`De held van ${thema.naam}`, 320, 215, 570)
        g.font = 'italic 28px Georgia, serif'
        g.fillText('Sterk genoeg voor elke bak.', 320, 280, 560)
      }),
      metalness: 0.75,
      roughness: 0.35,
    }),
  )
  plaat.position.set(0, 1.0, 0.856)
  groep.add(plaat)

  // ---------- het beeld ----------
  const beeld = new THREE.Group()
  beeld.position.y = SOKKEL
  beeld.scale.setScalar(1.3)
  groep.add(beeld)
  const lak = (kleur: string, ruw = 0.32) => new THREE.MeshPhysicalMaterial({ color: kleur, roughness: ruw, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.15 })
  const blauw = lak('#1f3fb4')
  const rood = lak('#d4202a')
  const geel = lak('#f6c915')
  const huid = lak('#e9b896', 0.45)
  const zwart = lak('#16181d')
  const wit = lak('#f4f4f2')
  const fluo = lak('#b6f22c', 0.4)
  const goud = new THREE.MeshStandardMaterial({ color: '#c9a65a', metalness: 0.9, roughness: 0.25 })
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    if (!licht) m.castShadow = true
    beeld.add(m)
    return m
  }

  // Benen: breed staand, in het wat losse blauwe pak.
  for (const k of [-1, 1]) {
    const heup = v(k * 0.1, 0.93, 0)
    const knie = v(k * 0.17, 0.5, 0.03)
    const enkel = v(k * 0.23, 0.11, 0.01)
    deel(ledemaat(heup, knie, 0.095, 0.07), blauw)
    deel(new THREE.SphereGeometry(0.07, 16, 12), blauw, knie.x, knie.y, knie.z)
    deel(ledemaat(knie, v(knie.x + k * 0.02, 0.36, 0.02), 0.07, 0.064), blauw)
    // De rode laarshoes: van onder de knie naar beneden, onderaan wijd uitlopend, met plooien.
    const hoes = deel(new THREE.CylinderGeometry(0.074, 0.088, 0.4, 20, 6, true), rood, enkel.x - k * 0.005, 0.31, enkel.z)
    {
      const p = hoes.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i))
        const plooi = 1 + Math.sin(a * 7) * 0.05 * (0.2 - p.getY(i)) * 2.5
        p.setXYZ(i, p.getX(i) * plooi, p.getY(i), p.getZ(i) * plooi)
      }
      hoes.geometry.computeVertexNormals()
      ;(hoes.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide
    }
    const boord = deel(new THREE.TorusGeometry(0.072, 0.014, 8, 24), rood, enkel.x - k * 0.005, 0.51, enkel.z)
    boord.rotation.x = Math.PI / 2
    // De sneaker (zwart-wit-rood), en de puntige flap van de hoes die over de wreef valt.
    const schoen = new THREE.Group()
    schoen.position.set(enkel.x, 0, 0.03)
    schoen.rotation.y = k * 0.2
    beeld.add(schoen)
    const stuk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      schoen.add(m)
      return m
    }
    stuk(rondeDoos(0.125, 0.04, 0.3, 0.018), wit, 0, 0.02, 0.01)
    stuk(new THREE.SphereGeometry(0.06, 16, 12).scale(1, 0.62, 1.15), zwart, 0, 0.06, 0.1) // neus
    stuk(rondeDoos(0.118, 0.08, 0.13, 0.035), rood, 0, 0.08, -0.01) // midden
    stuk(rondeDoos(0.115, 0.09, 0.08, 0.035), zwart, 0, 0.085, -0.1) // hiel
    for (const s of [-1, 1]) {
      // De witte swoosh opzij.
      const sw = stuk(new THREE.PlaneGeometry(0.11, 0.022), wit, s * 0.061, 0.075, 0.0)
      sw.rotation.set(0, (s * Math.PI) / 2, -0.35)
    }
    const flap = stuk(new THREE.ConeGeometry(0.075, 0.16, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 6).scale(1, 0.32, 1), rood, 0, 0.13, 0.075)
    flap.rotation.x = 0.35
  }
  // Het rode broekje: rond de heupen, voorop in een V naar het kruis.
  deel(new THREE.SphereGeometry(0.19, 24, 16), blauw, 0, 0.96, 0).scale.set(1, 0.6, 0.72)
  const broekje = deel(new THREE.SphereGeometry(0.196, 28, 16, 0, Math.PI * 2, Math.PI * 0.36, Math.PI * 0.3), rood, 0, 0.96, 0)
  broekje.scale.set(1, 0.95, 0.74)
  const vVorm = new THREE.Shape()
  vVorm.moveTo(-0.17, 0)
  vVorm.lineTo(0.17, 0)
  vVorm.quadraticCurveTo(0.09, -0.06, 0.035, -0.135)
  vVorm.lineTo(-0.035, -0.135)
  vVorm.quadraticCurveTo(-0.09, -0.06, -0.17, 0)
  for (const k of [1, -1]) {
    const v2 = deel(new THREE.ExtrudeGeometry(vVorm, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }), rood, 0, 1.0, k * 0.128)
    v2.rotation.x = k * 0.28
    if (k < 0) v2.rotation.y = Math.PI
  }
  // De gele riem in stukken, met een ovale gesp en een "B".
  const riem = deel(new THREE.CylinderGeometry(0.2, 0.2, 0.065, 32, 1, true), geel, 0, 1.03, 0)
  riem.scale.set(1, 1, 0.74)
  ;(riem.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide
  const naad = lak('#c99a0a')
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    const n = deel(new THREE.BoxGeometry(0.012, 0.068, 0.01), naad, Math.sin(a) * 0.201, 1.03, Math.cos(a) * 0.149)
    n.rotation.y = a
  }
  const gesp = deel(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24).rotateX(Math.PI / 2), geel, 0, 1.03, 0.152)
  gesp.scale.set(1.25, 0.8, 1)
  deel(
    new THREE.CircleGeometry(0.044, 24),
    new THREE.MeshStandardMaterial({
      map: tex(128, 128, (g) => {
        g.fillStyle = '#f6c915'
        g.fillRect(0, 0, 128, 128)
        g.strokeStyle = '#a07800'
        g.lineWidth = 8
        g.beginPath()
        g.ellipse(64, 64, 56, 56, 0, 0, Math.PI * 2)
        g.stroke()
        g.fillStyle = '#8a6400'
        g.font = '900 76px Inter, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('B', 64, 68)
      }),
      roughness: 0.3,
    }),
    0,
    1.03,
    0.163,
  ).scale.set(1.25, 0.8, 1)
  // De romp: een opgevuld spierpak, met brede borst, een duidelijke six-pack en schuine buikspieren.
  deel(new THREE.CapsuleGeometry(0.175, 0.34, 8, 24), blauw, 0, 1.26, 0).scale.set(1.14, 1, 0.74)
  for (const k of [-1, 1]) {
    deel(new THREE.SphereGeometry(0.11, 22, 16), blauw, k * 0.088, 1.37, 0.05).scale.set(1.05, 0.75, 0.62)
    deel(new THREE.SphereGeometry(0.088, 18, 14), blauw, k * 0.215, 1.46, 0)
    deel(new THREE.SphereGeometry(0.05, 14, 10), blauw, k * 0.15, 1.13, 0.075).scale.set(0.65, 1.5, 0.5) // schuine buikspier
    for (let r = 0; r < 3; r++) deel(new THREE.SphereGeometry(0.04, 16, 12), blauw, k * 0.042, 1.08 + r * 0.066, 0.104 - r * 0.004).scale.set(1, 0.72, 0.45)
  }
  // Het embleem op de borst: een brede, puntige schild-vorm net onder de kraag.
  // Het echte logo (public/virtueel/bakman-logo.webp); tot het geladen is, een getekende versie.
  const emb = embleem()
  const borstMat = new THREE.MeshStandardMaterial({ map: emb, transparent: true, alphaTest: 0.4, roughness: 0.35 })
  // Licht gebogen over de borst (een stukje cilinder), zodat het op het pak ligt.
  const borstGeo = new THREE.CylinderGeometry(0.212, 0.212, 0.172, 32, 1, true, -0.775, 1.55)
  const borst = deel(borstGeo, borstMat, 0, 1.385, -0.07)
  borst.rotation.x = -0.12
  ;(borst.material as THREE.MeshStandardMaterial).side = THREE.FrontSide
  // Fluogroene bretellen: van naast de hals, over de borst in een V naar het kruis, met een zakje.
  for (const k of [-1, 1]) {
    const pad = new THREE.CatmullRomCurve3([v(k * 0.075, 1.56, 0.04), v(k * 0.1, 1.42, 0.15), v(k * 0.083, 1.22, 0.125), v(k * 0.045, 1.04, 0.16), v(k * 0.015, 0.9, 0.152)])
    deel(new THREE.TubeGeometry(pad, 30, 0.008, 6), fluo)
  }
  deel(new THREE.SphereGeometry(0.03, 14, 10), fluo, 0, 0.885, 0.142).scale.set(1, 1.35, 0.5)
  // Armen: bijna gestrekt omhoog, de handen onder de bak.
  for (const k of [-1, 1]) {
    const schouder = v(k * 0.225, 1.48, 0)
    const elleboog = v(k * 0.29, 1.79, 0.02)
    const pols = v(k * 0.22, 2.06, 0.03)
    deel(ledemaat(schouder, elleboog, 0.07, 0.057), blauw)
    deel(new THREE.SphereGeometry(0.057, 14, 10), blauw, elleboog.x, elleboog.y, elleboog.z)
    deel(ledemaat(elleboog, pols, 0.056, 0.047), blauw)
    // Een hand met vingers die om de rand van de bak grijpen.
    const hand = new THREE.Group()
    hand.position.set(k * 0.21, 2.1, 0.03)
    hand.rotation.z = -k * 0.2
    beeld.add(hand)
    const palm = new THREE.Mesh(rondeDoos(0.075, 0.085, 0.035, 0.015), huid)
    hand.add(palm)
    for (let f = 0; f < 4; f++) {
      const vinger = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 4, 8), huid)
      vinger.position.set(-0.027 + f * 0.018, 0.055, 0.012)
      vinger.rotation.x = -0.5
      hand.add(vinger)
    }
    const duim = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.035, 4, 8), huid)
    duim.position.set(-k * 0.04, 0.02, 0.025)
    duim.rotation.z = k * 0.8
    hand.add(duim)
  }
  // Hals, hoofd, gezicht, haar, bril, en de rode knoop van de cape.
  // Het hoofd is gemodelleerd naar de foto's: een smal, lang gezicht met een hoekige kaak en een
  // uitgesproken kin, hoge jukbeenderen, een rechte neus, wat stoppels, rechte donkere wenkbrauwen,
  // een dun brilletje met blauw-paars getinte glazen, licht uitstaande oren, en kort bruin haar dat
  // bovenop warrig omhoog staat. De mond staat open: hij juicht.
  deel(new THREE.CylinderGeometry(0.044, 0.052, 0.12, 18), huid, 0, 1.58, 0.005)
  deel(new THREE.SphereGeometry(0.012, 10, 8), huid, 0, 1.585, 0.045).scale.set(1, 1.4, 0.8) // adamsappel
  const knoop = deel(new THREE.TorusGeometry(0.066, 0.022, 8, 20), rood, 0, 1.545, 0)
  knoop.rotation.x = Math.PI / 2 - 0.2
  for (const k of [-1, 1]) deel(new THREE.ConeGeometry(0.025, 0.07, 3), rood, k * 0.03, 1.52, 0.08).rotation.z = k * 1.9

  const KOP = v(0, 1.75, 0.01)
  const gauss = (x: number, m: number, s: number) => Math.exp(-(((x - m) / s) ** 2))
  /** Hoeveel het oppervlak in richting d naar buiten (of naar binnen) komt. */
  const vorm = (d: THREE.Vector3) => {
    const voor = Math.max(0, d.z)
    let s = 0
    s += 0.013 * gauss(d.y, -0.8, 0.16) * gauss(d.x, 0, 0.3) * voor // kin
    s += 0.006 * gauss(d.y, 0.3, 0.1) * Math.max(0, d.z - 0.5) * 2 // wenkbrauwboog
    s += 0.005 * gauss(d.y, -0.02, 0.14) * gauss(Math.abs(d.x), 0.62, 0.18) * voor // jukbeenderen
    s -= 0.008 * gauss(d.y, 0.15, 0.1) * gauss(Math.abs(d.x), 0.33, 0.13) * voor // oogkassen
    s -= 0.004 * gauss(d.y, -0.38, 0.14) * gauss(Math.abs(d.x), 0.62, 0.2) * voor // ingevallen wangen
    s += 0.006 * Math.max(0, -d.z) * gauss(d.y, 0.2, 0.5) // achterhoofd
    return s
  }
  /** Van een richting naar een punt op het hoofd (in de coördinaten van het beeld). */
  const opHoofd = (d0: THREE.Vector3, extra = 0) => {
    const d = d0.clone().normalize()
    const r = 0.1 + vorm(d) + extra
    const kaak = 1 - 0.2 * THREE.MathUtils.smoothstep(-d.y, 0.05, 0.85) // smaller naar de kin
    return v(d.x * r * 0.83 * kaak, d.y * r * 1.16, d.z * r * 0.99).add(KOP)
  }
  const kneed = (geo: THREE.BufferGeometry, extra: (d: THREE.Vector3) => number = () => 0) => {
    const p = geo.attributes.position as THREE.BufferAttribute
    const d = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize()
      const q = opHoofd(d, extra(d)).sub(KOP)
      p.setXYZ(i, q.x, q.y, q.z)
    }
    geo.computeVertexNormals()
    return geo
  }
  // De huid: met stoppels rond kin, kaak en bovenlip, en wat blos op de wangen.
  const gezichtTex = tex(1024, 512, (g) => {
    g.fillStyle = '#e6b392'
    g.fillRect(0, 0, 1024, 512)
    // De voorkant ligt rond u = 0,25 (x = 256), de top bij v = 0.
    const blos = g.createRadialGradient(256, 250, 10, 256, 250, 120)
    blos.addColorStop(0, 'rgba(214,120,100,.0)')
    blos.addColorStop(0.6, 'rgba(214,120,100,.12)')
    blos.addColorStop(1, 'rgba(214,120,100,0)')
    g.fillStyle = blos
    g.fillRect(100, 150, 312, 200)
    const rnd = (() => {
      let z = 7
      return () => ((z = (z * 16807) % 2147483647) / 2147483647)
    })()
    for (let i = 0; i < 9000; i++) {
      const x = 256 + (rnd() - 0.5) * 300
      const y = 300 + rnd() * 150
      const af = Math.abs(x - 256) / 150
      // Stoppels: op kin en kaak, langs de bovenlip, niet op de wangen boven de kaaklijn.
      const opKaak = y > 330 + af * 40 || (y > 300 && y < 318 && af < 0.35)
      if (!opKaak) continue
      g.fillStyle = `rgba(80,55,38,${0.12 + rnd() * 0.2})`
      g.fillRect(x, y, 2, 2)
    }
    // Korte bakkebaarden, net voor de oren.
    for (const x of [256 - 228, 256 + 228]) {
      const gr = g.createLinearGradient(0, 190, 0, 280)
      gr.addColorStop(0, 'rgba(90,60,40,.6)')
      gr.addColorStop(1, 'rgba(90,60,40,0)')
      g.fillStyle = gr
      g.fillRect(x - 9, 190, 18, 90)
    }
  })
  const gezichtMat = new THREE.MeshPhysicalMaterial({ map: gezichtTex, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 })
  const hoofd = deel(kneed(new THREE.SphereGeometry(1, 64, 48)), gezichtMat, KOP.x, KOP.y, KOP.z)
  void hoofd
  const plaats = (m: THREE.Object3D, d: THREE.Vector3, uit = 0) => {
    const n = d.clone().normalize()
    m.position.copy(opHoofd(n, uit))
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x * 0.83, n.y * 0.6, n.z).normalize())
    return m
  }
  // De neus: een rechte rug, een ronde punt en twee neusvleugels.
  const neusGeo = new THREE.CylinderGeometry(0.0035, 0.0115, 0.046, 3, 1).rotateY(Math.PI / 6)
  const neusRug = deel(neusGeo, gezichtMat)
  neusRug.position.copy(opHoofd(v(0, -0.06, 1), -0.002))
  neusRug.rotation.x = -0.28
  neusRug.scale.set(1, 1, 1.25)
  const punt = deel(new THREE.SphereGeometry(0.0085, 14, 10), huid)
  punt.position.copy(opHoofd(v(0, -0.23, 1), 0.009))
  for (const k of [-1, 1]) {
    const vleugel = deel(new THREE.SphereGeometry(0.0065, 12, 8), huid)
    vleugel.position.copy(opHoofd(v(k * 0.11, -0.25, 1), 0.002))
    vleugel.scale.set(1, 0.8, 0.8)
  }
  // De ogen: oogwit, een hazelnootbruine iris en een pupil, met een bovenooglid.
  const oogwit = lak('#f4efe8', 0.2)
  const iris = new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 0.2 })
  const pupil = new THREE.MeshBasicMaterial({ color: '#0b0806' })
  const brauw = lak('#3f2818', 0.7)
  for (const k of [-1, 1]) {
    const d = v(k * 0.33, 0.14, 0.94)
    plaats(deel(new THREE.SphereGeometry(0.0115, 16, 12), oogwit), d, -0.003).scale.set(1.25, 0.8, 0.7)
    plaats(deel(new THREE.CircleGeometry(0.0062, 18), iris), d, 0.0052)
    plaats(deel(new THREE.CircleGeometry(0.0028, 14), pupil), d, 0.0054)
    const lid = plaats(deel(new THREE.SphereGeometry(0.0125, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.38), huid), d.clone().add(v(0, 0.04, 0)), -0.004)
    lid.scale.set(1.25, 0.7, 0.8)
    // Rechte, vrij dikke wenkbrauwen, licht naar beneden aan de neuskant.
    const wb = plaats(deel(new THREE.CapsuleGeometry(0.0045, 0.032, 4, 8).rotateZ(Math.PI / 2), brauw), v(k * 0.33, 0.31, 0.92), 0.004)
    wb.rotateZ(-k * 0.1)
  }
  // De mond: wijd open van het juichen, met lippen, de bovenste tanden en de tong.
  const mondD = v(0, -0.47, 0.88)
  plaats(deel(new THREE.CircleGeometry(0.017, 24), new THREE.MeshBasicMaterial({ color: '#3a0d0d' })), mondD, 0.0015).scale.set(1.45, 0.95, 1)
  plaats(deel(new THREE.CircleGeometry(0.011, 18, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#f2ece2', roughness: 0.3 })), mondD.clone().add(v(0, 0.06, 0)), 0.0025).scale.set(1.8, 0.42, 1)
  plaats(deel(new THREE.CircleGeometry(0.011, 18, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: '#b5524f', roughness: 0.4 })), mondD.clone().add(v(0, -0.05, 0)), 0.0022).scale.set(1.5, 0.6, 1)
  const lippen = plaats(deel(new THREE.TorusGeometry(0.0185, 0.0018, 8, 32), lak('#c98a80', 0.45)), mondD, 0.0006)
  lippen.scale.set(1.42, 0.95, 0.5)
  // Oren: licht uitstaand, met een donkerdere binnenkant.
  for (const k of [-1, 1]) {
    const oor = deel(new THREE.SphereGeometry(0.024, 16, 12), huid)
    oor.position.copy(opHoofd(v(k, 0.06, -0.08), -0.004))
    oor.scale.set(0.42, 1.15, 0.78)
    oor.rotation.y = k * 0.35
    const binnen = deel(new THREE.SphereGeometry(0.016, 12, 10), lak('#c98f74', 0.6))
    binnen.position.copy(oor.position).add(v(k * 0.005, 0, 0.002))
    binnen.scale.set(0.3, 1.0, 0.6)
    binnen.rotation.y = k * 0.35
  }
  // Het haar: kort opzij en achter, bovenop een warrige kuif die naar voren omhoog staat.
  const haarMat = new THREE.MeshStandardMaterial({ color: '#6a4328', roughness: 0.9 })
  const haarGeo = kneed(new THREE.SphereGeometry(1, 48, 32), (d) => {
    const voor = Math.max(0, d.z)
    const lijn = 0.48 * voor + 0.12 * (1 - voor) - 0.5 * Math.max(0, -d.z)
    if (d.y < lijn) return -0.012 // onder de haarlijn: onder de huid
    const top = THREE.MathUtils.smoothstep(d.y, 0.55, 0.95)
    return 0.004 + top * 0.012 + Math.sin(d.x * 31) * Math.cos(d.z * 27) * 0.003 * top
  })
  deel(haarGeo, haarMat, KOP.x, KOP.y, KOP.z)
  // Pieken: kort, warrig, naar voren en omhoog geborsteld.
  // Plukjes: platte, wat gebogen lokken die naar voren en omhoog vallen (geen stekels).
  const piekKleur = [haarMat, new THREE.MeshStandardMaterial({ color: '#7a5032', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#56361f', roughness: 0.9 })]
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 * 3.7
    const r = 0.1 + (((i * 37) % 23) / 23) * 0.55
    const d = v(Math.cos(a) * r * 0.9, 1, Math.sin(a) * r + 0.2).normalize()
    if (d.y < 0.6) continue
    const lok = deel(new THREE.ConeGeometry(0.011, 0.028 + (i % 4) * 0.005, 5), piekKleur[i % 3])
    lok.scale.set(1, 1, 0.45)
    lok.position.copy(opHoofd(d, 0.01))
    lok.quaternion.setFromUnitVectors(v(0, 1, 0), v(d.x * 0.9 + Math.sin(i * 2.3) * 0.3, 0.75, d.z * 0.6 + 0.6).normalize())
  }
  // De bril: een dun goudkleurig montuur met blauw-paars getinte, wat afgeronde rechthoekige glazen.
  const glas = new THREE.MeshPhysicalMaterial({ color: '#9b8cff', transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.4, clearcoat: 1 })
  const bril = new THREE.Group()
  bril.position.copy(opHoofd(v(0, 0.14, 1), 0.011))
  beeld.add(bril)
  for (const k of [-1, 1]) {
    const x = k * 0.03
    const rand = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0018, 6, 28), goud)
    rand.position.x = x
    rand.scale.set(1.25, 0.82, 1)
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0188, 24), glas)
    lens.position.set(x, 0, -0.0005)
    lens.scale.set(1.25, 0.82, 1)
    const poot = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.1, 5).rotateX(Math.PI / 2), goud)
    poot.position.set(k * 0.066, 0.004, -0.048)
    poot.rotation.y = -k * 0.12
    bril.add(rand, lens, poot)
  }
  const brug = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0016, 5, 10, Math.PI), goud)
  brug.position.y = 0.003
  bril.add(brug)

  // De bak Jupiler: geel kunststof met handgrepen, ribbels, het etiket en de doppen van de flesjes.
  const bak = new THREE.Group()
  bak.position.set(0, 2.29, 0.03)
  bak.rotation.y = 0.06
  beeld.add(bak)
  const bakGeel = new THREE.MeshPhysicalMaterial({ color: '#ffc21a', roughness: 0.4, clearcoat: 0.6, emissive: '#5a3c00', emissiveIntensity: 0.25 })
  const romp = new THREE.Mesh(rondeDoos(0.42, 0.29, 0.31, 0.025), bakGeel)
  bak.add(romp)
  for (const k of [-1, 1]) {
    // Ribbels rondom.
    for (const y of [-0.1, 0.12]) {
      const rib = new THREE.Mesh(rondeDoos(0.43, 0.022, 0.32, 0.008), bakGeel)
      rib.position.y = y
      bak.add(rib)
    }
    // De handgrepen in de korte zijden (een donkere uitsparing).
    const greep = new THREE.Mesh(rondeDoos(0.01, 0.045, 0.12, 0.01), new THREE.MeshBasicMaterial({ color: '#5c3a00' }))
    greep.position.set(k * 0.212, 0.08, 0)
    bak.add(greep)
  }
  const et = etiket()
  for (const k of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ map: et, roughness: 0.4 }))
    e.position.set(0, -0.005, k * 0.157)
    e.rotation.y = k > 0 ? 0 : Math.PI
    bak.add(e)
  }
  // De inhoud: 22 bruine pintjes (hals en kroonkurk steken boven de bak uit) en, in de twee
  // vakjes vooraan rechts, 2 rode blikjes Coca-Cola. De bak telt 6 × 4 vakjes.
  const vakjes = Array.from({ length: 24 }, (_, i) => ({ x: -0.165 + (i % 6) * 0.066, z: -0.105 + Math.floor(i / 6) * 0.07 }))
  const COLA = [22, 23]
  const pintjes = vakjes.filter((_, i) => !COLA.includes(i))
  const glasBruin = new THREE.MeshPhysicalMaterial({ color: '#4a2508', roughness: 0.15, metalness: 0.1, clearcoat: 1, transmission: 0.15 })
  const hals = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.011, 0.024, 0.07, 12).translate(0, 0.175, 0),
    glasBruin,
    pintjes.length,
  )
  const dop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.012, 12).translate(0, 0.214, 0), new THREE.MeshStandardMaterial({ color: '#c8102e', metalness: 0.7, roughness: 0.3 }), pintjes.length)
  const m4 = new THREE.Matrix4()
  pintjes.forEach((p, i) => {
    m4.makeTranslation(p.x, 0, p.z)
    hals.setMatrixAt(i, m4)
    dop.setMatrixAt(i, m4)
  })
  bak.add(hals, dop)
  // De blikjes: rood met een witte golf, een zilveren deksel met lipje; ze steken iets hoger uit.
  const colaTex = tex(256, 128, (g) => {
    g.fillStyle = '#e41e2b'
    g.fillRect(0, 0, 256, 128)
    g.strokeStyle = '#ffffff'
    g.lineWidth = 7
    g.beginPath()
    for (let x = 0; x <= 256; x += 4) g.lineTo(x, 84 + Math.sin(x / 26) * 12)
    g.stroke()
    g.fillStyle = '#ffffff'
    g.font = 'italic 700 34px "Brush Script MT", Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('Coca-Cola', 64, 44)
    g.fillText('Coca-Cola', 192, 44)
  })
  const zilver = new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.6, roughness: 0.3, emissive: '#3a3d42', emissiveIntensity: 0.4 })
  for (const i of COLA) {
    const { x, z } = vakjes[i]
    const blik = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 20), [new THREE.MeshStandardMaterial({ map: colaTex, metalness: 0.2, roughness: 0.35, emissive: '#5a0006', emissiveIntensity: 0.4 }), zilver, zilver])
    blik.position.set(x, 0.14, z)
    blik.rotation.y = i * 1.3
    bak.add(blik)
    const lip = new THREE.Mesh(rondeDoos(0.012, 0.003, 0.02, 0.002), zilver)
    lip.position.set(x, 0.202, z + 0.008)
    bak.add(lip)
  }

  // De cape: vast aan de schouders, en dan opzij en naar achter wapperend, met plooien.
  const capeGeo = new THREE.PlaneGeometry(1, 1, 18, 28)
  {
    const p = capeGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5 // 0 = links, 1 = rechts
      const t = 0.5 - p.getY(i) // 0 = boven, 1 = onder
      const breedte = 0.36 + t * 0.42
      const zwaai = Math.pow(t, 1.6) * 0.42 // naar zijn linkerkant (+x)
      const x = (u - 0.5) * breedte * 2 * 0.5 + zwaai + (u - 0.5) * 0.08
      const y = 1.53 - t * 1.0 + Math.pow(t, 2) * 0.12
      const plooi = Math.sin(u * Math.PI * 3.2 + t * 2.5) * 0.045 * t
      const z = -0.15 - t * 0.2 - plooi - Math.sin(u * Math.PI) * 0.05
      p.setXYZ(i, x, y, z)
    }
    capeGeo.computeVertexNormals()
  }
  const tekenCape = (g: CanvasRenderingContext2D, logo: CanvasImageSource, w: number, h: number) => {
    g.fillStyle = '#d4202a'
    g.fillRect(0, 0, 512, 768)
    // Wat glans in de plooien.
    for (let x = 0; x < 512; x += 48) {
      const gr = g.createLinearGradient(x, 0, x + 48, 0)
      gr.addColorStop(0, 'rgba(0,0,0,.12)')
      gr.addColorStop(0.5, 'rgba(255,255,255,.07)')
      gr.addColorStop(1, 'rgba(0,0,0,.12)')
      g.fillStyle = gr
      g.fillRect(x, 0, 48, 768)
    }
    // Het embleem op de rug: gespiegeld getekend, want je ziet de achterkant van het doek.
    g.save()
    g.translate(256, 0)
    g.scale(-1, 1)
    g.drawImage(logo, -170, 300, 340, (340 * h) / w)
    g.restore()
  }
  const capeTex = tex(512, 768, (g) => tekenCape(g, emb.image as HTMLCanvasElement, 512, 384))
  new THREE.TextureLoader().load('/virtueel/bakman-logo.webp', (logo) => {
    logo.colorSpace = THREE.SRGBColorSpace
    logo.anisotropy = 8
    borstMat.map = logo
    borstMat.needsUpdate = true
    const img = logo.image as HTMLImageElement
    tekenCape((capeTex.image as HTMLCanvasElement).getContext('2d')!, img, img.width, img.height)
    capeTex.needsUpdate = true
  })
  // De voorkant van de cape is de binnenkant (effen rood), de achterkant draagt het embleem.
  capeTex.wrapS = THREE.ClampToEdgeWrapping
  const cape = deel(capeGeo, new THREE.MeshPhysicalMaterial({ map: capeTex, side: THREE.DoubleSide, roughness: 0.45, clearcoat: 0.4 }))
  void cape

  if (!licht) beeld.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null))

  // ---------- licht: vier grondspots die hem aanlichten ----------
  const gloed = tex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  })
  for (const [sx, sz] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 14), new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.7, roughness: 0.3 }))
    spot.position.set(sx * 1.15, 0.28, sz * 1.15)
    groep.add(spot)
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false }))
    lens.position.set(sx * 1.15, 0.325, sz * 1.15)
    groep.add(lens)
    // Een zachte lichtbundel omhoog langs het beeld.
    const bundel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.08, 3.6, 18, 1, true).translate(0, 1.8, 0),
      new THREE.MeshBasicMaterial({ color: '#fff1d0', transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    )
    bundel.position.set(sx * 1.15, 0.33, sz * 1.15)
    bundel.rotation.set(-sz * 0.22, 0, sx * 0.22)
    groep.add(bundel)
  }
  const plas = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gloed, color: '#ffe6b0', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))
  plas.position.y = 0.03
  groep.add(plas)
  if (!licht) {
    // Een echte spot van voren, zodat de kleuren 's avonds goed uitkomen.
    const spot = new THREE.SpotLight('#fff3e0', 420, 18, 0.55, 0.6, 1.4)
    spot.position.set(0, 0.6, 4.5)
    spot.target.position.set(0, 3.6, 0)
    groep.add(spot, spot.target)
  }

  // ---------- het bord aan de gevel, met zijn foto ----------
  // Achter het beeld, op de voorgevel: een vergulde lijst met de foto van Bakman zelf, zijn naam
  // erboven en een onderschrift, en een lampje dat het bord aanlicht.
  {
    const bord = new THREE.Group()
    // De muur ligt 0,6 m voor de gevellijn (omgeving.ts).
    bord.position.set(BAKMAN_BORD.x, 0, GEVEL.B + 0.68)
    scene.add(bord)
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 1000
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    const teken = (foto: HTMLImageElement | null) => {
      const g = c.getContext('2d')!
      const gr = g.createLinearGradient(0, 0, 0, 1000)
      gr.addColorStop(0, '#1f3fb4')
      gr.addColorStop(1, '#0f1f5c')
      g.fillStyle = gr
      g.fillRect(0, 0, 640, 1000)
      g.fillStyle = '#d4202a'
      g.fillRect(0, 0, 640, 130)
      g.fillStyle = '#f6c915'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = '900 104px Impact, "Arial Black", Inter, sans-serif'
      g.fillText('BAKMAN', 320, 70, 600)
      // De foto, in een wit passe-partout.
      g.fillStyle = '#f8f5ec'
      g.fillRect(40, 160, 560, 700)
      if (foto) g.drawImage(foto, 56, 176, 528, 668)
      else {
        g.fillStyle = '#334155'
        g.fillRect(56, 176, 528, 668)
      }
      g.fillStyle = '#ffffff'
      g.font = '800 40px Inter, system-ui, sans-serif'
      g.fillText(`De held van ${thema.naam}`, 320, 912, 600)
      g.fillStyle = '#f6c915'
      g.font = 'italic 600 28px Georgia, serif'
      g.fillText('Sterk genoeg voor elke bak', 320, 962, 600)
      t.needsUpdate = true
    }
    teken(null)
    const img = new Image()
    img.onload = () => teken(img)
    img.src = '/virtueel/bakman-foto.jpg'
    const B = 2.0
    const H = 3.125
    const vlak = new THREE.Mesh(new THREE.PlaneGeometry(B, H), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }))
    vlak.position.set(0, 3.0, 0.06)
    const lijst = new THREE.Mesh(rondeDoos(B + 0.24, H + 0.24, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.85, roughness: 0.3 }))
    lijst.position.set(0, 3.0, 0)
    bord.add(lijst, vlak)
    // Een lampje erboven, met een lichtwaaier over het bord.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.7 }))
    arm.position.set(0, 4.85, 0.25)
    const kap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.7 }))
    kap.position.set(0, 4.8, 0.5)
    kap.rotation.x = 0.6
    const waaier = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 3.4),
      new THREE.MeshBasicMaterial({ map: gloed, color: '#fff1d0', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    waaier.position.set(0, 3.4, 0.08)
    bord.add(arm, kap, waaier)
  }

  // Botsing: de sokkel (een vierkant van 2,6 m, gedraaid; ruim genomen).
  const r = 1.3 * (Math.abs(Math.cos(opt.ry)) + Math.abs(Math.sin(opt.ry)))
  return {
    obstakels: [{ x0: opt.x - r, x1: opt.x + r, z0: opt.z - r, z1: opt.z + r }],
    plek: { x: opt.x + Math.sin(opt.ry) * 3, z: opt.z + Math.cos(opt.ry) * 3 },
  }
}
