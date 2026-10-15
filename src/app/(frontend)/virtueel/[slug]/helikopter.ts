import * as THREE from 'three'

import { gevelAfstand, GEVEL, type StadionThema } from '@/lib/virtueel'
import { rondeDoos } from './rond'

// De clubhelikopter op het dak: een helikopterplatform (20 m) dat aan de oostkant van de dakring
// uitsteekt, verlicht zoals een echt helipad: groene randlichten, een oplichtende H, schijnwerpers op
// masten die de helikopter aanlichten, een ledring in clubkleur en een zwaailicht. Erop een
// helikopter op ware grootte (zoals een H145: 13,6 m lang met de rotor, rotor van 11 m, bijna 4 m
// hoog) in glanzende clubkleuren, met de reclame van de sponsors op de staart en het clublogo op de
// deuren. Een verlicht bord aan de brug legt uit hoe je mag vliegen (en hoe ver je al staat).
// Met de sleutel uit de kluis (alle gouden ballen) stap je in: de rotor draait op, je stijgt op en
// vliegt rond het stadion (joystick: vooruit en draaien; stijgen en dalen met de knoppen). "Landen"
// brengt je vanzelf terug naar het platform.

export type Vluchtinfo = { fase: Fase; hoogte: number; snelheid: number }
type Fase = 'geparkeerd' | 'opstijgen' | 'vliegen' | 'landen' | 'uitstappen'

export type Helikopter = {
  /** Mag je hier staan (het platform en de brug ernaartoe)? */
  opPlatform: (x: number, z: number) => boolean
  obstakel: { x0: number; x1: number; z0: number; z1: number }
  /** Sta je bij de deur? */
  bij: (x: number, z: number) => boolean
  inVlucht: () => boolean
  stapIn: () => void
  landen: () => void
  /** Elke frame tijdens de vlucht: stuur en zet de camera erachter. */
  stuur: (dt: number, vooruit: number, draai: number, stijg: number, camera: THREE.PerspectiveCamera) => void
  /** Na het landen: waar je uitstapt (één keer), anders null. */
  uitgestapt: () => { x: number; z: number; yaw: number } | null
  info: () => Vluchtinfo
  /** Werk het infobord bij: hoeveel gouden ballen je al hebt, en of je de sleutel hebt. */
  zetVoortgang: (gevonden: number, totaal: number, sleutel: boolean) => void
  update: (seconden: number, dt: number) => void
}

const tex = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  teken(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return { t, c }
}

