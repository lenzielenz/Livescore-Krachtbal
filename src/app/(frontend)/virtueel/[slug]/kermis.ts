import * as THREE from 'three'

import type { StadionThema } from '@/lib/virtueel'
import { rondeDoos } from './rond'

// De kermis in het fandorp: wat er tussen de grote attracties nog leeg lag, is nu gevuld — en je
// kan er écht op.
//  • een zweefmolen: stoeltjes aan kettingen die naar buiten zwieren als hij op toeren komt;
//  • een botsautobaan: je rijdt zelf (joystick of pijltjes) en botst tegen de andere wagentjes;
//  • een blikken-gooi-kraam en eendjes vissen (kermisspelletjes met een prijs) en een schiettent;
//  • een suikerspin- en een churroskraam aan de poort, een ballonverkoper, een fotobord met
//    gaten voor je gezicht, een toiletwagen, en banken, bloembakken en vuilbakken langs het pad.
// De ritten (ook het reuzenrad en de draaimolen, zie fandorp.ts) delen één vorm: `Rit`.

export type RitInfo = { titel: string; regel: string; rest: number; magUit: boolean }

export type Rit = {
  id: string
  /** Tekst op de actieknop als je ervoor staat. */
  actie: string
  bij: (x: number, z: number) => boolean
  stapIn: () => void
  inRit: () => boolean
  info: () => RitInfo | null
  /** Zet de camera op je plaats in de rit (rondkijken mag, behalve als je zelf stuurt). */
  camera: (camera: THREE.PerspectiveCamera, yaw: number, pitch: number) => void
  /** Enkel bij een rit die je zelf bestuurt (de botsauto). */
  stuur?: (dt: number, vooruit: number, draai: number) => void
  stapUit: () => void
  /** Net uitgestapt? Dan sta je hier (één keer). */
  uitgestapt: () => { x: number; z: number; yaw: number } | null
}

export type SpelUitslag = { tekst: string; goed: boolean }

/** Een kermisspel: je staat ervoor, je mikt (kracht 0–1) en het spel antwoordt. */
export type Kermisspel = {
  id: 'krachtmeter' | 'blikken' | 'eendjes'
  naam: string
  actie: string
  /** Uitleg in het spelvenster. */
  uitleg: string
  /** Knoptekst in het spelvenster. */
  knop: string
  /** Mik je met een meter (krachtmeter, blikken), of is het geluk (eendjes)? */
  meter: boolean
  bij: (x: number, z: number) => boolean
  speel: (kracht: number) => SpelUitslag
}

export type Gereedschap = {
  groep: THREE.Group
  thema: StadionThema
  licht: boolean
  toeval: () => number
  blok: (x0: number, x1: number, z0: number, z1: number) => void
  deel: (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry?: number) => THREE.Mesh
  bord: (tekst: string, w: number, h: number, achter: string, voor: string, onder?: string) => THREE.Mesh
  tex: (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void, herhaal?: [number, number]) => THREE.CanvasTexture
  lichtPlas: (x: number, z: number, r: number, kleur: string, sterk?: number) => THREE.Mesh
  animaties: ((s: number, dt: number) => void)[]
  mat: { club: THREE.Material; club2: THREE.Material; wit: THREE.Material; staal: THREE.Material; donker: THREE.Material; hout: THREE.Material }
}

/** Het speelpleintje rond de zweefmolen en de botsauto's: hun plaats in het fandorp. */
export const ZWEEFMOLEN = { x: -17, z: 103 }
export const BOTSBAAN = { x0: 8, x1: 22, z0: 96.5, z1: 107 }

const gestreept = (G: Gereedschap, a: string, b: string, n = 8) =>
  G.tex(256, 32, (g) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? b : a
      g.fillRect((i * 256) / n, 0, 256 / n + 1, 32)
    }
  })

// ---------------------------------------------------------------------------------------------
// De zweefmolen
// ---------------------------------------------------------------------------------------------

