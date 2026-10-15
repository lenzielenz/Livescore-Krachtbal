import * as THREE from 'three'

import type { Rechthoek, StadionThema } from '@/lib/virtueel'
import { MOZAIEK, tegelKleuren, tegelVolgorde } from '@/lib/virtueel-mozaiek'
import { canvasTex, rondLogo } from './stadion'

// De photobooth in de noordgang, tegen de binnenkant van de gevel:
//  • een klassieke fotocabine met een rood fluwelen gordijn, een lichtbord met lampjes, een
//    voorbeeldstrip en de sleuf waar je foto uitkomt;
//  • ernaast een koordje met knijpers waar de laatste polaroids aan hangen (een nieuwe foto schuift
//    uit de sleuf en hangt zich vooraan op);
//  • en de mozaïekwand: alle selfies van je club samen vormen het clublogo. Van dichtbij zie je de
//    mensen; wandel achteruit en het logo verschijnt (zie lib/virtueel-mozaiek.ts).
// Coördinaten: alles wordt gebouwd alsof de muur op z = 0 ligt en naar +z kijkt (de gang in), met x
// van links (de cabine) naar rechts (de mozaïek); de groep staat dan op de echte muur (opt.muurZ),
// eventueel omgedraaid (opt.ry = π: de muur kijkt naar -z).

export type BoothFoto = { id: number; url: string; tegel: string; naam: string; wanneer: string; eigen?: boolean }

export type Photobooth = {
  obstakels: Rechthoek[]
  /** Alle foto's (oudste eerst). */
  zetFotos: (fotos: BoothFoto[]) => void
  /** Een nieuwe foto: hij komt uit de sleuf en hangt zich op. */
  voegToe: (foto: BoothFoto) => void
  /** Sta je voor de cabine? */
  bijBooth: (x: number, z: number) => boolean
  update: (seconden: number, dt: number) => void
}

const POLAROIDS = 6

