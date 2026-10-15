import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import type { StadionThema } from '@/lib/virtueel'
import { pickSegmentIndex, RAD_SEGMENTS, segmentArcs } from '@/lib/pronostiek-rad'
import type { WedkantoorStats } from '@/lib/virtueel-wedkantoor'
import type { BordPlek, WedkantoorPlek } from './kelder'
import { rondeDoos } from './rond'
import { canvasTex, rondLogo } from './stadion'

// De inrichting van het wedkantoor in de kelder (de ruimte zelf: kelder.ts):
//  • het bonusrad van de site aan de achterwand, als echt kermisrad: gouden velg, pinnen, een
//    flapper die tikt, knipperende lampjes en een glazen naaf met het clublogo. Hier draai je
//    gratis, voor de fun (het echte rad met boosters staat op /pronostiek/rad);
//  • een wand met zes schermen: het klassement, de kerncijfers, de uitblinkers, de kansen op het
//    rad, wie dit weekend aan het echte rad mag, en jouw plaats (lib/virtueel-wedkantoor.ts);
//  • een balie met marmeren blad, glas, kassa, betaalterminal en ticketprinter, met daarachter een
//    lichtkrant; statafels met krukken en wedformulieren; een plank met formulieren en pennen;
//    twee zelfbedieningsterminals; fluwelen koorden; een neonbord.
// Alles staat in de groep van de kelder (enkel getekend als je beneden bent).

export type Gokkantoor = {
  zetStats: (s: WedkantoorStats) => void
  /** Wat kan je hier doen? */
  nabij: (x: number, z: number) => 'rad' | 'stats' | 'kiosk' | null
  /** Draai het rad (gratis, enkel voor de fun). Geeft de vermenigvuldiger, of null als het al draait. */
  draai: () => Promise<number> | null
  update: (seconden: number, dt: number) => void
}

const fmt = (v: number) => `×${Number.isInteger(v) ? v : String(v).replace('.', ',')}`
const GOUD = '#ffd166'