function bouwZweefmolen(G: Gereedschap): Rit {
  const { x: ZX, z: ZZ } = ZWEEFMOLEN
  const N = 12
  const R0 = 3.6 // straal van de ophangpunten
  const L = 4.2 // lengte van de kettingen
  const KROON_Y = 8.4
  const DUUR = 34
  const molen = new THREE.Group()
  molen.position.set(ZX, 0, ZZ)
  G.groep.add(molen)
  // De voet, de mast en een sterrenbord bovenop.
  G.deel(new THREE.CylinderGeometry(2.2, 2.6, 0.5, 24).translate(0, 0.25, 0), G.mat.donker, ZX, 0, ZZ)
  G.deel(new THREE.CylinderGeometry(0.45, 0.6, KROON_Y + 1.6, 16).translate(0, (KROON_Y + 1.6) / 2, 0), G.mat.club, ZX, 0, ZZ)
  // De vloer onder de stoeltjes en een hekje rondom, met een opening naar het pad (oostkant).
  const vloer = new THREE.Mesh(new THREE.RingGeometry(2.7, 8.2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#334155' }))
  vloer.position.set(ZX, 0.03, ZZ)
  vloer.receiveShadow = !G.licht
  G.groep.add(vloer)
  const hekGeo: THREE.BufferGeometry[] = []
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2
    // De ingang: aan de kant van het pad.
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.18) continue
    hekGeo.push(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5).translate(Math.cos(a) * 8.6, 0.5, Math.sin(a) * 8.6))
  }
  const hekRing = new THREE.TorusGeometry(8.6, 0.05, 5, 64).rotateX(Math.PI / 2).translate(0, 1.0, 0)
  for (const g of hekGeo) G.deel(g, G.mat.staal, ZX, 0, ZZ)
  G.deel(hekRing, G.mat.staal, ZX, 0, ZZ)
  // Het draaiende bovenstuk: een kroon met een gestreept dak en lampjes.
  const kroon = new THREE.Group()
  kroon.position.y = KROON_Y
  molen.add(kroon)
  const dak = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 24, 1, true).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ map: gestreept(G, G.thema.primair, '#ffffff', 12), side: THREE.DoubleSide, roughness: 0.6 }))
  kroon.add(dak)
  kroon.add(new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.55, 24, 1, true).translate(0, 0.3, 0), G.mat.club2))
  kroon.add(new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.2, R0 + 0.2, 0.12, 24), G.mat.staal))
  const lampjes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff1c4', toneMapped: false }), 36)
  {
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      lampjes.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 4.62, 0.3, Math.sin(a) * 4.62))
    }
  }
  kroon.add(lampjes)
  // De stoeltjes: een zitje met een rugleuning en een stang vooraan, aan twee kettingen.
  const stoelGeo = rondeDoos(0.62, 0.1, 0.55, 0.04)
  const rugGeo = rondeDoos(0.62, 0.55, 0.08, 0.03)
  const kettingGeo = new THREE.CylinderGeometry(0.012, 0.012, L, 4).translate(0, -L / 2, 0)
  const kleuren = [G.mat.club, G.mat.club2, new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 })]
  const stoelen = Array.from({ length: N }, (_, i) => {
    // Het ophangpunt draait met de kroon; de arm zwaait naar buiten (rotatie rond de raaklijn).
    const hang = new THREE.Group()
    const a = (i / N) * Math.PI * 2
    hang.position.set(Math.cos(a) * R0, 0, Math.sin(a) * R0)
    hang.rotation.y = -a
    kroon.add(hang)
    const arm = new THREE.Group()
    hang.add(arm)
    for (const dz of [-0.26, 0.26]) {
      const k = new THREE.Mesh(kettingGeo, G.mat.staal)
      k.position.z = dz
      arm.add(k)
    }
    const zit = new THREE.Mesh(stoelGeo, kleuren[i % 3])
    zit.position.y = -L - 0.05
    arm.add(zit)
    const rug = new THREE.Mesh(rugGeo, kleuren[i % 3])
    rug.position.set(-0.27, -L + 0.22, 0)
    rug.rotation.y = Math.PI / 2
    arm.add(rug)
    return { hang, arm, a }
  })
  G.blok(ZX - 8.8, ZX + 8.8, ZZ - 8.8, ZZ + 8.8)
  const zb = G.bord('🪂 ZWEEFMOLEN', 4.4, 1, '#0b1220', '#fde68a', 'stap in · zweef mee')
  zb.position.set(ZX + 9.4, 2.4, ZZ - 2.4)
  zb.rotation.y = Math.PI / 2
  G.groep.add(zb)
  G.deel(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6).translate(0, 1.2, 0), G.mat.donker, ZX + 9.4, 0, ZZ - 2.4)
  G.lichtPlas(ZX, ZZ, 10, '#ffe2a8', 0.22)

  // Draaien: rustig tot iemand instapt, dan een volle rit (op toeren komen, zwieren, uitbollen).
  let s0 = 0
  let nu = 0
  let rot = 0
  let mijn = -1
  let start = 0
  let uitstap: { x: number; z: number; yaw: number } | null = null
  let hoek = 0
  let draaiNul: number | null = null
  const snelheid = () => {
    if (mijn < 0) return 0.18
    const t = nu - start
    if (t < 6) return 0.18 + (t / 6) * 1.27
    if (t < DUUR - 8) return 1.45
    return Math.max(0.12, 1.45 * ((DUUR - t) / 8))
  }
  const uit = () => {
    mijn = -1
    uitstap = { x: ZX + 9.6, z: ZZ, yaw: -Math.PI / 2 }
  }
  G.animaties.push((s, dt) => {
    if (!s0) s0 = s
    nu = s
    const w = snelheid()
    rot += w * dt
    kroon.rotation.y = rot
    // Hoe sneller, hoe verder naar buiten (tan θ = ω²r/g), met een beetje naslingeren.
    const doel = Math.min(0.95, Math.atan((w * w * (R0 + L * 0.6)) / 9.81))
    hoek += (doel - hoek) * Math.min(1, dt * 1.8)
    // De arm zwaait rond de raaklijn (lokale z) naar buiten (lokale +x).
    for (const st of stoelen) st.arm.rotation.z = hoek * (1 + Math.sin(s * 1.3 + st.a * 3) * 0.04)
    // Een beetje op en neer, zoals de echte.
    kroon.position.y = KROON_Y + (mijn >= 0 ? Math.sin((nu - start) * 0.5) * 0.6 : 0)
    if (mijn >= 0 && nu - start > DUUR) uit()
  })
  const tmp = new THREE.Vector3()
  return {
    id: 'zweefmolen',
    actie: '🪂 Stap in de zweefmolen',
    bij: (x, z) => mijn < 0 && Math.hypot(x - (ZX + 9.4), z - ZZ) < 2.2,
    stapIn() {
      // Het stoeltje dat het dichtst bij de ingang hangt.
      let beste = 0
      let min = Infinity
      stoelen.forEach((st, i) => {
        const a = st.a + rot
        const d = Math.hypot(Math.cos(-a) - 1, Math.sin(-a))
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
      const t = nu - start
      stoelen[mijn].arm.getWorldPosition(tmp)
      return {
        titel: '🪂 In de zweefmolen',
        regel: `${Math.round(snelheid() * 9.5)} km/u · nog ${Math.max(0, Math.ceil(DUUR - t))} s · sleep om rond te kijken`,
        rest: Math.max(0, Math.ceil(DUUR - t)),
        magUit: snelheid() < 0.3,
      }
    },
    camera(camera, yaw, pitch) {
      if (mijn < 0) return
      const st = stoelen[mijn]
      st.arm.updateWorldMatrix(true, false)
      // Op het zitje, iets boven de zitting.
      tmp.set(0, -L + 0.75, 0).applyMatrix4(st.arm.matrixWorld)
      camera.position.copy(tmp)
      // Bij het instappen kijk je naar buiten (over het fandorp); daarna draait je kijkrichting mee.
      if (draaiNul == null) draaiNul = Math.atan2(tmp.x - ZX, tmp.z - ZZ) - yaw - rot
      const y = yaw + draaiNul + rot
      camera.lookAt(tmp.x + Math.sin(y) * Math.cos(pitch), tmp.y + Math.sin(pitch), tmp.z + Math.cos(y) * Math.cos(pitch))
    },
    stapUit: () => uit(),
    uitgestapt() {
      const u = uitstap
      uitstap = null
      return u
    },
  }
}

// ---------------------------------------------------------------------------------------------
// De botsauto's
// ---------------------------------------------------------------------------------------------

function bouwBotsautos(G: Gereedschap, melding: (tekst: string) => void): Rit {
  const { x0, x1, z0, z1 } = BOTSBAAN
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const DUUR = 45
  const R = 0.85 // straal van een wagentje (met de rubberen rand)
  // De vloer (staalplaat), de rand met rubber, de palen en het dak met het stroomnet.
  const plaat = G.tex(128, 128, (g) => {
    g.fillStyle = '#6b7280'
    g.fillRect(0, 0, 128, 128)
    g.strokeStyle = 'rgba(30,41,59,.55)'
    g.lineWidth = 2
    for (let i = 0; i <= 128; i += 16) {
      g.beginPath()
      g.moveTo(i, 0)
      g.lineTo(i, 128)
      g.moveTo(0, i)
      g.lineTo(128, i)
      g.stroke()
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 1)
    }
  }, [(x1 - x0) / 2, (z1 - z0) / 2])
  const vloer = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: plaat, metalness: 0.6, roughness: 0.45 }))
  vloer.position.set(cx, 0.16, cz)
  vloer.receiveShadow = !G.licht
  G.groep.add(vloer)
  G.deel(rondeDoos(x1 - x0 + 0.6, 0.15, z1 - z0 + 0.6, 0.05), G.mat.donker, cx, 0.075, cz)
  const rubber = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 })
  // De rand, met een opening aan de westkant (naar het pad).
  G.deel(rondeDoos(x1 - x0 + 0.6, 0.5, 0.3, 0.1), rubber, cx, 0.4, z0 - 0.15)
  G.deel(rondeDoos(x1 - x0 + 0.6, 0.5, 0.3, 0.1), rubber, cx, 0.4, z1 + 0.15)
  G.deel(rondeDoos(0.3, 0.5, z1 - z0, 0.1), rubber, x1 + 0.15, 0.4, cz)
  G.deel(rondeDoos(0.3, 0.5, (z1 - z0) / 2 - 1.1, 0.1), rubber, x0 - 0.15, 0.4, z0 + ((z1 - z0) / 2 - 1.1) / 2)
  G.deel(rondeDoos(0.3, 0.5, (z1 - z0) / 2 - 1.1, 0.1), rubber, x0 - 0.15, 0.4, z1 - ((z1 - z0) / 2 - 1.1) / 2)
  const dakY = 4.4
  for (const x of [x0 - 0.2, cx, x1 + 0.2]) for (const z of [z0 - 0.2, z1 + 0.2]) G.deel(new THREE.CylinderGeometry(0.12, 0.14, dakY, 8).translate(0, dakY / 2, 0), G.mat.club, x, 0, z)
  const dak = new THREE.Mesh(rondeDoos(x1 - x0 + 1.4, 0.35, z1 - z0 + 1.4, 0.1), G.mat.club2)
  dak.position.set(cx, dakY + 0.17, cz)
  dak.castShadow = !G.licht
  G.groep.add(dak)
  // Het stroomnet onder het dak (de wagentjes hangen er met een sleper aan).
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: G.tex(64, 64, (g) => {
        g.strokeStyle = '#94a3b8'
        g.lineWidth = 3
        g.strokeRect(0, 0, 64, 64)
      }, [(x1 - x0) / 1.2, (z1 - z0) / 1.2]),
      transparent: true,
      opacity: 0.8,
    }),
  )
  net.position.set(cx, dakY - 0.02, cz)
  G.groep.add(net)
  // Ledstrip rond het dak en een bord.
  const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), 60)
  {
    const m4 = new THREE.Matrix4()
    const P = new THREE.Color(G.thema.primair)
    const S = new THREE.Color(G.thema.secundair)
    for (let i = 0; i < 60; i++) {
      // Rond de dakrand lopen: boven, rechts, onder, links.
      const w = x1 - x0 + 1.4
      const h = z1 - z0 + 1.4
      const d = (i / 60) * 2 * (w + h)
      const [dx, dz] = d < w ? [d, 0] : d < w + h ? [w, d - w] : d < 2 * w + h ? [w - (d - w - h), h] : [0, h - (d - 2 * w - h)]
      leds.setMatrixAt(i, m4.makeTranslation(x0 - 0.7 + dx, dakY - 0.05, z0 - 0.7 + dz))
      leds.setColorAt(i, i % 2 ? P : S)
    }
  }
  G.groep.add(leds)
  const bb = G.bord("💥 BOTSAUTO'S", 6, 1.2, '#0b1220', '#fde68a', 'stap in · rijd · bots!')
  bb.position.set(x0 - 0.75, dakY - 0.6, cz)
  bb.rotation.y = -Math.PI / 2
  G.groep.add(bb)
  G.lichtPlas(cx, cz, 9, '#a5b4fc', 0.25)
  G.blok(x0 - 0.35, x1 + 0.35, z0 - 0.35, z1 + 0.35)

  // De wagentjes.
  const kleuren = [G.thema.primair, G.thema.secundair, '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#0ea5e9']
  const bodyGeo = rondeDoos(1.5, 0.45, 1.1, 0.18)
  const neusGeo = rondeDoos(0.55, 0.35, 0.95, 0.15)
  const rugGeo = rondeDoos(0.12, 0.6, 0.9, 0.05)
  const bumperGeo = new THREE.TorusGeometry(0.78, 0.09, 6, 24).rotateX(Math.PI / 2).scale(1.05, 1, 0.82)
  const stokGeo = new THREE.CylinderGeometry(0.025, 0.025, dakY - 0.9, 5).translate(0, (dakY - 0.9) / 2, 0)
  const stuurGeo = new THREE.TorusGeometry(0.15, 0.025, 5, 14)
  type Auto = { g: THREE.Group; x: number; z: number; h: number; v: number; vx: number; vz: number; draai: number; tik: number; vonk: THREE.Sprite }
  const vonkTex = G.tex(32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.3, 'rgba(147,197,253,.9)')
    r.addColorStop(1, 'rgba(59,130,246,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 32, 32)
  })
  const autos: Auto[] = kleuren.map((k, i) => {
    const g = new THREE.Group()
    const lak = new THREE.MeshStandardMaterial({ color: k, metalness: 0.35, roughness: 0.3 })
    const body = new THREE.Mesh(bodyGeo, lak)
    body.position.y = 0.42
    const neus = new THREE.Mesh(neusGeo, lak)
    neus.position.set(0.55, 0.62, 0)
    const rug = new THREE.Mesh(rugGeo, lak)
    rug.position.set(-0.6, 0.85, 0)
    const bumper = new THREE.Mesh(bumperGeo, rubber)
    bumper.position.y = 0.3
    const stok = new THREE.Mesh(stokGeo, G.mat.staal)
    stok.position.set(-0.62, 0.9, 0)
    const stuur = new THREE.Mesh(stuurGeo, G.mat.donker)
    stuur.position.set(0.18, 0.95, 0)
    stuur.rotation.z = Math.PI / 2 - 0.5
    const vonk = new THREE.Sprite(new THREE.SpriteMaterial({ map: vonkTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
    vonk.position.set(-0.62, dakY - 0.05, 0)
    vonk.scale.setScalar(0.6)
    g.add(body, neus, rug, bumper, stok, stuur, vonk)
    body.castShadow = !G.licht
    G.groep.add(g)
    const x = x0 + 1.5 + ((i * 3.7) % (x1 - x0 - 3))
    const z = z0 + 1.5 + ((i * 2.9) % (z1 - z0 - 3))
    return { g, x, z, h: G.toeval() * Math.PI * 2, v: 1.6 + G.toeval(), vx: 0, vz: 0, draai: 0, tik: 0, vonk }
  })
  let mijn: Auto | null = null
  let start = 0
  let nu = 0
  let botsen = 0
  let laatsteBots = 0
  let uitstap: { x: number; z: number; yaw: number } | null = null
  const stuurIn = { vooruit: 0, draai: 0 }
  const uit = () => {
    if (mijn) mijn.v = 1.6
    mijn = null
    uitstap = { x: x0 - 1.6, z: cz, yaw: Math.PI / 2 }
  }
  G.animaties.push((s, dt) => {
    nu = s
    dt = Math.min(dt, 0.05)
    for (const a of autos) {
      if (a === mijn) {
        // Jij stuurt: gas geven (vooruit/achteruit) en draaien, met wat traagheid.
        const doelV = stuurIn.vooruit * 4.2
        a.v += (doelV - a.v) * Math.min(1, dt * 2.2)
        a.h += stuurIn.draai * dt * 2.1 * (a.v < -0.1 ? -1 : 1)
      } else {
        // De anderen rijden wat rond, met af en toe een draai.
        a.draai += (G.toeval() - 0.5) * dt * 3
        a.draai *= 0.98
        a.h += a.draai * dt
        a.v += (2.1 - a.v) * dt * 0.8
      }
      a.x += (Math.cos(a.h) * a.v + a.vx) * dt
      a.z += (-Math.sin(a.h) * a.v + a.vz) * dt
      a.vx *= 1 - Math.min(1, dt * 3)
      a.vz *= 1 - Math.min(1, dt * 3)
      // De rand: terugkaatsen.
      const kaats = (spiegel: (h: number) => number) => {
        if (a !== mijn) a.h = spiegel(a.h)
      }
      if (a.x < x0 + R) {
        a.x = x0 + R
        a.vx = Math.abs(a.v) * 0.9
        kaats((h) => Math.PI - h)
      }
      if (a.x > x1 - R) {
        a.x = x1 - R
        a.vx = -Math.abs(a.v) * 0.9
        kaats((h) => Math.PI - h)
      }
      if (a.z < z0 + R) {
        a.z = z0 + R
        a.vz = Math.abs(a.v) * 0.9
        kaats((h) => -h)
      }
      if (a.z > z1 - R) {
        a.z = z1 - R
        a.vz = -Math.abs(a.v) * 0.9
        kaats((h) => -h)
      }
    }
    // Botsen: uit elkaar duwen en een stoot geven.
    for (let i = 0; i < autos.length; i++)
      for (let j = i + 1; j < autos.length; j++) {
        const a = autos[i]
        const b = autos[j]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const d = Math.hypot(dx, dz)
        if (d >= 2 * R || d < 1e-4) continue
        const nx = dx / d
        const nz = dz / d
        const over = 2 * R - d
        a.x -= nx * over * 0.5
        a.z -= nz * over * 0.5
        b.x += nx * over * 0.5
        b.z += nz * over * 0.5
        const kracht = 1.2 + Math.abs(a.v) * 0.5 + Math.abs(b.v) * 0.5
        a.vx -= nx * kracht
        a.vz -= nz * kracht
        b.vx += nx * kracht
        b.vz += nz * kracht
        a.tik = b.tik = 0.25
        if (a !== mijn) a.h += (G.toeval() - 0.5) * 1.5
        if (b !== mijn) b.h += (G.toeval() - 0.5) * 1.5
        if ((a === mijn || b === mijn) && s - laatsteBots > 0.6) {
          laatsteBots = s
          botsen++
          if (botsen === 1 || botsen % 5 === 0) melding(botsen === 1 ? '💥 BOTS! Daar ging je eerste.' : `💥 Al ${botsen} keer gebotst!`)
        }
      }
    for (const a of autos) {
      a.tik = Math.max(0, a.tik - dt)
      a.g.position.set(a.x, 0.16, a.z)
      a.g.rotation.y = a.h
      a.g.rotation.z = a.tik * 0.25
      // Vonken aan het stroomnet: af en toe, en altijd bij een bots.
      ;(a.vonk.material as THREE.SpriteMaterial).opacity = a.tik > 0 ? 1 : Math.random() < 0.04 ? 0.8 : 0
    }
    if (mijn && s - start > DUUR) uit()
  })
  return {
    id: 'botsautos',
    actie: "💥 Stap in een botsauto",
    bij: (x, z) => !mijn && x < x0 && x > x0 - 2.6 && Math.abs(z - cz) < 1.8,
    stapIn() {
      // Het wagentje dat het dichtst bij de ingang staat, wordt het jouwe.
      let beste = autos[0]
      for (const a of autos) if (Math.hypot(a.x - x0, a.z - cz) < Math.hypot(beste.x - x0, beste.z - cz)) beste = a
      mijn = beste
      mijn.x = x0 + 1.4
      mijn.z = cz
      mijn.h = 0
      mijn.v = 0
      start = nu
      botsen = 0
      stuurIn.vooruit = 0
      stuurIn.draai = 0
    },
    inRit: () => mijn != null,
    info() {
      if (!mijn) return null
      const rest = Math.max(0, Math.ceil(DUUR - (nu - start)))
      return { titel: "💥 In de botsauto", regel: `${botsen} keer gebotst · nog ${rest} s · joystick of pijltjes om te rijden`, rest, magUit: true }
    },
    camera(camera, _yaw, pitch) {
      if (!mijn) return
      // Achter het stuur, een beetje achteruit zodat je de neus van je wagentje ziet.
      const h = mijn.h
      camera.position.set(mijn.x - Math.cos(h) * 0.45, 1.55, mijn.z + Math.sin(h) * 0.45)
      const p = Math.max(-0.5, Math.min(0.3, pitch)) - 0.12
      camera.lookAt(camera.position.x + Math.cos(h) * Math.cos(p), camera.position.y + Math.sin(p), camera.position.z - Math.sin(h) * Math.cos(p))
    },
    stuur(_dt, vooruit, draai) {
      stuurIn.vooruit = Math.max(-1, Math.min(1, vooruit))
      stuurIn.draai = Math.max(-1, Math.min(1, draai))
    },
    stapUit: () => uit(),
    uitgestapt() {
      const u = uitstap
      uitstap = null
      return u
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Kermisspelletjes: blikken gooien en eendjes vissen
// ---------------------------------------------------------------------------------------------

/** Een kraam: toog, achterwand, zijwanden en een gestreept dak. De voorkant kijkt naar `ry`. */
function kraam(G: Gereedschap, x: number, z: number, ry: number, b: number, d: number, kleur: string) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  g.rotation.y = ry
  G.groep.add(g)
  const zet = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(px, py, pz)
    m.castShadow = !G.licht
    g.add(m)
    return m
  }
  const verf = new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.55 })
  zet(rondeDoos(b, 1.05, 0.5, 0.06), verf, 0, 0.52, d / 2 - 0.25)
  zet(rondeDoos(b + 0.2, 0.08, 0.7, 0.03), G.mat.hout, 0, 1.08, d / 2 - 0.2)
  zet(rondeDoos(b, 2.8, 0.12, 0.04), verf, 0, 1.4, -d / 2)
  for (const sx of [-1, 1]) zet(rondeDoos(0.12, 2.8, d, 0.04), verf, (sx * b) / 2, 1.4, 0)
  const dak = new THREE.Mesh(new THREE.BoxGeometry(b + 0.6, 0.08, d + 0.9), new THREE.MeshStandardMaterial({ map: gestreept(G, kleur, '#ffffff', 10), roughness: 0.6 }))
  dak.position.set(0, 2.95, 0.2)
  dak.rotation.x = 0.12
  g.add(dak)
  // Een lamp binnen.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff3c4', toneMapped: false }))
  lamp.position.set(0, 2.6, 0)
  g.add(lamp)
  return g
}

function bouwBlikken(G: Gereedschap): Kermisspel {
  const KX = -21
  const KZ = 121
  // De voorkant kijkt naar het oosten (naar het rad en het pad).
  const k = kraam(G, KX, KZ, Math.PI / 2, 4.6, 2.6, '#dc2626')
  const bb = G.bord('🥫 BLIKKEN GOOIEN', 4.2, 0.8, '#0b1220', '#fde68a', 'alles om = een prijs')
  bb.position.set(0, 3.35, 1.4)
  k.add(bb)
  // Drie plankjes met elk een piramide van zes blikken.
  const blikGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.22, 12)
  const blikMat = [
    new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.8, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: G.thema.primair, metalness: 0.6, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.6, roughness: 0.35 }),
  ]
  type Blik = { m: THREE.Mesh; thuis: THREE.Vector3; v: THREE.Vector3; w: number; valt: boolean }
  const torens: Blik[][] = []
  for (let t = 0; t < 3; t++) {
    const px = -1.4 + t * 1.4
    const plank = new THREE.Mesh(rondeDoos(1.0, 0.06, 0.4, 0.02), G.mat.hout)
    plank.position.set(px, 1.25, -0.6)
    k.add(plank)
    const toren: Blik[] = []
    for (let rij = 0; rij < 3; rij++)
      for (let i = 0; i < 3 - rij; i++) {
        const m = new THREE.Mesh(blikGeo, blikMat[(t + rij + i) % 3])
        const thuis = new THREE.Vector3(px + (i - (2 - rij) / 2) * 0.2, 1.39 + rij * 0.22, -0.6)
        m.position.copy(thuis)
        k.add(m)
        toren.push({ m, thuis, v: new THREE.Vector3(), w: 0, valt: false })
      }
    torens.push(toren)
  }
  // Prijzen: knuffels (krachtballen met oortjes) aan het plafond.
  for (let i = 0; i < 5; i++) {
    const knuffel = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshStandardMaterial({ color: ['#f472b6', '#60a5fa', '#facc15', '#34d399', '#f97316'][i], roughness: 0.9 }))
    knuffel.position.set(-1.8 + i * 0.9, 2.35, 0.1)
    k.add(knuffel)
  }
  G.blok(KX - 1.5, KX + 1.5, KZ - 2.5, KZ + 2.5)
  G.lichtPlas(KX + 2.5, KZ, 4, '#ffd9a0', 0.25)
  let reset = -1
  let nu = 0
  G.animaties.push((s, dt) => {
    nu = s
    for (const toren of torens)
      for (const b of toren) {
        if (!b.valt) continue
        b.v.y -= 9.81 * dt
        b.m.position.addScaledVector(b.v, dt)
        b.m.rotation.x += b.w * dt
        // Op de grond van de kraam blijft het liggen.
        if (b.m.position.y < 0.1) {
          b.m.position.y = 0.1
          b.v.set(0, 0, 0)
          b.w = 0
        }
      }
    if (reset > 0 && s > reset) {
      reset = -1
      for (const toren of torens)
        for (const b of toren) {
          b.valt = false
          b.m.position.copy(b.thuis)
          b.m.rotation.set(0, 0, 0)
        }
    }
  })
  return {
    id: 'blikken',
    naam: 'Blikken gooien',
    actie: '🥫 Gooi de blikken om',
    uitleg: 'Mik in het midden van de meter: hoe zuiverder je gooit, hoe meer blikken er omgaan.',
    knop: '🎯 Gooi!',
    meter: true,
    bij: (x, z) => Math.hypot(x - (KX + 2.6), z - KZ) < 2.2,
    speel(kracht) {
      // Zuiver = in het midden van de meter.
      const zuiver = Math.max(0, 1 - Math.abs(kracht - 0.5) * 2)
      const doel = torens[Math.floor(nu * 7) % 3]
      const om = Math.max(0, Math.min(6, Math.round(Math.pow(zuiver, 0.8) * 6 + (G.toeval() - 0.5) * 1.5)))
      // Van boven naar beneden: wat bovenaan staat, valt eerst.
      const volgorde = [...doel].sort((a, b) => b.thuis.y - a.thuis.y)
      volgorde.slice(0, om).forEach((b, i) => {
        b.valt = true
        b.v.set((G.toeval() - 0.5) * 1.2, 1 + G.toeval() * 1.5, -1.5 - G.toeval() * 1.5 - i * 0.1)
        b.w = (G.toeval() - 0.5) * 18
      })
      reset = nu + 4
      if (om === 6) return { tekst: '🏆 Alle zes om! Je wint een knuffel-krachtbal.', goed: true }
      if (om >= 4) return { tekst: `🥫 ${om} van de 6 om — bijna! Nog eens?`, goed: true }
      if (om >= 1) return { tekst: `🥫 ${om} blik${om > 1 ? 'ken' : ''} om. Mik beter in het midden!`, goed: false }
      return { tekst: '😅 Mis! De bal vloog ernaast.', goed: false }
    },
  }
}

