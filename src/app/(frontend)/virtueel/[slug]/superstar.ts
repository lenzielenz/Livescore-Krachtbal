import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'
import { BAAN_LENGTE, BALLEN, LOSLAAT_HOOGTE, balStraal, balVan, vliegAfstand, type BalId, type SuperstarStand } from '@/lib/virtueel-superstar'
import { krachtbalGeometrie, krachtbalTextuur } from './krachtbal'
import { rondeDoos } from './rond'

// Superstar: de hal voor het afstandwerpen in de kelder.
//  • een werpbaan van 30 m in rood tartan, met een witte lijn om de meter en grote cijfers om de
//    5 m, zijboarding met ledlijnen, en vlaggetjes op het record van elke bal;
//  • achter de werplijn een tafel met de vijf krachtballen (800 g oranje, 1 kg geel, 2 kg rood,
//    3 kg blauw, 4 kg wit), elk een echte krachtbal (krachtbal.ts);
//  • op de kopwand een groot ledscherm met het klassement van heel het platform, per bal;
//  • spots die de baan in licht zetten, een tribuneke en banners.
// De worp zelf: de bal vliegt langs een echte kogelbaan tot op de afstand die de server uitrekende,
// met een spoor, een stofwolkje bij de landing en een vlag met de afstand.
// De hal ligt op de x-as: de werplijn oostelijk, er wordt naar het westen (−x) geworpen.

export type SuperstarHal = {
  /** Sta je aan de tafel met de ballen (of op de werplijn)? */
  bijTafel: (x: number, z: number) => boolean
  /** Waar je gaat staan om te werpen (en de kijkrichting, naar de baan). */
  werpPlek: { x: number; z: number; yaw: number }
  obstakels: { x0: number; x1: number; z0: number; z1: number }[]
  /** Neem een bal in je hand (of leg hem terug met null). */
  neem: (bal: BalId | null) => void
  /** Gooi: de bal vliegt tot op `afstand` meter onder `hoek` graden. Klaar als hij ligt. */
  gooi: (bal: BalId, afstand: number, hoek: number) => Promise<void>
  zetStand: (s: SuperstarStand, gekozen: BalId | null) => void
  update: (seconden: number, dt: number) => void
}

