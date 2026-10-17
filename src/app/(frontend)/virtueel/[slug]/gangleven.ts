import * as THREE from 'three'

import { GEVEL, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { gevelOmtrek } from './omgeving'
import { canvasTex, rnd, rondLogo } from './stadion'
import { bouwShopRek } from './shoprek'
import { bouwVolk } from './volk'

// Leven in de wandelgangen: het mag er niet leeg aanvoelen.
//  • Supporters die rond het stadion wandelen, in twee rijstroken en beide richtingen.
//  • In de vier hoeken (waar de gevel rond loopt en er ruimte is) een plek om te blijven hangen:
//    een bar met verlicht menubord en neonnaam (clubcafé, frituur, koffiebar, fanshop), een barman,
//    een wachtrij, statafels met supporters die staan te praten, hanglampen en planten.
//  • Het clublogo in de vloer bij elke ingang.
// Vlot: de mensen zijn twee InstancedMeshes (lijf en hoofd); enkel de wandelaars worden per beeld
// verplaatst.

type Hoek = { naam: string; icoon: string; menu: [string, string][] }
const HOEKEN: Hoek[] = [
  { naam: 'CLUBCAFÉ', icoon: '🍺', menu: [['Pintje', '2,80'], ['Frisdrank', '2,50'], ['Koffie', '2,20']] },
  { naam: 'FRITUUR', icoon: '🍟', menu: [['Friet', '3,50'], ['Frikandel', '2,80'], ['Bicky', '4,50']] },
  { naam: 'KOFFIEBAR', icoon: '☕', menu: [['Koffie', '2,20'], ['Warme choco', '2,80'], ['Wafel', '3,00']] },
  { naam: 'FANSHOP', icoon: '🧣', menu: [['Sjaal', '15'], ['Thuisshirt', '45'], ['Pet', '20']] },
]

export function bouwGangleven(
  scene: THREE.Scene,
  opt: { thema: StadionThema; licht: boolean; logo: Promise<HTMLImageElement | null> },
): { obstakels: Rechthoek[]; fanshop: { x: number; z: number } | null; update: (seconden: number) => void } {
  const { thema, licht } = opt
  const { A, B, R } = GEVEL
  const toeval = rnd(5150)
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)
  const obstakels: Rechthoek[] = []
  const Y = new THREE.Vector3(0, 1, 0)

  // ---------- mensen (divers volk, zie volk.ts) ----------
  type Mens = { x: number; z: number; ry: number }
  const staand: Mens[] = []

  // ---------- de vier hoeken ----------
  const hoekMats = {
    toog: new THREE.MeshLambertMaterial({ color: '#1f2937' }),
    blad: new THREE.MeshStandardMaterial({ color: '#d6d3d1', metalness: 0.1, roughness: 0.35 }),
    wand: new THREE.MeshLambertMaterial({ color: '#111827' }),
    led: new THREE.MeshBasicMaterial({ color: primair, toneMapped: false }),
    tafel: new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.6, roughness: 0.3 }),
    pot: new THREE.MeshLambertMaterial({ color: '#374151' }),
    groen: new THREE.MeshLambertMaterial({ color: '#166534' }),
    lamp: new THREE.MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false }),
  }
  const plasC = document.createElement('canvas')
  plasC.width = plasC.height = 64
  {
    const g = plasC.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,220,160,.5)')
    gr.addColorStop(1, 'rgba(255,220,160,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  }
  const plasMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(plasC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  // Op de toog wat zachter, anders lijkt het blad wit uitgebrand.
  const toogPlasMat = plasMat.clone()
  toogPlasMat.opacity = 0.45
  const hoeken: [number, number][] = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]
  let fanshop: { x: number; z: number } | null = null
  hoeken.forEach(([sx, sz], h) => {
    const info = HOEKEN[h]
    const n = new THREE.Vector3(sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2)
    const rand = new THREE.Vector3(sx * (A - R) + n.x * R, 0, sz * (B - R) + n.z * R)
    const c = rand.clone().addScaledVector(n, -5.2)
    if (info.naam === 'FANSHOP') fanshop = { x: c.x, z: c.z }
    const ry = Math.atan2(n.x, n.z)
    const groep = new THREE.Group()
    groep.position.copy(c)
    groep.rotation.y = ry
    // Toog met een lichtstrook in clubkleur en een stenen blad.
    const toog = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.05, 0.85), hoekMats.toog)
    toog.position.set(0, 0.525, 0)
    const blad = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.06, 1.0), hoekMats.blad)
    blad.position.set(0, 1.08, 0)
    const strook = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.05, 0.02), hoekMats.led)
    strook.position.set(0, 0.95, 0.44)
    // Achterwand met een verlicht menubord en een neonnaam erboven.
    const wand = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.0, 0.2), hoekMats.wand)
    wand.position.set(0, 1.5, -1.7)
    const menuC = document.createElement('canvas')
    menuC.width = 1024
    menuC.height = 320
    {
      const g = menuC.getContext('2d')!
      g.fillStyle = '#0b1220'
      g.fillRect(0, 0, 1024, 320)
      g.strokeStyle = thema.primair
      g.lineWidth = 8
      g.strokeRect(4, 4, 1016, 312)
      info.menu.forEach(([wat, prijs], i) => {
        const x = 40 + i * 330
        g.fillStyle = '#ffffff'
        g.font = '800 44px Inter, system-ui, sans-serif'
        g.textAlign = 'left'
        g.textBaseline = 'middle'
        g.fillText(wat, x, 120, 290)
        g.fillStyle = '#fcd34d'
        g.font = '900 64px Inter, system-ui, sans-serif'
        g.fillText(`€ ${prijs}`, x, 210, 290)
      })
    }
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.44), new THREE.MeshBasicMaterial({ map: canvasTex(menuC), toneMapped: false }))
    menu.position.set(0, 1.95, -1.59)
    const neonC = document.createElement('canvas')
    neonC.width = 1024
    neonC.height = 192
    {
      const g = neonC.getContext('2d')!
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = '900 120px Inter, system-ui, sans-serif'
      g.shadowColor = thema.primair
      g.shadowBlur = 36
      g.fillStyle = '#ffffff'
      g.fillText(`${info.icoon} ${info.naam}`, 512, 100, 980)
      g.fillText(`${info.icoon} ${info.naam}`, 512, 100, 980)
    }
    const neon = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 0.83),
      new THREE.MeshBasicMaterial({ map: canvasTex(neonC), transparent: true, toneMapped: false, depthWrite: false }),
    )
    neon.position.set(0, 3.35, -1.58)
    // Ook de achterkant van de wand (wie door de gang aankomt, ziet die eerst): een verlicht paneel
    // in clubkleur met de naam van de zaak.
    const rugC = document.createElement('canvas')
    rugC.width = 1024
    rugC.height = 560
    {
      const g = rugC.getContext('2d')!
      const gr = g.createLinearGradient(0, 0, 0, 560)
      gr.addColorStop(0, thema.primair)
      gr.addColorStop(1, '#' + primair.clone().multiplyScalar(0.45).getHexString())
      g.fillStyle = gr
      g.fillRect(0, 0, 1024, 560)
      g.fillStyle = thema.secundair
      g.fillRect(0, 0, 1024, 18)
      g.fillRect(0, 542, 1024, 18)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
      g.fillText(info.icoon, 512, 210)
      g.fillStyle = thema.tekstOpPrimair
      g.font = '900 120px Inter, system-ui, sans-serif'
      g.fillText(info.naam, 512, 420, 960)
    }
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.85), new THREE.MeshBasicMaterial({ map: canvasTex(rugC), toneMapped: false }))
    rug.position.set(0, 1.5, -1.81)
    rug.rotation.y = Math.PI
    // In de fanshop hangt alles wat je kan kopen aan de wanden (shoprek.ts), in plaats van een menubord.
    const isShop = info.naam === 'FANSHOP'
    groep.add(toog, blad, strook, wand, neon, rug)
    if (!isShop) groep.add(menu)
    const rek = isShop ? bouwShopRek(thema) : null
    if (rek) groep.add(rek.groep)
    // Hanglampen boven de toog, met een lichtplas.
    for (const lx of [-1.5, 0, 1.5]) {
      const kap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.25, 14, 1, true), hoekMats.wand)
      kap.position.set(lx, 2.75, 0)
      const bol = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hoekMats.lamp)
      bol.position.set(lx, 2.62, 0)
      const snoer = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 4), hoekMats.wand)
      snoer.position.set(lx, 3.45, 0)
      const plas = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20).rotateX(-Math.PI / 2), toogPlasMat)
      plas.position.set(lx, 1.12, 0)
      groep.add(kap, bol, snoer, plas)
    }
    const vloerPlas = new THREE.Mesh(new THREE.CircleGeometry(4.2, 28).rotateX(-Math.PI / 2), plasMat)
    vloerPlas.position.set(0, 0.03, 1.2)
    groep.add(vloerPlas)
    // Statafels met supporters die staan te praten (een beker in de hand).
    for (const [tx, tz] of [
      [-3.6, 1.1],
      [3.6, 1.1],
    ]) {
      const voet = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.04, 16), hoekMats.tafel)
      voet.position.set(tx, 0.02, tz)
      const poot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.08, 8), hoekMats.tafel)
      poot.position.set(tx, 0.56, tz)
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 20), hoekMats.blad)
      top.position.set(tx, 1.1, tz)
      const beker = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.13, 8), hoekMats.lamp)
      beker.position.set(tx + 0.12, 1.18, tz)
      groep.add(voet, poot, top, beker)
      const aantal = 1 + Math.floor(toeval() * 2)
      for (let k = 0; k < aantal; k++) {
        const a = (k / aantal) * Math.PI * 2 + toeval()
        const lx = tx + Math.sin(a) * 0.62
        const lz = tz + Math.cos(a) * 0.62
        const w = new THREE.Vector3(lx, 0, lz).applyAxisAngle(Y, ry).add(c)
        staand.push({ x: w.x, z: w.z, ry: ry + a + Math.PI })
      }
    }
    // Planten naast de achterwand (niet in de fanshop: daar staan de rekken).
    for (const px of isShop ? [] : [-2.95, 2.95]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.6, 12), hoekMats.pot)
      pot.position.set(px, 0.3, -1.25)
      const blad1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), hoekMats.groen)
      blad1.position.set(px, 1.05, -1.25)
      groep.add(pot, blad1)
    }
    scene.add(groep)
    // Barman achter de toog en een wachtrij ervoor (niet voor de fanshop: daar een verkoper).
    const naarWereld = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(Y, ry).add(c)
    const achter = naarWereld(0.3, -0.85)
    staand.push({ x: achter.x, z: achter.z, ry })
    for (const lz of [0.95, 1.65]) {
      const w = naarWereld(-0.4 + toeval() * 0.3, lz)
      staand.push({ x: w.x, z: w.z, ry: ry + Math.PI })
    }
    // Botsing: toog + achterwand en de statafels, als ruime rechthoeken rond het midden.
    const doos = (lx: number, lz: number, r: number) => {
      const w = naarWereld(lx, lz)
      obstakels.push({ x0: w.x - r, x1: w.x + r, z0: w.z - r, z1: w.z + r })
    }
    for (const o of rek?.obstakels ?? []) doos(o.lx, o.lz, o.r)
    doos(-1.4, -0.5, 1.1)
    doos(1.4, -0.5, 1.1)
    doos(-3.6, 1.1, 0.5)
    doos(3.6, 1.1, 0.5)
  })

  // ---------- wandelaars rond het stadion ----------
  const pts = gevelOmtrek(0.5)
  const L = pts[pts.length - 1].s + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z)
  const plekOp = (s: number, af: number) => {
    const t = ((s % L) + L) % L
    let i = Math.floor(t / 0.5)
    while (i < pts.length - 1 && pts[i + 1].s < t) i++
    while (i > 0 && pts[i].s > t) i--
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const lengte = (i + 1 < pts.length ? b.s : L) - a.s || 1
    const f = Math.min(1, Math.max(0, (t - a.s) / lengte))
    const nx = a.nx + (b.nx - a.nx) * f
    const nz = a.nz + (b.nz - a.nz) * f
    return {
      x: a.x + (b.x - a.x) * f - nx * af,
      z: a.z + (b.z - a.z) * f - nz * af,
      tx: b.x - a.x,
      tz: b.z - a.z,
    }
  }
  const wandelaars = Array.from({ length: licht ? 8 : 32 }, (_, i) => ({
    s0: toeval() * L,
    v: (1.0 + toeval() * 0.5) * (i % 2 ? 1 : -1),
    baan: i % 2 ? 2.0 : 2.75,
    fase: toeval() * 6.28,
  }))

  const totaal = staand.length + wandelaars.length
  // Aan de toog en de statafels staan geen kinderwagens of juichers; die wandelen wel rond.
  const volk = bouwVolk(totaal, {
    toeval,
    primair,
    secundair,
    zonder: ['juicher'],
    soort: (i) => (i < staand.length ? (['man', 'vrouwBroek', 'vrouwRok', 'man', 'oudere', 'kind'] as const)[Math.floor(toeval() * 6)] : undefined),
  })
  staand.forEach((m, i) => {
    volk.zet(i, m.x, 0, m.z, m.ry)
    volk.houding(i, 'staan')
  })
  wandelaars.forEach((w, i) => volk.houding(staand.length + i, 'stappen', Math.abs(w.v)))
  volk.klaar()
  scene.add(volk.groep)

  // ---------- het clublogo in de vloer bij elke ingang ----------
  const logoC = document.createElement('canvas')
  logoC.width = logoC.height = 512
  const logoTex = canvasTex(logoC)
  const tekenLogo = (logo: HTMLImageElement | null) => {
    const g = logoC.getContext('2d')!
    g.clearRect(0, 0, 512, 512)
    g.fillStyle = thema.secundair
    g.beginPath()
    g.arc(256, 256, 250, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = thema.primair
    g.beginPath()
    g.arc(256, 256, 232, 0, Math.PI * 2)
    g.fill()
    rondLogo(g, logo, thema, 256, 256, 196)
    logoTex.needsUpdate = true
  }
  tekenLogo(null)
  void opt.logo.then(tekenLogo)
  const vloerLogo = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  for (const [x, z] of [
    [0, B - 3.4],
    [0, -B + 2.6],
    [A - 3.4, 0],
    [-A + 3.4, 0],
  ]) {
    const schijf = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40).rotateX(-Math.PI / 2), vloerLogo)
    schijf.position.set(x, 0.025, z)
    scene.add(schijf)
  }

  return {
    obstakels,
    fanshop,
    update(seconden) {
      volk.update(seconden)
      wandelaars.forEach((w, i) => {
        const p = plekOp(w.s0 + w.v * seconden, w.baan)
        // Een lichte op-en-neer bij elke stap.
        volk.zet(staand.length + i, p.x, Math.abs(Math.sin(seconden * 5.5 + w.fase)) * 0.04, p.z, Math.atan2(p.tx * Math.sign(w.v), p.tz * Math.sign(w.v)))
      })
      volk.klaar()
    },
  }
}
