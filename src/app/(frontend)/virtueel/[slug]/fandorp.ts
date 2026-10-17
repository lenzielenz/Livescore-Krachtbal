import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Rechthoek, StadionThema } from '@/lib/virtueel'
import { bouwKermis, type Kermisspel, type Rit, type RitInfo } from './kermis'
import { krachtbalGeometrie, krachtbalTextuur } from './krachtbal'
import { rondeDoos } from './rond'
import { rnd } from './stadion'
import { bouwVolk } from './volk'
import { bouwVerkoopwagen, nachtOmgeving } from './voertuig'

// Het fandorp: aan de overkant van de straat, recht tegenover de hoofdingang, zoals bij een echt
// stadion op wedstrijddag. Een zebrapad en een poort met de clubnaam brengen je erin. Daar:
//  • een reuzenrad met LED's in clubkleur: stap in een bakje en draai een ronde mee, met zicht
//    over het hele terrein (stadion, plein, parking en oefencomplex);
//  • een rij foodtrucks (frieten, wafels, burgers, ijsjes) met picknicktafels onder lichtslingers;
//  • een feesttent met een dj-podium, een ledwand, draaiende spots, een toog en dansend publiek;
//  • een springkasteel in clubkleur (je veert er echt op), een draaimolen met krachtballen (stap op
//    en draai mee), een krachtmeter met een bel (sla zelf!) en een schminkstand;
//  • een kermis met een zweefmolen, botsauto's, blikken gooien en eendjes vissen (kermis.ts);
//  • en op het plein naast het stadion een tv-wagen met een schotel.

export const FANDORP = { x0: -62, x1: 62, z0: 75, z1: 126 }

/** Het reuzenrad: middelpunt, straal, en hoe lang een ronde duurt (s). */
const RAD = { x: 0, z: 116, H: 17.2, R: 14, N: 16, periode: 48 }

export type { Kermisspel, Rit, RitInfo }

export type Fandorp = {
  obstakels: Rechthoek[]
  /** Waar je op het springkasteel veert (0 = niet erop, 1 = midden). */
  springkasteel: (x: number, z: number) => number
  /** Alles waar je op kan: het reuzenrad, de draaimolen, de zweefmolen en de botsauto's. */
  ritten: Rit[]
  /** De kermisspelletjes: de krachtmeter, blikken gooien en eendjes vissen. */
  spellen: Kermisspel[]
  update: (seconden: number, dt: number) => void
}

const tex = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void, herhaal?: [number, number]) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (herhaal) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(herhaal[0], herhaal[1])
  }
  return t
}