export function bouwGokkantoor(
  groep: THREE.Group,
  opt: { thema: StadionThema; plek: WedkantoorPlek; renderer: THREE.WebGLRenderer; logo: Promise<HTMLImageElement | null>; licht: boolean },
): Gokkantoor {
  const { thema, plek: W } = opt
  const Y = W.y
  let omgeving: THREE.Texture | null = null
  try {
    const pm = new THREE.PMREMGenerator(opt.renderer)
    omgeving = pm.fromScene(new RoomEnvironment(), 0.04).texture
    pm.dispose()
  } catch {
    omgeving = null
  }
  const metaal = (kleur: string, ruw = 0.25, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color: kleur, metalness: 1, roughness: ruw, envMap: omgeving, envMapIntensity: 1.2, ...extra })
  const mat = {
    goud: metaal('#e2b43a', 0.22, { emissive: '#3a2604', emissiveIntensity: 0.35 }),
    chroom: metaal('#e6e9ee', 0.12, { emissive: '#1f2329', emissiveIntensity: 0.3 }),
    zwart: new THREE.MeshStandardMaterial({ color: '#0d0f13', roughness: 0.35, metalness: 0.2, envMap: omgeving, envMapIntensity: 0.6 }),
    hout: new THREE.MeshStandardMaterial({ color: '#4a2a12', roughness: 0.55, envMap: omgeving, envMapIntensity: 0.3, emissive: '#1a0d05', emissiveIntensity: 0.4 }),
    leder: new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.45, envMap: omgeving, envMapIntensity: 0.4, emissive: '#2a0606', emissiveIntensity: 0.4 }),
    glas: new THREE.MeshStandardMaterial({ color: '#dbeafe', transparent: true, opacity: 0.16, roughness: 0.02, metalness: 0.1, envMap: omgeving, envMapIntensity: 1.4, depthWrite: false }),
    licht: new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false }),
  }
  const tekst = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    teken(c.getContext('2d')!)
    return canvasTex(c)
  }
  const doos = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, ouder: THREE.Object3D = groep) => {
    const mesh = new THREE.Mesh(rondeDoos(w, h, d), m)
    mesh.position.set(x, y, z)
    ouder.add(mesh)
    return mesh
  }
  const gloedTex = tekst(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  })
  const gloed = (kleur: string, sterkte: number) => new THREE.MeshBasicMaterial({ map: gloedTex, color: kleur, transparent: true, opacity: sterkte, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })

  // ================= het bonusrad =================
  const R = W.rad
  const rad = new THREE.Group()
  rad.position.set(R.x, R.y, R.z)
  rad.rotation.y = -Math.PI / 2 // kijkt naar -x, de kamer in
  groep.add(rad)
  const segs = RAD_SEGMENTS
  const arcs = segmentArcs(segs)
  const maxMult = Math.max(...segs.map((s) => s.mult))
  const kleurVak = (i: number, mult: number) => (mult === maxMult ? GOUD : i % 2 === 0 ? thema.primair : thema.secundair)
  // Achterpaneel: zwart gelakt, met een gouden lijst, en een zachte gloed erachter.
  const paneelB = R.straal * 2 + 1.0
  doos(paneelB, paneelB, 0.08, 0, 0, 0.0, mat.zwart, rad)
  for (const [w, h, x, y] of [
    [paneelB + 0.08, 0.06, 0, paneelB / 2],
    [paneelB + 0.08, 0.06, 0, -paneelB / 2],
    [0.06, paneelB + 0.08, paneelB / 2, 0],
    [0.06, paneelB + 0.08, -paneelB / 2, 0],
  ]) doos(w, h, 0.1, x, y, 0.01, mat.goud, rad)
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(paneelB * 1.5, paneelB * 1.5), gloed(thema.primair, 0.35))
  aura.position.z = 0.045
  rad.add(aura)
  // Het draaiende deel.
  const wiel = new THREE.Group()
  wiel.position.z = 0.12
  rad.add(wiel)
  const vakTex = tekst(1024, 1024, (g) => {
    const c = 512
    const r = 508
    arcs.forEach((a, i) => {
      const a0 = ((a.start - 90) * Math.PI) / 180
      const a1 = ((a.end - 90) * Math.PI) / 180
      const gr = g.createRadialGradient(c, c, 60, c, c, r)
      const k = kleurVak(i, a.mult)
      gr.addColorStop(0, k)
      gr.addColorStop(0.85, k)
      gr.addColorStop(1, 'rgba(0,0,0,.55)')
      g.fillStyle = gr
      g.beginPath()
      g.moveTo(c, c)
      g.arc(c, c, r, a0, a1)
      g.closePath()
      g.fill()
    })
    // Fluweel: fijne korrel over alles.
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.05)'
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2)
    }
    // Gouden scheidingslijnen tussen de vakken.
    g.strokeStyle = '#f5d77a'
    g.lineWidth = 6
    for (const a of arcs) {
      const h = ((a.start - 90) * Math.PI) / 180
      g.beginPath()
      g.moveTo(c + Math.cos(h) * 70, c + Math.sin(h) * 70)
      g.lineTo(c + Math.cos(h) * r, c + Math.sin(h) * r)
      g.stroke()
    }
    // De vermenigvuldigers, langs de straal.
    arcs.forEach((a, i) => {
      const h = ((a.mid - 90) * Math.PI) / 180
      g.save()
      g.translate(c + Math.cos(h) * 330, c + Math.sin(h) * 330)
      g.rotate(h + Math.PI / 2)
      const span = a.end - a.start
      g.font = `900 ${span >= 55 ? 92 : span >= 35 ? 80 : span >= 22 ? 66 : 54}px Inter, "Arial Black", system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const k = kleurVak(i, a.mult)
      const donker = k === GOUD || k.toLowerCase() === '#ffffff' || k.toLowerCase() === '#fff'
      g.lineWidth = 10
      g.strokeStyle = donker ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.55)'
      g.strokeText(fmt(a.mult), 0, 0)
      g.fillStyle = donker ? '#1f1300' : '#ffffff'
      g.fillText(fmt(a.mult), 0, 0)
      g.restore()
    })
  })
  vakTex.anisotropy = 8
  const schijf = new THREE.Mesh(
    new THREE.CircleGeometry(R.straal, 128),
    new THREE.MeshStandardMaterial({ map: vakTex, roughness: 0.6, metalness: 0.05, emissive: '#ffffff', emissiveMap: vakTex, emissiveIntensity: 0.35 }),
  )
  wiel.add(schijf)
  // Pinnen rond de rand (de flapper tikt ertegen).
  const PINNEN = 24
  const pinGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.09, 10).rotateX(Math.PI / 2)
  const pinnen = new THREE.InstancedMesh(pinGeo, mat.chroom, PINNEN)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < PINNEN; i++) {
    const a = (i / PINNEN) * Math.PI * 2
    pinnen.setMatrixAt(i, m4.makeTranslation(Math.sin(a) * (R.straal - 0.06), Math.cos(a) * (R.straal - 0.06), 0.045))
  }
  wiel.add(pinnen)
  // Velg (draait niet mee): een dikke gouden ring, en een tweede, fijnere ring.
  const velg = new THREE.Mesh(new THREE.TorusGeometry(R.straal + 0.04, 0.07, 18, 128), mat.goud)
  velg.position.z = 0.13
  const velg2 = new THREE.Mesh(new THREE.TorusGeometry(R.straal + 0.32, 0.035, 12, 128), mat.goud)
  velg2.position.z = 0.08
  rad.add(velg, velg2)
  // Lampjes in de rand: ze lopen rond (marquee) en knipperen bij het winnen.
  const LAMPEN = 32
  const lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 14, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), LAMPEN)
  const lampKap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14).rotateX(Math.PI / 2), mat.goud, LAMPEN)
  for (let i = 0; i < LAMPEN; i++) {
    const a = (i / LAMPEN) * Math.PI * 2
    const x = Math.sin(a) * (R.straal + 0.18)
    const y = Math.cos(a) * (R.straal + 0.18)
    lamp.setMatrixAt(i, m4.makeTranslation(x, y, 0.16))
    lampKap.setMatrixAt(i, m4.makeTranslation(x, y, 0.12))
    lamp.setColorAt(i, new THREE.Color('#fff4c2'))
  }
  rad.add(lampKap, lamp)
  // De naaf: een gouden kroon met het clublogo onder een glazen koepel.
  const naafTex = tekst(256, 256, (g) => {
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 256, 256)
    rondLogo(g, null, thema, 128, 128, 112)
  })
  const naafMat = new THREE.MeshBasicMaterial({ map: naafTex, toneMapped: false })
  const naaf = new THREE.Mesh(new THREE.CircleGeometry(0.3, 48), naafMat)
  naaf.position.z = 0.2
  const naafRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 14, 48), mat.goud)
  naafRing.position.z = 0.2
  const koepel = new THREE.Mesh(new THREE.SphereGeometry(0.33, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.45), mat.glas)
  koepel.position.z = 0.2
  rad.add(naaf, naafRing, koepel)
  void opt.logo.then((logo) => {
    if (!logo) return
    const c = naafTex.image as HTMLCanvasElement
    const g = c.getContext('2d')!
    g.clearRect(0, 0, 256, 256)
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, 256, 256)
    rondLogo(g, logo, thema, 128, 128, 112)
    naafTex.needsUpdate = true
  })
  // De flapper bovenaan: een gouden pijl op een scharnier.
  const flapScharnier = new THREE.Group()
  flapScharnier.position.set(0, R.straal + 0.3, 0.2)
  const flapVorm = new THREE.Shape([new THREE.Vector2(-0.11, 0), new THREE.Vector2(0.11, 0), new THREE.Vector2(0, -0.34)])
  const flap = new THREE.Mesh(new THREE.ExtrudeGeometry(flapVorm, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }), mat.goud)
  flapScharnier.add(flap, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 16).rotateX(Math.PI / 2), mat.chroom))
  rad.add(flapScharnier)
  // Het bord erboven.
  const radBord = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 0.5),
    new THREE.MeshBasicMaterial({
      map: tekst(1024, 170, (g) => {
        g.shadowColor = '#fbbf24'
        g.shadowBlur = 26
        g.fillStyle = '#fff7e0'
        g.font = '900 96px Inter, system-ui, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('BONUSRAD · GRATIS', 512, 90, 1000)
      }),
      transparent: true,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  radBord.position.set(0, paneelB / 2 + 0.38, 0.05)
  rad.add(radBord)
  // Fluwelen koorden aan beide kanten, en een lichtplas op het tapijt ervoor.
  for (const sz of [-1, 1]) {
    const px = R.x - 1.6
    for (const dz of [1.3, 2.4]) {
      const z = R.z + sz * dz
      const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 14), mat.goud)
      paal.position.set(px, Y + 0.48, z)
      const voet = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 20), mat.goud)
      voet.position.set(px, Y + 0.02, z)
      const knop = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), mat.goud)
      knop.position.set(px, Y + 0.97, z)
      groep.add(paal, voet, knop)
    }
    const koord = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(R.x - 1.6, Y + 0.9, R.z + sz * 1.3), new THREE.Vector3(R.x - 1.6, Y + 0.62, R.z + sz * 1.85), new THREE.Vector3(R.x - 1.6, Y + 0.9, R.z + sz * 2.4)), 16, 0.028, 8),
      new THREE.MeshStandardMaterial({ color: '#8b0e1e', roughness: 0.9, emissive: '#2a0308', emissiveIntensity: 0.5 }),
    )
    groep.add(koord)
  }
  const radPlas = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32).rotateX(-Math.PI / 2), gloed('#ffd27a', 0.35))
  radPlas.position.set(R.x - 1.4, Y + 0.02, R.z)
  groep.add(radPlas)

  // ---- draaien ----
  let hoek = 0 // graden, met de klok mee
  let spin: { van: number; naar: number; t0: number; duur: number; klaar: (m: number) => void; mult: number } | null = null
  let laatstePin = 0
  let flapUit = 0
  let winTot = 0
  let ac: AudioContext | null = null
  const toon = (f: number, t: number, duur: number, type: OscillatorType, gain: number) => {
    if (!ac) return
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur)
    o.connect(g).connect(ac.destination)
    o.start(t)
    o.stop(t + duur + 0.02)
  }
  const klik = () => ac && toon(1150, ac.currentTime, 0.02, 'square', 0.05)
  const fanfare = (groot: boolean) => {
    if (!ac) return
    const t = ac.currentTime + 0.02
    ;(groot ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047]).forEach((f, i) => toon(f, t + i * 0.1, 0.3, 'triangle', 0.16))
  }

  // ================= de schermenwand =================
  const SCH_W = 1024
  const SCH_H = 560
  const schermen = W.schermen.map((p: BordPlek) => {
    const c = document.createElement('canvas')
    c.width = SCH_W
    c.height = SCH_H
    const tex = canvasTex(c)
    const g = new THREE.Group()
    g.position.set(p.x, p.y, p.z)
    g.rotation.y = p.ry
    const rand = new THREE.Mesh(new THREE.BoxGeometry(p.b + 0.1, p.h + 0.1, 0.07), mat.zwart)
    rand.position.z = 0.04
    const beeld = new THREE.Mesh(new THREE.PlaneGeometry(p.b, p.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    beeld.position.z = 0.078
    // Een dunne glasplaat ervoor: een vleugje weerkaatsing.
    const ruit = new THREE.Mesh(new THREE.PlaneGeometry(p.b, p.h), mat.glas)
    ruit.position.z = 0.082
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(p.b * 1.35, p.h * 1.5), gloed('#60a5fa', 0.12))
    halo.position.z = 0.01
    g.add(halo, rand, beeld, ruit)
    groep.add(g)
    return { c, tex }
  })
  // Een kader voor elk scherm, in de stijl van een sportzender.
  const kop = (g: CanvasRenderingContext2D, titel: string, kleur: string) => {
    const bg = g.createLinearGradient(0, 0, 0, SCH_H)
    bg.addColorStop(0, '#0b1730')
    bg.addColorStop(1, '#050a16')
    g.fillStyle = bg
    g.fillRect(0, 0, SCH_W, SCH_H)
    g.fillStyle = 'rgba(255,255,255,.03)'
    for (let y = 0; y < SCH_H; y += 4) g.fillRect(0, y, SCH_W, 1)
    const band = g.createLinearGradient(0, 0, SCH_W, 0)
    band.addColorStop(0, kleur)
    band.addColorStop(1, '#0b1730')
    g.fillStyle = band
    g.fillRect(0, 0, SCH_W, 78)
    g.fillStyle = '#ffffff'
    g.font = '900 46px Inter, system-ui, sans-serif'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText(titel, 30, 41, SCH_W - 260)
    g.font = '800 26px Inter, system-ui, sans-serif'
    g.textAlign = 'right'
    g.fillStyle = 'rgba(255,255,255,.85)'
    g.fillText('KRACHTBAL LIVE', SCH_W - 28, 41)
    g.fillStyle = kleur
    g.fillRect(0, SCH_H - 10, SCH_W, 10)
  }
  const regel = (g: CanvasRenderingContext2D, links: string, rechts: string, y: number, grootte: number, kleur = '#e2e8f0', accent = '#fde047') => {
    g.font = `700 ${grootte}px Inter, system-ui, sans-serif`
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    g.fillStyle = kleur
    g.fillText(links, 34, y, SCH_W * 0.66)
    g.textAlign = 'right'
    g.fillStyle = accent
    g.font = `900 ${grootte}px Inter, system-ui, sans-serif`
    g.fillText(rechts, SCH_W - 34, y)
  }
  const leeg = (g: CanvasRenderingContext2D, t: string) => {
    g.fillStyle = '#94a3b8'
    g.font = '700 36px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText(t, SCH_W / 2, SCH_H / 2 + 20, SCH_W - 80)
  }
  const teken = (i: number, f: (g: CanvasRenderingContext2D) => void) => {
    const s = schermen[i]
    if (!s) return
    f(s.c.getContext('2d')!)
    s.tex.needsUpdate = true
  }
  const getal = (n: number) => n.toLocaleString('nl-BE')
  const zetStats = (s: WedkantoorStats) => {
    // [0] linksboven: het klassement.
    teken(0, (g) => {
      kop(g, `🏆 KLASSEMENT ${s.seizoen}`, '#b45309')
      if (!s.top.length) return leeg(g, 'Nog geen punten dit seizoen — voorspel mee!')
      s.top.forEach((r, k) => {
        const y = 112 + k * 44
        if (k % 2 === 0) {
          g.fillStyle = 'rgba(255,255,255,.04)'
          g.fillRect(20, y - 22, SCH_W - 40, 44)
        }
        regel(g, `${String(r.rank).padStart(2, ' ')}.  ${r.naam}`, `${getal(r.punten)} pt`, y, 30, k < 3 ? '#ffffff' : '#cbd5e1', k === 0 ? '#fde047' : '#93c5fd')
      })
    })
    // [1] linksonder: uitblinkers.
    teken(1, (g) => {
      kop(g, '⭐ UITBLINKERS', '#7c3aed')
      const rijen: [string, string, string][] = [
        ['🎯 Meeste exacte uitslagen', s.scherpste?.naam ?? '—', s.scherpste ? `${s.scherpste.aantal}×` : ''],
        ['🔥 Meest actief', s.actiefste?.naam ?? '—', s.actiefste ? `${s.actiefste.aantal}` : ''],
        ['📏 Vaakst dichtst bij', s.dichtste?.naam ?? '—', s.dichtste ? `${s.dichtste.aantal}×` : ''],
        ['🗳️ Populairste uitslag', s.populairst?.uitslag ?? '—', s.populairst ? `${s.populairst.aantal}×` : ''],
      ]
      rijen.forEach(([t, naam, n], k) => {
        const y = 130 + k * 104
        g.fillStyle = '#94a3b8'
        g.font = '700 28px Inter, system-ui, sans-serif'
        g.textAlign = 'left'
        g.fillText(t, 34, y - 22)
        regel(g, naam, n, y + 20, 40, '#ffffff', '#c4b5fd')
      })
    })
    // [2] middenboven: de kerncijfers.
    teken(2, (g) => {
      kop(g, '📊 KERNCIJFERS', '#0369a1')
      const cijfers: [string, string][] = [
        [getal(s.deelnemers), 'voorspellers'],
        [getal(s.wedstrijden), 'wedstrijden'],
        [getal(s.voorspellingen), 'voorspellingen'],
        [getal(s.exact), 'exacte uitslagen'],
        [`${s.exactPct}%`, 'exact geraden'],
        [String(s.gemPunten).replace('.', ','), 'punten per gok'],
      ]
      cijfers.forEach(([n, t], k) => {
        const cx = 180 + (k % 3) * 332
        const cy = 200 + Math.floor(k / 3) * 190
        g.textAlign = 'center'
        g.fillStyle = '#ffffff'
        g.font = '900 86px Inter, system-ui, sans-serif'
        g.fillText(n, cx, cy, 300)
        g.fillStyle = '#7dd3fc'
        g.font = '700 28px Inter, system-ui, sans-serif'
        g.fillText(t, cx, cy + 64, 300)
      })
    })
    // [3] middenonder: wie mag dit weekend aan het echte rad.
    teken(3, (g) => {
      kop(g, '🎡 DIT WEEKEND AAN HET RAD', '#15803d')
      if (!s.radWinnaars.length) return leeg(g, 'Wie vorig weekend het best voorspelde, draait hier.')
      g.fillStyle = '#86efac'
      g.font = '700 28px Inter, system-ui, sans-serif'
      g.textAlign = 'left'
      g.fillText('De beste voorspellers van vorig weekend draaien 3× voor een booster:', 34, 116, SCH_W - 68)
      s.radWinnaars.slice(0, 8).forEach((n, k) => {
        const x = k < 4 ? 34 : SCH_W / 2 + 10
        const y = 180 + (k % 4) * 86
        g.fillStyle = '#ffffff'
        g.font = '800 40px Inter, system-ui, sans-serif'
        g.fillText(`${k + 1}. ${n}`, x, y, SCH_W / 2 - 50)
      })
    })
    // [4] rechtsboven: de kansen op het rad.
    teken(4, (g) => {
      kop(g, '🎰 KANSEN OP HET RAD', '#a16207')
      const max = Math.max(...s.radKansen.map((k) => k.pct), 1)
      s.radKansen.forEach((k, i) => {
        const y = 130 + i * 82
        g.fillStyle = k.mult === maxMult ? GOUD : '#e2e8f0'
        g.font = '900 46px Inter, system-ui, sans-serif'
        g.textAlign = 'left'
        g.fillText(fmt(k.mult), 34, y)
        const b = ((SCH_W - 360) * k.pct) / max
        const gr = g.createLinearGradient(190, 0, 190 + b, 0)
        gr.addColorStop(0, k.mult === maxMult ? '#f59e0b' : thema.primair)
        gr.addColorStop(1, k.mult === maxMult ? GOUD : '#fca5a5')
        g.fillStyle = gr
        g.beginPath()
        g.roundRect(190, y - 24, b, 48, 10)
        g.fill()
        g.fillStyle = '#ffffff'
        g.font = '800 36px Inter, system-ui, sans-serif'
        g.textAlign = 'right'
        g.fillText(`${k.pct}%`, SCH_W - 34, y)
      })
    })
    // [5] rechtsonder: jij.
    teken(5, (g) => {
      kop(g, '👤 JOUW STAND', thema.primair)
      g.textAlign = 'center'
      if (s.ik) {
        g.fillStyle = '#ffffff'
        g.font = '900 150px Inter, system-ui, sans-serif'
        g.fillText(`#${s.ik.rank}`, SCH_W / 2, 250)
        g.fillStyle = '#fde047'
        g.font = '800 48px Inter, system-ui, sans-serif'
        g.fillText(`${getal(s.ik.punten)} punten · van ${getal(s.deelnemers)}`, SCH_W / 2, 390, SCH_W - 80)
      } else {
        g.fillStyle = '#ffffff'
        g.font = '900 56px Inter, system-ui, sans-serif'
        g.fillText('Speel mee!', SCH_W / 2, 220)
        g.fillStyle = '#cbd5e1'
        g.font = '700 32px Inter, system-ui, sans-serif'
        g.fillText('Voorspel de uitslag op een wedstrijdpagina', SCH_W / 2, 300, SCH_W - 80)
        g.fillText('en klim in het klassement.', SCH_W / 2, 346, SCH_W - 80)
      }
    })
  }

  // ================= de balie =================
  const B = W.balie
  const bx = (B.x0 + B.x1) / 2
  const bz = (B.z0 + B.z1) / 2
  const bw = B.x1 - B.x0
  const bd = B.z1 - B.z0
  const balieFront = tekst(1024, 256, (g) => {
    const hout = g.createLinearGradient(0, 0, 0, 256)
    hout.addColorStop(0, '#5a3418')
    hout.addColorStop(1, '#2b170a')
    g.fillStyle = hout
    g.fillRect(0, 0, 1024, 256)
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`
      g.beginPath()
      const y = Math.random() * 256
      g.moveTo(0, y)
      g.bezierCurveTo(300, y + 10, 700, y - 10, 1024, y + 5)
      g.stroke()
    }
    g.fillStyle = '#d4a017'
    g.fillRect(0, 26, 1024, 4)
    g.fillRect(0, 226, 1024, 4)
    g.font = '900 86px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#e9c46a'
    g.shadowColor = 'rgba(0,0,0,.6)'
    g.shadowBlur = 6
    g.fillText('WEDKANTOOR', 512, 132)
  })
  const front = new THREE.Mesh(new THREE.PlaneGeometry(bw, 1.05), new THREE.MeshStandardMaterial({ map: balieFront, roughness: 0.5, envMap: omgeving, envMapIntensity: 0.3, emissive: '#ffffff', emissiveMap: balieFront, emissiveIntensity: 0.25 }))
  front.position.set(bx, Y + 0.53, B.z0 - 0.001)
  front.rotation.y = Math.PI
  groep.add(front)
  doos(bw, 1.05, bd, bx, Y + 0.525, bz, mat.hout)
  // Marmeren blad.
  const marmer = tekst(512, 128, (g) => {
    g.fillStyle = '#eceae6'
    g.fillRect(0, 0, 512, 128)
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(90,90,100,${0.08 + Math.random() * 0.15})`
      g.lineWidth = 0.6 + Math.random() * 1.6
      g.beginPath()
      let x = Math.random() * 512
      let y = 0
      g.moveTo(x, y)
      while (y < 128) {
        x += (Math.random() - 0.5) * 40
        y += 8 + Math.random() * 14
        g.lineTo(x, y)
      }
      g.stroke()
    }
  })
  doos(bw + 0.12, 0.05, bd + 0.16, bx, Y + 1.075, bz - 0.02, new THREE.MeshStandardMaterial({ map: marmer, roughness: 0.15, metalness: 0.05, envMap: omgeving, envMapIntensity: 0.8 }))
  // Glazen scherm met een loket.
  for (const [x0, x1] of [
    [B.x0 + 0.1, bx - 0.5],
    [bx + 0.5, B.x1 - 0.1],
  ]) doos(x1 - x0, 0.75, 0.012, (x0 + x1) / 2, Y + 1.5, bz + 0.05, mat.glas)
  doos(1.0, 0.4, 0.012, bx, Y + 1.68, bz + 0.05, mat.glas)
  doos(bw, 0.03, 0.03, bx, Y + 1.88, bz + 0.05, mat.chroom)
  // Kassa, betaalterminal, ticketprinter, bel en een stapel formulieren.
  const kassaScherm = tekst(256, 160, (g) => {
    g.fillStyle = '#04120a'
    g.fillRect(0, 0, 256, 160)
    g.fillStyle = '#4ade80'
    g.font = '700 26px "Courier New", monospace'
    g.fillText('PRONOSTIEK', 20, 40)
    g.fillText('INZET   GRATIS', 20, 84)
    g.fillText('SUCCES! ✓', 20, 128)
  })
  const kassa = new THREE.Group()
  kassa.position.set(bx - 1.6, Y + 1.1, bz + 0.2)
  doos(0.42, 0.12, 0.36, 0, 0.06, 0, mat.zwart, kassa)
  const ks = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), new THREE.MeshBasicMaterial({ map: kassaScherm, toneMapped: false }))
  ks.position.set(0, 0.3, 0.02)
  ks.rotation.x = -0.25
  ks.rotation.y = Math.PI
  doos(0.4, 0.26, 0.03, 0, 0.3, 0.035, mat.zwart, kassa)
  kassa.add(ks)
  groep.add(kassa)
  doos(0.09, 0.03, 0.16, bx + 0.8, Y + 1.115, bz - 0.15, mat.zwart)
  const terminalScherm = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.05), new THREE.MeshBasicMaterial({ color: '#38bdf8', toneMapped: false }))
  terminalScherm.rotation.x = -Math.PI / 2
  terminalScherm.position.set(bx + 0.8, Y + 1.132, bz - 0.19)
  groep.add(terminalScherm)
  doos(0.22, 0.14, 0.24, bx + 1.6, Y + 1.17, bz + 0.15, new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.4 }))
  doos(0.14, 0.004, 0.18, bx + 1.6, Y + 1.245, bz - 0.02, new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.goud)
  bel.position.set(bx + 0.2, Y + 1.1, bz - 0.25)
  groep.add(bel)
  for (let k = 0; k < 6; k++) doos(0.15, 0.003, 0.21, bx - 0.6 + k * 0.004, Y + 1.102 + k * 0.004, bz - 0.25, new THREE.MeshBasicMaterial({ color: k % 2 ? '#fde68a' : '#fef3c7' }))
  // De lichtkrant op de wand achter de balie.
  const krantC = document.createElement('canvas')
  krantC.width = 2048
  krantC.height = 96
  const krantTex = canvasTex(krantC)
  krantTex.wrapS = THREE.RepeatWrapping
  const tekenKrant = (t: string) => {
    const g = krantC.getContext('2d')!
    g.fillStyle = '#050505'
    g.fillRect(0, 0, 2048, 96)
    g.fillStyle = '#ff6a00'
    g.font = '900 60px "Courier New", ui-monospace, monospace'
    g.textBaseline = 'middle'
    g.fillText(t, 10, 52)
    // Ledpuntjes: een raster over de letters.
    g.fillStyle = 'rgba(0,0,0,.55)'
    for (let x = 0; x < 2048; x += 6) g.fillRect(x, 0, 2, 96)
    for (let y = 0; y < 96; y += 6) g.fillRect(0, y, 2048, 2)
    krantTex.needsUpdate = true
  }
  tekenKrant('  ★ PRONOSTIEK · VOORSPEL DE UITSLAG · BONUSRAD ★ GRATIS DRAAIEN ★ KRACHTBAL LIVE ★')
  const krant = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.4, 0.32), new THREE.MeshBasicMaterial({ map: krantTex, toneMapped: false }))
  krant.position.set(bx, Y + 2.65, W.z1 - 0.03)
  krant.rotation.y = Math.PI
  doos(bw - 0.3, 0.42, 0.05, bx, Y + 2.65, W.z1 - 0.01, mat.zwart)
  groep.add(krant)
  // Rekken met flessen water en snoep achter de balie, en een klok.
  doos(bw - 0.6, 0.04, 0.3, bx, Y + 1.7, W.z1 - 0.18, mat.hout)
  for (let k = 0; k < 18; k++) {
    const fles = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), new THREE.MeshStandardMaterial({ color: k % 3 ? '#38bdf8' : '#f97316', transparent: true, opacity: 0.8, roughness: 0.1, envMap: omgeving }))
    fles.position.set(B.x0 + 0.5 + k * ((bw - 1) / 17), Y + 1.83, W.z1 - 0.18)
    groep.add(fles)
  }
  const klokC = document.createElement('canvas')
  klokC.width = klokC.height = 256
  const klokTex = canvasTex(klokC)
  const klok = new THREE.Mesh(new THREE.CircleGeometry(0.28, 48), new THREE.MeshBasicMaterial({ map: klokTex, toneMapped: false }))
  klok.position.set(B.x1 + 0.9, Y + 3.0, W.z1 - 0.02)
  klok.rotation.y = Math.PI
  const klokRing = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 10, 48), mat.goud)
  klokRing.position.copy(klok.position)
  groep.add(klok, klokRing)
  let laatsteMinuut = -1
  const tekenKlok = () => {
    const nu = new Date()
    if (nu.getMinutes() === laatsteMinuut) return
    laatsteMinuut = nu.getMinutes()
    const g = klokC.getContext('2d')!
    g.fillStyle = '#fbf7ee'
    g.fillRect(0, 0, 256, 256)
    g.strokeStyle = '#111'
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      g.lineWidth = i % 3 ? 3 : 7
      g.beginPath()
      g.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100)
      g.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118)
      g.stroke()
    }
    const wijzer = (a: number, l: number, w: number) => {
      g.lineWidth = w
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(128, 128)
      g.lineTo(128 + Math.sin(a) * l, 128 - Math.cos(a) * l)
      g.stroke()
    }
    wijzer(((nu.getHours() % 12) + nu.getMinutes() / 60) * (Math.PI / 6), 60, 9)
    wijzer(nu.getMinutes() * (Math.PI / 30), 92, 6)
    klokTex.needsUpdate = true
  }
  tekenKlok()

  // ================= statafels, krukken, plank, terminals =================
  const tafelBlad = new THREE.MeshStandardMaterial({ map: marmer, roughness: 0.18, envMap: omgeving, envMapIntensity: 0.7 })
  const formulier = tekst(128, 180, (g) => {
    g.fillStyle = '#fffbea'
    g.fillRect(0, 0, 128, 180)
    g.fillStyle = '#b45309'
    g.fillRect(0, 0, 128, 22)
    g.fillStyle = '#fff'
    g.font = '800 13px Inter, sans-serif'
    g.fillText('PRONOSTIEK', 10, 15)
    g.strokeStyle = '#d6c79a'
    for (let y = 36; y < 170; y += 14) {
      g.strokeRect(10, y, 10, 9)
      g.fillStyle = '#94a3b8'
      g.fillRect(28, y + 3, 80, 3)
    }
  })
  const formMat = new THREE.MeshBasicMaterial({ map: formulier })
  const kruk = (x: number, z: number) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 10), mat.chroom)
    p.position.set(x, Y + 0.38, z)
    const voet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), mat.chroom)
    voet.position.set(x, Y + 0.015, z)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 24).rotateX(Math.PI / 2), mat.chroom)
    ring.position.set(x, Y + 0.3, z)
    const zit = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.08, 24), mat.leder)
    zit.position.set(x, Y + 0.78, z)
    groep.add(p, voet, ring, zit)
  }
  for (const t of W.tafels) {
    const poot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.08, 14), mat.chroom)
    poot.position.set(t.x, Y + 0.54, t.z)
    const voet = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.04, 28), mat.chroom)
    voet.position.set(t.x, Y + 0.02, t.z)
    const blad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 40), tafelBlad)
    blad.position.set(t.x, Y + 1.08, t.z)
    const rand = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 8, 40).rotateX(Math.PI / 2), mat.goud)
    rand.position.set(t.x, Y + 1.08, t.z)
    groep.add(poot, voet, blad, rand)
    // Formulieren, een pennenbakje en een potlood.
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.18).rotateX(-Math.PI / 2), formMat)
      f.position.set(t.x - 0.15 + k * 0.16, Y + 1.102 + k * 0.001, t.z + 0.05 * (k - 1))
      f.rotation.y = (k - 1) * 0.4
      groep.add(f)
    }
    const bak = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 12, 1, true), mat.zwart)
    bak.position.set(t.x + 0.22, Y + 1.145, t.z - 0.18)
    groep.add(bak)
    for (let k = 0; k < 3; k++) {
      const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), new THREE.MeshBasicMaterial({ color: ['#1d4ed8', '#dc2626', '#111827'][k] }))
      pen.position.set(t.x + 0.22 + (k - 1) * 0.01, Y + 1.2, t.z - 0.18)
      pen.rotation.z = (k - 1) * 0.2
      groep.add(pen)
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5
      kruk(t.x + Math.cos(a) * 0.72, t.z + Math.sin(a) * 0.72)
    }
  }
  // De plank tegen de westwand, met formulierhouders en krukken.
  const P = W.plank
  doos(P.x1 - P.x0 + 0.05, 0.05, P.z1 - P.z0, (P.x0 + P.x1) / 2 + 0.03, Y + 1.05, (P.z0 + P.z1) / 2, tafelBlad)
  for (let z = P.z0 + 0.6; z < P.z1 - 0.3; z += 1.3) {
    doos(0.12, 0.3, 0.3, P.x0 + 0.1, Y + 1.22, z, mat.hout)
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.26), formMat)
    f.position.set(P.x0 + 0.165, Y + 1.24, z)
    f.rotation.y = Math.PI / 2
    groep.add(f)
    kruk(P.x1 + 0.45, z + 0.4)
  }
  // Zelfbedieningsterminals: een zuil met een groot aanraakscherm.
  const kioskScherm = tekst(256, 420, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 420)
    bg.addColorStop(0, '#0f2a5a')
    bg.addColorStop(1, '#071226')
    g.fillStyle = bg
    g.fillRect(0, 0, 256, 420)
    g.fillStyle = '#fbbf24'
    g.font = '900 30px Inter, sans-serif'
    g.textAlign = 'center'
    g.fillText('VOORSPEL', 128, 60)
    g.fillText('MEE!', 128, 96)
    for (let k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(255,255,255,.1)'
      g.beginPath()
      g.roundRect(24, 130 + k * 64, 208, 50, 10)
      g.fill()
      g.fillStyle = '#e2e8f0'
      g.font = '700 20px Inter, sans-serif'
      g.fillText(['Wedstrijden', 'Klassement', 'Bonusrad', 'Mijn boosters'][k], 128, 162 + k * 64)
    }
    g.fillStyle = '#fbbf24'
    g.font = '800 17px Inter, sans-serif'
    g.fillText('👆 TIK OM TE WEDDEN', 128, 400)
  })
  for (const k of W.kiosken) {
    const zuil = new THREE.Group()
    zuil.position.set(k.x, Y, k.z)
    zuil.rotation.y = -Math.PI / 2
    doos(0.7, 1.0, 0.45, 0, 0.5, 0, mat.zwart, zuil)
    doos(0.72, 0.06, 0.47, 0, 1.0, 0, mat.goud, zuil)
    const kop2 = doos(0.66, 0.95, 0.12, 0, 1.55, 0.05, mat.zwart, zuil)
    kop2.rotation.x = -0.12
    const sch = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.86), new THREE.MeshBasicMaterial({ map: kioskScherm, toneMapped: false }))
    sch.position.set(0, 1.55, 0.118)
    sch.rotation.x = -0.12
    zuil.add(sch)
    // De sleuf waar je ticket uitkomt, verlicht.
    doos(0.3, 0.02, 0.05, 0, 0.85, 0.23, mat.licht, zuil)
    groep.add(zuil)
  }
  // Het neonbord boven de deur, binnen.
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 0.7),
    new THREE.MeshBasicMaterial({
      map: tekst(1024, 170, (g) => {
        g.shadowColor = thema.primair
        g.shadowBlur = 34
        g.strokeStyle = '#ffd6e0'
        g.lineWidth = 6
        g.font = '900 100px Inter, system-ui, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.strokeText('WEDKANTOOR', 512, 88, 980)
        g.fillStyle = '#ffffff'
        g.fillText('WEDKANTOOR', 512, 88, 980)
      }),
      transparent: true,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  // Boven de deur (die ligt 3 m van de zuidwand, in het midden van de boulevard).
  neon.position.set(W.x0 + 0.05, Y + 3.6, W.z1 - 3)
  neon.rotation.y = Math.PI / 2
  groep.add(neon)
  // Een kamerplant in de hoek, voor de gezelligheid.
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 20), mat.goud)
  pot.position.set(W.x1 - 0.5, Y + 0.21, W.z0 + 0.5)
  const blad = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1).scale(1, 1.6, 1), new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.8, emissive: '#052e16', emissiveIntensity: 0.5 }))
  blad.position.set(W.x1 - 0.5, Y + 1.0, W.z0 + 0.5)
  groep.add(pot, blad)

  const lampKleur = new THREE.Color()
  return {
    zetStats,
    nabij(x, z) {
      if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1) return null
      // Vlak voor een wedkiosk: daar zet je een echte pronostiek.
      if (W.kiosken.some((k) => Math.hypot(x - k.x, z - k.z) < 1.5)) return 'kiosk'
      if (x > R.x - 4.2 && Math.abs(z - R.z) < 2.6) return 'rad'
      if (z < W.z0 + 4) return 'stats'
      return null
    },
    draai() {
      if (spin) return null
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        ac ??= new Ctx()
        void ac.resume?.()
      } catch {
        ac = null
      }
      const i = pickSegmentIndex(segs)
      const arc = arcs[i]
      const naar = Math.ceil(hoek / 360) * 360 + 6 * 360 + (360 - arc.mid) + (Math.random() - 0.5) * (arc.end - arc.start) * 0.6
      return new Promise<number>((klaar) => {
        spin = { van: hoek, naar, t0: performance.now(), duur: 6500, klaar, mult: arc.mult }
      })
    },
    update(seconden, dt) {
      if (!groep.visible) return
      // Het rad.
      if (spin) {
        const t = Math.min(1, (performance.now() - spin.t0) / spin.duur)
        hoek = spin.van + (spin.naar - spin.van) * (1 - Math.pow(1 - t, 5))
        const pin = Math.floor(hoek / (360 / PINNEN))
        if (pin !== laatstePin) {
          laatstePin = pin
          flapUit = 1
          klik()
        }
        if (t >= 1) {
          const s = spin
          spin = null
          winTot = seconden + 3
          fanfare(s.mult >= 5)
          s.klaar(s.mult)
        }
      }
      wiel.rotation.z = (-hoek * Math.PI) / 180
      flapUit = Math.max(0, flapUit - dt * 9)
      flapScharnier.rotation.z = flapUit * 0.45
      // Lampjes: een lopend licht, en knipperend goud na een prijs.
      const wint = seconden < winTot
      for (let i = 0; i < LAMPEN; i++) {
        const aan = wint ? Math.sin(seconden * 18) > 0 === (i % 2 === 0) : (i + Math.floor(seconden * (spin ? 14 : 4))) % 4 === 0
        lampKleur.set(aan ? (wint ? '#ffd166' : '#fff4c2') : '#5a4a2a')
        lamp.setColorAt(i, lampKleur)
      }
      if (lamp.instanceColor) lamp.instanceColor.needsUpdate = true
      ;(aura.material as THREE.MeshBasicMaterial).opacity = wint ? 0.55 + Math.sin(seconden * 10) * 0.2 : 0.3 + Math.sin(seconden * 1.5) * 0.05
      // De lichtkrant schuift.
      krantTex.offset.x = (seconden * 0.06) % 1
      if (Math.floor(seconden) % 10 === 0) tekenKlok()
    },
  }
}
