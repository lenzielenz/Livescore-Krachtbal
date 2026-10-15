import * as THREE from 'three'

import { rondeDoos } from './rond'

// Extra inrichting voor de kelder, zodat de grote zalen niet leeg aanvoelen en elk zijn eigen
// "ding" heeft:
//  • fitness: een boksring met touwen in clubkleur en een rij bokszakken;
//  • zwembad: een duiktoren (1 m en 3 m), een poolbar met krukken en palmen, en opblaasfiguren
//    die rondjes drijven;
//  • gaming: een esportspodium met een gebogen reuzescherm en twee teambureaus, en drie
//    racesimulators;
//  • sauna & wellness: een gloeiende zoutwand, een ijsbad, en hangende eierstoelen.
// Alles wordt enkel neergezet waar nog plaats is (niet op bestaand meubilair, niet voor een deur).

export type Rechthoek = { x0: number; x1: number; z0: number; z1: number }
type Zaal = Rechthoek & { deuren: { x: number; z: number }[] }

export function bouwKelderinrichting(
  groep: THREE.Group,
  opt: {
    Y: number
    thema: { primair: string; secundair: string; naam: string }
    licht: boolean
    meubels: Rechthoek[]
    fitness: Zaal
    zwembad: Zaal & { bad: Rechthoek & { y: number } }
    gaming: Zaal
    sauna: Zaal
  },
): { update: (seconden: number) => void } {
  const { Y, thema, meubels } = opt
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = groep) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, Y + y, z)
    p.add(m)
    return m
  }
  const tekst = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    teken(c.getContext('2d')!)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const primair = new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.5 })
  const secundair = new THREE.MeshStandardMaterial({ color: thema.secundair, roughness: 0.5 })
  const zwart = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 })
  const chroom = new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.9, roughness: 0.2 })
  const neon = (kleur: string) => new THREE.MeshBasicMaterial({ color: kleur, toneMapped: false })

  /** Zoek een vrije plek (middelpunt) voor iets van b × d in de zaal, het dichtst bij `wens`. */
  const plek = (z: Zaal, b: number, d: number, wens: { x: number; z: number }, marge = 0.7): { x: number; z: number } | null => {
    const kandidaten: { x: number; z: number; afst: number }[] = []
    for (let x = z.x0 + b / 2 + 0.8; x <= z.x1 - b / 2 - 0.8; x += 0.5)
      for (let zz = z.z0 + d / 2 + 0.8; zz <= z.z1 - d / 2 - 0.8; zz += 0.5) kandidaten.push({ x, z: zz, afst: Math.hypot(x - wens.x, zz - wens.z) })
    kandidaten.sort((a, c) => a.afst - c.afst)
    for (const k of kandidaten) {
      const r = { x0: k.x - b / 2 - marge, x1: k.x + b / 2 + marge, z0: k.z - d / 2 - marge, z1: k.z + d / 2 + marge }
      if (meubels.some((m) => m.x0 < r.x1 && m.x1 > r.x0 && m.z0 < r.z1 && m.z1 > r.z0)) continue
      if (z.deuren.some((dr) => dr.x > r.x0 - 2.5 && dr.x < r.x1 + 2.5 && dr.z > r.z0 - 3.5 && dr.z < r.z1 + 3.5)) continue
      return { x: k.x, z: k.z }
    }
    return null
  }
  const bezet = (x: number, z: number, b: number, d: number) => meubels.push({ x0: x - b / 2, x1: x + b / 2, z0: z - d / 2, z1: z + d / 2 })
  const anim: ((s: number) => void)[] = []

  // ---------- 🥊 fitness: boksring en bokszakken ----------
  {
    const F = opt.fitness
    const p = plek(F, 6.4, 6.4, { x: (F.x0 + F.x1) / 2, z: (F.z0 + F.z1) / 2 })
    if (p) {
      const R = 6
      deel(rondeDoos(R + 0.4, 0.9, R + 0.4, 0.06), zwart, p.x, 0.45, p.z)
      const canvas = tekst(512, 512, (g) => {
        g.fillStyle = '#1e3a8a'
        g.fillRect(0, 0, 512, 512)
        g.fillStyle = 'rgba(255,255,255,.08)'
        g.fillRect(40, 40, 432, 432)
        g.fillStyle = '#ffffff'
        g.font = '900 64px Inter, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(thema.naam.toUpperCase().slice(0, 16), 256, 256, 460)
      })
      deel(new THREE.PlaneGeometry(R, R).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvas, roughness: 0.8 }), p.x, 0.905, p.z)
      // Hoekpalen met kussens, en drie touwen in de clubkleuren.
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        deel(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 10), chroom, p.x + (sx * R) / 2, 1.65, p.z + (sz * R) / 2)
        deel(rondeDoos(0.22, 1.1, 0.22, 0.06), sx * sz > 0 ? primair : secundair, p.x + (sx * R) / 2 - sx * 0.12, 1.65, p.z + (sz * R) / 2 - sz * 0.12)
      }
      const touwMat = [primair, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), secundair]
      for (let t = 0; t < 3; t++) {
        const y = 1.35 + t * 0.35
        for (const [ax, az, bx, bz] of [
          [-1, -1, 1, -1],
          [1, -1, 1, 1],
          [1, 1, -1, 1],
          [-1, 1, -1, -1],
        ]) {
          const l = R
          const touw = deel(new THREE.CylinderGeometry(0.025, 0.025, l, 8), touwMat[t], p.x + ((ax + bx) / 4) * R, y, p.z + ((az + bz) / 4) * R)
          if (az === bz) touw.rotation.z = Math.PI / 2
          else touw.rotation.x = Math.PI / 2
        }
      }
      // Een spot recht boven de ring.
      const plas = deel(new THREE.CircleGeometry(3.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#dbeafe', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending }), p.x, 0.92, p.z)
      plas.renderOrder = 1
      bezet(p.x, p.z, R + 0.6, R + 0.6)
    }
    // Bokszakken aan een balk.
    const q = plek(F, 7, 1.4, { x: F.x0 + 4, z: F.z1 - 4 })
    if (q) {
      deel(new THREE.BoxGeometry(7, 0.12, 0.12), zwart, q.x, 3.6, q.z)
      const zakken: THREE.Group[] = []
      for (let i = 0; i < 5; i++) {
        const g = new THREE.Group()
        g.position.set(q.x - 2.8 + i * 1.4, Y + 3.55, q.z)
        groep.add(g)
        const ketting = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), chroom)
        ketting.position.y = -0.25
        const zak = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 14), i % 2 ? zwart : primair)
        zak.position.y = -1.1
        g.add(ketting, zak)
        zakken.push(g)
      }
      anim.push((s) => zakken.forEach((g, i) => (g.rotation.z = Math.sin(s * 1.3 + i * 1.7) * 0.04)))
      bezet(q.x, q.z, 7, 1)
    }
  }

  // ---------- 🏊 zwembad: duiktoren, poolbar, opblaasfiguren ----------
  {
    const Z = opt.zwembad
    const bad = Z.bad
    // De duiktoren aan de korte kant van het bad (oost), met planken die over het water steken.
    const tx = bad.x1 + 1.6
    const tz = (bad.z0 + bad.z1) / 2
    if (tx + 1.5 < Z.x1) {
      const wit = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.4 })
      deel(rondeDoos(1.6, 3.0, 1.6, 0.06), wit, tx + 0.4, 1.5, tz)
      deel(rondeDoos(0.5, 3.2, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.5 }), tx + 1.35, 1.6, tz)
      for (const [h, lang] of [
        [1.0, 3.2],
        [3.0, 3.8],
      ]) {
        const plank = deel(rondeDoos(lang, 0.08, 0.55, 0.03), new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4 }), tx - lang / 2 + 0.6, h + 0.04, tz + (h > 2 ? 0.45 : -0.45))
        plank.userData.veer = h
      }
      // Een trapje en een leuning op de top.
      for (let t = 0; t < 8; t++) deel(new THREE.BoxGeometry(0.4, 0.05, 0.25), chroom, tx + 1.35, 0.35 + t * 0.37, tz + 0.55)
      deel(new THREE.BoxGeometry(1.6, 0.04, 0.04), chroom, tx + 0.4, 3.9, tz - 0.8)
      const bord = deel(
        new THREE.PlaneGeometry(1.3, 0.45),
        new THREE.MeshBasicMaterial({
          map: tekst(256, 88, (g) => {
            g.fillStyle = '#0c4a6e'
            g.fillRect(0, 0, 256, 88)
            g.fillStyle = '#fff'
            g.font = '900 44px Inter, sans-serif'
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText('1 m · 3 m', 128, 46)
          }),
          toneMapped: false,
        }),
        tx - 0.41,
        2.2,
        tz,
      )
      bord.rotation.y = -Math.PI / 2
      bezet(tx + 0.6, tz, 2.4, 2)
    }
    // De poolbar: een ronde toog met krukken, een rieten dak en twee palmen.
    const pb = plek(Z, 5, 5, { x: Z.x0 + 6, z: Z.z1 - 6 })
    if (pb) {
      const hout = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.7 })
      deel(new THREE.CylinderGeometry(1.4, 1.4, 1.05, 32, 1, true), hout, pb.x, 0.52, pb.z).material.side = THREE.DoubleSide
      deel(new THREE.TorusGeometry(1.45, 0.1, 8, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.2 }), pb.x, 1.08, pb.z)
      deel(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), hout, pb.x, 2.2, pb.z)
      const dak = deel(new THREE.ConeGeometry(2.4, 1.1, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#d6b46a', roughness: 0.95, side: THREE.DoubleSide }), pb.x, 3.5, pb.z)
      dak.rotation.y = 0.3
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const k = new THREE.Group()
        k.position.set(pb.x + Math.cos(a) * 2.0, Y, pb.z + Math.sin(a) * 2.0)
        groep.add(k)
        const poot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), chroom)
        poot.position.y = 0.38
        const zit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), primair)
        zit.position.y = 0.78
        k.add(poot, zit)
      }
      // Cocktails op de toog.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3
        deel(new THREE.CylinderGeometry(0.05, 0.03, 0.14, 10), new THREE.MeshStandardMaterial({ color: ['#f97316', '#22d3ee', '#ec4899', '#a3e635', '#facc15'][i], transparent: true, opacity: 0.85, roughness: 0.1 }), pb.x + Math.cos(a) * 1.4, 1.2, pb.z + Math.sin(a) * 1.4)
      }
      bezet(pb.x, pb.z, 3.2, 3.2)
      // Palmen ernaast.
      for (const [dx, dz] of [
        [2.8, -1.8],
        [-2.6, 2.2],
      ]) {
        const x = pb.x + dx
        const z = pb.z + dz
        if (x < Z.x0 + 1 || x > Z.x1 - 1 || z < Z.z0 + 1 || z > Z.z1 - 1) continue
        const stam = deel(new THREE.CylinderGeometry(0.12, 0.2, 4.2, 8), new THREE.MeshStandardMaterial({ color: '#7c5a3a', roughness: 0.9 }), x, 2.1, z)
        stam.rotation.z = 0.12
        const blad = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.7, side: THREE.DoubleSide })
        for (let i = 0; i < 7; i++) {
          const b = deel(new THREE.PlaneGeometry(0.5, 2.2), blad, x + 0.25, 4.2, z)
          b.rotation.set(-1.0, (i / 7) * Math.PI * 2, 0)
          b.geometry.translate(0, 1.1, 0)
        }
        bezet(x, z, 0.6, 0.6)
      }
    }
    // Opblaasfiguren in het water: een flamingo, een donut en een krachtbal.
    const drijvers: { m: THREE.Object3D; fase: number }[] = []
    const water = bad.y + 0.05
    const maakDonut = (kleur: string) => new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 12, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.3 }))
    const flamingo = new THREE.Group()
    flamingo.add(maakDonut('#f472b6'))
    const nek = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 10), new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.3 }))
    nek.position.set(0.5, 0.45, 0)
    nek.rotation.z = -0.25
    const kop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), nek.material)
    kop.position.set(0.62, 0.92, 0)
    flamingo.add(nek, kop)
    const donut = maakDonut('#fbbf24')
    const bal = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.3 }))
    for (const [i, m] of [flamingo, donut, bal].entries()) {
      groep.add(m)
      drijvers.push({ m, fase: i * 2.1 })
    }
    const bx = (bad.x0 + bad.x1) / 2
    const bz = (bad.z0 + bad.z1) / 2
    const rx = (bad.x1 - bad.x0) * 0.32
    const rz = (bad.z1 - bad.z0) * 0.3
    anim.push((s) =>
      drijvers.forEach(({ m, fase }) => {
        const a = s * 0.05 + fase
        m.position.set(bx + Math.cos(a) * rx, Y + water + Math.sin(s * 1.6 + fase) * 0.04 - 0.02, bz + Math.sin(a * 1.3) * rz)
        m.rotation.y = s * 0.1 + fase
      }),
    )
  }

  // ---------- 🎮 gaming: esportspodium en racesimulators ----------
  {
    const G = opt.gaming
    const pd = plek(G, 9, 4, { x: (G.x0 + G.x1) / 2, z: G.z0 + 3 })
    if (pd) {
      deel(rondeDoos(9, 0.5, 4, 0.06), zwart, pd.x, 0.25, pd.z)
      deel(new THREE.BoxGeometry(9.02, 0.04, 0.04), neon(thema.primair), pd.x, 0.48, pd.z + 2.0)
      // Het gebogen reuzescherm achteraan.
      const schermTex = tekst(1024, 300, (g) => {
        const gr = g.createLinearGradient(0, 0, 1024, 300)
        gr.addColorStop(0, '#312e81')
        gr.addColorStop(1, '#0e7490')
        g.fillStyle = gr
        g.fillRect(0, 0, 1024, 300)
        g.fillStyle = '#fff'
        g.font = 'italic 900 96px Inter, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('KRACHTBAL ESPORTS', 512, 120, 980)
        g.font = '800 46px Inter, sans-serif'
        g.fillStyle = '#facc15'
        g.fillText('FINALE · LIVE', 512, 220)
      })
      const scherm = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2.4, 40, 1, true, -0.6, 1.2), new THREE.MeshBasicMaterial({ map: schermTex, toneMapped: false, side: THREE.BackSide }))
      scherm.position.set(pd.x, Y + 2.3, pd.z + 5.4)
      scherm.rotation.y = Math.PI
      groep.add(scherm)
      // Twee teambureaus met schermen en stoelen.
      for (const kant of [-1, 1]) {
        const x = pd.x + kant * 2.4
        deel(rondeDoos(3.6, 0.06, 0.9, 0.02), zwart, x, 1.25, pd.z + 0.5)
        for (let i = 0; i < 3; i++) {
          deel(new THREE.BoxGeometry(0.62, 0.38, 0.04), zwart, x - 1.15 + i * 1.15, 1.55, pd.z + 0.85)
          deel(new THREE.PlaneGeometry(0.58, 0.34), neon(kant < 0 ? '#3b82f6' : '#ef4444'), x - 1.15 + i * 1.15, 1.55, pd.z + 0.828).rotation.y = Math.PI
          deel(rondeDoos(0.55, 0.9, 0.5, 0.08), kant < 0 ? new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.5 }) : primair, x - 1.15 + i * 1.15, 1.0, pd.z - 0.2)
        }
      }
      bezet(pd.x, pd.z, 9, 4)
    }
    // Drie racesimulators: kuipstoel, stuur, pedalen en een gebogen scherm.
    const rs = plek(G, 6, 2.2, { x: G.x0 + 5, z: G.z1 - 4 })
    if (rs) {
      for (let i = 0; i < 3; i++) {
        const x = rs.x - 2 + i * 2
        deel(rondeDoos(0.7, 0.25, 1.6, 0.05), zwart, x, 0.2, rs.z)
        const stoel = deel(rondeDoos(0.6, 0.8, 0.55, 0.12), i === 1 ? primair : secundair, x, 0.7, rs.z + 0.4)
        stoel.rotation.x = -0.35
        const stuur = deel(new THREE.TorusGeometry(0.17, 0.025, 8, 24), zwart, x, 0.95, rs.z - 0.35)
        stuur.rotation.x = -0.4
        deel(new THREE.CylinderGeometry(0.6, 0.6, 0.42, 24, 1, true, -0.7, 1.4), neon('#22d3ee'), x, 1.15, rs.z - 0.75).material.side = THREE.DoubleSide
      }
      bezet(rs.x, rs.z, 6, 2)
    }
  }

  // ---------- 🧖 wellness: zoutwand, ijsbad, eierstoelen ----------
  {
    const S = opt.sauna
    // De zoutwand: blokken roze zout die van achteren gloeien.
    const zw = plek(S, 5, 0.6, { x: (S.x0 + S.x1) / 2, z: S.z0 + 1.2 }, 0.3)
    if (zw) {
      const zout = tekst(256, 128, (g) => {
        for (let y = 0; y < 128; y += 21)
          for (let x = (y / 21) % 2 ? -18 : 0; x < 256; x += 36) {
            const l = 55 + Math.random() * 18
            g.fillStyle = `hsl(${15 + Math.random() * 12}, 85%, ${l}%)`
            g.fillRect(x + 1, y + 1, 34, 19)
          }
      })
      deel(new THREE.BoxGeometry(5, 2.6, 0.4), new THREE.MeshBasicMaterial({ map: zout, toneMapped: false, color: '#ffb48a' }), zw.x, 1.3, zw.z)
      const plas = deel(new THREE.CircleGeometry(2.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff8a4c', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }), zw.x, 0.03, zw.z + 1.2)
      plas.renderOrder = 1
      bezet(zw.x, zw.z, 5, 0.5)
    }
    // Het ijsbad: een ronde houten ton met ijsblauw water en een bordje.
    const ij = plek(S, 2.2, 2.2, { x: S.x0 + 14, z: S.z0 + 8 })
    if (ij) {
      deel(new THREE.CylinderGeometry(1.0, 1.0, 1.0, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#6b4b2e', roughness: 0.8, side: THREE.DoubleSide }), ij.x, 0.5, ij.z)
      for (const y of [0.2, 0.8]) deel(new THREE.TorusGeometry(1.01, 0.03, 6, 32).rotateX(Math.PI / 2), chroom, ij.x, y, ij.z)
      deel(new THREE.CircleGeometry(0.97, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#a5f3fc', toneMapped: false, transparent: true, opacity: 0.9 }), ij.x, 0.9, ij.z)
      for (let i = 0; i < 9; i++) deel(new THREE.BoxGeometry(0.14, 0.1, 0.14), new THREE.MeshStandardMaterial({ color: '#e0f7ff', transparent: true, opacity: 0.8, roughness: 0.05 }), ij.x + Math.cos(i * 2.3) * 0.6, 0.93, ij.z + Math.sin(i * 2.3) * 0.6).rotation.y = i
      const bord = deel(
        new THREE.PlaneGeometry(0.9, 0.32),
        new THREE.MeshBasicMaterial({
          map: tekst(256, 92, (g) => {
            g.fillStyle = '#0c4a6e'
            g.fillRect(0, 0, 256, 92)
            g.fillStyle = '#e0f2fe'
            g.font = '900 48px Inter, sans-serif'
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText('IJSBAD 4°', 128, 48)
          }),
          toneMapped: false,
        }),
        ij.x,
        1.35,
        ij.z - 1.02,
      )
      bord.rotation.y = Math.PI
      deel(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), chroom, ij.x, 1.1, ij.z - 1.02)
      bezet(ij.x, ij.z, 2.2, 2.2)
    }
    // Hangende eierstoelen van rotan, met een kussen in clubkleur.
    const ei = plek(S, 5, 1.6, { x: S.x1 - 8, z: S.z0 + 17 })
    if (ei) {
      const rotan = new THREE.MeshStandardMaterial({ color: '#c8a26b', roughness: 0.9, side: THREE.DoubleSide })
      const stoelen: THREE.Group[] = []
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group()
        g.position.set(ei.x - 1.7 + i * 1.7, Y + 3.2, ei.z)
        groep.add(g)
        const ketting = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 4), chroom)
        ketting.position.y = -0.7
        const schaal = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14, 0, Math.PI * 2, 0.35, Math.PI - 0.35), rotan)
        schaal.position.y = -1.95
        schaal.rotation.x = 0.5
        const kussen = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20), primair)
        kussen.position.y = -2.35
        g.add(ketting, schaal, kussen)
        stoelen.push(g)
      }
      anim.push((s) => stoelen.forEach((g, i) => (g.rotation.y = Math.sin(s * 0.5 + i) * 0.25)))
      bezet(ei.x, ei.z, 5, 1.4)
    }
  }

  return {
    update(seconden) {
      if (!groep.visible) return
      for (const a of anim) a(seconden)
    },
  }
}
