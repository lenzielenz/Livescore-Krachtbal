import * as THREE from 'three'

import type { Rechthoek, StadionThema } from '@/lib/virtueel'
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
  deel(new THREE.CylinderGeometry(0.05, 0.057, 0.11, 16), huid, 0, 1.585, 0)
  const knoop = deel(new THREE.TorusGeometry(0.066, 0.022, 8, 20), rood, 0, 1.555, 0)
  knoop.rotation.x = Math.PI / 2 - 0.2
  for (const k of [-1, 1]) deel(new THREE.ConeGeometry(0.025, 0.07, 3), rood, k * 0.03, 1.53, 0.08).rotation.z = k * 1.9
  const hoofd = deel(new THREE.SphereGeometry(0.1, 32, 24), huid, 0, 1.745, 0.005)
  hoofd.scale.set(0.86, 1.13, 0.98)
  deel(new THREE.SphereGeometry(0.075, 22, 16), huid, 0, 1.69, 0.025).scale.set(0.95, 0.85, 0.95) // kaak
  deel(new THREE.ConeGeometry(0.014, 0.035, 10).rotateX(Math.PI / 2), huid, 0, 1.74, 0.108) // neus
  for (const k of [-1, 1]) deel(new THREE.SphereGeometry(0.02, 10, 8), huid, k * 0.088, 1.745, -0.005).scale.set(0.5, 1.2, 0.8) // oren
  const mondMat = new THREE.MeshBasicMaterial({ color: '#4a1414' })
  deel(new THREE.CircleGeometry(0.015, 20), mondMat, 0, 1.682, 0.097).scale.set(1.1, 1.2, 1) // juichende open mond
  const oog = new THREE.MeshBasicMaterial({ color: '#2a1d14' })
  const wenkbrauw = lak('#4a3020', 0.6)
  for (const k of [-1, 1]) {
    deel(new THREE.SphereGeometry(0.009, 8, 6), oog, k * 0.033, 1.758, 0.088)
    deel(rondeDoos(0.034, 0.008, 0.008, 0.003), wenkbrauw, k * 0.034, 1.788, 0.09).rotation.z = -k * 0.12
  }
  // Kort, wat warrig bruin haar, opgeborsteld.
  const haarKleur = lak('#6b4528', 0.7)
  const kruin = deel(new THREE.SphereGeometry(0.104, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), haarKleur, 0, 1.775, -0.008)
  kruin.scale.set(0.9, 0.95, 1.0)
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    const r = i % 3 === 0 ? 0.02 : i % 2 ? 0.045 : 0.07
    const pluk = deel(new THREE.SphereGeometry(0.026, 8, 6), haarKleur, Math.cos(a) * r * 0.85, 1.845 + (0.07 - r) * 0.25, Math.sin(a) * r + 0.015)
    pluk.scale.set(1, 0.55 + (i % 4) * 0.1, 1.2)
  }
  // De bril: een dun montuur met blauw-paars getinte glazen.
  const glas = new THREE.MeshPhysicalMaterial({ color: '#8fa8ff', transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.3 })
  for (const k of [-1, 1]) {
    deel(new THREE.TorusGeometry(0.023, 0.0025, 6, 22), goud, k * 0.034, 1.758, 0.1).scale.set(1.1, 0.85, 1)
    deel(new THREE.CircleGeometry(0.022, 18), glas, k * 0.034, 1.758, 0.099).scale.set(1.1, 0.85, 1)
    deel(new THREE.CylinderGeometry(0.0022, 0.0022, 0.1, 5).rotateX(Math.PI / 2), goud, k * 0.06, 1.762, 0.05)
  }
  deel(new THREE.CylinderGeometry(0.0022, 0.0022, 0.02, 5).rotateZ(Math.PI / 2), goud, 0, 1.762, 0.102)

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

  // Botsing: de sokkel (een vierkant van 2,6 m, gedraaid; ruim genomen).
  const r = 1.3 * (Math.abs(Math.cos(opt.ry)) + Math.abs(Math.sin(opt.ry)))
  return {
    obstakels: [{ x0: opt.x - r, x1: opt.x + r, z0: opt.z - r, z1: opt.z + r }],
    plek: { x: opt.x + Math.sin(opt.ry) * 3, z: opt.z + Math.cos(opt.ry) * 3 },
  }
}