export function bouwHelikopter(
  scene: THREE.Scene,
  opt: { thema: StadionThema; logo: Promise<HTMLImageElement | null>; y: number; licht: boolean },
): Helikopter {
  const { thema } = opt
  const Y = opt.y
  // Het platform: oostelijk van de gevel, op de hoogte van de dakring.
  const R = 10
  const px = GEVEL.A + 0.8 + R + 0.4
  const pz = 0
  const brug = { x0: GEVEL.A - 0.5, x1: px - R + 0.6, z0: -1.4, z1: 1.4 }

  // ---------- het platform ----------
  const platform = new THREE.Group()
  scene.add(platform)
  const { t: padTex } = tex(1024, 1024, (g) => {
    g.fillStyle = '#2b2f36'
    g.fillRect(0, 0, 1024, 1024)
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2)
    }
    g.strokeStyle = thema.primair
    g.lineWidth = 34
    g.beginPath()
    g.arc(512, 512, 460, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = '#facc15'
    g.lineWidth = 18
    g.beginPath()
    g.arc(512, 512, 330, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#f8fafc'
    g.font = '900 420px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('H', 512, 540)
  })
  // De markeringen lichten op (in de schijnwerpers en met ingebouwde leds).
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.35, 64), [
    new THREE.MeshStandardMaterial({ color: '#3f4650', metalness: 0.6, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.7, emissive: '#ffffff', emissiveMap: padTex, emissiveIntensity: 0.32 }),
    new THREE.MeshStandardMaterial({ color: '#1f242b' }),
  ])
  pad.position.set(px, Y - 0.175, pz)
  pad.receiveShadow = true
  platform.add(pad)
  // De brug van de ring naar het platform.
  const brugMesh = new THREE.Mesh(rondeDoos(brug.x1 - brug.x0, 0.3, brug.z1 - brug.z0, 0.04), new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.5, roughness: 0.5 }))
  brugMesh.position.set((brug.x0 + brug.x1) / 2, Y - 0.15, 0)
  platform.add(brugMesh)
  // Een veiligheidsnet rond de rand, en draagbalken naar de gevel.
  const net = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.9, R + 0.2, 0.6, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#111827', transparent: true, opacity: 0.55, side: THREE.DoubleSide, wireframe: true }))
  net.position.set(px, Y - 0.25, pz)
  platform.add(net)
  const staal = new THREE.MeshStandardMaterial({ color: '#6b7280', metalness: 0.8, roughness: 0.35 })
  const deelP = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = platform) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    p.add(m)
    return m
  }
  for (const dz of [-4.5, 0, 4.5]) {
    const a = new THREE.Vector3(GEVEL.A, Y - 9, dz)
    const b = new THREE.Vector3(px + 1.5, Y - 0.4, pz + dz * 0.8)
    const balk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, a.distanceTo(b), 10), staal)
    balk.position.copy(a).lerp(b, 0.5)
    balk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    platform.add(balk)
  }
  // ---------- de verlichting, zoals op een echt helipad ----------
  const gloed = tex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.3, 'rgba(255,255,255,.45)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  }).t
  const halo = (kleur: string, x: number, y: number, z: number, maat: number, sterk = 0.9) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gloed, color: kleur, transparent: true, opacity: sterk, depthWrite: false, blending: THREE.AdditiveBlending }))
    sp.position.set(x, y, z)
    sp.scale.set(maat, maat, 1)
    platform.add(sp)
    return sp
  }
  // Groene randlichten (vast), ingebouwde lampjes met een gloed.
  const lampGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.12, 12)
  const groen = new THREE.MeshBasicMaterial({ color: '#4ade80', toneMapped: false })
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2
    const x = px + Math.cos(a) * (R - 0.3)
    const z = pz + Math.sin(a) * (R - 0.3)
    deelP(lampGeo, groen, x, Y + 0.06, z)
    halo('#22c55e', x, Y + 0.15, z, 0.9, 0.8)
  }
  // Gele lampjes rond de doelcirkel.
  const geel = new THREE.MeshBasicMaterial({ color: '#fde047', toneMapped: false })
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const x = px + Math.cos(a) * R * 0.645
    const z = pz + Math.sin(a) * R * 0.645
    deelP(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), geel, x, Y + 0.03, z)
    halo('#facc15', x, Y + 0.1, z, 0.6, 0.7)
  }
  // Een ledring in clubkleur langs de rand, met een zachte gloed eronder.
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.05, 6, 128).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: thema.primair, toneMapped: false }))
  ledRing.position.set(px, Y - 0.05, pz)
  platform.add(ledRing)
  // Schijnwerpers op vier lage masten aan de rand, gericht op de helikopter; lichtplassen op het pad.
  const plasTex = gloed
  const lichtPlas = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: plasTex, color: '#fff3d6', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))
  lichtPlas.position.set(px, Y + 0.02, pz)
  platform.add(lichtPlas)
  const mastHoeken = [0.8, 2.35, 3.95, 5.5]
  for (const a of mastHoeken) {
    const x = px + Math.cos(a) * (R - 0.9)
    const z = pz + Math.sin(a) * (R - 0.9)
    deelP(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 8).translate(0, 0.7, 0), staal, x, Y, z)
    const kop = deelP(rondeDoos(0.6, 0.4, 0.35, 0.06), new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.6, roughness: 0.4 }), x, Y + 1.5, z)
    kop.lookAt(px, Y + 1.2, pz)
    const lens = deelP(new THREE.CircleGeometry(0.15, 16), new THREE.MeshBasicMaterial({ color: '#fffaf0', toneMapped: false }), 0, 0, 0.18, kop)
    void lens
    halo('#fff7e0', x, Y + 1.5, z, 2.2, 0.75)
    // Een zichtbare lichtbundel naar de helikopter.
    const doel = new THREE.Vector3(px, Y + 1.4, pz)
    const van = new THREE.Vector3(x, Y + 1.5, z)
    const lang = van.distanceTo(doel)
    const bundel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.5, lang, 20, 1, true).translate(0, -lang / 2, 0), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.03, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    bundel.position.copy(van)
    bundel.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), doel.clone().sub(van).normalize())
    platform.add(bundel)
  }
  // Echte lampen (niet op een licht toestel): twee schijnwerpers en een warm licht boven het pad.
  if (!opt.licht) {
    for (const a of [0.8, 3.95]) {
      const spot = new THREE.SpotLight('#fff1d6', 900, 40, 0.75, 0.7, 1.6)
      spot.position.set(px + Math.cos(a) * (R - 0.9), Y + 1.6, pz + Math.sin(a) * (R - 0.9))
      spot.target.position.set(px, Y + 1.2, pz)
      platform.add(spot, spot.target)
    }
    const boven = new THREE.PointLight('#dbeafe', 260, 26, 1.6)
    boven.position.set(px - 2, Y + 9, pz)
    platform.add(boven)
  }
  // Een zwaailicht bovenop de windzakpaal.
  const zwaai = halo('#ffffff', px + R - 0.6, Y + 3.25, pz - R + 1.8, 2.6, 0)
  // Een windzak op een paal.
  const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), staal)
  paal.position.set(px + R - 0.6, Y + 1.5, pz - R + 1.8)
  platform.add(paal)
  const windzak = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.12, 1.3, 12, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f97316', side: THREE.DoubleSide }))
  windzak.geometry.translate(0.65, 0, 0)
  windzak.position.set(paal.position.x, Y + 2.9, paal.position.z)
  platform.add(windzak)

  // ---------- de helikopter (neus naar +z) ----------
  const heli = new THREE.Group()
  scene.add(heli)
  // Glanzende lak (met een blanke laklaag erover), zoals een echte toestel.
  const lak = (kleur: string) => new THREE.MeshPhysicalMaterial({ color: kleur, metalness: 0.25, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 })
  const romp = lak(thema.primair)
  const wit = lak('#f8fafc')
  const tweede = lak(thema.secundair)
  const glas = new THREE.MeshStandardMaterial({ color: '#0b1220', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.5 })
  const zwart = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.6, roughness: 0.4 })
  const deel = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = heli) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    p.add(m)
    return m
  }
  // De cabine: een gestroomlijnde druppel, met een witte buik en een band in de tweede kleur.
  // Ware grootte: de romp is 2 m breed (zoals een H145), de cabine 5 m lang.
  const BR = 1.0
  const cabine = deel(new THREE.SphereGeometry(1, 48, 32), romp, 0, 1.75, 0.2)
  cabine.scale.set(BR, 1.15, 2.5)
  const buik = deel(new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wit, 0, 1.72, 0.2)
  buik.scale.set(BR + 0.01, 1.0, 2.51)
  const band = deel(new THREE.SphereGeometry(1, 48, 4, 0, Math.PI * 2, Math.PI / 2 - 0.06, 0.12), tweede, 0, 1.75, 0.2)
  band.scale.set(BR + 0.015, 1.16, 2.515)
  // De ruiten: een grote voorruit, en grote ramen in de schuifdeuren (donker getint).
  const ruit = deel(new THREE.SphereGeometry(1, 40, 24, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.42), glas, 0, 1.85, 0.32)
  ruit.scale.set(BR + 0.02, 1.17, 2.52)
  for (const k of [-1, 1]) {
    for (const [z, w] of [
      [0.75, 0.9],
      [-0.45, 1.25],
    ] as const) {
      const zij = deel(rondeDoos(0.04, 0.7, w, 0.12), glas, k * (BR - 0.02) * Math.cos(Math.asin(Math.min(0.9, Math.abs(z - 0.2) / 2.5))), 2.08, z)
      void zij
    }
    // De naad van de schuifdeur, een handgreep en een opstapje.
    deel(new THREE.BoxGeometry(0.02, 1.45, 0.03), zwart, k * (BR - 0.005), 1.75, -1.18)
    deel(new THREE.BoxGeometry(0.02, 1.45, 0.03), zwart, k * (BR - 0.005) * 0.98, 1.75, 0.3)
    deel(new THREE.BoxGeometry(0.05, 0.05, 0.28), new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 1, roughness: 0.2 }), k * (BR + 0.02), 1.7, -0.95)
    deel(rondeDoos(0.35, 0.05, 0.9, 0.02), zwart, k * (BR + 0.12), 0.62, -0.45)
    // Uitlaten van de turbines.
    deel(new THREE.CylinderGeometry(0.16, 0.2, 0.45, 14).rotateZ(k * 1.2), zwart, k * 0.55, 3.1, -1.8)
  }
  // Luchtinlaten, antennes, een zoeklicht onder de buik en een pitotbuis in de neus.
  for (const k of [-1, 1]) deel(rondeDoos(0.06, 0.32, 0.6, 0.03), zwart, k * 0.76, 3.0, -0.2)
  deel(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5), zwart, 0, 3.4, -2.4).rotation.x = -0.4
  deel(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 5), zwart, 0.2, 0.55, -1.2)
  const zoek = deel(new THREE.CylinderGeometry(0.18, 0.14, 0.22, 16), zwart, 0.35, 0.72, 1.4)
  void zoek
  deel(new THREE.CircleGeometry(0.15, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fffaf0', toneMapped: false }), 0.35, 0.6, 1.4)
  deel(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 1, roughness: 0.2 }), 0, 1.45, 2.85)
  // De motorkap en de staartbalk.
  deel(rondeDoos(1.5, 0.7, 2.4, 0.3), romp, 0, 2.95, -0.8)
  const staart = deel(new THREE.CylinderGeometry(0.3, 0.55, 6.2, 20).rotateX(Math.PI / 2), romp, 0, 2.15, -4.6)
  staart.scale.set(1, 1.1, 1)
  // De staart: een vin met een ommantelde staartrotor (fenestron) en twee stabilo's.
  const vin = deel(rondeDoos(0.2, 1.35, 1.2, 0.08), romp, 0, 2.75, -7.8)
  vin.rotation.x = 0.25
  const mantel = deel(new THREE.TorusGeometry(0.62, 0.16, 12, 32).rotateY(Math.PI / 2), romp, 0, 2.3, -7.6)
  void mantel
  const staartRotor = new THREE.Group()
  staartRotor.position.set(0, 2.3, -7.6)
  heli.add(staartRotor)
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.12), zwart)
    b.position.y = 0.27
    const arm = new THREE.Group()
    arm.rotation.x = (i / 8) * Math.PI * 2
    arm.add(b)
    staartRotor.add(arm)
  }
  for (const k of [-1, 1]) deel(rondeDoos(0.9, 0.07, 0.5, 0.03), tweede, k * 0.7, 2.2, -6.5)
  // De ski's.
  for (const k of [-1, 1]) {
    const ski = deel(new THREE.CylinderGeometry(0.07, 0.07, 3.9, 12).rotateX(Math.PI / 2), zwart, k * 1.2, 0.12, 0.15)
    void ski
    const neus = deel(new THREE.TorusGeometry(0.25, 0.07, 8, 12, Math.PI / 2), zwart, k * 1.2, 0.37, 2.1)
    neus.rotation.y = Math.PI / 2
    for (const z of [-0.9, 1.1]) {
      const poot = deel(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 8), zwart, k * 0.98, 0.66, z)
      poot.rotation.z = k * 0.42
    }
  }
  // De hoofdrotor: mast, naaf, vijf bladen.
  const rotor = new THREE.Group()
  rotor.position.set(0, 3.55, -0.4)
  heli.add(rotor)
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 12), zwart))
  const naaf = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16), zwart)
  naaf.position.y = 0.28
  rotor.add(naaf)
  const bladen: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const arm = new THREE.Group()
    arm.rotation.y = (i / 5) * Math.PI * 2
    arm.position.y = 0.3
    const blad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 5.4), zwart)
    blad.position.z = 2.85
    blad.rotation.x = -0.04
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.055, 0.35), new THREE.MeshStandardMaterial({ color: '#facc15' }))
    tip.position.z = 5.4
    arm.add(blad, tip)
    rotor.add(arm)
    bladen.push(blad)
  }
  // Een doorzichtige schijf voor als de rotor op toeren is (bewegingsonscherpte).
  const schijf = new THREE.Mesh(new THREE.CircleGeometry(5.6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }))
  schijf.position.y = 0.3
  rotor.add(schijf)
  // Navigatielichten: rood links, groen rechts, een witte flitser op de staart, een rode bovenop.
  const nav = (kleur: string, x: number, y: number, z: number) => deel(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: kleur, toneMapped: false }), x, y, z)
  nav('#ff2020', -BR - 0.02, 1.7, 0.3)
  nav('#20ff60', BR + 0.02, 1.7, 0.3)
  const flits = nav('#ffffff', 0, 3.85, -8.3)
  const baken = nav('#ff2020', 0, 3.3, -1.6)
  // Een landingslicht onder de neus.
  deel(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: '#fff7df', toneMapped: false }), 0, 0.95, 2.35).rotation.x = 0.6

  // Reclame van de sponsors op de staartbalk (beide kanten) en het logo op de deuren.
  const reclameVlak = (x: number, ry: number) => {
    const { t, c } = tex(1024, 256, (g) => {
      g.fillStyle = '#f8fafc'
      g.fillRect(0, 0, 1024, 256)
      g.fillStyle = thema.primair
      g.fillRect(0, 0, 1024, 14)
      g.fillRect(0, 242, 1024, 14)
      g.fillStyle = '#0b1220'
      g.font = '900 64px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(thema.reclames[0]?.naam ?? thema.naam, 512, 130, 980)
    })
    const m = deel(new THREE.PlaneGeometry(4.2, 0.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, transparent: false }), x, 2.18, -4.5)
    m.rotation.y = ry
    return { t, c }
  }
  const reclames = [reclameVlak(0.47, Math.PI / 2), reclameVlak(-0.47, -Math.PI / 2)]
  // Het registratienummer op de vin.
  const reg = tex(512, 128, (g) => {
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 86px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(`OO-${thema.kort.toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(3, 'X').slice(0, 3)}`, 256, 68)
  }).t
  for (const k of [-1, 1]) {
    const m = deel(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshBasicMaterial({ map: reg, transparent: true }), k * 0.115, 2.85, -7.75)
    m.rotation.y = k * Math.PI / 2
  }
  // De sponsorlogo's naast elkaar op de staart (zodra ze geladen zijn).
  const sponsors = thema.reclames.slice(0, 3)
  if (sponsors.length) {
    const beelden: (HTMLImageElement | null)[] = sponsors.map(() => null)
    const teken = () => {
      for (const r of reclames) {
        const g = r.c.getContext('2d')!
        g.fillStyle = '#f8fafc'
        g.fillRect(0, 14, 1024, 228)
        const vak = 1024 / sponsors.length
        sponsors.forEach((s, i) => {
          const img = beelden[i]
          if (img && img.width) {
            const sc = Math.min((vak - 60) / img.width, 190 / img.height)
            g.drawImage(img, i * vak + (vak - img.width * sc) / 2, 128 - (img.height * sc) / 2, img.width * sc, img.height * sc)
          } else {
            g.fillStyle = '#0b1220'
            g.font = '900 44px Inter, system-ui, sans-serif'
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText(s.naam, i * vak + vak / 2, 128, vak - 30)
          }
        })
        r.t.needsUpdate = true
      }
    }
    teken()
    sponsors.forEach((s, i) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        beelden[i] = img
        teken()
      }
      img.src = s.url
    })
  }
  const deurLogo = tex(256, 256, (g) => {
    g.fillStyle = thema.secundair
    g.beginPath()
    g.arc(128, 128, 120, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 90px Inter, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(thema.kort, 128, 134)
  })
  void opt.logo.then((logo) => {
    if (!logo) return
    const g = deurLogo.c.getContext('2d')!
    g.clearRect(0, 0, 256, 256)
    g.save()
    g.beginPath()
    g.arc(128, 128, 120, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.clip()
    const sc = Math.min(200 / logo.width, 200 / logo.height)
    g.drawImage(logo, 128 - (logo.width * sc) / 2, 128 - (logo.height * sc) / 2, logo.width * sc, logo.height * sc)
    g.restore()
    deurLogo.t.needsUpdate = true
  })
  for (const k of [-1, 1]) {
    const l = deel(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ map: deurLogo.t, transparent: true }), k * (BR + 0.01), 1.42, -0.55)
    l.rotation.y = k * Math.PI / 2
  }
  if (!opt.licht) heli.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null))

  // ---------- het infobord aan de brug: hoe mag je vliegen? ----------
  const bordC = document.createElement('canvas')
  bordC.width = 768
  bordC.height = 512
  const bordTex = new THREE.CanvasTexture(bordC)
  bordTex.colorSpace = THREE.SRGBColorSpace
  const tekenBord = (gevonden: number, totaal: number, sleutel: boolean) => {
    const g = bordC.getContext('2d')!
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 768, 512)
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 768, 92)
    g.fillStyle = thema.tekstOpPrimair
    g.font = '900 50px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('🚁 HELIPORT', 30, 48)
    g.font = '700 26px Inter, system-ui, sans-serif'
    g.textAlign = 'right'
    g.fillText('vlieg met de clubhelikopter', 740, 50)
    g.textAlign = 'left'
    const stap = (y: number, nr: string, tekst: string, sub: string, klaar: boolean) => {
      g.fillStyle = klaar ? '#22c55e' : '#1f2937'
      g.beginPath()
      g.arc(62, y, 30, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff'
      g.font = '900 32px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(klaar ? '✓' : nr, 62, y + 2)
      g.textAlign = 'left'
      g.fillStyle = klaar ? '#86efac' : '#f8fafc'
      g.font = '800 30px Inter, system-ui, sans-serif'
      g.fillText(tekst, 112, y - 14)
      g.fillStyle = '#94a3b8'
      g.font = '600 22px Inter, system-ui, sans-serif'
      g.fillText(sub, 112, y + 20)
    }
    stap(160, '1', `Vind alle ${totaal} gouden ballen`, `in en rond het stadion — jij hebt er ${gevonden}/${totaal}`, gevonden >= totaal)
    stap(275, '2', 'Open de kluis in de kelder (-1)', 'neem de lift naar beneden; de sleutel ligt erin', sleutel)
    stap(390, '3', 'Stap in bij de deur van de helikopter', sleutel ? 'je hebt de sleutel: je mag vliegen!' : 'met de sleutel start je de rotor', false)
    g.fillStyle = '#facc15'
    g.font = '700 21px Inter, system-ui, sans-serif'
    g.fillText('Vliegen: joystick vooruit/draaien · ⬆️⬇️ stijgen/dalen · 🛬 landen', 30, 478)
    bordTex.needsUpdate = true
  }
  tekenBord(0, 12, false)
  {
    const bx = brug.x0 + 1.4
    const bz = -2.6
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ map: bordTex, toneMapped: false }))
    bord.position.set(bx, Y + 1.55, bz)
    bord.rotation.y = -Math.PI / 2 + 0.35
    platform.add(bord)
    const kader = deelP(rondeDoos(0.08, 1.75, 2.55, 0.03), new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.6, roughness: 0.4 }), bx + 0.06, Y + 1.55, bz)
    kader.rotation.y = 0.35
    deelP(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8).translate(0, -0.8, 0), staal, bx + 0.1, Y + 0.75, bz)
    halo('#93c5fd', bx - 0.3, Y + 1.55, bz, 3.2, 0.25)
  }

  // ---------- de vlucht ----------
  const park = { x: px, z: pz + 0.5, yaw: Math.PI / 2 } // neus naar het oosten (weg van het stadion)
  const pos = new THREE.Vector3(park.x, Y, park.z)
  let yaw = park.yaw
  let snelheid = 0
  let klim = 0
  let draaiing = 0
  let toeren = 0
  let fase: Fase = 'geparkeerd'
  let uit: { x: number; z: number; yaw: number } | null = null
  const camPos = new THREE.Vector3()
  const camDoel = new THREE.Vector3()
  // Geluid: het geklapper van de rotor (ruis door een filter, gemoduleerd) en het gefluit van de turbine.
  let ac: AudioContext | null = null
  let klap: { gain: GainNode; lfo: OscillatorNode; fluit: OscillatorNode; fluitGain: GainNode } | null = null
  const startGeluid = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ac ??= new Ctx()
      void ac.resume?.()
      if (klap) return
      const n = ac.sampleRate * 2
      const buf = ac.createBuffer(1, n, ac.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      const bron = ac.createBufferSource()
      bron.buffer = buf
      bron.loop = true
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 420
      const am = ac.createGain()
      am.gain.value = 0.5
      const lfo = ac.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = 1
      const lfoGain = ac.createGain()
      lfoGain.gain.value = 0.5
      lfo.connect(lfoGain).connect(am.gain)
      const gain = ac.createGain()
      gain.gain.value = 0
      bron.connect(f).connect(am).connect(gain).connect(ac.destination)
      const fluit = ac.createOscillator()
      fluit.type = 'sawtooth'
      fluit.frequency.value = 200
      const fluitGain = ac.createGain()
      fluitGain.gain.value = 0
      const ff = ac.createBiquadFilter()
      ff.type = 'bandpass'
      ff.frequency.value = 2400
      fluit.connect(ff).connect(fluitGain).connect(ac.destination)
      bron.start()
      lfo.start()
      fluit.start()
      klap = { gain, lfo, fluit, fluitGain }
    } catch {
      ac = null
    }
  }

  const minHoogte = (x: number, z: number) => (gevelAfstand(GEVEL, x, z) <= 1 ? 22 : Math.hypot(x - px, z - pz) < R ? Y : 4)
  const fwd = new THREE.Vector3()

  return {
    opPlatform: (x, z) => Math.hypot(x - px, z - pz) < R - 0.4 || (x > brug.x0 && x < brug.x1 && z > brug.z0 + 0.25 && z < brug.z1 - 0.25),
    obstakel: { x0: park.x - 2.4, x1: park.x + 2.4, z0: park.z - 1.6, z1: park.z + 1.6 },
    bij: (x, z) => fase === 'geparkeerd' && Math.hypot(x - park.x, z - (park.z - 2.4)) < 2.6,
    inVlucht: () => fase === 'opstijgen' || fase === 'vliegen' || fase === 'landen',
    stapIn() {
      if (fase !== 'geparkeerd') return
      startGeluid()
      fase = 'opstijgen'
      uit = null
      camPos.set(pos.x - 14, Y + 6, pos.z)
    },
    landen() {
      if (fase === 'vliegen' || fase === 'opstijgen') {
        fase = 'landen'
      }
    },
    stuur(dt, vooruit, draai, stijg, camera) {

      if (fase === 'opstijgen') {
        // Eerst de rotor op toeren, dan los van het platform.
        toeren = Math.min(1, toeren + dt / 2.6)
        if (toeren >= 1) {
          klim = 4.5
          pos.y += klim * dt
          if (pos.y > Y + 7) fase = 'vliegen'
        }
      } else if (fase === 'vliegen') {
        const doelV = vooruit >= 0 ? vooruit * 32 : vooruit * 9
        snelheid += (doelV - snelheid) * Math.min(1, dt * 0.9)
        draaiing += (draai * 0.85 - draaiing) * Math.min(1, dt * 2.5)
        yaw += draaiing * dt
        klim += (stijg * 9 - klim) * Math.min(1, dt * 2)
        pos.x += Math.sin(yaw) * snelheid * dt
        pos.z += Math.cos(yaw) * snelheid * dt
        pos.y = Math.min(170, Math.max(minHoogte(pos.x, pos.z) + 1, pos.y + klim * dt))
        const r = Math.hypot(pos.x, pos.z)
        if (r > 430) {
          pos.x *= 430 / r
          pos.z *= 430 / r
        }
      } else if (fase === 'landen') {
        // Automatisch terug: eerst naar boven het platform, draaien naar de parkeerrichting, dan zakken.
        const dx = park.x - pos.x
        const dz = park.z - pos.z
        const d = Math.hypot(dx, dz)
        const doelYaw = d > 3 ? Math.atan2(dx, dz) : park.yaw
        let dy = doelYaw - yaw
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        draaiing = THREE.MathUtils.clamp(dy * 1.4, -0.9, 0.9)
        yaw += draaiing * dt
        snelheid += (Math.min(28, d * 0.6) - snelheid) * Math.min(1, dt * 1.2)
        if (d > 0.3) {
          const stap = Math.min(d, snelheid * dt)
          pos.x += (dx / d) * stap
          pos.z += (dz / d) * stap
        }
        const doelH = d > 25 ? Math.max(pos.y, Y + 25) : d > 1.5 ? Y + 8 : Y
        pos.y += THREE.MathUtils.clamp(doelH - pos.y, -5 * dt, 6 * dt)
        if (d < 0.5 && Math.abs(pos.y - Y) < 0.05 && Math.abs(dy) < 0.05) {
          // Geland: je stapt uit naast de deur; de rotor loopt vanzelf uit (zie update).
          fase = 'uitstappen'
          snelheid = 0
          draaiing = 0
          pos.set(park.x, Y, park.z)
          yaw = park.yaw
          uit = { x: park.x, z: park.z - 3.4, yaw: Math.PI }
        }
      }
      // De helikopter zelf: kantelen in de bocht, de neus naar beneden als hij snel vliegt.
      heli.position.copy(pos)
      heli.rotation.set(0, 0, 0)
      heli.rotateY(yaw)
      heli.rotateX(fase === 'vliegen' || fase === 'landen' ? Math.min(0.22, snelheid / 32) * 0.8 : 0)
      heli.rotateZ(-draaiing * 0.35)
      // De camera: achter en boven de helikopter, zacht volgend.
      fwd.set(Math.sin(yaw), 0, Math.cos(yaw))
      const afstand = 15 + snelheid * 0.12
      camPos.lerp(new THREE.Vector3(pos.x - fwd.x * afstand, pos.y + 5.5, pos.z - fwd.z * afstand), Math.min(1, dt * 3))
      camDoel.lerp(new THREE.Vector3(pos.x + fwd.x * 9, pos.y + 1.6, pos.z + fwd.z * 9), Math.min(1, dt * 5))
      camera.position.copy(camPos)
      camera.lookAt(camDoel)
    },
    uitgestapt() {
      const u = uit
      uit = null
      return u
    },
    info: () => ({ fase, hoogte: Math.max(0, pos.y - Y + 15.75), snelheid: snelheid * 3.6 }),
    zetVoortgang: (gevonden, totaal, sleutel) => tekenBord(gevonden, totaal, sleutel),
    update(seconden, dt) {
      // De rotor draait mee met het toerental; op toeren wordt het een waas.
      rotor.rotation.y += toeren * dt * 38
      staartRotor.rotation.x += toeren * dt * 70
      ;(schijf.material as THREE.MeshBasicMaterial).opacity = Math.max(0, toeren - 0.5) * 0.35
      for (const b of bladen) b.visible = toeren < 0.85
      flits.visible = Math.floor(seconden * 1.3) % 2 === 0 && seconden % 0.77 < 0.12
      baken.visible = Math.floor(seconden * 1.6) % 2 === 0
      // Het zwaailicht: een korte witte flits om de anderhalve seconde.
      ;(zwaai.material as THREE.SpriteMaterial).opacity = seconden % 1.5 < 0.12 ? 1 : 0
      windzak.rotation.y = Math.sin(seconden * 0.4) * 0.5 + 0.6
      windzak.rotation.z = Math.sin(seconden * 2.1) * 0.06
      if (fase === 'uitstappen') {
        toeren = Math.max(0, toeren - dt / 3.5)
        if (toeren <= 0) fase = 'geparkeerd'
      }
      if (fase === 'geparkeerd' || fase === 'uitstappen') {
        heli.position.copy(pos)
        heli.rotation.set(0, yaw, 0)
      }
      if (klap && ac) {
        const t = ac.currentTime
        klap.gain.gain.setTargetAtTime(toeren * 0.5, t, 0.2)
        klap.lfo.frequency.setTargetAtTime(2 + toeren * 18, t, 0.2)
        klap.fluit.frequency.setTargetAtTime(180 + toeren * 520, t, 0.3)
        klap.fluitGain.gain.setTargetAtTime(toeren * 0.025, t, 0.3)
      }
    },
  }
}