export function bouwPhotobooth(
  scene: THREE.Scene,
  opt: { thema: StadionThema; muurZ: number; ry: 0 | typeof Math.PI; x0: number; logo: Promise<HTMLImageElement | null>; licht: boolean },
): Photobooth {
  const { thema } = opt
  const muurZ = 0
  const om = opt.ry !== 0
  const groep = new THREE.Group()
  groep.position.z = opt.muurZ
  groep.rotation.y = opt.ry
  scene.add(groep)
  // Van het eigen (lokale) assenstelsel naar de wereld, en terug.
  const rechthoekNaarWereld = (r: Rechthoek): Rechthoek =>
    om ? { x0: -r.x1, x1: -r.x0, z0: opt.muurZ - r.z1, z1: opt.muurZ - r.z0 } : { x0: r.x0, x1: r.x1, z0: opt.muurZ + r.z0, z1: opt.muurZ + r.z1 }
  const naarLokaal = (x: number, z: number) => (om ? { x: -x, z: opt.muurZ - z } : { x, z: z - opt.muurZ })
  const lokaleObstakels: Rechthoek[] = []
  const tekst = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    teken(c.getContext('2d')!)
    return canvasTex(c)
  }
  const doos = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, ouder: THREE.Object3D = groep) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    ouder.add(mesh)
    return mesh
  }
  const mat = {
    lak: new THREE.MeshStandardMaterial({ color: thema.primair, roughness: 0.28, metalness: 0.15, emissive: thema.primair, emissiveIntensity: 0.12 }),
    zwart: new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.4, metalness: 0.2 }),
    chroom: new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.18, metalness: 0.9, emissive: '#30343a', emissiveIntensity: 0.4 }),
    licht: new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false }),
    fluweel: new THREE.MeshStandardMaterial({ color: '#7a0b16', roughness: 0.95, emissive: '#2a0308', emissiveIntensity: 0.5, side: THREE.DoubleSide }),
    koord: new THREE.MeshStandardMaterial({ color: '#d6c7a1', roughness: 0.9 }),
    hout: new THREE.MeshStandardMaterial({ color: '#c08a4a', roughness: 0.7 }),
  }

  // ================= de cabine =================
  const CB = { x: opt.x0 + 0.8, b: 1.6, h: 2.35, d: 1.3 }
  const cz = muurZ + CB.d / 2 + 0.02
  const booth = new THREE.Group()
  booth.position.set(CB.x, 0, cz)
  groep.add(booth)
  // Romp: achterwand, zijwanden, dak en de linkerhelft van de voorkant (met de bediening).
  doos(CB.b, CB.h, 0.06, 0, CB.h / 2, -CB.d / 2 + 0.03, mat.lak, booth)
  for (const sx of [-1, 1]) doos(0.06, CB.h, CB.d, (sx * (CB.b - 0.06)) / 2, CB.h / 2, 0, mat.lak, booth)
  doos(CB.b, 0.08, CB.d, 0, CB.h - 0.04, 0, mat.zwart, booth)
  doos(CB.b * 0.48, CB.h - 0.08, 0.06, -CB.b / 4, (CB.h - 0.08) / 2, CB.d / 2 - 0.03, mat.lak, booth)
  // Chromen hoeklijsten en een plint.
  for (const sx of [-1, 1]) doos(0.04, CB.h, 0.04, (sx * CB.b) / 2, CB.h / 2, CB.d / 2, mat.chroom, booth)
  doos(CB.b + 0.04, 0.12, CB.d + 0.04, 0, 0.06, 0, mat.chroom, booth)
  // Het lichtbord bovenaan, met lampjes rondom.
  const kop = tekst(512, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128)
    gr.addColorStop(0, '#1a1a1a')
    gr.addColorStop(1, '#050505')
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 128)
    g.shadowColor = '#fde68a'
    g.shadowBlur = 18
    g.fillStyle = '#fff7d6'
    g.font = '900 64px Georgia, "Times New Roman", serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('PHOTO BOOTH', 256, 68, 480)
  })
  const kopBord = new THREE.Mesh(new THREE.PlaneGeometry(CB.b - 0.1, 0.4), new THREE.MeshBasicMaterial({ map: kop, toneMapped: false }))
  kopBord.position.set(0, CB.h + 0.25, CB.d / 2 - 0.02)
  booth.add(kopBord)
  doos(CB.b + 0.04, 0.5, 0.1, 0, CB.h + 0.25, CB.d / 2 - 0.09, mat.zwart, booth)
  const lampjes: THREE.Mesh[] = []
  for (let k = 0; k < 12; k++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3c4', toneMapped: false }))
    const t = k / 11
    l.position.set(-CB.b / 2 + 0.05 + t * (CB.b - 0.1), CB.h + 0.49, CB.d / 2 - 0.02)
    booth.add(l)
    lampjes.push(l)
  }
  // De voorkant links: een voorbeeldstrip met vier foto's, het bedieningspaneel en de sleuf.
  const strip = tekst(128, 448, (g) => {
    g.fillStyle = '#fafafa'
    g.fillRect(0, 0, 128, 448)
    for (let k = 0; k < 4; k++) {
      const gr = g.createLinearGradient(0, 12 + k * 108, 0, 108 + k * 108)
      gr.addColorStop(0, ['#fca5a5', '#93c5fd', '#fde68a', '#86efac'][k])
      gr.addColorStop(1, '#334155')
      g.fillStyle = gr
      g.fillRect(12, 12 + k * 108, 104, 96)
      g.fillStyle = 'rgba(255,255,255,.75)'
      g.beginPath()
      g.arc(64, 50 + k * 108, 18, 0, Math.PI * 2)
      g.fill()
      g.beginPath()
      g.ellipse(64, 104 + k * 108, 34, 22, 0, Math.PI, 0)
      g.fill()
    }
  })
  const stripMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.76), new THREE.MeshBasicMaterial({ map: strip }))
  stripMesh.position.set(-CB.b / 4 - 0.16, 1.55, CB.d / 2 + 0.005)
  booth.add(stripMesh)
  const paneel = tekst(256, 320, (g) => {
    g.fillStyle = '#0b0b0d'
    g.fillRect(0, 0, 256, 320)
    g.fillStyle = '#fde68a'
    g.font = '900 34px Georgia, serif'
    g.textAlign = 'center'
    g.fillText('SELFIE!', 128, 56)
    g.fillStyle = '#e5e7eb'
    g.font = '700 22px Inter, sans-serif'
    g.fillText('GRATIS', 128, 100)
    g.fillText('1 polaroid', 128, 132)
    g.fillText('aan de muur', 128, 160)
    g.fillStyle = '#ef4444'
    g.beginPath()
    g.arc(128, 240, 44, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#fff'
    g.font = '900 24px Inter, sans-serif'
    g.fillText('START', 128, 249)
  })
  const paneelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42), new THREE.MeshBasicMaterial({ map: paneel, toneMapped: false }))
  paneelMesh.position.set(-CB.b / 4 + 0.13, 1.5, CB.d / 2 + 0.005)
  booth.add(paneelMesh)
  doos(0.26, 0.03, 0.04, -CB.b / 4 + 0.13, 0.95, CB.d / 2 + 0.02, mat.chroom, booth)
  const sleufLicht = doos(0.22, 0.012, 0.02, -CB.b / 4 + 0.13, 0.95, CB.d / 2 + 0.035, mat.licht, booth)
  // Het gordijn (rechterhelft): fluweel in plooien, op een chromen roede.
  const gordijnGeo = new THREE.PlaneGeometry(CB.b * 0.5 - 0.06, CB.h - 0.3, 40, 1)
  const gp = gordijnGeo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < gp.count; i++) gp.setZ(i, Math.sin(gp.getX(i) * 38) * 0.035)
  gordijnGeo.computeVertexNormals()
  const gordijn = new THREE.Mesh(gordijnGeo, mat.fluweel)
  gordijn.position.set(CB.b / 4, (CB.h - 0.3) / 2 + 0.22, CB.d / 2 - 0.05)
  booth.add(gordijn)
  doos(CB.b * 0.5, 0.025, 0.025, CB.b / 4, CB.h - 0.08, CB.d / 2 - 0.05, mat.chroom, booth)
  // Binnenin (zichtbaar onder het gordijn): een krukje.
  const kruk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 18), mat.zwart)
  kruk.position.set(CB.b / 4, 0.5, 0)
  booth.add(kruk, doos(0.04, 0.45, 0.04, CB.b / 4, 0.25, 0, mat.chroom, booth))
  lokaleObstakels.push({ x0: CB.x - CB.b / 2 - 0.05, x1: CB.x + CB.b / 2 + 0.05, z0: muurZ - 0.3, z1: cz + CB.d / 2 + 0.05 })
  const sleufPos = new THREE.Vector3(CB.x - CB.b / 4 + 0.13, 0.95, cz + CB.d / 2 + 0.06)

  // ================= het koordje met polaroids =================
  const PL = { x0: CB.x + CB.b / 2 + 0.45, b: 0.42, h: 0.51, gat: 0.18 }
  const rijY = [2.55, 1.7]
  for (const y of rijY) {
    const lengte = 3 * PL.b + 2 * PL.gat + 0.5
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(PL.x0 - 0.2, y + 0.3, muurZ + 0.06), new THREE.Vector3(PL.x0 + lengte / 2 - 0.2, y + 0.18, muurZ + 0.09), new THREE.Vector3(PL.x0 + lengte - 0.2, y + 0.3, muurZ + 0.06))
    groep.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.006, 6), mat.koord))
    for (const x of [PL.x0 - 0.2, PL.x0 + lengte - 0.2]) {
      const nagel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat.chroom)
      nagel.position.set(x, y + 0.3, muurZ + 0.05)
      groep.add(nagel)
    }
  }
  const slot = (i: number) => {
    const k = i % 3
    const r = Math.floor(i / 3)
    const x = PL.x0 + PL.b / 2 + k * (PL.b + PL.gat)
    // Volgt de doorhang van het koordje.
    const t = (x - (PL.x0 - 0.2)) / (3 * PL.b + 2 * PL.gat + 0.5)
    const zak = 0.12 * 4 * t * (1 - t)
    return new THREE.Vector3(x, rijY[r] + 0.3 - zak - PL.h / 2 - 0.03, muurZ + 0.1)
  }
  type Polaroid = { g: THREE.Group; mat: THREE.MeshBasicMaterial; doel: THREE.Vector3; van: THREE.Vector3 | null; t: number; f: number }
  const polaroids: Polaroid[] = []
  const knijperMat = new THREE.MeshStandardMaterial({ color: '#c8a26b', roughness: 0.7 })
  const maakPolaroid = (): Polaroid => {
    const g = new THREE.Group()
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff' })
    const vlak = new THREE.Mesh(new THREE.PlaneGeometry(PL.b, PL.h), m)
    vlak.position.y = -PL.h / 2
    const knijper = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.025), knijperMat)
    knijper.position.set(0, 0, 0.012)
    g.add(vlak, knijper)
    g.visible = false
    groep.add(g)
    return { g, mat: m, doel: new THREE.Vector3(), van: null, t: 1, f: Math.random() * 6 }
  }
  for (let i = 0; i < POLAROIDS; i++) polaroids.push(maakPolaroid())
  const beeldCache = new Map<string, HTMLImageElement>()
  const laadBeeld = (src: string) =>
    new Promise<HTMLImageElement | null>((klaar) => {
      const al = beeldCache.get(src)
      if (al?.complete) return klaar(al)
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        beeldCache.set(src, img)
        klaar(img)
      }
      img.onerror = () => klaar(null)
      img.src = src
    })
  const datum = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`
  }
  const polaroidTex = (foto: BoothFoto, img: HTMLImageElement | null) =>
    tekst(256, 312, (g) => {
      g.fillStyle = '#fbfaf6'
      g.fillRect(0, 0, 256, 312)
      g.fillStyle = '#1f2937'
      g.fillRect(14, 14, 228, 228)
      if (img) {
        const s = Math.min(img.width, img.height)
        g.drawImage(img, (img.width - s) / 2, (img.height - s) * 0.25, s, s, 14, 14, 228, 228)
      }
      // Een zweem glans en een heel lichte vergeling, zoals een echte polaroid.
      const gl = g.createLinearGradient(14, 14, 242, 242)
      gl.addColorStop(0, 'rgba(255,255,255,.12)')
      gl.addColorStop(0.5, 'rgba(255,255,255,0)')
      gl.addColorStop(1, 'rgba(255,220,150,.08)')
      g.fillStyle = gl
      g.fillRect(14, 14, 228, 228)
      g.fillStyle = '#1e3a8a'
      g.font = 'italic 600 26px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive'
      g.textAlign = 'center'
      g.fillText(`${foto.naam} ${datum(foto.wanneer)}`.trim(), 128, 284, 220)
    })
  let laatstePolaroids: BoothFoto[] = []
  const toonPolaroids = (lijst: BoothFoto[], nieuw: BoothFoto | null) => {
    laatstePolaroids = lijst
    lijst.forEach((foto, i) => {
      const p = polaroids[i]
      p.doel.copy(slot(i))
      if (nieuw && foto.id === nieuw.id) {
        p.van = sleufPos.clone()
        p.t = 0
        p.g.position.copy(sleufPos)
      } else if (!p.g.visible) p.g.position.copy(p.doel)
      else {
        p.van = p.g.position.clone()
        p.t = 0
      }
      p.g.visible = true
      void laadBeeld(foto.url).then((img) => {
        if (laatstePolaroids[i] !== foto) return
        p.mat.map?.dispose()
        p.mat.map = polaroidTex(foto, img)
        p.mat.needsUpdate = true
      })
    })
    for (let i = lijst.length; i < POLAROIDS; i++) polaroids[i].g.visible = false
  }

  // ================= de mozaïekwand =================
  const MZ = { x0: PL.x0 + 3 * PL.b + 2 * PL.gat + 0.9, cel: 0.32, y0: 0.55 }
  const mb = MOZAIEK.kol * MZ.cel
  const mh = MOZAIEK.rij * MZ.cel
  const PX = opt.licht ? 40 : 56
  const mozC = document.createElement('canvas')
  mozC.width = MOZAIEK.kol * PX
  mozC.height = MOZAIEK.rij * PX
  const mozTex = canvasTex(mozC)
  mozTex.anisotropy = 8
  const mozVlak = new THREE.Mesh(new THREE.PlaneGeometry(mb, mh), new THREE.MeshBasicMaterial({ map: mozTex, toneMapped: false }))
  mozVlak.position.set(MZ.x0 + mb / 2, MZ.y0 + mh / 2, muurZ + 0.05)
  groep.add(mozVlak)
  // Een smalle zwarte lijst en een lichtlijn erboven.
  for (const [w, h, x, y] of [
    [mb + 0.2, 0.1, MZ.x0 + mb / 2, MZ.y0 + mh + 0.05],
    [mb + 0.2, 0.1, MZ.x0 + mb / 2, MZ.y0 - 0.05],
    [0.1, mh + 0.2, MZ.x0 - 0.05, MZ.y0 + mh / 2],
    [0.1, mh + 0.2, MZ.x0 + mb + 0.05, MZ.y0 + mh / 2],
  ]) doos(w, h, 0.06, x, y, muurZ + 0.04, mat.zwart)
  doos(mb, 0.04, 0.12, MZ.x0 + mb / 2, MZ.y0 + mh + 0.2, muurZ + 0.12, mat.licht)
  // Het bordje eronder: wat dit is, en hoeveel foto's er nog nodig zijn.
  const bordC = document.createElement('canvas')
  bordC.width = 1024
  bordC.height = 128
  const bordTex = canvasTex(bordC)
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.52), new THREE.MeshBasicMaterial({ map: bordTex, toneMapped: false }))
  bord.position.set(MZ.x0 + mb / 2, MZ.y0 - 0.42, muurZ + 0.06)
  groep.add(bord)
  const tekenBord = (n: number) => {
    const g = bordC.getContext('2d')!
    g.fillStyle = '#0b0f17'
    g.fillRect(0, 0, 1024, 128)
    g.fillStyle = thema.primair
    g.fillRect(0, 0, 12, 128)
    g.fillStyle = '#ffffff'
    g.font = '900 44px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('📸 SAMEN ÉÉN CLUB', 36, 48, 600)
    g.fillStyle = '#cbd5e1'
    g.font = '700 30px Inter, system-ui, sans-serif'
    g.fillText(
      n >= MOZAIEK.min ? `${n} selfies vormen het logo — wandel achteruit!` : `Nog ${MOZAIEK.min - n} selfie${MOZAIEK.min - n === 1 ? '' : 's'}, dan verschijnt de mozaïek`,
      36,
      96,
      960,
    )
    bordTex.needsUpdate = true
  }

  // De kleuren van het logo per tegel: het clubschild in het midden, op de clubkleur.
  let kleuren: [number, number, number][] = []
  const maakKleuren = (logo: HTMLImageElement | null) => {
    const S = 8
    const c = document.createElement('canvas')
    c.width = MOZAIEK.kol * S
    c.height = MOZAIEK.rij * S
    const g = c.getContext('2d')!
    g.fillStyle = thema.secundair
    g.fillRect(0, 0, c.width, c.height)
    rondLogo(g, logo, thema, c.width / 2, c.height / 2, c.height * 0.46)
    const klein = document.createElement('canvas')
    klein.width = MOZAIEK.kol
    klein.height = MOZAIEK.rij
    const k = klein.getContext('2d')!
    k.imageSmoothingQuality = 'high'
    k.drawImage(c, 0, 0, MOZAIEK.kol, MOZAIEK.rij)
    const hex = new THREE.Color(thema.secundair)
    kleuren = tegelKleuren(k.getImageData(0, 0, MOZAIEK.kol, MOZAIEK.rij).data, MOZAIEK.kol, MOZAIEK.rij, [hex.r * 255, hex.g * 255, hex.b * 255].map(Math.round) as [number, number, number])
  }
  maakKleuren(null)

  let alle: BoothFoto[] = []
  let tegels: (HTMLImageElement | null)[] = []
  let tekenTaak = 0
  const tekenMozaiek = () => {
    const taak = ++tekenTaak
    const g = mozC.getContext('2d')!
    const n = alle.length
    tekenBord(n)
    g.fillStyle = '#0d1016'
    g.fillRect(0, 0, mozC.width, mozC.height)
    const vol = n >= MOZAIEK.min
    // Genoeg foto's: elke tegel een foto. Anders hangt elke foto één keer, en de rest is een lege
    // polaroid in de kleur van het logo (zo zie je al waar het naartoe gaat).
    const volgorde = vol ? tegelVolgorde(n, MOZAIEK.kol, MOZAIEK.rij) : (() => {
      const v: number[] = Array(MOZAIEK.kol * MOZAIEK.rij).fill(-1)
      const plekken = tegelVolgorde(MOZAIEK.kol * MOZAIEK.rij, MOZAIEK.kol, MOZAIEK.rij, 11)
      for (let i = 0; i < n; i++) v[plekken[i]] = i
      return v
    })()
    let i = 0
    const stap = () => {
      if (taak !== tekenTaak) return
      const einde = Math.min(volgorde.length, i + 120)
      for (; i < einde; i++) {
        const x = (i % MOZAIEK.kol) * PX
        const y = Math.floor(i / MOZAIEK.kol) * PX
        const [r, gg, b] = kleuren[i] ?? [128, 128, 128]
        const rand = Math.max(2, Math.round(PX * 0.06))
        g.fillStyle = '#f4f1ea'
        g.fillRect(x + 1, y + 1, PX - 2, PX - 2)
        const img = volgorde[i] >= 0 ? tegels[volgorde[i]] : null
        const bx = x + rand
        const by = y + rand
        const bb = PX - 2 * rand
        if (img) {
          const s = Math.min(img.width, img.height)
          g.drawImage(img, (img.width - s) / 2, (img.height - s) * 0.25, s, s, bx, by, bb, bb)
          g.fillStyle = `rgba(${r},${gg},${b},0.55)`
          g.fillRect(x, y, PX, PX)
        } else {
          g.fillStyle = `rgba(${r},${gg},${b},${vol ? 0.9 : 0.35})`
          g.fillRect(x + 1, y + 1, PX - 2, PX - 2)
        }
      }
      mozTex.needsUpdate = true
      if (i < volgorde.length) setTimeout(stap, 0)
    }
    stap()
  }
  const laadTegels = async () => {
    const beelden = await Promise.all(alle.map((f) => (f.tegel ? laadBeeld(f.tegel) : Promise.resolve(null))))
    tegels = beelden
    tekenMozaiek()
  }
  void opt.logo.then((logo) => {
    maakKleuren(logo)
    tekenMozaiek()
  })
  tekenMozaiek()

  return {
    obstakels: lokaleObstakels.map(rechthoekNaarWereld),
    zetFotos(fotos) {
      alle = fotos.slice(-MOZAIEK.max)
      toonPolaroids(alle.slice(-POLAROIDS).reverse(), null)
      void laadTegels()
    },
    voegToe(foto) {
      alle = [...alle, foto].slice(-MOZAIEK.max)
      toonPolaroids(alle.slice(-POLAROIDS).reverse(), foto)
      void laadTegels()
    },
    bijBooth(wx, wz) {
      const { x, z } = naarLokaal(wx, wz)
      return Math.abs(x - CB.x) < 1.6 && z > cz + CB.d / 2 && z < cz + CB.d / 2 + 2.4
    },
    update(seconden, dt) {
      if (!groep.visible) return
      lampjes.forEach((l, i) => ((l.material as THREE.MeshBasicMaterial).color.set((i + Math.floor(seconden * 5)) % 3 === 0 ? '#fff3c4' : '#7a5d2a')))
      ;(sleufLicht.material as THREE.MeshBasicMaterial).color.setHSL(0.12, 1, 0.55 + 0.3 * Math.sin(seconden * 4))
      for (const p of polaroids) {
        if (!p.g.visible) continue
        if (p.van && p.t < 1) {
          p.t = Math.min(1, p.t + dt / 1.6)
          const e = 1 - Math.pow(1 - p.t, 3)
          p.g.position.lerpVectors(p.van, p.doel, e)
          // Een boogje naar voren tijdens het ophangen.
          p.g.position.z += Math.sin(e * Math.PI) * 0.35
          if (p.t >= 1) p.van = null
        }
        p.g.rotation.z = Math.sin(seconden * 1.1 + p.f) * 0.04
      }
    },
  }
}