export function bouwSuperstar(
  ouder: THREE.Group,
  opt: { thema: StadionThema; Y: number; x0: number; x1: number; z0: number; z1: number; licht: boolean },
): SuperstarHal {
  const { thema, Y } = opt
  const mz = (opt.z0 + opt.z1) / 2
  const lijnX = opt.x1 - 7 // de werplijn
  const eindX = lijnX - BAAN_LENGTE
  const BB = 4.4 // breedte van de baan
  const groep = new THREE.Group()
  ouder.add(groep)
  const obstakels: SuperstarHal['obstakels'] = []
  const tekst = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    teken(c.getContext('2d')!)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = groep) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, Y + y, z)
    p.add(m)
    return m
  }

  // ---------- de baan ----------
  const tartan = tekst(256, 256, (g) => {
    g.fillStyle = '#9a2a1d'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,180,150'},${0.05 + Math.random() * 0.08})`
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
    }
  })
  tartan.wrapS = tartan.wrapT = THREE.RepeatWrapping
  tartan.repeat.set(BAAN_LENGTE / 2, BB / 2)
  const baan = deel(new THREE.PlaneGeometry(BAAN_LENGTE + 4, BB).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tartan, roughness: 0.85 }), (lijnX + eindX) / 2 - 2, 0.012, mz)
  baan.receiveShadow = true
  // De aanloop: een cirkel met de werplijn (een witte balk), in clubkleur.
  deel(new THREE.CircleGeometry(1.6, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.7 }), lijnX + 2, 0.014, mz)
  deel(new THREE.RingGeometry(1.55, 1.65, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: thema.primair }), lijnX + 2, 0.016, mz)
  deel(new THREE.BoxGeometry(0.12, 0.05, BB), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), lijnX, 0.025, mz)
  // Een witte lijn om de meter; dikker om de 5 m, met grote cijfers op de baan.
  const lijnMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' })
  const lijnen = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), lijnMat, BAAN_LENGTE)
  const m4 = new THREE.Matrix4()
  for (let i = 1; i <= BAAN_LENGTE; i++) {
    const dik = i % 5 === 0 ? 0.09 : 0.04
    m4.compose(new THREE.Vector3(lijnX - i, Y + 0.018, mz), new THREE.Quaternion(), new THREE.Vector3(dik, 1, i % 5 === 0 ? BB : BB * 0.82))
    lijnen.setMatrixAt(i - 1, m4)
  }
  groep.add(lijnen)
  for (let i = 5; i <= BAAN_LENGTE; i += 5) {
    const cijfer = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.75).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: tekst(256, 160, (g) => {
          g.fillStyle = '#ffffff'
          g.font = '900 120px Inter, system-ui, sans-serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(String(i), 128, 86)
        }),
        transparent: true,
        depthWrite: false,
      }),
    )
    // Leesbaar voor wie op de werplijn staat (naar −x kijkt).
    cijfer.rotation.y = Math.PI / 2
    cijfer.position.set(lijnX - i + 0.6, Y + 0.02, mz + BB / 2 - 0.65)
    groep.add(cijfer)
  }
  // Zijboarding met een ledlijn in clubkleur, langs heel de baan.
  const board = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5 })
  const led = new THREE.MeshBasicMaterial({ color: thema.primair, toneMapped: false })
  for (const kant of [-1, 1]) {
    const z = mz + kant * (BB / 2 + 0.25)
    deel(rondeDoos(BAAN_LENGTE + 4, 0.55, 0.12, 0.03), board, (lijnX + eindX) / 2 - 2, 0.275, z)
    deel(new THREE.BoxGeometry(BAAN_LENGTE + 4, 0.04, 0.02), led, (lijnX + eindX) / 2 - 2, 0.48, z - kant * 0.07)
    obstakels.push({ x0: eindX - 4, x1: lijnX, z0: z - 0.1, z1: z + 0.1 })
  }
  // Vlaggetjes op het record van elke bal, in de kleur van die bal.
  for (const b of BALLEN) {
    const x = lijnX - b.record
    const z = mz - BB / 2 - 0.55
    deel(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.8, roughness: 0.3 }), x, 0.7, z)
    const vlag = deel(
      new THREE.PlaneGeometry(0.62, 0.36),
      new THREE.MeshBasicMaterial({
        map: tekst(256, 150, (g) => {
          g.fillStyle = b.kleur
          g.fillRect(0, 0, 256, 150)
          g.fillStyle = b.id === '4kg' || b.id === '1kg' ? '#111827' : '#ffffff'
          g.font = '900 54px Inter, sans-serif'
          g.textAlign = 'center'
          g.fillText(b.label, 128, 62)
          g.font = '800 40px Inter, sans-serif'
          g.fillText(`record ${b.record} m`, 128, 118)
        }),
        side: THREE.DoubleSide,
      }),
      x,
      1.22,
      z - 0.31,
    )
    // Naar de werplijn gekeerd.
    vlag.rotation.y = Math.PI / 2
  }

  // ---------- de tafel met de ballen ----------
  const tafelX = lijnX + 3.2
  const tafelZ = mz - BB / 2 - 1.4
  const hout = new THREE.MeshStandardMaterial({ color: '#5b3a1e', roughness: 0.6 })
  deel(rondeDoos(2.6, 0.08, 0.9, 0.03), hout, tafelX, 0.92, tafelZ)
  for (const [dx, dz] of [
    [-1.2, -0.35],
    [1.2, -0.35],
    [-1.2, 0.35],
    [1.2, 0.35],
  ])
    deel(new THREE.CylinderGeometry(0.035, 0.03, 0.9, 8), hout, tafelX + dx, 0.45, tafelZ + dz)
  // Een fluwelen loper met vijf kuiltjes.
  deel(rondeDoos(2.4, 0.02, 0.6, 0.01), new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.95 }), tafelX, 0.97, tafelZ)
  obstakels.push({ x0: tafelX - 1.4, x1: tafelX + 1.4, z0: tafelZ - 0.55, z1: tafelZ + 0.55 })
  // Echte maten uit het reglement: van 24 cm (800 g) tot bijna 35 cm (4 kg).
  const straal = balStraal
  const balMat = new Map<BalId, THREE.MeshStandardMaterial>()
  const balGeo = new Map<BalId, THREE.BufferGeometry>()
  for (const b of BALLEN) {
    balMat.set(b.id, new THREE.MeshStandardMaterial({ map: krachtbalTextuur(b.kleur, b.id === '4kg' ? '#64748b' : '#1c1206'), vertexColors: true, roughness: 0.55, metalness: 0.05 }))
    balGeo.set(b.id, krachtbalGeometrie(straal(b.id), opt.licht ? 0.5 : 0.75))
  }
  const opTafel = new Map<BalId, THREE.Mesh>()
  BALLEN.forEach((b, i) => {
    const m = new THREE.Mesh(balGeo.get(b.id)!, balMat.get(b.id)!)
    m.position.set(tafelX - 0.96 + i * 0.48, Y + 0.98 + straal(b.id), tafelZ)
    m.rotation.set(0.3, i, 0.2)
    groep.add(m)
    opTafel.set(b.id, m)
    // Een kaartje met het gewicht ervoor.
    const kaart = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.12),
      new THREE.MeshBasicMaterial({
        map: tekst(128, 52, (g) => {
          g.fillStyle = '#f8fafc'
          g.fillRect(0, 0, 128, 52)
          g.fillStyle = '#111827'
          g.font = '900 34px Inter, sans-serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(b.label, 64, 28)
        }),
      }),
    )
    kaart.position.set(tafelX - 0.96 + i * 0.48, Y + 0.99, tafelZ + 0.36)
    kaart.rotation.x = -Math.PI / 2 + 0.5
    groep.add(kaart)
  })

  // ---------- het ledscherm met het klassement, op de kopwand achter het einde van de baan ----------
  const SW = 1536
  const SH = 640
  const schermC = document.createElement('canvas')
  schermC.width = SW
  schermC.height = SH
  const schermTex = new THREE.CanvasTexture(schermC)
  schermTex.colorSpace = THREE.SRGBColorSpace
  const scherm = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 4), new THREE.MeshBasicMaterial({ map: schermTex, toneMapped: false }))
  scherm.position.set(opt.x0 + 0.08, Y + 3.1, mz)
  scherm.rotation.y = Math.PI / 2
  groep.add(scherm)
  deel(rondeDoos(0.2, 4.3, 9.9, 0.05), board, opt.x0 - 0.05, 3.1, mz)
  let laatsteWorp: { bal: BalId; afstand: number } | null = null
  let stand: SuperstarStand | null = null
  const tekenScherm = () => {
    const g = schermC.getContext('2d')!
    const bg = g.createLinearGradient(0, 0, 0, SH)
    bg.addColorStop(0, '#0b1020')
    bg.addColorStop(1, '#03050b')
    g.fillStyle = bg
    g.fillRect(0, 0, SW, SH)
    g.fillStyle = thema.primair
    g.fillRect(0, 0, SW, 10)
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.font = 'italic 900 64px Inter, system-ui, sans-serif'
    g.textAlign = 'left'
    g.fillText('★ SUPERSTAR', 40, 62)
    g.font = '700 30px Inter, system-ui, sans-serif'
    g.fillStyle = '#94a3b8'
    g.fillText('afstandwerpen · klassement van heel Krachtbal Live', 470, 66)
    if (laatsteWorp) {
      g.textAlign = 'right'
      g.fillStyle = '#facc15'
      g.font = '900 56px Inter, system-ui, sans-serif'
      g.fillText(`${laatsteWorp.afstand.toFixed(2).replace('.', ',')} m`, SW - 40, 62)
    }
    const kolom = (SW - 80) / BALLEN.length
    BALLEN.forEach((b, i) => {
      const x = 40 + i * kolom
      g.fillStyle = b.kleur
      g.beginPath()
      g.roundRect(x + 6, 120, kolom - 12, 60, 12)
      g.fill()
      g.fillStyle = b.id === '4kg' || b.id === '1kg' ? '#111827' : '#ffffff'
      g.font = '900 38px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(b.label, x + kolom / 2, 151)
      const rijen = stand?.per[b.id] ?? []
      g.textAlign = 'left'
      for (let r = 0; r < 6; r++) {
        const y = 222 + r * 66
        const rij = rijen[r]
        g.fillStyle = r % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.06)'
        g.fillRect(x + 6, y - 28, kolom - 12, 58)
        g.fillStyle = r === 0 ? '#facc15' : '#64748b'
        g.font = '900 30px Inter, system-ui, sans-serif'
        g.fillText(String(r + 1), x + 16, y)
        g.fillStyle = rij ? '#f8fafc' : '#334155'
        g.font = '800 28px Inter, system-ui, sans-serif'
        g.fillText(rij ? rij.naam : '—', x + 50, y, kolom - 170)
        if (rij) {
          g.textAlign = 'right'
          g.fillStyle = '#fde68a'
          g.font = '900 30px Inter, system-ui, sans-serif'
          g.fillText(`${rij.afstand.toFixed(2).replace('.', ',')}`, x + kolom - 16, y)
          g.textAlign = 'left'
        }
      }
    })
    schermTex.needsUpdate = true
  }
  tekenScherm()

  // ---------- sfeer: banners, spots, een tribuneke ----------
  const banner = (x: number, z: number, ry: number) => {
    const b = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 3.2),
      new THREE.MeshBasicMaterial({
        map: tekst(256, 586, (g) => {
          g.fillStyle = thema.primair
          g.fillRect(0, 0, 256, 586)
          g.fillStyle = thema.secundair
          g.fillRect(0, 470, 256, 116)
          g.save()
          g.translate(128, 260)
          g.rotate(-Math.PI / 2)
          g.fillStyle = '#ffffff'
          g.font = 'italic 900 92px Inter, sans-serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText('SUPERSTAR', 0, 0)
          g.restore()
        }),
        side: THREE.DoubleSide,
      }),
    )
    b.position.set(x, Y + 3.2, z)
    b.rotation.y = ry
    groep.add(b)
  }
  for (let i = 0; i < 4; i++) {
    banner(lijnX - 4 - i * 8, opt.z0 + 0.06, 0)
    banner(lijnX - 8 - i * 8, opt.z1 - 0.06, Math.PI)
  }
  // Een tribuneke langs de noordwand: drie treden met zitjes in clubkleur.
  const zit = new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.6 })
  for (let t = 0; t < 3; t++) {
    deel(rondeDoos(16, 0.42, 0.75, 0.03), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8 }), lijnX - 12, 0.21 + t * 0.42, opt.z0 + 0.5 + t * 0.75)
    const zitjes = new THREE.InstancedMesh(rondeDoos(0.42, 0.12, 0.4, 0.04), zit, 30)
    for (let k = 0; k < 30; k++) {
      m4.makeTranslation(lijnX - 19.5 + k * 0.52, Y + 0.48 + t * 0.42, opt.z0 + 0.6 + t * 0.75)
      zitjes.setMatrixAt(k, m4)
    }
    groep.add(zitjes)
  }
  obstakels.push({ x0: lijnX - 20.2, x1: lijnX - 3.8, z0: opt.z0, z1: opt.z0 + 2.4 })
  // Spots langs het plafond die de baan in licht zetten (lampkappen; het licht zelf is een plas).
  for (let i = 0; i < 6; i++) {
    const x = lijnX - 2 - i * 5.5
    deel(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 14), new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.7, roughness: 0.3 }), x, 5.05, mz)
    deel(new THREE.CircleGeometry(0.2, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff7e0', toneMapped: false }), x, 4.89, mz)
    const plas = deel(new THREE.CircleGeometry(2.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }), x, 0.03, mz)
    plas.renderOrder = 1
  }

  // ---------- de bal in je hand, en de vlucht ----------
  const inHand = new THREE.Mesh(balGeo.get('3kg')!, balMat.get('3kg')!)
  inHand.visible = false
  groep.add(inHand)
  const vlieger = new THREE.Mesh(balGeo.get('3kg')!, balMat.get('3kg')!)
  vlieger.visible = false
  groep.add(vlieger)
  // Het spoor: een rij gloeiende bolletjes die achter de bal blijven hangen en uitdoven.
  const spoorN = 60
  const spoor = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }), spoorN)
  spoor.count = 0
  groep.add(spoor)
  const spoorPunten: { p: THREE.Vector3; t: number }[] = []
  // Stofwolkje bij de landing.
  const stof = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 5), new THREE.MeshBasicMaterial({ color: '#d6b8a4', transparent: true, opacity: 0.5, depthWrite: false }), 24)
  stof.count = 0
  groep.add(stof)
  let stofT = -10
  const stofP = new THREE.Vector3()
  const stofV = Array.from({ length: 24 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.9) * (0.5 + (i % 3) * 0.4), 0.6 + (i % 4) * 0.35, Math.sin(i * 0.9) * (0.5 + (i % 3) * 0.4)))
  // De vlag met de afstand, waar de bal landde.
  const markVlag = new THREE.Group()
  markVlag.visible = false
  groep.add(markVlag)
  const markTex = { c: document.createElement('canvas'), t: null as THREE.CanvasTexture | null }
  markTex.c.width = 256
  markTex.c.height = 110
  markTex.t = new THREE.CanvasTexture(markTex.c)
  markTex.t.colorSpace = THREE.SRGBColorSpace
  {
    const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc' }))
    paal.position.y = 0.6
    const doek = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.32), new THREE.MeshBasicMaterial({ map: markTex.t, side: THREE.DoubleSide, toneMapped: false }))
    doek.position.set(0, 1.04, 0.38)
    doek.rotation.y = Math.PI / 2
    markVlag.add(paal, doek)
  }
  const tekenMark = (afstand: number, kleur: string) => {
    const g = markTex.c.getContext('2d')!
    g.fillStyle = kleur
    g.fillRect(0, 0, 256, 110)
    g.fillStyle = kleur === '#f8fafc' || kleur === '#facc15' ? '#111827' : '#ffffff'
    g.font = '900 64px Inter, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(`${afstand.toFixed(2).replace('.', ',')} m`, 128, 58)
    markTex.t!.needsUpdate = true
  }

  let gekozen: BalId | null = null
  let vlucht: { bal: BalId; v: number; a: number; T: number; t0: number; klaar: () => void; afstand: number; rol: number } | null = null
  // Rechts voor je (wie naar −x kijkt, heeft −z aan zijn rechterhand).
  const handPos = new THREE.Vector3(lijnX + 1.35, Y + 1.32, mz - 0.3)

  return {
    bijTafel: (x, z) => (Math.abs(x - tafelX) < 2.2 && Math.abs(z - tafelZ) < 1.6) || Math.hypot(x - (lijnX + 2), z - mz) < 1.8,
    werpPlek: { x: lijnX + 1.9, z: mz, yaw: -Math.PI / 2 },
    obstakels,
    neem(bal) {
      if (gekozen) opTafel.get(gekozen)!.visible = true
      gekozen = bal
      inHand.visible = bal != null
      if (bal) {
        opTafel.get(bal)!.visible = false
        inHand.geometry = balGeo.get(bal)!
        inHand.material = balMat.get(bal)!
      }
      if (stand) {
        tekenScherm()
      }
    },
    gooi(bal, afstand, hoek) {
      // De snelheid die hoort bij deze afstand en hoek (zelfde kogelbaan als de server).
      let lo = 0.5
      let hi = 40
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (vliegAfstand(mid, hoek) < afstand) lo = mid
        else hi = mid
      }
      const v = (lo + hi) / 2
      const a = (hoek * Math.PI) / 180
      const vy = v * Math.sin(a)
      const T = (vy + Math.sqrt(vy * vy + 2 * 9.81 * LOSLAAT_HOOGTE)) / 9.81
      inHand.visible = false
      vlieger.geometry = balGeo.get(bal)!
      vlieger.material = balMat.get(bal)!
      vlieger.visible = true
      markVlag.visible = false
      spoorPunten.length = 0
      ;(spoor.material as THREE.MeshBasicMaterial).color.set(balVan(bal).kleur)
      laatsteWorp = null
      return new Promise<void>((klaar) => {
        vlucht = { bal, v, a, T, t0: performance.now() / 1000, klaar, afstand, rol: 0.4 + Math.random() * 0.6 }
      })
    },
    zetStand(s, kies) {
      stand = s
      void kies
      tekenScherm()
    },
    update(seconden, dt) {
      if (!ouder.visible) return
      // De bal in je hand: rechts voor je, op de werplijn.
      if (inHand.visible) {
        inHand.position.copy(handPos)
        inHand.position.y += Math.sin(seconden * 2) * 0.02
        inHand.rotation.y = seconden * 0.6
      }
      if (vlucht) {
        // Een tikje vertraagd, zodat je hem goed ziet vliegen.
        const t = (performance.now() / 1000 - vlucht.t0) * 0.85
        const tv = Math.min(t, vlucht.T)
        const x = lijnX + 0.2 - vlucht.v * Math.cos(vlucht.a) * tv
        const y = Y + LOSLAAT_HOOGTE + vlucht.v * Math.sin(vlucht.a) * tv - 0.5 * 9.81 * tv * tv
        if (t <= vlucht.T) {
          vlieger.position.set(x, Math.max(Y + 0.12, y), mz - 0.3 + tv * 0.05)
          vlieger.rotation.z += dt * 9
          vlieger.rotation.x += dt * 3
          if (spoorPunten.length === 0 || spoorPunten[spoorPunten.length - 1].p.distanceTo(vlieger.position) > 0.25) {
            spoorPunten.push({ p: vlieger.position.clone(), t: seconden })
            if (spoorPunten.length > spoorN) spoorPunten.shift()
          }
        } else {
          // Geland: een stofwolkje, een kort rolletje, en de vlag met de afstand.
          if (stofT < vlucht.t0) {
            stofT = seconden
            stofP.set(lijnX - vlucht.afstand, Y + 0.05, mz - 0.3 + vlucht.T * 0.05)
            markVlag.position.set(lijnX - vlucht.afstand, Y, mz - BB / 2 + 0.35)
            tekenMark(vlucht.afstand, balVan(vlucht.bal).kleur)
            markVlag.visible = true
            laatsteWorp = { bal: vlucht.bal, afstand: vlucht.afstand }
            tekenScherm()
          }
          const na = t - vlucht.T
          const rol = vlucht.rol * (1 - Math.exp(-na * 3))
          vlieger.position.set(lijnX - vlucht.afstand - rol, Y + 0.12 + Math.abs(Math.sin(na * 9)) * 0.15 * Math.exp(-na * 4), mz - 0.3 + vlucht.T * 0.05)
          if (na > 1.2) {
            const k = vlucht.klaar
            vlucht = null
            k()
          }
        }
      }
      // Het spoor dooft uit.
      let n = 0
      for (const s of spoorPunten) {
        const leeft = 1 - (seconden - s.t) / 1.6
        if (leeft <= 0) continue
        m4.compose(s.p, new THREE.Quaternion(), new THREE.Vector3(leeft, leeft, leeft))
        spoor.setMatrixAt(n++, m4)
      }
      spoor.count = n
      spoor.instanceMatrix.needsUpdate = true
      // Het stof.
      const st = seconden - stofT
      if (st < 1.4) {
        stof.count = 24
        stofV.forEach((v, i) => {
          const s = 0.6 + st * 2.2
          m4.compose(new THREE.Vector3(stofP.x + v.x * st, stofP.y + v.y * st - 0.6 * st * st, stofP.z + v.z * st), new THREE.Quaternion(), new THREE.Vector3(s, s, s))
          stof.setMatrixAt(i, m4)
        })
        ;(stof.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - st / 1.4)
        stof.instanceMatrix.needsUpdate = true
      } else stof.count = 0
    },
  }
}