function bouwEendjes(G: Gereedschap): Kermisspel {
  const EX = 21
  const EZ = 121
  // Een ronde bak met stromend water en eendjes die rondjes drijven, onder een dakje.
  G.deel(new THREE.CylinderGeometry(2.4, 2.5, 0.7, 32, 1, true).translate(0, 0.35, 0), new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.5, side: THREE.DoubleSide }), EX, 0, EZ)
  G.deel(new THREE.TorusGeometry(2.42, 0.1, 6, 40).rotateX(Math.PI / 2).translate(0, 0.72, 0), G.mat.wit, EX, 0, EZ)
  const water = new THREE.Mesh(new THREE.RingGeometry(0.9, 2.38, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.15, metalness: 0.2, emissive: '#0c4a6e', emissiveIntensity: 0.35 }))
  water.position.set(EX, 0.6, EZ)
  G.groep.add(water)
  G.deel(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 20).translate(0, 0.4, 0), G.mat.club, EX, 0, EZ)
  G.deel(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6).translate(0, 1.6, 0), G.mat.staal, EX, 0, EZ)
  G.deel(new THREE.ConeGeometry(3.0, 1.2, 16, 1, true).translate(0, 3.6, 0), new THREE.MeshStandardMaterial({ map: gestreept(G, '#facc15', '#ffffff', 16), side: THREE.DoubleSide, roughness: 0.6 }), EX, 0, EZ)
  const eb = G.bord('🦆 EENDJES VISSEN', 4, 0.8, '#0b1220', '#fde68a', 'elke eend wint!')
  eb.position.set(EX, 2.55, EZ - 2.65)
  eb.rotation.y = Math.PI
  G.groep.add(eb)
  // De eendjes.
  const lijf = new THREE.SphereGeometry(0.16, 12, 8).scale(1.25, 0.85, 1)
  const kop = new THREE.SphereGeometry(0.1, 10, 8)
  const bek = new THREE.ConeGeometry(0.04, 0.09, 6).rotateZ(-Math.PI / 2)
  const geel = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.45 })
  const oranje = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.5 })
  const eenden = Array.from({ length: 14 }, (_, i) => {
    const g = new THREE.Group()
    const l = new THREE.Mesh(lijf, i % 4 === 0 ? G.mat.club : geel)
    const k = new THREE.Mesh(kop, i % 4 === 0 ? G.mat.club : geel)
    k.position.set(0.13, 0.14, 0)
    const b = new THREE.Mesh(bek, oranje)
    b.position.set(0.25, 0.13, 0)
    g.add(l, k, b)
    G.groep.add(g)
    return { g, a: (i / 14) * Math.PI * 2, r: 1.45 + (i % 2) * 0.5, op: 0 }
  })
  G.blok(EX - 2.6, EX + 2.6, EZ - 2.6, EZ + 2.6)
  G.lichtPlas(EX, EZ, 4.5, '#bae6fd', 0.25)
  let gevist = -1
  let tot = 0
  let nu = 0
  G.animaties.push((s, dt) => {
    nu = s
    eenden.forEach((e, i) => {
      e.a += dt * (0.32 + (i % 2) * 0.06)
      const omhoog = i === gevist && s < tot ? Math.min(1, (tot - s) * 2, (s - (tot - 3)) * 3) : 0
      e.op += (omhoog - e.op) * Math.min(1, dt * 6)
      e.g.position.set(EX + Math.cos(e.a) * e.r, 0.62 + Math.sin(s * 3 + i) * 0.015 + e.op * 1.1, EZ + Math.sin(e.a) * e.r)
      e.g.rotation.y = -e.a - Math.PI / 2
      e.g.rotation.x = e.op * 2.6
    })
  })
  const prijzen = ['een sleutelhanger in clubkleuren', 'een sjaal van de club', 'een fluitje van de scheidsrechter', 'een minikrachtbal', 'een stickervel van de ploeg', 'een badeendje met clublogo', 'een zak snoep', 'een vlaggetje voor op de tribune']
  return {
    id: 'eendjes',
    naam: 'Eendjes vissen',
    actie: '🦆 Vis een eendje',
    uitleg: 'Elke eend heeft een nummer onderaan. Elke eend wint — de gele met het clublogo wint dubbel!',
    knop: '🎣 Vissen!',
    meter: false,
    bij: (x, z) => Math.hypot(x - EX, z - EZ) < 3.6,
    speel() {
      gevist = Math.floor(G.toeval() * eenden.length)
      tot = nu + 3
      const nr = 1 + Math.floor(G.toeval() * 40)
      const prijs = prijzen[nr % prijzen.length]
      const club = gevist % 4 === 0
      return { tekst: `🦆 Eend nummer ${nr}${club ? ' (met clublogo: dubbel!)' : ''}: je wint ${prijs}${club ? ' — twee keer' : ''}!`, goed: true }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Opvulling: kraampjes, toiletwagen, ballonnen, fotobord, banken, bloembakken, vuilbakken
// ---------------------------------------------------------------------------------------------

function bouwOpvulling(G: Gereedschap) {
  // Suikerspin en churros: een rond kraampje met een luifel en een reuzensnoepje op het dak.
  const kiosk = (x: number, z: number, naam: string, kleur: string, top: (g: THREE.Group) => void) => {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    G.groep.add(g)
    const verf = new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.5 })
    const m = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const mm = new THREE.Mesh(geo, mat)
      mm.position.y = y
      mm.castShadow = !G.licht
      g.add(mm)
      return mm
    }
    m(new THREE.CylinderGeometry(1.1, 1.2, 1.1, 20), verf, 0.55)
    m(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 20), G.mat.hout, 1.12)
    m(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), G.mat.staal, 1.9)
    m(new THREE.ConeGeometry(1.7, 0.8, 20, 1, true), new THREE.MeshStandardMaterial({ map: gestreept(G, kleur, '#ffffff', 16), side: THREE.DoubleSide, roughness: 0.6 }), 2.9)
    // Het bord kijkt naar de poort (en het stadion).
    const b = G.bord(naam, 2.2, 0.5, '#0b1220', '#fde68a')
    b.position.set(0, 1.55, -1.3)
    b.rotation.y = Math.PI
    g.add(b)
    top(g)
    G.blok(x - 1.25, x + 1.25, z - 1.25, z + 1.25)
    G.lichtPlas(x, z, 3, '#ffd9a0', 0.2)
    return g
  }
  kiosk(-30, 79, '🍭 SUIKERSPIN', '#ec4899', (g) => {
    const wolk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 2), new THREE.MeshStandardMaterial({ color: '#f9a8d4', roughness: 1 }))
    wolk.position.y = 3.9
    wolk.scale.set(1, 1.2, 1)
    g.add(wolk)
    const stok = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), G.mat.wit)
    stok.position.y = 3.1
    g.add(stok)
  })
  kiosk(30, 79, '🥨 CHURROS', '#f59e0b', (g) => {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.6, 8), new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.8 }))
      c.position.set(-0.3 + i * 0.3, 3.9, 0)
      c.rotation.z = (i - 1) * 0.35
      g.add(c)
    }
  })

  // Een toiletwagen aan de oostrand, deuren naar het westen.
  {
    const TX = 57.5
    const TZ = 112
    const w = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.6 })
    G.deel(rondeDoos(2.6, 2.6, 6.4, 0.25), w, TX, 1.6, TZ)
    G.deel(rondeDoos(2.7, 0.15, 6.5, 0.05), G.mat.club, TX, 2.95, TZ)
    for (let i = 0; i < 3; i++) {
      const deur = new THREE.Mesh(rondeDoos(0.06, 2.0, 0.9, 0.02), new THREE.MeshStandardMaterial({ color: i === 1 ? '#f472b6' : '#60a5fa', roughness: 0.5 }))
      deur.position.set(TX - 1.32, 1.35, TZ - 2 + i * 2)
      G.groep.add(deur)
    }
    const wc = G.bord('🚻 WC', 2.2, 0.6, '#0b1220', '#ffffff')
    wc.position.set(TX - 1.34, 2.65, TZ)
    wc.rotation.y = -Math.PI / 2
    G.groep.add(wc)
    for (let i = 0; i < 3; i++) G.deel(rondeDoos(0.8, 0.3, 1.2, 0.05), G.mat.donker, TX - 1.7, 0.15, TZ - 2 + i * 2)
    G.blok(TX - 1.35, TX + 1.35, TZ - 3.3, TZ + 3.3)
  }

  // De ballonverkoper: een kar met een bos ballonnen die zachtjes wiegen.
  {
    const BX = 7.2
    const BZ = 88.5
    G.deel(rondeDoos(1.3, 0.8, 0.8, 0.1), G.mat.club2, BX, 0.75, BZ)
    for (const dz of [-0.4, 0.4]) G.deel(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 14).rotateX(Math.PI / 2), G.mat.donker, BX, 0.3, BZ + dz)
    const bos = new THREE.Group()
    bos.position.set(BX, 1.2, BZ)
    G.groep.add(bos)
    const kleuren = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', G.thema.primair, G.thema.secundair]
    const touw = new THREE.MeshBasicMaterial({ color: '#e5e7eb' })
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 * 2.3
      const r = 0.25 + (i % 4) * 0.14
      const hoog = 1.9 + (i % 5) * 0.28
      const top = new THREE.Vector3(Math.cos(a) * r, hoog, Math.sin(a) * r)
      const ballon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: kleuren[i % kleuren.length], roughness: 0.25, metalness: 0.1 }))
      ballon.position.copy(top)
      bos.add(ballon)
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, top.length(), 3).translate(0, top.length() / 2, 0), touw)
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().normalize())
      bos.add(t)
    }
    G.animaties.push((s) => {
      bos.rotation.z = Math.sin(s * 0.7) * 0.05
      bos.rotation.x = Math.sin(s * 0.53 + 1) * 0.04
    })
    G.blok(BX - 0.8, BX + 0.8, BZ - 0.6, BZ + 0.6)
  }

  // Het fotobord: twee figuurtjes in clubtenue met een gat voor je gezicht.
  {
    const FX = -8.5
    const FZ = 88
    const t = G.tex(512, 384, (g) => {
      g.fillStyle = '#0b1220'
      g.fillRect(0, 0, 512, 384)
      const gr = g.createLinearGradient(0, 0, 0, 384)
      gr.addColorStop(0, G.thema.primair)
      gr.addColorStop(1, G.thema.secundair)
      g.fillStyle = gr
      g.fillRect(8, 8, 496, 368)
      for (const cx of [150, 362]) {
        // Een lijfje in clubkleur met een krachtbal onder de arm.
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.ellipse(cx, 300, 90, 110, 0, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = G.thema.primair
        g.beginPath()
        g.ellipse(cx, 300, 78, 98, 0, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#f97316'
        g.beginPath()
        g.arc(cx + 70, 300, 30, 0, Math.PI * 2)
        g.fill()
        // Het gat voor je gezicht.
        g.fillStyle = '#020617'
        g.beginPath()
        g.arc(cx, 130, 52, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#ffffff'
      g.font = '900 34px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText('IK WAS ERBIJ!', 256, 44)
    })
    const bord = new THREE.Mesh(rondeDoos(3.2, 2.4, 0.08, 0.03), [
      G.mat.donker,
      G.mat.donker,
      G.mat.donker,
      G.mat.donker,
      new THREE.MeshBasicMaterial({ map: t }),
      new THREE.MeshBasicMaterial({ map: t }),
    ] as unknown as THREE.Material)
    bord.position.set(FX, 1.7, FZ)
    bord.rotation.y = Math.PI / 2
    bord.castShadow = !G.licht
    G.groep.add(bord)
    for (const dz of [-1.2, 1.2]) G.deel(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6).translate(0, 0.6, 0), G.mat.donker, FX, 0, FZ + dz)
    G.blok(FX - 0.3, FX + 0.3, FZ - 1.7, FZ + 1.7)
  }

  // Banken, bloembakken en vuilbakken langs het pad.
  {
    const zitting = new THREE.BoxGeometry(1.8, 0.06, 0.45)
    const leuning = new THREE.BoxGeometry(1.8, 0.4, 0.05)
    const poot = new THREE.BoxGeometry(0.06, 0.45, 0.45)
    const bank = (x: number, z: number, ry: number) => {
      const g = new THREE.Group()
      g.position.set(x, 0, z)
      g.rotation.y = ry
      G.groep.add(g)
      const z1 = new THREE.Mesh(zitting, G.mat.hout)
      z1.position.y = 0.46
      const l = new THREE.Mesh(leuning, G.mat.hout)
      l.position.set(0, 0.75, -0.2)
      g.add(z1, l)
      for (const px of [-0.8, 0.8]) {
        const p = new THREE.Mesh(poot, G.mat.donker)
        p.position.set(px, 0.22, 0)
        g.add(p)
      }
      const ext = Math.abs(Math.sin(ry)) > 0.5
      G.blok(x - (ext ? 0.35 : 0.95), x + (ext ? 0.35 : 0.95), z - (ext ? 0.95 : 0.35), z + (ext ? 0.95 : 0.35))
    }
    const vuilbak = (x: number, z: number) => {
      G.deel(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 12).translate(0, 0.43, 0), G.mat.club, x, 0, z)
      G.deel(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12).translate(0, 0.88, 0), G.mat.donker, x, 0, z)
      G.blok(x - 0.3, x + 0.3, z - 0.3, z + 0.3)
    }
    const bloembak = (x: number, z: number) => {
      G.deel(rondeDoos(1.6, 0.55, 0.7, 0.06), G.mat.hout, x, 0.28, z)
      const kleuren = ['#f472b6', '#facc15', '#f97316', '#a78bfa', '#ffffff']
      for (let i = 0; i < 9; i++) {
        const bloem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: kleuren[i % 5], roughness: 0.8 }))
        bloem.position.set(x - 0.6 + (i % 5) * 0.3, 0.68 + (i % 2) * 0.06, z - 0.15 + Math.floor(i / 5) * 0.3)
        G.groep.add(bloem)
      }
      G.deel(new THREE.BoxGeometry(1.5, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.9 }), x, 0.58, z)
      G.blok(x - 0.85, x + 0.85, z - 0.4, z + 0.4)
    }
    // Langs het hoofdpad (x ±3), tussen de slingerpalen (z 80, 87, 94, …) en de dwarsweg (z 90–94).
    for (const z of [98.5, 105.5]) {
      bank(-4.9, z, Math.PI / 2)
      bank(4.9, z, -Math.PI / 2)
    }
    vuilbak(-4.6, 96.5)
    vuilbak(4.6, 96.5)
    vuilbak(-4.6, 85)
    vuilbak(4.6, 85)
    // Aan de poort.
    bloembak(-8.5, 78.6)
    bloembak(8.5, 78.6)
    // Langs de dwarsweg (tussen de zweefmolen, de botsauto's en de feesttent).
    for (const x of [-27, 12]) {
      bank(x, 95.6, Math.PI)
      vuilbak(x + 1.6, 95.4)
    }
  }
}