/** Een balk (cilinder) van a naar b. */
const balk = (a: THREE.Vector3, b: THREE.Vector3, r: number, segs = 8) => {
  const d = b.clone().sub(a)
  const L = d.length()
  const g = new THREE.CylinderGeometry(r, r, L, segs, 1)
  g.translate(0, L / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function bouwFandorp(scene: THREE.Scene, opt: { thema: StadionThema; licht: boolean; straatZ: number; melding?: (tekst: string) => void }): Fandorp {
  const { thema, licht } = opt
  const groep = new THREE.Group()
  scene.add(groep)
  const obstakels: Rechthoek[] = []
  const blok = (x0: number, x1: number, z0: number, z1: number) => obstakels.push({ x0, x1, z0, z1 })
  const toeval = rnd(9182)
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    groep.add(m)
    if (!licht) m.castShadow = true
    return m
  }
  const P = new THREE.Color(thema.primair)
  const S = new THREE.Color(thema.secundair)
  const clubMat = new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.45 })
  const club2Mat = new THREE.MeshStandardMaterial({ color: thema.secundair, roughness: 0.45 })
  const witMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 })
  const staal = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.6, roughness: 0.35 })
  const donker = new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.3, roughness: 0.6 })
  const hout = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.8 })
  const plas = (kleur: string, sterk: number) => new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: sterk, depthWrite: false, blending: THREE.AdditiveBlending })
  const zacht = tex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  })
  const lichtPlas = (x: number, z: number, r: number, kleur: string, sterk = 0.35) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: zacht, color: kleur, transparent: true, opacity: sterk, depthWrite: false, blending: THREE.AdditiveBlending }))
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.04, z)
    groep.add(m)
    return m
  }
  /** Een bord met tekst (een vlak met een getekende textuur). */
  const bord = (tekst: string, w: number, h: number, achter: string, voor: string, onder?: string) => {
    const pw = 512
    const ph = Math.round((pw * h) / w)
    const t = tex(pw, ph, (g) => {
      g.fillStyle = achter
      g.fillRect(0, 0, pw, ph)
      g.strokeStyle = voor
      g.lineWidth = ph * 0.05
      g.strokeRect(ph * 0.04, ph * 0.04, pw - ph * 0.08, ph - ph * 0.08)
      g.fillStyle = voor
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `900 ${Math.round(ph * (onder ? 0.42 : 0.55))}px Inter, system-ui, sans-serif`
      g.fillText(tekst, pw / 2, ph * (onder ? 0.4 : 0.52), pw * 0.9)
      if (onder) {
        g.font = `700 ${Math.round(ph * 0.2)}px Inter, system-ui, sans-serif`
        g.globalAlpha = 0.85
        g.fillText(onder, pw / 2, ph * 0.76, pw * 0.9)
        g.globalAlpha = 1
      }
    })
    // Twee kanten, elk leesbaar (een dubbelzijdig vlak toont de tekst achteraan in spiegelschrift).
    const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false })
    const voorkant = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    const achterkant = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    achterkant.rotation.y = Math.PI
    voorkant.add(achterkant)
    return voorkant
  }
  const animaties: ((s: number, dt: number) => void)[] = []

  // ---------- de grond: betreden gras, grindpaden en het zebrapad ----------
  const grondTex = tex(256, 256, (g) => {
    g.fillStyle = '#3d5a2c'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${toeval() < 0.5 ? '110,95,60' : '60,100,45'},${0.15 + toeval() * 0.25})`
      g.fillRect(toeval() * 256, toeval() * 256, 2, 2)
    }
  }, [14, 7])
  const vorm = new THREE.Shape()
  {
    const r = 8
    const [a, b, c, d] = [FANDORP.x0, FANDORP.x1, -FANDORP.z1, -FANDORP.z0]
    vorm.moveTo(a + r, c)
    vorm.lineTo(b - r, c)
    vorm.quadraticCurveTo(b, c, b, c + r)
    vorm.lineTo(b, d - r)
    vorm.quadraticCurveTo(b, d, b - r, d)
    vorm.lineTo(a + r, d)
    vorm.quadraticCurveTo(a, d, a, d - r)
    vorm.lineTo(a, c + r)
    vorm.quadraticCurveTo(a, c, a + r, c)
  }
  const grondGeo = new THREE.ShapeGeometry(vorm, 6)
  grondGeo.rotateX(-Math.PI / 2)
  {
    // UV's op wereldmaat (de ShapeGeometry geeft ze in meters).
    const uv = grondGeo.attributes.uv as THREE.BufferAttribute
    const pos = grondGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - FANDORP.x0) / 124, (pos.getZ(i) - FANDORP.z0) / 51)
  }
  const grond = new THREE.Mesh(grondGeo, new THREE.MeshLambertMaterial({ map: grondTex }))
  grond.position.y = 0.008
  grond.receiveShadow = !licht
  groep.add(grond)
  const grind = new THREE.MeshLambertMaterial({ color: '#b8a98a' })
  const pad = (x0: number, x1: number, z0: number, z1: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), grind)
    m.rotation.x = -Math.PI / 2
    m.position.set((x0 + x1) / 2, 0.018, (z0 + z1) / 2)
    m.receiveShadow = !licht
    groep.add(m)
  }
  pad(-3, 3, opt.straatZ + 4.5, 109)
  pad(-50, 50, 90, 94)
  // Het zebrapad over de straat, van de hoofdingang naar de poort.
  const zebra = new THREE.MeshBasicMaterial({ color: '#e5e7eb' })
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), zebra)
    m.rotation.x = -Math.PI / 2
    m.position.set(0, 0.03, opt.straatZ - 3.6 + i * 1.45)
    groep.add(m)
  }

  // ---------- de poort ----------
  {
    const z = FANDORP.z0 + 1
    for (const sx of [-1, 1]) {
      deel(rondeDoos(1.4, 6.4, 1.4, 0.25), clubMat, sx * 5, 3.2, z)
      deel(new THREE.SphereGeometry(0.75, 20, 12), club2Mat, sx * 5, 6.9, z)
      blok(sx * 5 - 0.75, sx * 5 + 0.75, z - 0.75, z + 0.75)
    }
    deel(rondeDoos(11.6, 1.6, 0.6, 0.2), donker, 0, 5.6, z)
    for (const [kant, ry] of [
      [-0.32, Math.PI],
      [0.32, 0],
    ] as const) {
      const b = bord('FANDORP', 10.8, 1.3, thema.primair, thema.tekstOpPrimair, thema.naam.toUpperCase())
      b.position.set(0, 5.6, z + kant)
      b.rotation.y = ry
      groep.add(b)
    }
    // Wimpelslingers vanaf de poort.
    const wimpel = new THREE.ConeGeometry(0.22, 0.5, 3).rotateX(Math.PI)
    const wimpels = new THREE.InstancedMesh(wimpel, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), 60)
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < 60; i++) {
      const kant = i < 30 ? -1 : 1
      const f = (i % 30) / 29
      const x = kant * (5 + f * 16)
      const y = 6.2 - Math.sin(f * Math.PI) * 1.3 - f * 1.8
      m4.makeTranslation(x, y, z)
      wimpels.setMatrixAt(i, m4)
      wimpels.setColorAt(i, i % 3 === 0 ? P : i % 3 === 1 ? S : new THREE.Color('#ffffff'))
    }
    groep.add(wimpels)
    for (const sx of [-1, 1]) deel(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 8).translate(0, 2.3, 0), donker, sx * 21, 0, z)
  }

  // ---------- het reuzenrad ----------
  const rad = (() => {
    const { x: RX, z: RZ, H, R, N } = RAD
    const D = 1.35 // halve afstand tussen de twee velgen
    // Het draaiende deel: twee velgen, spaken, assen en een binnenring, in wit gelakt staal.
    const delen: THREE.BufferGeometry[] = []
    for (const z of [-D, D]) {
      delen.push(new THREE.TorusGeometry(R, 0.2, 8, 96).translate(0, 0, z))
      delen.push(new THREE.TorusGeometry(R * 0.55, 0.12, 6, 64).translate(0, 0, z))
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        const a2 = ((i + 0.5) / N) * Math.PI * 2
        delen.push(balk(v3(Math.sin(a) * 0.9, -Math.cos(a) * 0.9, z), v3(Math.sin(a) * R, -Math.cos(a) * R, z), 0.09, 6))
        // Vakwerk tussen de binnenring en de velg.
        delen.push(balk(v3(Math.sin(a) * R * 0.55, -Math.cos(a) * R * 0.55, z), v3(Math.sin(a2) * R, -Math.cos(a2) * R, z), 0.06, 5))
        delen.push(balk(v3(Math.sin(a2) * R * 0.55 * 1.0, -Math.cos(a2) * R * 0.55, z), v3(Math.sin(a) * R, -Math.cos(a) * R, z), 0.06, 5))
      }
    }
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      // De as van elk bakje dwars tussen de velgen.
      delen.push(balk(v3(Math.sin(a) * R, -Math.cos(a) * R, -D - 0.1), v3(Math.sin(a) * R, -Math.cos(a) * R, D + 0.1), 0.1, 8))
    }
    delen.push(new THREE.CylinderGeometry(1.0, 1.0, D * 2 + 0.8, 24).rotateX(Math.PI / 2))
    const draai = new THREE.Group()
    draai.position.set(RX, H, RZ)
    groep.add(draai)
    const wiel = new THREE.Mesh(mergeGeometries(delen.map((g) => (g.index ? g.toNonIndexed() : g))), new THREE.MeshStandardMaterial({ color: '#f1f5f9', metalness: 0.5, roughness: 0.35 }))
    draai.add(wiel)
    delen.forEach((g) => g.dispose())
    // Een naafkap met het clublogo-kleuren.
    const naaf = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 32).rotateX(Math.PI / 2), clubMat)
    naaf.position.z = -(D + 0.5)
    draai.add(naaf)
    const naaf2 = naaf.clone()
    naaf2.position.z = D + 0.5
    draai.add(naaf2)
    // De LED's op de velgen en de spaken (ze lopen in een golf rond in clubkleur).
    const ledPlek: { x: number; y: number; z: number; f: number; s: number }[] = []
    for (const z of [-D - 0.22, D + 0.22]) {
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2
        ledPlek.push({ x: Math.sin(a) * R, y: -Math.cos(a) * R, z, f: i / 64, s: 0 })
      }
      for (let i = 0; i < N; i++)
        for (let k = 1; k <= 5; k++) {
          const a = (i / N) * Math.PI * 2
          const r = 1.2 + (k / 5) * (R - 1.6)
          ledPlek.push({ x: Math.sin(a) * r, y: -Math.cos(a) * r, z, f: i / N, s: k / 5 })
        }
    }
    const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), ledPlek.length)
    const m4 = new THREE.Matrix4()
    ledPlek.forEach((l, i) => {
      m4.makeTranslation(l.x, l.y, l.z)
      leds.setMatrixAt(i, m4)
      leds.setColorAt(i, P)
    })
    draai.add(leds)
    // De poten: twee A-frames, voor en achter, tot aan de as.
    const poten: THREE.BufferGeometry[] = []
    for (const sz of [-1, 1]) {
      const top = v3(RX, H, RZ + sz * (D + 0.35))
      const voet = (sx: number) => v3(RX + sx * 9, 0, RZ + sz * 4.2)
      poten.push(balk(voet(-1), top, 0.38, 10), balk(voet(1), top, 0.38, 10))
      poten.push(balk(v3(RX - 6.6, 4.8, RZ + sz * 3.4), v3(RX + 6.6, 4.8, RZ + sz * 3.4), 0.2), balk(v3(RX - 3.4, 11, RZ + sz * 2.2), v3(RX + 3.4, 11, RZ + sz * 2.2), 0.16))
      blok(RX - 9.6, RX - 8.4, RZ + sz * 4.2 - 0.6, RZ + sz * 4.2 + 0.6)
      blok(RX + 8.4, RX + 9.6, RZ + sz * 4.2 - 0.6, RZ + sz * 4.2 + 0.6)
    }
    const poot = new THREE.Mesh(mergeGeometries(poten.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: thema.primair, metalness: 0.4, roughness: 0.4 }))
    groep.add(poot)
    poten.forEach((g) => g.dispose())
    // Het instapplatform onderaan, met een trapje en een loket.
    const platY = H - R - 2.6
    deel(rondeDoos(7, platY, 5.2, 0.15), donker, RX, platY / 2, RZ)
    for (let i = 0; i < 3; i++) deel(new THREE.BoxGeometry(3, (platY * (i + 1)) / 4, 0.6), staal, RX, (platY * (i + 1)) / 8, RZ - 2.9 - (2 - i) * 0.6)
    blok(RX - 3.5, RX + 3.5, RZ - 2.6, RZ + 2.6)
    deel(rondeDoos(2.2, 2.6, 1.8, 0.2), clubMat, RX + 5.4, 1.3, RZ - 4.6)
    blok(RX + 4.3, RX + 6.5, RZ - 5.5, RZ - 3.7)
    const radBord = bord('🎡 REUZENRAD', 4.2, 1.05, '#0b1220', '#fde68a', 'stap in · draai een ronde mee')
    radBord.position.set(RX + 5.4, 3.3, RZ - 5.55)
    radBord.rotation.y = Math.PI
    groep.add(radBord)
    lichtPlas(RX, RZ - 4, 7, thema.primair, 0.3)

    // De bakjes: een open cabine met een dak, borstwering in clubkleur, hoekpalen en een bank.
    const bakDelen = {
      kleur: mergeGeometries([
        ...[-0.95, 0.95].map((z) => new THREE.BoxGeometry(2.2, 1.0, 0.07).translate(0, -2.16, z)),
        ...[-1.08, 1.08].map((x) => new THREE.BoxGeometry(0.07, 1.0, 1.9).translate(x, -2.16, 0)),
        rondeDoos(2.4, 0.22, 2.1, 0.08).translate(0, -0.72, 0),
      ].map((g) => (g.index ? g.toNonIndexed() : g))),
      staal: mergeGeometries([
        rondeDoos(2.3, 0.14, 2.0, 0.05).translate(0, -2.72, 0),
        ...[
          [-1.05, -0.92],
          [1.05, -0.92],
          [-1.05, 0.92],
          [1.05, 0.92],
        ].map(([x, z]) => new THREE.CylinderGeometry(0.045, 0.045, 1.95, 6).translate(x, -1.68, z)),
        new THREE.CylinderGeometry(0.07, 0.07, 0.62, 8).translate(0, -0.3, 0),
        new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, 0.35, 1.15).translate(0, -0.62, 0),
        new THREE.BoxGeometry(1.9, 0.12, 0.5).translate(0, -2.25, 0.62),
        new THREE.BoxGeometry(1.9, 0.5, 0.1).translate(0, -1.95, 0.85),
      ].map((g) => (g.index ? g.toNonIndexed() : g))),
    }
    const bakken = Array.from({ length: N }, (_, i) => {
      const g = new THREE.Group()
      const k = new THREE.Mesh(bakDelen.kleur, i % 2 ? club2Mat : clubMat)
      const s = new THREE.Mesh(bakDelen.staal, staal)
      g.add(k, s)
      const lampje = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff3c4', toneMapped: false }))
      lampje.position.y = -0.85
      g.add(lampje)
      groep.add(g)
      return g
    })
    let hoek = 0
    const plek = (i: number, uit: THREE.Vector3) => {
      const a = hoek + (i / N) * Math.PI * 2
      return uit.set(RX + Math.sin(a) * R, H - Math.cos(a) * R, RZ)
    }
    animaties.push((s) => {
      hoek = (s / RAD.periode) * Math.PI * 2
      draai.rotation.z = hoek
      bakken.forEach((b, i) => {
        plek(i, b.position)
        b.rotation.z = Math.sin(s * 0.9 + i) * 0.025
      })
      // Een golf van licht die rondloopt.
      const c = new THREE.Color()
      ledPlek.forEach((l, i) => {
        const golf = 0.5 + 0.5 * Math.sin((l.f - s * 0.25) * Math.PI * 2 * 2 + l.s * 3)
        c.copy(P).lerp(S, golf).multiplyScalar(0.6 + golf * 0.9)
        leds.setColorAt(i, c)
      })
      if (leds.instanceColor) leds.instanceColor.needsUpdate = true
    })

    // De rit.
    let mijn = -1
    let instap = 0
    let uitstap: { x: number; z: number; yaw: number } | null = null
    let laatsteS = 0
    animaties.push((s) => (laatsteS = s))
    const tmp = new THREE.Vector3()
    const voortgang = () => (mijn < 0 ? 0 : (laatsteS - instap) / RAD.periode)
    const hoekVan = () => hoek + (mijn / N) * Math.PI * 2
    const uit = () => {
      mijn = -1
      uitstap = { x: RX, z: RZ - 4.6, yaw: Math.PI }
    }
    animaties.push(() => {
      if (mijn >= 0 && voortgang() >= 1) uit()
    })
    const rad: Rit = {
      id: 'reuzenrad',
      actie: '🎡 Stap in het reuzenrad',
      bij: (x, z) => mijn < 0 && Math.hypot(x - RX, z - (RZ - 4.2)) < 2.6,
      stapIn() {
        // Het bakje dat nu het dichtst bij de grond hangt.
        let beste = 0
        let min = Infinity
        for (let i = 0; i < N; i++) {
          const a = hoek + (i / N) * Math.PI * 2
          const d = 1 - Math.cos(a)
          if (d < min) {
            min = d
            beste = i
          }
        }
        mijn = beste
        // Zodat de ronde eindigt als het bakje weer onderaan is.
        const a = Math.atan2(Math.sin(hoekVan()), Math.cos(hoekVan()))
        instap = laatsteS - (a / (Math.PI * 2)) * RAD.periode
      },
      inRit: () => mijn >= 0,
      info() {
        if (mijn < 0) return null
        plek(mijn, tmp)
        const a = hoekVan()
        const rest = Math.max(0, Math.ceil((1 - voortgang()) * RAD.periode))
        return { titel: '🎡 In het reuzenrad', regel: `${Math.round(Math.max(0, tmp.y - 2.7))} m hoog · nog ${rest} s · sleep om rond te kijken`, rest, magUit: Math.cos(a) > 0.96 && voortgang() > 0.08 }
      },
      camera(camera, yaw, pitch) {
        if (mijn < 0) return
        plek(mijn, tmp)
        camera.position.set(tmp.x, tmp.y - 1.48, tmp.z + 0.3)
        camera.lookAt(camera.position.x + Math.sin(yaw) * Math.cos(pitch), camera.position.y + Math.sin(pitch), camera.position.z + Math.cos(yaw) * Math.cos(pitch))
      },
      stapUit: () => uit(),
      uitgestapt() {
        const u = uitstap
        uitstap = null
        return u
      },
    }
    return rad
  })()

  // ---------- de foodtrucks ----------
  const trucks = [
    { naam: 'FRIETKOT', sub: 'frieten · stoofvlees · bicky', icoon: '🍟', kleur: '#facc15', z: 86 },
    { naam: 'WAFELS', sub: 'Luikse · Brusselse · pannenkoek', icoon: '🧇', kleur: '#f472b6', z: 96 },
    { naam: 'BURGERS', sub: 'smash · veggie · hotdogs', icoon: '🍔', kleur: '#fb923c', z: 106 },
    { naam: 'IJSJES', sub: 'softijs · sorbet · milkshake', icoon: '🍦', kleur: '#38bdf8', z: 116 },
  ]
  const truckX = -55
  for (const t of trucks) {
    // Een foodtruck met een echte vorm (voertuig.ts): de cabine met voorruit vooraan (naar -z), het
    // luik aan de pleinkant (+x).
    const wagen = bouwVerkoopwagen({ lengte: 8.6, breedte: 2.8, hoogte: 2.6, kleur: t.kleur, cabine: true, bodem: 0.45 })
    wagen.position.set(truckX, 0, t.z - 0.8)
    wagen.rotation.y = Math.PI / 2
    groep.add(wagen)
    // Het luik: een verlicht interieur met een toog.
    const binnen = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.2), new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false }))
    binnen.position.set(truckX + 1.41, 2.25, t.z + 0.4)
    binnen.rotation.y = Math.PI / 2
    groep.add(binnen)
    deel(new THREE.BoxGeometry(0.5, 0.08, 4.8), staal, truckX + 1.65, 1.62, t.z + 0.4)
    // Een luifel in streepjes.
    const luifelTex = tex(128, 32, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : t.kleur
        g.fillRect(i * 16, 0, 16, 32)
      }
    })
    // Plat over het luik, de buitenrand hangt wat lager.
    const luifel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: luifelTex, side: THREE.DoubleSide, roughness: 0.7 }))
    luifel.position.set(truckX + 2.1, 3.0, t.z + 0.4)
    luifel.rotation.z = -0.3
    groep.add(luifel)
    // Een bord op het dak en een menubord.
    const b = bord(`${t.icoon} ${t.naam}`, 5.2, 1.4, '#0b1220', t.kleur, t.sub)
    b.position.set(truckX + 0.2, 3.85, t.z + 0.3)
    b.rotation.y = Math.PI / 2
    groep.add(b)
    blok(truckX - 1.5, truckX + 1.5, t.z - 5.1, t.z + 3.6)
    lichtPlas(truckX + 3.5, t.z + 0.4, 4, '#ffd9a0', 0.3)
  }
  // Picknicktafels onder lichtslingers.
  {
    const tafelGeo = mergeGeometries([
      new THREE.BoxGeometry(2.4, 0.08, 0.9).translate(0, 0.76, 0),
      new THREE.BoxGeometry(2.4, 0.06, 0.3).translate(0, 0.45, 0.72),
      new THREE.BoxGeometry(2.4, 0.06, 0.3).translate(0, 0.45, -0.72),
      new THREE.BoxGeometry(0.08, 0.76, 1.8).translate(-0.9, 0.38, 0),
      new THREE.BoxGeometry(0.08, 0.76, 1.8).translate(0.9, 0.38, 0),
    ])
    const plekken: [number, number][] = []
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) plekken.push([-44 + i * 6, 84 + j * 6.5 + (j > 1 ? 4 : 0)])
    const tafels = new THREE.InstancedMesh(tafelGeo, hout, plekken.length)
    const m4 = new THREE.Matrix4()
    plekken.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0, z)
      tafels.setMatrixAt(i, m4)
      blok(x - 1.25, x + 1.25, z - 0.95, z + 0.95)
    })
    tafels.castShadow = !licht
    groep.add(tafels)
  }

  // ---------- lichtslingers ----------
  {
    const lampjes: THREE.Vector3[] = []
    const lampKleur: THREE.Color[] = []
    const warm = new THREE.Color('#ffd58a')
    const slinger = (a: THREE.Vector3, b: THREE.Vector3, n: number, door = 1.2) => {
      for (let i = 0; i <= n; i++) {
        const f = i / n
        lampjes.push(a.clone().lerp(b, f).setY(a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * door))
        lampKleur.push(i % 4 === 0 ? P : i % 4 === 2 ? S : warm)
      }
    }
    const paalGeo = new THREE.CylinderGeometry(0.07, 0.09, 5, 6).translate(0, 2.5, 0)
    const palen: [number, number][] = []
    for (let z = 80; z <= 108; z += 7) palen.push([-4, z], [4, z])
    for (let x = -46; x <= -32; x += 7) palen.push([x, 81], [x, 110])
    for (const [x, z] of palen) {
      deel(paalGeo, donker, x, 0, z)
      blok(x - 0.15, x + 0.15, z - 0.15, z + 0.15)
    }
    for (let z = 80; z <= 108; z += 7) slinger(v3(-4, 4.9, z), v3(4, 4.9, z), 10, 0.7)
    for (let z = 80; z < 108; z += 7) {
      slinger(v3(-4, 4.9, z), v3(4, 4.9, z + 7), 10, 0.8)
      slinger(v3(4, 4.9, z), v3(-4, 4.9, z + 7), 10, 0.8)
    }
    for (let x = -46; x <= -32; x += 7) slinger(v3(x, 4.9, 81), v3(x, 4.9, 110), 26, 1.4)
    slinger(v3(-46, 4.9, 81), v3(-32, 4.9, 81), 14, 0.6)
    slinger(v3(-46, 4.9, 110), v3(-32, 4.9, 110), 14, 0.6)
    const bol = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), lampjes.length)
    const m4 = new THREE.Matrix4()
    lampjes.forEach((p, i) => {
      m4.makeTranslation(p.x, p.y, p.z)
      bol.setMatrixAt(i, m4)
      bol.setColorAt(i, lampKleur[i])
    })
    groep.add(bol)
    lichtPlas(0, 94, 10, '#ffcf8a', 0.22)
    lichtPlas(-39, 96, 13, '#ffcf8a', 0.25)
  }

  // ---------- de feesttent ----------
  const tent = { x0: 24, x1: 52, z0: 82, z1: 104 }
  const dansers: { x: number; z: number; fase: number }[] = []
  {
    const { x0, x1, z0, z1 } = tent
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const zijH = 4.2
    const zeil = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.75, side: THREE.DoubleSide })
    // De zijwanden (de westkant blijft open), met ramen als donkere boogjes.
    const raamTex = tex(256, 64, (g) => {
      g.fillStyle = '#f8fafc'
      g.fillRect(0, 0, 256, 64)
      g.fillStyle = 'rgba(255,214,140,.85)'
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.moveTo(i * 64 + 14, 50)
        g.lineTo(i * 64 + 14, 26)
        g.quadraticCurveTo(i * 64 + 32, 6, i * 64 + 50, 26)
        g.lineTo(i * 64 + 50, 50)
        g.fill()
      }
    })
    raamTex.wrapS = THREE.RepeatWrapping
    const wand = (lengte: number, x: number, z: number, ry: number) => {
      const t = raamTex.clone()
      t.repeat.set(lengte / 7, 1)
      t.needsUpdate = true
      const m = new THREE.Mesh(new THREE.PlaneGeometry(lengte, zijH), new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, side: THREE.DoubleSide, emissive: '#3a2a10', emissiveIntensity: 0.4 }))
      m.position.set(x, zijH / 2, z)
      m.rotation.y = ry
      groep.add(m)
    }
    wand(x1 - x0, cx, z0, 0)
    wand(x1 - x0, cx, z1, 0)
    wand(z1 - z0, x1, cz, Math.PI / 2)
    blok(x0, x1, z0 - 0.15, z0 + 0.15)
    blok(x0, x1, z1 - 0.15, z1 + 0.15)
    blok(x1 - 0.15, x1 + 0.15, z0, z1)
    // Het dak: een zadeldak (langs x), met een gestreepte rand in clubkleur.
    const nok = 4.2
    const dakVorm = new THREE.Shape()
    dakVorm.moveTo(-(z1 - z0) / 2 - 0.4, 0)
    dakVorm.lineTo(0, nok)
    dakVorm.lineTo((z1 - z0) / 2 + 0.4, 0)
    dakVorm.lineTo(-(z1 - z0) / 2 - 0.4, 0)
    const dakGeo = new THREE.ExtrudeGeometry(dakVorm, { depth: x1 - x0 + 0.8, bevelEnabled: false })
    dakGeo.rotateY(Math.PI / 2)
    const dak = new THREE.Mesh(dakGeo, zeil)
    dak.position.set(x0 - 0.4, zijH, cz)
    groep.add(dak)
    const valTex = tex(256, 32, (g) => {
      g.clearRect(0, 0, 256, 32)
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? thema.primair : thema.secundair
        g.beginPath()
        g.moveTo(i * 32, 0)
        g.lineTo(i * 32 + 32, 0)
        g.lineTo(i * 32 + 32, 18)
        g.quadraticCurveTo(i * 32 + 16, 34, i * 32, 18)
        g.fill()
      }
    })
    valTex.wrapS = THREE.RepeatWrapping
    for (const [l, x, z, ry] of [
      [x1 - x0 + 0.8, cx, z0 - 0.42, 0],
      [x1 - x0 + 0.8, cx, z1 + 0.42, 0],
      [z1 - z0 + 0.8, x0 - 0.42, cz, Math.PI / 2],
    ] as const) {
      const t = valTex.clone()
      t.repeat.set(l / 2, 1)
      t.needsUpdate = true
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.7), new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, roughness: 0.7 }))
      m.position.set(x, zijH - 0.3, z)
      m.rotation.y = ry
      groep.add(m)
    }
    // Palen langs de open kant.
    for (let z = z0; z <= z1; z += (z1 - z0) / 4) deel(new THREE.CylinderGeometry(0.1, 0.1, zijH, 8).translate(0, zijH / 2, 0), staal, x0, 0, z)
    const tb = bord('🍻 FEESTTENT', 9, 1.6, thema.primair, thema.tekstOpPrimair, 'dj · bar · supporterssfeer')
    tb.position.set(x0 - 0.5, zijH + 1.6, cz)
    tb.rotation.y = -Math.PI / 2
    groep.add(tb)
    // Een houten vloer.
    const vloer = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ color: '#7a5a3a' }))
    vloer.rotation.x = -Math.PI / 2
    vloer.position.set(cx, 0.03, cz)
    groep.add(vloer)
    // Het podium met de dj, een ledwand en speakers.
    deel(rondeDoos(5, 1, 14, 0.1), donker, x1 - 2.8, 0.5, cz)
    blok(x1 - 5.3, x1, cz - 7, cz + 7)
    deel(rondeDoos(1, 1.1, 3, 0.1), new THREE.MeshStandardMaterial({ color: '#111827', emissive: thema.primair, emissiveIntensity: 0.5 }), x1 - 3.6, 1.55, cz)
    const ledC = document.createElement('canvas')
    ledC.width = 512
    ledC.height = 256
    const ledTex = new THREE.CanvasTexture(ledC)
    ledTex.colorSpace = THREE.SRGBColorSpace
    const ledWand = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.4), new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false }))
    ledWand.position.set(x1 - 0.3, 3.0, cz)
    ledWand.rotation.y = -Math.PI / 2
    groep.add(ledWand)
    for (const sz of [-1, 1]) deel(rondeDoos(1.1, 2.4, 1.1, 0.1), donker, x1 - 1.4, 2.2, cz + sz * 6.2)
    let ledT = -1
    animaties.push((s) => {
      if (s - ledT < 0.12) return
      ledT = s
      const g = ledC.getContext('2d')!
      const h = (s * 40) % 360
      const grad = g.createLinearGradient(0, 0, 512, 256)
      grad.addColorStop(0, thema.primair)
      grad.addColorStop(0.5 + 0.4 * Math.sin(s * 2), `hsl(${h},90%,55%)`)
      grad.addColorStop(1, thema.secundair)
      g.fillStyle = grad
      g.fillRect(0, 0, 512, 256)
      // Een equalizer.
      g.fillStyle = 'rgba(255,255,255,.85)'
      for (let i = 0; i < 24; i++) {
        const v = 0.25 + 0.7 * Math.abs(Math.sin(s * (3 + (i % 5)) + i * 1.7))
        g.fillRect(16 + i * 20.5, 256 - v * 120, 14, v * 120)
      }
      g.font = '900 64px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillStyle = '#ffffff'
      g.fillText(thema.kort.toUpperCase() + ' FEEST', 256, 88, 480)
      ledTex.needsUpdate = true
    })
    // Draaiende spots: lichtbundels vanaf het podium.
    const bundelGeo = new THREE.ConeGeometry(1.4, 9, 16, 1, true).translate(0, -4.5, 0)
    const bundels = [0, 1, 2, 3].map((i) => {
      const m = new THREE.Mesh(bundelGeo, plas(i % 2 ? thema.secundair : thema.primair, 0.18))
      m.position.set(x1 - 2, zijH + 1.6, cz - 4.5 + i * 3)
      groep.add(m)
      return m
    })
    animaties.push((s) => {
      bundels.forEach((b, i) => {
        b.rotation.z = -0.9 + Math.sin(s * 1.1 + i) * 0.45
        b.rotation.x = Math.sin(s * 0.8 + i * 2) * 0.5
      })
    })
    // De toog langs de noordwand, met tapkranen en een bord.
    deel(rondeDoos(14, 1.1, 1, 0.1), hout, x0 + 9, 0.55, z1 - 1.2)
    blok(x0 + 2, x0 + 16, z1 - 1.8, z1)
    for (let i = 0; i < 6; i++) deel(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), staal, x0 + 5 + i * 1.6, 1.3, z1 - 1.2)
    const bar = bord('BAR', 4, 0.9, '#0b1220', '#fde68a')
    bar.position.set(x0 + 9, 3.2, z1 - 0.25)
    groep.add(bar)
    // Biertafels in rijen, en dansers voor het podium.
    const tafelGeo = mergeGeometries([new THREE.BoxGeometry(5, 0.06, 0.7).translate(0, 0.76, 0), new THREE.BoxGeometry(5, 0.06, 0.28).translate(0, 0.45, 0.6), new THREE.BoxGeometry(5, 0.06, 0.28).translate(0, 0.45, -0.6), new THREE.BoxGeometry(0.06, 0.76, 1.4).translate(-2.2, 0.38, 0), new THREE.BoxGeometry(0.06, 0.76, 1.4).translate(2.2, 0.38, 0)])
    const rijen: [number, number][] = []
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) rijen.push([x0 + 5 + i * 7, z0 + 3 + j * 3.4])
    const bt = new THREE.InstancedMesh(tafelGeo, hout, rijen.length)
    const m4 = new THREE.Matrix4()
    rijen.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0, z)
      bt.setMatrixAt(i, m4)
      blok(x - 2.55, x + 2.55, z - 0.8, z + 0.8)
    })
    groep.add(bt)
    for (let i = 0; i < 8; i++) dansers.push({ x: x1 - 7 - toeval() * 6, z: cz - 6 + toeval() * 12, fase: toeval() * 6 })
    lichtPlas(cx, cz, 14, thema.primair, 0.22)
  }

  // ---------- het springkasteel ----------
  const kasteel = { x: -36, z: 116, w: 10 }
  const kasteelGroep = new THREE.Group()
  {
    const { x, z, w } = kasteel
    kasteelGroep.position.set(x, 0, z)
    groep.add(kasteelGroep)
    const opblaas = (kleur: string) => new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.35, metalness: 0 })
    const k1 = opblaas(thema.primair)
    const k2 = opblaas(thema.secundair)
    const geel = opblaas('#facc15')
    const voeg = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(px, py, pz)
      kasteelGroep.add(m)
      return m
    }
    voeg(rondeDoos(w, 0.7, w, 0.3), k1, 0, 0.35, 0)
    const h = w / 2
    // Wanden: dikke opgeblazen rollen, op drie kanten; de oostkant (naar het pad) is open.
    for (const [px, pz, lang, rot] of [
      [0, -h + 0.4, w, 0],
      [0, h - 0.4, w, 0],
      [-h + 0.4, 0, w, Math.PI / 2],
    ] as const) {
      for (let r = 0; r < 3; r++) {
        const m = voeg(new THREE.CapsuleGeometry(0.4, lang - 1.2, 6, 12).rotateZ(Math.PI / 2), r % 2 ? k2 : k1, px, 1.1 + r * 0.75, pz)
        m.rotation.y = rot
      }
    }
    // Hoektorens met een puntdak.
    for (const [px, pz] of [
      [-h + 0.5, -h + 0.5],
      [h - 0.5, -h + 0.5],
      [-h + 0.5, h - 0.5],
      [h - 0.5, h - 0.5],
    ]) {
      voeg(new THREE.CylinderGeometry(0.9, 1.0, 4.2, 16), k2, px, 2.6, pz)
      voeg(new THREE.ConeGeometry(1.15, 1.6, 16), geel, px, 5.5, pz)
    }
    // Een glijbaan-helling aan de open kant.
    voeg(new THREE.BoxGeometry(2.6, 0.5, 3).rotateZ(-0.22), geel, h + 1.2, 0.35, 0)
    const kb = bord('🏰 SPRINGKASTEEL', 5, 1.1, thema.primair, thema.tekstOpPrimair)
    kb.position.set(0, 4.6, -h + 0.2)
    kb.rotation.y = 0
    kasteelGroep.add(kb)
    const kb2 = kb.clone()
    kb2.position.set(0, 4.6, h - 0.2)
    kasteelGroep.add(kb2)
    blok(x - h, x + h, z - h, z - h + 0.85)
    blok(x - h, x + h, z + h - 0.85, z + h)
    blok(x - h, x - h + 0.85, z - h, z + h)
    blok(x + h - 1.4, x + h, z - h, z - h + 1.4)
    blok(x + h - 1.4, x + h, z + h - 1.4, z + h)
    // Kinderen die springen.
    const kids = [0, 1, 2].map((i) => {
      const k = new THREE.Group()
      const lijf = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.75, 8).translate(0, 0.38, 0), opblaas(['#ef4444', '#22c55e', '#a855f7'][i]))
      const kop = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8).translate(0, 0.9, 0), opblaas('#e0ac69'))
      k.add(lijf, kop)
      k.position.set(-1.5 + i * 1.6, 0.7, -1 + i)
      kasteelGroep.add(k)
      return k
    })
    animaties.push((s) => {
      kids.forEach((k, i) => (k.position.y = 0.7 + Math.abs(Math.sin(s * 3.1 + i * 1.3)) * 1.1))
      // Het kasteel ademt een beetje (opgeblazen).
      kasteelGroep.scale.y = 1 + Math.sin(s * 2.2) * 0.012
    })
    lichtPlas(x, z, 8, thema.secundair, 0.2)
  }

  // ---------- de draaimolen (met krachtballen in plaats van paarden) ----------
  let draaimolen: Rit | null = null
  {
    const MX = 38
    const MZ = 116
    const molen = new THREE.Group()
    molen.position.set(MX, 0, MZ)
    groep.add(molen)
    const draait = new THREE.Group()
    molen.add(draait)
    // Een klassieke kermismolen: een houten draaivloer met een gouden rand en een sierrok, een
    // spiegelzuil met gouden lijsten, gouden palen, een gestreepte kap met een geschulpte rand in de
    // clubkleuren, een gouden bol bovenop, en overal lampjes. Goud en spiegels weerspiegelen de
    // nacht (één gedeelde omgevingstextuur, geen echte lampen).
    const env = nachtOmgeving()
    const goud = new THREE.MeshStandardMaterial({ color: '#d9a93c', metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.6 })
    const spiegelMat = new THREE.MeshStandardMaterial({ color: '#cfd8e6', metalness: 1, roughness: 0.04, envMap: env, envMapIntensity: 2.2 })
    // De vloer: planken in een waaier, gelakt hout.
    const planken = tex(512, 512, (g) => {
      g.fillStyle = '#6b3a1f'
      g.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 36; i++) {
        const a0 = (i / 36) * Math.PI * 2
        const a1 = ((i + 1) / 36) * Math.PI * 2
        const l = 95 + ((i * 37) % 30)
        g.fillStyle = `rgb(${l + 40},${l - 10},${l - 50})`
        g.beginPath()
        g.moveTo(256, 256)
        g.arc(256, 256, 256, a0, a1)
        g.closePath()
        g.fill()
      }
      g.strokeStyle = 'rgba(40,20,8,.6)'
      g.lineWidth = 2
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2
        g.beginPath()
        g.moveTo(256, 256)
        g.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256)
        g.stroke()
      }
      // Een rozet in het midden en een ring in clubkleur.
      g.strokeStyle = thema.primair
      g.lineWidth = 14
      g.beginPath()
      g.arc(256, 256, 200, 0, Math.PI * 2)
      g.stroke()
    })
    const vloer = new THREE.Mesh(new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: planken, roughness: 0.35, metalness: 0.1, envMap: env, envMapIntensity: 0.5 }))
    draait.add(vloer)
    // De sierrok rond de vloer: panelen in clubkleur met een gouden lijst, en een gouden boord.
    const rok = tex(1024, 64, (g) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? thema.primair : thema.secundair
        g.fillRect(i * 64, 0, 64, 64)
        g.strokeStyle = '#e8c15a'
        g.lineWidth = 5
        g.strokeRect(i * 64 + 6, 8, 52, 48)
      }
    })
    draait.add(new THREE.Mesh(new THREE.CylinderGeometry(6, 6.1, 0.5, 48, 1, true).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ map: rok, roughness: 0.4, side: THREE.DoubleSide })))
    draait.add(new THREE.Mesh(new THREE.TorusGeometry(6.02, 0.07, 6, 64).rotateX(Math.PI / 2).translate(0, 0.5, 0), goud))
    draait.add(new THREE.Mesh(new THREE.TorusGeometry(6.08, 0.05, 6, 64).rotateX(Math.PI / 2).translate(0, 0.03, 0), goud))
    // De middenzuil: spiegelpanelen tussen gouden stijlen, met een gouden voet en kroon.
    const N = 8
    const zuilR = 1.25
    const zuil = new THREE.Mesh(new THREE.CylinderGeometry(zuilR, zuilR, 3.6, N).translate(0, 2.55, 0), spiegelMat)
    draait.add(zuil)
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const stijl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.6, 0.1).translate(0, 2.55, 0), goud)
      stijl.position.set(Math.sin(a) * zuilR, 0, Math.cos(a) * zuilR)
      draait.add(stijl)
    }
    draait.add(new THREE.Mesh(new THREE.CylinderGeometry(zuilR + 0.2, zuilR + 0.28, 0.35, 24).translate(0, 0.68, 0), goud))
    draait.add(new THREE.Mesh(new THREE.CylinderGeometry(zuilR + 0.28, zuilR + 0.12, 0.4, 24).translate(0, 4.5, 0), goud))
    // De kap: banen in clubkleur en wit, de geschulpte rand (valance) en een gouden bol bovenop.
    const streep = tex(512, 64, (g) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : thema.primair
        g.fillRect(i * 32, 0, 32, 64)
      }
    })
    const kap = new THREE.Mesh(new THREE.ConeGeometry(6.8, 2.6, 32, 1, true).translate(0, 6.0, 0), new THREE.MeshStandardMaterial({ map: streep, side: THREE.DoubleSide, roughness: 0.5 }))
    draait.add(kap)
    // De binnenkant van de kap: donkerder, zodat de lampjes eronder oplichten.
    draait.add(new THREE.Mesh(new THREE.ConeGeometry(6.75, 2.55, 32, 1, true).translate(0, 5.98, 0), new THREE.MeshStandardMaterial({ color: thema.secundair, side: THREE.BackSide, roughness: 0.7 })))
    const schulp = tex(1024, 128, (g) => {
      g.clearRect(0, 0, 1024, 128)
      for (let i = 0; i < 24; i++) {
        const x = i * (1024 / 24)
        const w = 1024 / 24
        g.fillStyle = i % 2 ? thema.secundair : thema.primair
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x + w, 0)
        g.lineTo(x + w, 64)
        g.arc(x + w / 2, 64, w / 2, 0, Math.PI)
        g.closePath()
        g.fill()
        g.strokeStyle = '#e8c15a'
        g.lineWidth = 4
        g.beginPath()
        g.arc(x + w / 2, 64, w / 2 - 4, 0, Math.PI)
        g.stroke()
      }
      g.fillStyle = '#e8c15a'
      g.fillRect(0, 0, 1024, 10)
    })
    draait.add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(6.82, 6.82, 0.95, 48, 1, true).translate(0, 4.3, 0),
        new THREE.MeshStandardMaterial({ map: schulp, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45 }),
      ),
    )
    draait.add(new THREE.Mesh(new THREE.TorusGeometry(6.82, 0.06, 6, 64).rotateX(Math.PI / 2).translate(0, 4.78, 0), goud))
    draait.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12).translate(0, 7.55, 0), goud))
    draait.add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 10).translate(0, 8.2, 0), goud))
    const vlag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45).translate(0.4, 8.25, 0), new THREE.MeshStandardMaterial({ color: thema.primair, side: THREE.DoubleSide, roughness: 0.6 }))
    draait.add(vlag)
    // Gouden palen met een kraag waar ze de bal raken.
    const ballen: THREE.Mesh[] = []
    const kleuren = ['#f97316', '#facc15', '#dc2626', '#2563eb', '#f8fafc']
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const x = Math.sin(a) * 4.4
      const z = Math.cos(a) * 4.4
      const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4, 8).translate(0, 2.4, 0), goud)
      paal.position.set(x, 0, z)
      draait.add(paal)
      const bal = new THREE.Mesh(krachtbalGeometrie(0.55, 0.5), new THREE.MeshStandardMaterial({ map: krachtbalTextuur(kleuren[i % 5]), roughness: 0.4, envMap: env, envMapIntensity: 0.6 }))
      bal.position.set(x, 1.6, z)
      draait.add(bal)
      ballen.push(bal)
    }
    // Lampjes: langs de rand van de kap, in stralen onder de kap, rond de zuilkroon en langs de vloer.
    const lampPos: [number, number, number][] = []
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      lampPos.push([Math.sin(a) * 6.9, 4.62, Math.cos(a) * 6.9])
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      for (let j = 1; j <= 6; j++) {
        const r = 1.6 + j * 0.85
        lampPos.push([Math.sin(a) * r, 7.25 - (r / 6.8) * 2.6 - 0.08, Math.cos(a) * r])
      }
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      lampPos.push([Math.sin(a) * (zuilR + 0.3), 4.72, Math.cos(a) * (zuilR + 0.3)])
      lampPos.push([Math.sin(a) * 6.1, 0.28, Math.cos(a) * 6.1])
    }
    const lampRing = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffe9b8', toneMapped: false }), lampPos.length)
    const m4 = new THREE.Matrix4()
    lampPos.forEach(([x, y, z], i) => {
      m4.makeTranslation(x, y, z)
      lampRing.setMatrixAt(i, m4)
    })
    draait.add(lampRing)
    // Een warme gloed onder de kap, op de vloer (nep-licht).
    const gloedC = tex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      gr.addColorStop(0, 'rgba(255,214,150,.55)')
      gr.addColorStop(1, 'rgba(255,214,150,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 64, 64)
    })
    draait.add(new THREE.Mesh(new THREE.CircleGeometry(6, 40).rotateX(-Math.PI / 2).translate(0, 0.52, 0), new THREE.MeshBasicMaterial({ map: gloedC, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))
    blok(MX - 6.4, MX + 6.4, MZ - 6.4, MZ + 6.4)
    const mb = bord('🎠 DRAAIMOLEN', 4.6, 1, '#0b1220', '#fde68a')
    mb.position.set(MX - 7.2, 2.2, MZ)
    mb.rotation.y = -Math.PI / 2
    groep.add(mb)
    deel(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6).translate(0, 1.1, 0), donker, MX - 7.2, 0, MZ)
    // De rit: je zit op een krachtbal die op en neer gaat, en draait mee.
    const DUUR = 36
    let nu = 0
    let mijn = -1
    let start = 0
    let uitstap: { x: number; z: number; yaw: number } | null = null
    let draaiNul: number | null = null
    animaties.push((s, dt) => {
      nu = s
      draait.rotation.y += dt * 0.55
      ballen.forEach((b, i) => {
        b.position.y = 1.6 + Math.sin(s * 2 + i * 1.3) * 0.45
        // Op jouw bal zit jij: die draait niet rond zijn as.
        if (i !== mijn) b.rotation.y += dt * 1.5
      })
      if (mijn >= 0 && s - start > DUUR) {
        mijn = -1
        uitstap = { x: MX - 7.8, z: MZ + 1.2, yaw: Math.PI / 2 }
      }
    })
    const tmp = new THREE.Vector3()
    draaimolen = {
      id: 'draaimolen',
      actie: '🎠 Stap op de draaimolen',
      bij: (x, z) => mijn < 0 && Math.hypot(x - (MX - 7.8), z - (MZ + 1.2)) < 2.2,
      stapIn() {
        // De bal die het dichtst bij de ingang (de westkant) staat.
        let beste = 0
        let min = Infinity
        ballen.forEach((b, i) => {
          b.getWorldPosition(tmp)
          const d = Math.hypot(tmp.x - (MX - 6.4), tmp.z - MZ)
          if (d < min) {
            min = d
            beste = i
          }
        })
        mijn = beste
        start = nu
        draaiNul = null
      },
      inRit: () => mijn >= 0,
      info() {
        if (mijn < 0) return null
        const rest = Math.max(0, Math.ceil(DUUR - (nu - start)))
        return { titel: '🎠 Op de draaimolen', regel: `je zit op een krachtbal · nog ${rest} s · sleep om rond te kijken`, rest, magUit: nu - start > 3 }
      },
      camera(camera, yaw, pitch) {
        if (mijn < 0) return
        ballen[mijn].getWorldPosition(tmp)
        camera.position.set(tmp.x, tmp.y + 1.3, tmp.z)
        // Bij het opstappen kijk je naar buiten (niet tegen de spiegelzuil); daarna draait je
        // kijkrichting mee met de molen.
        if (draaiNul == null) draaiNul = Math.atan2(tmp.x - MX, tmp.z - MZ) + 0.5 - yaw - draait.rotation.y
        const y = yaw + draaiNul + draait.rotation.y
        camera.lookAt(tmp.x + Math.sin(y) * Math.cos(pitch), camera.position.y + Math.sin(pitch), tmp.z + Math.cos(y) * Math.cos(pitch))
      },
      stapUit() {
        mijn = -1
        uitstap = { x: MX - 7.8, z: MZ + 1.2, yaw: Math.PI / 2 }
      },
      uitgestapt() {
        const u = uitstap
        uitstap = null
        return u
      },
    }
    lichtPlas(MX, MZ, 9, '#ffe2a8', 0.28)
  }

  // ---------- krachtmeter en schminkstand, aan de poort ----------
  let krachtmeter: Kermisspel | null = null
  {
    const KX = -12
    const KZ = 83
    deel(rondeDoos(1.6, 0.3, 1.6, 0.1), donker, KX, 0.15, KZ)
    deel(rondeDoos(0.6, 6, 0.4, 0.1), clubMat, KX, 3.2, KZ + 0.5)
    const schaal = tex(64, 512, (g) => {
      const grad = g.createLinearGradient(0, 512, 0, 0)
      grad.addColorStop(0, '#22c55e')
      grad.addColorStop(0.5, '#facc15')
      grad.addColorStop(1, '#ef4444')
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 512)
      g.fillStyle = '#111'
      for (let i = 1; i < 10; i++) g.fillRect(0, i * 51, 64, 4)
    })
    const sch = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5.2), new THREE.MeshBasicMaterial({ map: schaal, toneMapped: false }))
    sch.position.set(KX, 3.3, KZ + 0.29)
    sch.rotation.y = Math.PI
    groep.add(sch)
    const bel = deel(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.9, roughness: 0.2, emissive: '#fbbf24', emissiveIntensity: 0 }), KX, 6.3, KZ + 0.5)
    const schuif = deel(new THREE.BoxGeometry(0.5, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), KX, 0.8, KZ + 0.2)
    const kb = bord('💪 KRACHTMETER', 3.2, 0.8, '#0b1220', '#fde68a')
    kb.position.set(KX, 7.1, KZ + 0.5)
    kb.rotation.y = Math.PI
    groep.add(kb)
    blok(KX - 0.8, KX + 0.8, KZ - 0.8, KZ + 0.8)
    // Een hamer op de sokkel.
    const hamer = new THREE.Group()
    hamer.position.set(KX + 1.1, 0, KZ - 0.6)
    hamer.rotation.z = 0.25
    groep.add(hamer)
    hamer.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6).translate(0, 0.55, 0), hout))
    hamer.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 12).rotateZ(Math.PI / 2).translate(0, 1.15, 0), donker))
    // Jouw slag: de schuif vliegt tot `kracht` en valt terug; vanaf 0,94 rinkelt de bel.
    let slag = { t: -10, kracht: 0 }
    let nu = 0
    animaties.push((s) => {
      nu = s
      const sinds = s - slag.t
      let h: number
      let raak: boolean
      if (sinds < 1.4) {
        h = sinds < 0.35 ? Math.sin((sinds / 0.35) * (Math.PI / 2)) * slag.kracht : slag.kracht * Math.max(0, 1 - ((sinds - 0.35) / 1.05) ** 2)
        raak = slag.kracht >= 0.94 && sinds > 0.3 && sinds < 1.1
        hamer.rotation.z = sinds < 0.15 ? 0.25 - sinds * 8 : -0.95 + Math.min(1.2, (sinds - 0.15) * 2)
      } else {
        // Anders slaat er om de 5 s iemand anders (soms tot de bel).
        const f = (s % 5) / 5
        const sterk = 0.55 + 0.45 * Math.abs(Math.sin(Math.floor(s / 5) * 7.3))
        h = f < 0.25 ? Math.sin((f / 0.25) * Math.PI) * sterk : 0
        raak = sterk > 0.93 && f > 0.1 && f < 0.3
        hamer.rotation.z = 0.25
      }
      schuif.position.y = 0.8 + h * 5.3
      ;(bel.material as THREE.MeshStandardMaterial).emissiveIntensity = raak ? 1.5 + Math.sin(s * 40) * 0.5 : 0.05
    })
    krachtmeter = {
      id: 'krachtmeter',
      naam: 'Krachtmeter',
      actie: '💪 Sla op de krachtmeter',
      uitleg: 'De meter gaat op en neer: sla als hij bovenaan staat. Haal je de bel?',
      knop: '🔨 Sla!',
      meter: true,
      // Een paar stappen ervoor, zodat je de hele toren en de bel ziet.
      bij: (x, z) => Math.hypot(x - KX, z - (KZ - 3.4)) < 2.2,
      speel(kracht) {
        const k = Math.max(0, Math.min(1, kracht))
        slag = { t: nu, kracht: k }
        if (k >= 0.94) return { tekst: '🔔 DING! De bel rinkelt — jij bent de sterkste van het fandorp!', goed: true }
        if (k >= 0.8) return { tekst: `💪 ${Math.round(k * 100)}%: bijna de bel! Nog een tikje harder.`, goed: true }
        if (k >= 0.55) return { tekst: `👍 ${Math.round(k * 100)}%: een stevige slag.`, goed: true }
        if (k >= 0.3) return { tekst: `🙂 ${Math.round(k * 100)}%: dat kan beter, sla bovenaan!`, goed: false }
        return { tekst: `🐣 ${Math.round(k * 100)}%: kuikenkracht… probeer opnieuw!`, goed: false }
      },
    }
    // De schminkstand: een paviljoentje met een spiegel en een stoel.
    const SX = 12
    const SZ = 83
    for (const [dx, dz] of [
      [-1.6, -1.6],
      [1.6, -1.6],
      [-1.6, 1.6],
      [1.6, 1.6],
    ])
      deel(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0), staal, SX + dx, 0, SZ + dz)
    const dakStreep = tex(256, 32, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : thema.secundair
        g.fillRect(i * 32, 0, 32, 32)
      }
    })
    deel(new THREE.ConeGeometry(2.6, 1.4, 4, 1).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ map: dakStreep, roughness: 0.6 }), SX, 3.3, SZ)
    deel(new THREE.BoxGeometry(1.4, 0.8, 0.6), witMat, SX, 0.4, SZ + 1.1)
    deel(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 12).translate(0, 0.25, 0), clubMat, SX, 0, SZ)
    const sb = bord('🎨 SCHMINK', 3, 0.7, thema.secundair, '#0b1220', 'clubkleuren op je wangen')
    sb.position.set(SX, 2.75, SZ - 1.62)
    groep.add(sb)
    blok(SX - 1.7, SX + 1.7, SZ - 1.7, SZ + 1.7)
  }

  // ---------- de tv-wagen op het plein (naast het stadion) ----------
  {
    const TX = 64
    const TZ = 18
    deel(rondeDoos(2.6, 3.2, 9, 0.3), witMat, TX, 1.9, TZ)
    deel(rondeDoos(2.5, 2.2, 2.2, 0.3), witMat, TX, 1.4, TZ - 5.4)
    const streep = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.5, 9.02), clubMat)
    streep.position.set(TX, 1.6, TZ)
    groep.add(streep)
    for (const dz of [-5.2, -2.5, 2.5, 3.6]) for (const sx of [-1, 1]) deel(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14).rotateZ(Math.PI / 2), donker, TX + sx * 1.15, 0.5, TZ + dz)
    // De schotel op het dak.
    const schotel = new THREE.Group()
    schotel.position.set(TX, 3.8, TZ + 2)
    groep.add(schotel)
    schotel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8).translate(0, 0.45, 0), staal))
    const kom = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 10, 0, Math.PI * 2, 0, 0.9).rotateX(-Math.PI / 2 - 0.6), new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }))
    kom.position.y = 1.4
    schotel.add(kom)
    // Een telescoopmast met een lampje.
    deel(new THREE.CylinderGeometry(0.08, 0.12, 6, 8).translate(0, 3, 0), staal, TX, 3.5, TZ - 2.8)
    const knipper = deel(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: '#ef4444', toneMapped: false }), TX, 9.6, TZ - 2.8)
    const tv = bord('📺 LIVE · KRACHTBAL TV', 7.5, 0.95, '#0b1220', '#ffffff')
    tv.position.set(TX - 1.32, 2.6, TZ)
    tv.rotation.y = -Math.PI / 2
    groep.add(tv)
    blok(TX - 1.4, TX + 1.4, TZ - 6.6, TZ + 4.6)
    // Kabels over de grond naar het stadion.
    const kabel = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(TX - 1, 0.05, TZ + 3), v3(TX - 6, 0.05, TZ + 6), v3(TX - 12, 0.05, TZ + 3)]), 20, 0.05, 5), donker)
    groep.add(kabel)
    animaties.push((s) => {
      knipper.visible = Math.floor(s * 1.5) % 2 === 0
      schotel.rotation.y = Math.sin(s * 0.1) * 0.15 - 0.4
    })
  }

  // ---------- de kermis: zweefmolen, botsauto's, kraampjes en de rest (zie kermis.ts) ----------
  const kermis = bouwKermis(
    { groep, thema, licht, toeval, blok, deel, bord, tex, lichtPlas, animaties, mat: { club: clubMat, club2: club2Mat, wit: witMat, staal, donker, hout } },
    (t) => opt.melding?.(t),
  )

  // ---------- het publiek ----------
  {
    type Mens = { x: number; z: number; ry: number; danst: boolean; fase: number }
    const mensen: Mens[] = []
    for (const t of trucks) for (let i = 0; i < 1; i++) mensen.push({ x: truckX + 3.2 + i * 0.9, z: t.z + 0.4 + (toeval() - 0.5) * 0.8, ry: -Math.PI / 2, danst: false, fase: 0 })
    for (const d of dansers) mensen.push({ x: d.x, z: d.z, ry: Math.PI / 2, danst: true, fase: d.fase })
    // Rond de tafels, langs het pad, aan het rad en de draaimolen.
    const rondom: [number, number, number][] = [
      [-44, 87, 3],
      [-38, 99, 3],
      [0, 88, 4],
      [2, 104, 3],
      [-6, 109, 2],
      [30, 110, 3],
      [-28, 108, 2],
      [10, 96, 3],
      [-14, 92, 2],
    ]
    for (const [cx, cz, n] of rondom)
      for (let i = 0; i < n; i++) {
        const x = cx + (toeval() - 0.5) * 6
        const z = cz + (toeval() - 0.5) * 5
        if (obstakels.some((o) => x > o.x0 - 0.4 && x < o.x1 + 0.4 && z > o.z0 - 0.4 && z < o.z1 + 0.4)) continue
        mensen.push({ x, z, ry: toeval() * Math.PI * 2, danst: toeval() < 0.15, fase: toeval() * 6 })
      }
    // Een rij aan het reuzenrad.
    for (let i = 0; i < 3; i++) mensen.push({ x: RAD.x + 1.6 + i * 0.75, z: RAD.z - 6.5, ry: Math.PI / 2, danst: false, fase: 0 })
    // Divers volk (volk.ts): wie danst, springt met de armen omhoog of stapt ter plaatse mee.
    const volk = bouwVolk(mensen.length, {
      toeval,
      primair: P,
      secundair: S,
      soort: (i) => (mensen[i].danst ? (toeval() < 0.55 ? 'juicher' : (['man', 'vrouwRok', 'vrouwBroek'] as const)[Math.floor(toeval() * 3)]) : undefined),
    })
    mensen.forEach((m, i) => {
      volk.zet(i, m.x, 0, m.z, m.ry)
      volk.houding(i, m.danst ? (volk.soort(i) === 'juicher' ? 'juichen' : 'stappen') : 'staan', 0.5)
    })
    volk.klaar()
    groep.add(volk.groep)
    animaties.push((s) => volk.update(s))
  }

  return {
    obstakels,
    springkasteel(x, z) {
      const h = kasteel.w / 2 - 0.85
      const dx = Math.abs(x - kasteel.x)
      const dz = Math.abs(z - kasteel.z)
      if (dx > h + 0.6 || dz > h) return 0
      return Math.max(0.35, 1 - Math.hypot(dx, dz) / (h * 1.6))
    },
    ritten: [rad, draaimolen!, ...kermis.ritten],
    spellen: [krachtmeter!, ...kermis.spellen],
    update(s, dt) {
      for (const a of animaties) a(s, dt)
    },
  }
}