/** Een schiettent aan de oostrand: draaiende schijven en een rij prijzen (om naar te kijken). */
function bouwSchiettent(G: Gereedschap) {
  const SX = 53
  const SZ = 121.5
  const k = kraam(G, SX, SZ, -Math.PI / 2, 5.2, 2.6, '#2563eb')
  const sb = G.bord('🎯 SCHIETTENT', 4.4, 0.8, '#0b1220', '#fde68a', 'roos = hoofdprijs')
  sb.position.set(0, 3.35, 1.4)
  k.add(sb)
  const schijfTex = G.tex(128, 128, (g) => {
    for (let r = 64, i = 0; r > 0; r -= 12, i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#dc2626'
      g.beginPath()
      g.arc(64, 64, r, 0, Math.PI * 2)
      g.fill()
    }
  })
  const schijven = Array.from({ length: 5 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), new THREE.MeshBasicMaterial({ map: schijfTex }))
    m.position.set(-2 + i, 1.8, -1.2)
    k.add(m)
    return m
  })
  G.animaties.push((s) => schijven.forEach((m, i) => (m.position.x = -2 + i + Math.sin(s * 0.9 + i) * 0.25)))
  G.blok(SX - 1.5, SX + 1.5, SZ - 2.8, SZ + 2.8)
  G.lichtPlas(SX - 2.5, SZ, 4, '#bfdbfe', 0.22)
}

/** Bouw de kermis; geeft de nieuwe ritten en spelletjes terug. */
export function bouwKermis(G: Gereedschap, melding: (tekst: string) => void): { ritten: Rit[]; spellen: Kermisspel[] } {
  const ritten = [bouwZweefmolen(G), bouwBotsautos(G, melding)]
  const spellen = [bouwBlikken(G), bouwEendjes(G)]
  bouwOpvulling(G)
  bouwSchiettent(G)
  return { ritten, spellen }
}
