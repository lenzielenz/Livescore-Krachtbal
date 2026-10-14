import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { opVloer, type Rechthoek, type StadionThema } from '@/lib/virtueel'
import { VERDIEPEN } from '@/lib/virtueel-lift'
import { canvasTex, rnd, rondLogo } from './stadion'

// Verdiep -1: onder de grond, dus niet gebonden aan het stadion erboven — de ruimte is zo groot als
// we willen. Een ondergrondse boulevard vanaf de lift, met aan weerszijden:
//  • 💪 fitness: rubbervloer, loopbanden, fietsen, rekken met halters, een spiegelwand en neon;
//  • 🎬 cinema: rijen rode zetels onder een sterrenhemel, een groot doek met een film (videoscherm.ts);
//  • 🎮 gaming: neonraster in de vloer, gamebureaus met schermen, arcadekasten en zitzakken;
//  • 🏊 zwembad: een 25 m-bad met banen in clubkleur, onderwaterlicht en lichtschitteringen op het plafond;
//  • 🧖 sauna & wellness: houten saunacabines met amberkleurige gloed, een bubbelbad, ligbedden, kaarsjes.
// Omdat het onder de grond is: geen daglicht, alles leeft van verlichting en sfeer — warm in de
// sauna, koel blauw bij het water, neon in de gameroom, gedimd in de cinema. Al dat licht is nep
// (lichtgevende vlakken, gloed- en lichtplassen): echte lampen zouden het hele stadion vertragen.
// De boulevard loopt aan beide kanten "eindeloos" door (een geschilderd perspectief op de eindwand).

export type Kelder = {
  groep: THREE.Group
  /** Mag je hier staan in de kelder? */
  mag: (x: number, z: number) => boolean
  /** In welke ruimte ben je (voor een melding bij het binnenkomen)? */
  ruimte: (x: number, z: number) => string | null
  /** Het filmdoek in de cinema (voor de video). */
  doek: { x: number; y: number; z: number; b: number; h: number; ry: number }
  /** Waar je dingen kan doen (en achterlaten): zie kelderspel.ts. */
  plekken: KelderPlekken
  /** De kleur van het zwembadwater (verf van bezoekers). */
  zetWaterKleur: (hex: string) => void
  /** Hoe hard je op een trampoline veert (0 = er niet op). */
  trampoline: (x: number, z: number) => number
  update: (seconden: number, speler?: { x: number; z: number }) => void
}

/** Een bord aan de muur: midden, hoogte en waar het naar kijkt. */
export type BordPlek = { x: number; y: number; z: number; ry: number; b: number; h: number }
export type KelderPlekken = {
  bad: { x0: number; x1: number; z0: number; z1: number; y: number }
  popcorn: { x: number; z: number; y: number }
  popcornBord: BordPlek
  loopbanden: { x: number; z: number }[]
  loopbandBord: BordPlek
  zetels: { x: number; z: number }[]
  arcade: { x: number; z: number }
  scoreBord: BordPlek
  kampioenBord: BordPlek
  /** De graffitimuur in de speelhal: waar u = 0 begint, in welke richting hij loopt, en de normaal. */
  graffiti: { x: number; z: number; dx: number; dz: number; ry: number; max: number }
  tactiek: BordPlek
  /** Plekken voor gouden ballen in de kelder (zie goudjacht.ts). */
  goud: { x: number; y: number; z: number }[]
}

type Kant = 'n' | 'z' | 'o' | 'w'
type Deur = { kant: Kant; van: number; tot: number }
type Zaal = { naam: string; x0: number; x1: number; z0: number; z1: number; h: number; wand: THREE.Material; vloer: THREE.Material; plafond: THREE.Material; deuren: Deur[]; vloerTegel: number; gat?: Rechthoek }

const DEUR_H = 2.9

export function bouwKelder(scene: THREE.Scene, opt: { thema: StadionThema; licht: boolean; liftX: number; liftZ: number; logo: Promise<HTMLImageElement | null> }): Kelder {
  const { thema, licht } = opt
  const Y = VERDIEPEN[0].y
  const ox = opt.liftX
  const oz = opt.liftZ
  const primair = new THREE.Color(thema.primair)
  const secundair = new THREE.Color(thema.secundair)
  const toeval = rnd(1357)
  const groep = new THREE.Group()
  groep.visible = false
  scene.add(groep)
  const meubels: Rechthoek[] = []
  const vloeren: Rechthoek[] = []
  const add = (...o: THREE.Object3D[]) => groep.add(...o)
  const doos = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, obst = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, Y + y, z)
    add(m)
    if (obst) meubels.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })
    return m
  }
  const basis = (c: string) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false })
  const tekst = (w: number, h: number, teken: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    teken(c.getContext('2d')!)
    return canvasTex(c)
  }
  /** Een wandtextuur van 4 m breed over de hele hoogte: een verloop, en bovenaan een lichtlijn (cove). */
  const wandMat = (onder: string, boven: string, cove: string, deco?: (g: CanvasRenderingContext2D) => void) => {
    const t = tekst(256, 256, (g) => {
      const gr = g.createLinearGradient(0, 256, 0, 0)
      gr.addColorStop(0, onder)
      gr.addColorStop(0.82, boven)
      gr.addColorStop(0.9, cove)
      gr.addColorStop(1, boven)
      g.fillStyle = gr
      g.fillRect(0, 0, 256, 256)
      deco?.(g)
    })
    t.wrapS = THREE.RepeatWrapping
    return new THREE.MeshBasicMaterial({ map: t })
  }
  const tegelMat = (kleur: string, voeg: string, n: number, extra?: (g: CanvasRenderingContext2D) => void) => {
    const t = tekst(256, 256, (g) => {
      g.fillStyle = voeg
      g.fillRect(0, 0, 256, 256)
      const s = 256 / n
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = kleur
          g.globalAlpha = 0.85 + toeval() * 0.15
          g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3)
        }
      g.globalAlpha = 1
      extra?.(g)
    })
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    // Onder de grond geen maanlicht: vloeren en tegels dragen hun eigen (gedimde) licht.
    return new THREE.MeshBasicMaterial({ map: t })
  }
  // Een lichtplas (nep-licht) op de vloer of tegen de muur.
  const plasTex = tekst(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,.9)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  })
  const plassen = new Map<string, { mat: THREE.MeshBasicMaterial; m: THREE.Matrix4[] }>()
  const plas = (x: number, z: number, r: number, kleur: string, sterkte = 0.35, y = 0.02) => {
    let p = plassen.get(`${kleur}|${sterkte}`)
    if (!p) {
      p = { mat: new THREE.MeshBasicMaterial({ map: plasTex, color: kleur, transparent: true, opacity: sterkte, blending: THREE.AdditiveBlending, depthWrite: false }), m: [] }
      plassen.set(`${kleur}|${sterkte}`, p)
    }
    p.m.push(new THREE.Matrix4().compose(new THREE.Vector3(x, Y + y, z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r)))
  }

  // ---------- muren, vloeren en plafonds per zaal ----------
  /** Verzamelt wandvlakken per materiaal en maakt er op het einde één mesh van. */
  const wanden = new Map<THREE.Material, { pos: number[]; uv: number[] }>()
  const quad = (mat: THREE.Material, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, nx: number, nz: number, h: number) => {
    // Voorkant naar (nx, nz): draai de punten om als het nodig is.
    if (-(bz - az) * nx + (bx - ax) * nz < 0) [ax, az, bx, bz] = [bx, bz, ax, az]
    let w = wanden.get(mat)
    if (!w) wanden.set(mat, (w = { pos: [], uv: [] }))
    const ua = 0
    const ub = Math.hypot(bx - ax, bz - az) / 4
    const va = y0 / h
    const vb = y1 / h
    w.pos.push(ax, Y + y0, az, bx, Y + y0, bz, bx, Y + y1, bz, ax, Y + y0, az, bx, Y + y1, bz, ax, Y + y1, az)
    w.uv.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb)
  }
  const zalen: Zaal[] = []
  const bouwZaal = (z: Zaal) => {
    zalen.push(z)
    vloeren.push({ x0: z.x0, x1: z.x1, z0: z.z0, z1: z.z1 })
    const lijnen: [Kant, number, number, number, number, number, number][] = [
      // kant, ax, az, bx, bz, nx, nz (naar binnen)
      ['n', z.x0, z.z0, z.x1, z.z0, 0, 1],
      ['z', z.x0, z.z1, z.x1, z.z1, 0, -1],
      ['w', z.x0, z.z0, z.x0, z.z1, 1, 0],
      ['o', z.x1, z.z0, z.x1, z.z1, -1, 0],
    ]
    for (const [kant, ax, az, bx, bz, nx, nz] of lijnen) {
      const langsX = az === bz
      const a = langsX ? ax : az
      const b = langsX ? bx : bz
      const gaten = z.deuren.filter((d) => d.kant === kant).sort((p, q) => p.van - q.van)
      let van = a
      const stuk = (s0: number, s1: number, y0: number, y1: number) => {
        if (s1 - s0 < 0.01) return
        if (langsX) quad(z.wand, s0, az, s1, az, y0, y1, nx, nz, z.h)
        else quad(z.wand, ax, s0, ax, s1, y0, y1, nx, nz, z.h)
      }
      for (const d of gaten) {
        stuk(van, d.van, 0, z.h)
        stuk(d.van, d.tot, DEUR_H, z.h)
        // De doorgang zelf: een vloerstrook over de muurlijn, zodat je erdoor kan.
        vloeren.push(langsX ? { x0: d.van, x1: d.tot, z0: az - 1.2, z1: az + 1.2 } : { x0: ax - 1.2, x1: ax + 1.2, z0: d.van, z1: d.tot })
        van = d.tot
      }
      stuk(van, b, 0, z.h)
    }
    // De vloer als vorm (in x, -z), met eventueel een gat (het zwembad); uv = meters / tegelmaat.
    const vorm = new THREE.Shape([new THREE.Vector2(z.x0, -z.z0), new THREE.Vector2(z.x1, -z.z0), new THREE.Vector2(z.x1, -z.z1), new THREE.Vector2(z.x0, -z.z1)])
    if (z.gat) vorm.holes.push(new THREE.Path([new THREE.Vector2(z.gat.x0, -z.gat.z0), new THREE.Vector2(z.gat.x0, -z.gat.z1), new THREE.Vector2(z.gat.x1, -z.gat.z1), new THREE.Vector2(z.gat.x1, -z.gat.z0)]))
    const vg = new THREE.ShapeGeometry(vorm).rotateX(-Math.PI / 2)
    const uv = vg.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / z.vloerTegel, uv.getY(i) / z.vloerTegel)
    const vloer = new THREE.Mesh(vg, z.vloer)
    vloer.position.y = Y
    const plafond = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0, z.z1 - z.z0).rotateX(Math.PI / 2), z.plafond)
    plafond.position.set((z.x0 + z.x1) / 2, Y + z.h, (z.z0 + z.z1) / 2)
    add(vloer, plafond)
  }

  // ---------- de indeling ----------
  // Rond de lift (ox, oz = de liftdeuren): lobby, boulevard (west → oost), zalen aan beide kanten.
  const B0 = oz + 7
  const B1 = oz + 13
  const R = {
    lobby: { x0: ox - 5, x1: ox + 5, z0: oz, z1: B0 },
    boulevard: { x0: ox - 44, x1: ox + 66, z0: B0, z1: B1 },
    fitness: { x0: ox - 42, x1: ox - 7, z0: oz - 24, z1: B0 },
    cinema: { x0: ox + 7, x1: ox + 31, z0: oz - 24, z1: B0 },
    gaming: { x0: ox + 33, x1: ox + 64, z0: oz - 14, z1: B0 },
    zwembad: { x0: ox - 40, x1: ox + 14, z0: B1, z1: oz + 45 },
    sauna: { x0: ox + 16, x1: ox + 46, z0: B1, z1: oz + 37 },
    speelhal: { x0: ox + 48, x1: ox + 80, z0: B1, z1: B1 + 36 },
  }
  const deurX = { fitness: ox - 20, cinema: ox + 19, gaming: ox + 48, zwembad: ox - 14, sauna: ox + 31, speelhal: ox + 57 }
  const goud: { x: number; y: number; z: number }[] = []
  const d3 = (x: number) => ({ van: x - 1.6, tot: x + 1.6 })

  // ---------- boulevard en lobby ----------
  const steenVloer = tegelMat('#22252c', '#15171c', 4)
  const blvWand = wandMat('#14161c', '#2a2e38', thema.primair, (g) => {
    // Panelen met een verticale ledlijn om de 4 m.
    g.fillStyle = 'rgba(255,255,255,.04)'
    g.fillRect(8, 20, 240, 190)
    g.fillStyle = thema.primair
    g.globalAlpha = 0.9
    g.fillRect(0, 0, 4, 256)
    g.globalAlpha = 1
  })
  const donkerPlafond = new THREE.MeshBasicMaterial({ color: '#0d0f14' })
  bouwZaal({
    naam: 'Boulevard',
    ...R.boulevard,
    h: 4.2,
    wand: blvWand,
    vloer: steenVloer,
    plafond: donkerPlafond,
    vloerTegel: 2,
    deuren: [
      { kant: 'n', ...d3(deurX.fitness) },
      { kant: 'n', van: R.lobby.x0, tot: R.lobby.x1 },
      { kant: 'n', ...d3(deurX.cinema) },
      { kant: 'n', ...d3(deurX.gaming) },
      { kant: 'z', ...d3(deurX.zwembad) },
      { kant: 'z', ...d3(deurX.sauna) },
      { kant: 'z', ...d3(deurX.speelhal) },
    ],
  })
  bouwZaal({ naam: 'Lobby', ...R.lobby, h: 4.2, wand: blvWand, vloer: steenVloer, plafond: donkerPlafond, vloerTegel: 2, deuren: [{ kant: 'z', van: R.lobby.x0, tot: R.lobby.x1 }, { kant: 'n', van: ox - 0.6, tot: ox + 0.6 }] })
  // De kooi zelf (en de deur ernaar) is ook vloer.
  vloeren.push({ x0: ox - 1.2, x1: ox + 1.2, z0: oz - 2.6, z1: oz + 1 })
  // Een lichtende lijn in clubkleur door het midden van de boulevard, en lichtlijnen in het plafond.
  doos(R.boulevard.x1 - R.boulevard.x0, 0.01, 0.16, (R.boulevard.x0 + R.boulevard.x1) / 2, 0.005, (B0 + B1) / 2, basis(thema.primair))
  for (const zz of [B0 + 1.2, B1 - 1.2]) doos(R.boulevard.x1 - R.boulevard.x0 - 1, 0.03, 0.12, (R.boulevard.x0 + R.boulevard.x1) / 2, 4.18, zz, basis('#fff3d6'))
  for (let x = R.boulevard.x0 + 3; x < R.boulevard.x1; x += 6) plas(x, (B0 + B1) / 2, 3.2, '#ffe2b0', 0.12)
  // De eindwanden: een geschilderde, eindeloos doorlopende gang.
  const eindeloos = tekst(512, 512, (g) => {
    const vx = 256
    const vy = 230
    const gr = g.createRadialGradient(vx, vy, 0, vx, vy, 360)
    gr.addColorStop(0, '#000000')
    gr.addColorStop(0.6, '#111319')
    gr.addColorStop(1, '#22252c')
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 512)
    g.strokeStyle = thema.primair
    g.lineWidth = 3
    for (let k = 0; k < 9; k++) {
      const f = Math.pow(0.68, k)
      const w = 256 * f
      const h = 230 * f
      g.globalAlpha = 0.15 + 0.7 * f
      g.strokeStyle = '#3a3f4b'
      g.strokeRect(vx - w, vy - h, 2 * w, h + (512 - vy) * f)
      g.fillStyle = '#fff3d6'
      g.fillRect(vx - w * 0.6, vy - h + 4 * f, w * 1.2, Math.max(1, 3 * f))
      g.fillStyle = thema.primair
      g.fillRect(vx - 6 * f, vy + (512 - vy) * f - 2, 12 * f, Math.max(1, 6 * f))
    }
    g.globalAlpha = 1
    for (const s of [-1, 1]) {
      g.strokeStyle = thema.primair
      g.globalAlpha = 0.8
      g.beginPath()
      g.moveTo(vx, vy + 30)
      g.lineTo(vx + s * 30, 512)
      g.stroke()
    }
    g.globalAlpha = 1
  })
  for (const [x, ry] of [
    [R.boulevard.x0 + 0.02, Math.PI / 2],
    [R.boulevard.x1 - 0.02, -Math.PI / 2],
  ] as const) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(B1 - B0, 4.2), new THREE.MeshBasicMaterial({ map: eindeloos }))
    v.position.set(x, Y + 2.1, (B0 + B1) / 2)
    v.rotation.y = ry
    add(v)
  }
  // Borden boven de deuren.
  const bordBoven = (naam: string, icoon: string, x: number, z: number, ry: number, kleur: string) => {
    const t = tekst(1024, 220, (g) => {
      g.fillStyle = '#07090d'
      g.fillRect(0, 0, 1024, 220)
      g.shadowColor = kleur
      g.shadowBlur = 30
      g.fillStyle = '#ffffff'
      g.font = '900 120px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(`${icoon} ${naam}`, 512, 116, 980)
      g.shadowBlur = 0
      g.fillStyle = kleur
      g.fillRect(0, 206, 1024, 14)
    })
    const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.77), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }))
    b.position.set(x, Y + DEUR_H + 0.6, z)
    b.rotation.y = ry
    add(b)
    plas(x, z + Math.cos(ry) * 1.2, 1.6, kleur, 0.25)
  }
  bordBoven('FITNESS', '💪', deurX.fitness, B0 + 0.02, 0, '#22d3ee')
  bordBoven('CINEMA', '🎬', deurX.cinema, B0 + 0.02, 0, '#f43f5e')
  bordBoven('GAMING', '🎮', deurX.gaming, B0 + 0.02, 0, '#a855f7')
  bordBoven('ZWEMBAD', '🏊', deurX.zwembad, B1 - 0.02, Math.PI, '#38bdf8')
  bordBoven('SAUNA & WELLNESS', '🧖', deurX.sauna, B1 - 0.02, Math.PI, '#f59e0b')
  bordBoven('SPEELHAL', '🎡', deurX.speelhal, B1 - 0.02, Math.PI, '#22c55e')
  // In de lobby: een welkomstwand met het clublogo, en bankjes.
  const welkomC = document.createElement('canvas')
  welkomC.width = 1024
  welkomC.height = 512
  const welkomTex = canvasTex(welkomC)
  const tekenWelkom = (logo: HTMLImageElement | null) => {
    const g = welkomC.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 0, 512)
    gr.addColorStop(0, '#0b0e14')
    gr.addColorStop(1, '#161a22')
    g.fillStyle = gr
    g.fillRect(0, 0, 1024, 512)
    g.shadowColor = thema.primair
    g.shadowBlur = 40
    rondLogo(g, logo, thema, 512, 190, 130)
    g.shadowBlur = 0
    g.fillStyle = '#ffffff'
    g.font = '900 64px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText('-1 · WELLNESS & ONTSPANNING', 512, 390, 980)
    g.fillStyle = 'rgba(226,232,240,.75)'
    g.font = '600 32px Inter, system-ui, sans-serif'
    g.fillText(`${thema.naam} · fitness · sauna · zwembad · cinema · gaming`, 512, 448, 980)
    welkomTex.needsUpdate = true
  }
  tekenWelkom(null)
  void opt.logo.then(tekenWelkom)
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.25), new THREE.MeshBasicMaterial({ map: welkomTex, toneMapped: false }))
    w.position.set(ox + sx * 4.98, Y + 2.1, oz + 3.6)
    w.rotation.y = -sx * (Math.PI / 2)
    add(w)
  }
  plas(ox, oz + 3.5, 4, thema.primair, 0.18)

  const loopbanden: { x: number; z: number }[] = []
  const zetelPlekken: { x: number; z: number }[] = []
  // ---------- 💪 fitness ----------
  {
    const F = R.fitness
    const rubber = tegelMat('#24272e', '#191b20', 2, (g) => {
      g.fillStyle = 'rgba(255,255,255,.03)'
      for (let i = 0; i < 300; i++) g.fillRect(toeval() * 256, toeval() * 256, 1, 1)
    })
    bouwZaal({
      naam: 'Fitness',
      ...F,
      h: 4.6,
      wand: wandMat('#0f1116', '#23262e', '#e0f2fe', (g) => {
        g.fillStyle = thema.primair
        g.fillRect(0, 150, 256, 10)
      }),
      vloer: rubber,
      plafond: new THREE.MeshBasicMaterial({ color: '#16181d' }),
      vloerTegel: 1,
      deuren: [{ kant: 'z', ...d3(deurX.fitness) }],
    })
    // Spiegelwand op de westkant: een lichte, glanzende band met de vage weerschijn van de zaal.
    const spiegel = tekst(512, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 512, 256)
      gr.addColorStop(0, '#9aa6b5')
      gr.addColorStop(0.5, '#cfd8e3')
      gr.addColorStop(1, '#8794a5')
      g.fillStyle = gr
      g.fillRect(0, 0, 512, 256)
      g.fillStyle = 'rgba(255,255,255,.35)'
      for (let i = 0; i < 6; i++) g.fillRect(40 + i * 80, 0, 18, 256)
      g.fillStyle = 'rgba(17,24,39,.25)'
      g.fillRect(0, 200, 512, 56)
    })
    spiegel.wrapS = THREE.RepeatWrapping
    spiegel.repeat.set((F.z1 - F.z0) / 6, 1)
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(F.z1 - F.z0 - 2, 2.4), new THREE.MeshBasicMaterial({ map: spiegel }))
    sp.position.set(F.x0 + 0.03, Y + 1.5, (F.z0 + F.z1) / 2)
    sp.rotation.y = Math.PI / 2
    add(sp)
    // Neon op de noordwand.
    const neon = tekst(1024, 200, (g) => {
      g.shadowColor = thema.primair
      g.shadowBlur = 36
      g.fillStyle = '#ffffff'
      g.font = 'italic 900 120px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('SAMEN STERKER', 512, 104, 1000)
      g.fillText('SAMEN STERKER', 512, 104, 1000)
    })
    const ne = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.76), new THREE.MeshBasicMaterial({ map: neon, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }))
    ne.position.set((F.x0 + F.x1) / 2, Y + 3.3, F.z0 + 0.05)
    add(ne)
    plas((F.x0 + F.x1) / 2, F.z0 + 1.2, 5, thema.primair, 0.3)
    // Lichtstroken in het plafond, en hun plassen.
    for (let z = F.z0 + 4; z < F.z1 - 2; z += 6) {
      doos(F.x1 - F.x0 - 4, 0.04, 0.18, (F.x0 + F.x1) / 2, 4.56, z, basis('#eef6ff'))
      for (let x = F.x0 + 4; x < F.x1 - 2; x += 6) plas(x, z, 3.4, '#dbeafe', 0.26)
    }
    const zwart = new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.5, metalness: 0.4 })
    const chroom = new THREE.MeshStandardMaterial({ color: '#cbd2da', roughness: 0.25, metalness: 0.9, emissive: '#2a2f36', emissiveIntensity: 0.5 })
    const club = new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.15 })
    const schermGloed = basis('#38bdf8')
    // Loopbanden in een rij, met het gezicht naar de spiegel.
    const loopband: THREE.BufferGeometry[] = []
    const loopbandZwart: THREE.BufferGeometry[] = []
    const loopbandScherm: THREE.BufferGeometry[] = []
    for (let k = 0; k < 6; k++) {
      const z = F.z0 + 4 + k * 2.3
      const x = F.x0 + 4.5
      loopbanden.push({ x: x + 1.5, z })
      loopbandZwart.push(new THREE.BoxGeometry(1.9, 0.22, 0.85).translate(x, Y + 0.11, z))
      loopband.push(new THREE.BoxGeometry(0.06, 1.25, 0.06).translate(x - 0.85, Y + 0.75, z - 0.38), new THREE.BoxGeometry(0.06, 1.25, 0.06).translate(x - 0.85, Y + 0.75, z + 0.38))
      loopbandZwart.push(new THREE.BoxGeometry(0.22, 0.4, 0.9).translate(x - 0.85, Y + 1.4, z))
      loopbandScherm.push(new THREE.PlaneGeometry(0.5, 0.28).rotateY(Math.PI / 2).translate(x - 0.73, Y + 1.45, z))
      meubels.push({ x0: x - 1.0, x1: x + 1.0, z0: z - 0.5, z1: z + 0.5 })
    }
    // Fietsen.
    for (let k = 0; k < 5; k++) {
      const z = F.z0 + 4 + k * 2.3
      const x = F.x0 + 9
      loopbandZwart.push(new THREE.BoxGeometry(1.1, 0.08, 0.5).translate(x, Y + 0.04, z))
      loopband.push(new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(x + 0.25, Y + 0.45, z).rotateZ(0), new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(x - 0.35, Y + 0.55, z))
      loopbandZwart.push(new THREE.BoxGeometry(0.32, 0.08, 0.22).translate(x + 0.25, Y + 0.95, z), new THREE.CylinderGeometry(0.28, 0.28, 0.08, 18).rotateX(Math.PI / 2).translate(x - 0.05, Y + 0.45, z))
      loopband.push(new THREE.BoxGeometry(0.06, 0.06, 0.5).translate(x - 0.38, Y + 1.12, z))
      meubels.push({ x0: x - 0.65, x1: x + 0.65, z0: z - 0.35, z1: z + 0.35 })
    }
    // Halterrekken tegen de noordwand, met halters in clubkleur.
    const halterGeo: THREE.BufferGeometry[] = []
    for (let r = 0; r < 2; r++) {
      const x0 = F.x0 + 14 + r * 7
      loopband.push(new THREE.BoxGeometry(5, 0.06, 0.7).translate(x0 + 2.5, Y + 0.45, F.z0 + 0.6), new THREE.BoxGeometry(5, 0.06, 0.7).translate(x0 + 2.5, Y + 0.95, F.z0 + 0.6))
      for (const lx of [0.1, 2.5, 4.9]) loopband.push(new THREE.BoxGeometry(0.06, 1.0, 0.7).translate(x0 + lx, Y + 0.5, F.z0 + 0.6))
      for (let k = 0; k < 10; k++)
        for (const hy of [0.53, 1.03]) {
          const x = x0 + 0.35 + k * 0.48
          halterGeo.push(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 8).rotateX(Math.PI / 2).translate(x, Y + hy + 0.06, F.z0 + 0.6))
          for (const dz of [-0.17, 0.17]) halterGeo.push(new THREE.CylinderGeometry(0.06 + (k % 5) * 0.01, 0.06 + (k % 5) * 0.01, 0.06, 12).rotateX(Math.PI / 2).translate(x, Y + hy + 0.06, F.z0 + 0.6 + dz))
        }
      meubels.push({ x0, x1: x0 + 5, z0: F.z0, z1: F.z0 + 1.0 })
    }
    // Twee squatrekken en halterbanken in het midden.
    for (let k = 0; k < 2; k++) {
      const x = F.x0 + 18 + k * 8
      const z = (F.z0 + F.z1) / 2 + 1
      for (const [dx, dz] of [
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6],
      ])
        loopband.push(new THREE.BoxGeometry(0.08, 2.4, 0.08).translate(x + dx, Y + 1.2, z + dz))
      loopband.push(new THREE.BoxGeometry(1.3, 0.08, 0.08).translate(x, Y + 2.4, z - 0.6), new THREE.BoxGeometry(1.3, 0.08, 0.08).translate(x, Y + 2.4, z + 0.6))
      halterGeo.push(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 10).rotateZ(Math.PI / 2).translate(x, Y + 1.45, z - 0.55))
      for (const dx of [-0.95, 0.95]) halterGeo.push(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 18).rotateZ(Math.PI / 2).translate(x + dx, Y + 1.45, z - 0.55))
      loopbandZwart.push(new THREE.BoxGeometry(0.35, 0.1, 1.3).translate(x, Y + 0.45, z + 2.6), new THREE.BoxGeometry(0.1, 0.45, 0.1).translate(x, Y + 0.22, z + 2.1), new THREE.BoxGeometry(0.1, 0.45, 0.1).translate(x, Y + 0.22, z + 3.1))
      meubels.push({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 3.4 })
    }
    // Kettlebells en een vloer met clubkleur onder de rekken.
    for (let k = 0; k < 8; k++) halterGeo.push(new THREE.SphereGeometry(0.12 + (k % 3) * 0.02, 12, 10).translate(F.x1 - 3 - k * 0.45, Y + 0.13, F.z0 + 1.6))
    meubels.push({ x0: F.x1 - 6.5, x1: F.x1 - 2.6, z0: F.z0 + 1.3, z1: F.z0 + 1.9 })
    goud.push({ x: F.x1 - 1.6, y: Y + 0.5, z: F.z0 + 1.6 })
    add(new THREE.Mesh(mergeGeometries(loopband), chroom), new THREE.Mesh(mergeGeometries(loopbandZwart), zwart), new THREE.Mesh(mergeGeometries(loopbandScherm), schermGloed), new THREE.Mesh(mergeGeometries(halterGeo), club))
  }

  // ---------- 🎬 cinema ----------
  const C = R.cinema
  const doekB = 14.4
  const doek = { x: (C.x0 + C.x1) / 2, y: Y + 0.6 + (doekB * 9) / 32, z: C.z0 + 0.08, b: doekB, h: (doekB * 9) / 16, ry: 0 }
  {
    const sterren = tekst(1024, 1024, (g) => {
      g.fillStyle = '#05060b'
      g.fillRect(0, 0, 1024, 1024)
      for (let i = 0; i < 900; i++) {
        const a = 0.25 + toeval() * 0.75
        g.fillStyle = `rgba(255,${230 + Math.floor(toeval() * 25)},${200 + Math.floor(toeval() * 55)},${a})`
        const r = toeval() < 0.06 ? 2.2 : 1.1
        g.beginPath()
        g.arc(toeval() * 1024, toeval() * 1024, r, 0, Math.PI * 2)
        g.fill()
      }
    })
    const tapijt = tegelMat('#2a0c12', '#200a0e', 8, (g) => {
      g.fillStyle = 'rgba(244,63,94,.12)'
      for (let i = 0; i < 40; i++) g.fillRect(toeval() * 256, toeval() * 256, 3, 3)
    })
    bouwZaal({
      naam: 'Cinema',
      ...C,
      h: 6.2,
      wand: wandMat('#120608', '#1d0b0f', '#ff9b6b', (g) => {
        // Gecapitonneerde stof, met een rij wandlampjes.
        g.fillStyle = 'rgba(0,0,0,.25)'
        for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 256)
        g.fillStyle = 'rgba(255,190,140,.55)'
        g.beginPath()
        g.ellipse(128, 120, 26, 46, 0, 0, Math.PI * 2)
        g.fill()
      }),
      vloer: tapijt,
      plafond: new THREE.MeshBasicMaterial({ map: sterren }),
      vloerTegel: 2,
      deuren: [{ kant: 'z', ...d3(deurX.cinema) }],
    })
    // Rond het doek: een zwarte kader en rode gordijnen.
    doos(doek.b + 0.6, doek.h + 0.6, 0.1, doek.x, doek.y - Y, C.z0 + 0.04, basis('#000000'))
    const gordijn = tekst(128, 256, (g) => {
      for (let x = 0; x < 128; x += 16) {
        const gr = g.createLinearGradient(x, 0, x + 16, 0)
        gr.addColorStop(0, '#5a0a14')
        gr.addColorStop(0.5, '#a3122a')
        gr.addColorStop(1, '#5a0a14')
        g.fillStyle = gr
        g.fillRect(x, 0, 16, 256)
      }
    })
    for (const sx of [-1, 1]) {
      const gd = new THREE.Mesh(new THREE.PlaneGeometry(3, 6.0), new THREE.MeshBasicMaterial({ map: gordijn }))
      gd.position.set(doek.x + sx * (doek.b / 2 + 1.7), Y + 3.0, C.z0 + 0.12)
      add(gd)
    }
    plas(doek.x, C.z0 + 3, 8, '#7dd3fc', 0.1)
    // Zetels: rode relaxzetels in rijen, met een middenpad.
    const zetel = mergeGeometries([
      new THREE.BoxGeometry(0.75, 0.45, 0.75).translate(0, 0.22, 0),
      new THREE.BoxGeometry(0.75, 0.75, 0.18).translate(0, 0.72, 0.36).rotateX(0),
      new THREE.BoxGeometry(0.12, 0.62, 0.75).translate(-0.4, 0.31, 0),
      new THREE.BoxGeometry(0.12, 0.62, 0.75).translate(0.4, 0.31, 0),
    ])
    const plekken: THREE.Matrix4[] = []
    for (let r = 0; r < 6; r++) {
      const z = C.z0 + 9 + r * 2.4
      for (let k = -5; k <= 5; k++) {
        if (k === 0) continue
        plekken.push(new THREE.Matrix4().makeTranslation(doek.x + k * 0.95, Y, z))
        zetelPlekken.push({ x: doek.x + k * 0.95, z })
      }
      meubels.push({ x0: doek.x - 5.4, x1: doek.x - 0.45, z0: z - 0.45, z1: z + 0.55 }, { x0: doek.x + 0.45, x1: doek.x + 5.4, z0: z - 0.45, z1: z + 0.55 })
      // Lichtjes langs het middenpad.
      doos(0.08, 0.05, 0.08, doek.x - 0.5, 0.03, z + 0.8, basis('#ffb37a'))
      doos(0.08, 0.05, 0.08, doek.x + 0.5, 0.03, z + 0.8, basis('#ffb37a'))
    }
    const zetels = new THREE.InstancedMesh(zetel, new THREE.MeshLambertMaterial({ color: '#8f1023', emissive: '#3a0610', emissiveIntensity: 0.6 }), plekken.length)
    plekken.forEach((m, i) => zetels.setMatrixAt(i, m))
    add(zetels)
    // Popcornkraam bij de ingang.
    doos(2.6, 1.05, 0.8, C.x1 - 3, 0.52, C.z1 - 2.2, new THREE.MeshLambertMaterial({ color: '#b91c1c', emissive: '#450a0a', emissiveIntensity: 0.5 }), true)
    const pop = tekst(512, 128, (g) => {
      g.fillStyle = '#facc15'
      g.font = '900 86px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.shadowColor = '#f59e0b'
      g.shadowBlur = 20
      g.fillText('🍿 POPCORN', 256, 68, 500)
    })
    const pb = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: pop, transparent: true, toneMapped: false }))
    pb.position.set(C.x1 - 3, Y + 2.4, C.z1 - 2.62)
    pb.rotation.y = Math.PI
    add(pb)
    plas(C.x1 - 3, C.z1 - 3.2, 2, '#facc15', 0.25)
    goud.push({ x: C.x1 - 3.9, y: Y + 1.3, z: C.z1 - 2.2 })
  }

  // ---------- 🎮 gaming ----------
  const gameC = document.createElement('canvas')
  gameC.width = 256
  gameC.height = 144
  const gameTex = canvasTex(gameC)
  gameTex.magFilter = THREE.NearestFilter
  const spel = { bal: { x: 128, y: 72, vx: 2.6, vy: 1.7 }, a: 72, b: 72, sa: 0, sb: 0 }
  const tekenSpel = () => {
    const g = gameC.getContext('2d')!
    g.fillStyle = '#05010d'
    g.fillRect(0, 0, 256, 144)
    g.fillStyle = '#1a0f33'
    for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 1, 144)
    g.fillStyle = 'rgba(168,85,247,.5)'
    g.fillRect(127, 0, 2, 144)
    const s = spel
    s.bal.x += s.bal.vx
    s.bal.y += s.bal.vy
    if (s.bal.y < 6 || s.bal.y > 138) s.bal.vy *= -1
    s.a += Math.sign(s.bal.y - s.a) * 1.8
    s.b += Math.sign(s.bal.y - s.b) * 1.6
    if (s.bal.x < 18 && Math.abs(s.bal.y - s.a) < 16) s.bal.vx = Math.abs(s.bal.vx)
    if (s.bal.x > 238 && Math.abs(s.bal.y - s.b) < 16) s.bal.vx = -Math.abs(s.bal.vx)
    if (s.bal.x < 0 || s.bal.x > 256) {
      if (s.bal.x < 0) s.sb++
      else s.sa++
      s.bal = { x: 128, y: 72, vx: (Math.random() < 0.5 ? -1 : 1) * 2.6, vy: (Math.random() - 0.5) * 4 }
    }
    g.fillStyle = thema.primair
    g.fillRect(10, s.a - 12, 6, 24)
    g.fillStyle = '#22d3ee'
    g.fillRect(240, s.b - 12, 6, 24)
    g.fillStyle = '#fde047'
    g.beginPath()
    g.arc(s.bal.x, s.bal.y, 4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = '700 14px "Courier New", monospace'
    g.textAlign = 'center'
    g.fillText(`${s.sa}  KRACHTBAL  ${s.sb}`, 128, 16)
    gameTex.needsUpdate = true
  }
  tekenSpel()
  const neonMats: THREE.MeshBasicMaterial[] = []
  {
    const G = R.gaming
    const raster = tekst(256, 256, (g) => {
      g.fillStyle = '#07040f'
      g.fillRect(0, 0, 256, 256)
      g.strokeStyle = '#7c3aed'
      g.lineWidth = 3
      g.shadowColor = '#a855f7'
      g.shadowBlur = 10
      g.strokeRect(0, 0, 256, 256)
    })
    raster.wrapS = raster.wrapT = THREE.RepeatWrapping
    bouwZaal({
      naam: 'Gaming',
      ...G,
      h: 4.2,
      wand: wandMat('#0a0614', '#140c26', '#22d3ee', (g) => {
        g.fillStyle = 'rgba(168,85,247,.25)'
        for (let y = 20; y < 200; y += 24) g.fillRect(0, y, 256, 1)
      }),
      vloer: new THREE.MeshBasicMaterial({ map: raster }),
      plafond: new THREE.MeshBasicMaterial({ color: '#07040f' }),
      vloerTegel: 2,
      deuren: [{ kant: 'z', ...d3(deurX.gaming) }],
    })
    // Neonbuizen langs de plafondrand die van kleur verschieten (zie update).
    for (const [w, d, x, z] of [
      [G.x1 - G.x0, 0.08, (G.x0 + G.x1) / 2, G.z0 + 0.1],
      [G.x1 - G.x0, 0.08, (G.x0 + G.x1) / 2, G.z1 - 0.1],
      [0.08, G.z1 - G.z0, G.x0 + 0.1, (G.z0 + G.z1) / 2],
      [0.08, G.z1 - G.z0, G.x1 - 0.1, (G.z0 + G.z1) / 2],
    ]) {
      const mat = basis('#a855f7')
      neonMats.push(mat)
      doos(w, 0.08, d, x, 4.0, z, mat)
    }
    const schermMat = new THREE.MeshBasicMaterial({ map: gameTex, toneMapped: false })
    // Groot scherm op de noordwand.
    const groot = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.6), schermMat)
    groot.position.set((G.x0 + G.x1) / 2, Y + 2.4, G.z0 + 0.06)
    add(groot)
    plas((G.x0 + G.x1) / 2, G.z0 + 2.5, 6, '#a855f7', 0.25)
    // Gamebureaus: drie schermen, een stoel in clubkleur, en een gloed onder het bureau.
    const bureau: THREE.BufferGeometry[] = []
    const stoel: THREE.BufferGeometry[] = []
    const schermen: THREE.BufferGeometry[] = []
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 5; k++) {
        const x = G.x0 + 4 + k * 5
        const z = G.z0 + 9 + r * 5.5
        bureau.push(new THREE.BoxGeometry(2.2, 0.06, 0.9).translate(x, Y + 0.76, z), new THREE.BoxGeometry(0.06, 0.74, 0.8).translate(x - 1.05, Y + 0.37, z), new THREE.BoxGeometry(0.06, 0.74, 0.8).translate(x + 1.05, Y + 0.37, z))
        for (const [dx, ry] of [
          [-0.72, 0.35],
          [0, 0],
          [0.72, -0.35],
        ])
          schermen.push(new THREE.PlaneGeometry(0.68, 0.4).rotateY(ry).translate(x + dx, Y + 1.12, z - 0.28 + Math.abs(dx) * 0.12))
        stoel.push(new THREE.BoxGeometry(0.6, 0.12, 0.6).translate(x, Y + 0.5, z + 0.8), new THREE.BoxGeometry(0.6, 0.85, 0.12).translate(x, Y + 0.95, z + 1.1), new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8).translate(x, Y + 0.22, z + 0.8))
        meubels.push({ x0: x - 1.15, x1: x + 1.15, z0: z - 0.5, z1: z + 1.2 })
        plas(x, z, 1.6, r ? '#22d3ee' : '#ec4899', 0.3)
      }
    add(new THREE.Mesh(mergeGeometries(bureau), new THREE.MeshLambertMaterial({ color: '#111827' })), new THREE.Mesh(mergeGeometries(stoel), new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.25 })), new THREE.Mesh(mergeGeometries(schermen), schermMat))
    // Arcadekasten tegen de oostwand.
    for (let k = 0; k < 4; k++) {
      const z = G.z0 + 3 + k * 2.2
      const x = G.x1 - 0.6
      doos(0.9, 1.9, 0.8, x, 0.95, z, new THREE.MeshLambertMaterial({ color: k % 2 ? '#1e1b4b' : '#3b0764' }), true)
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), schermMat)
      sc.position.set(x - 0.46, Y + 1.45, z)
      sc.rotation.y = -Math.PI / 2
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.2), basis(k % 2 ? '#22d3ee' : '#f472b6'))
      top.position.set(x - 0.46, Y + 1.8, z)
      top.rotation.y = -Math.PI / 2
      add(sc, top)
      plas(x - 1.2, z, 1.2, k % 2 ? '#22d3ee' : '#f472b6', 0.3)
    }
    goud.push({ x: (G.x0 + G.x1) / 2, y: Y + 0.6, z: G.z0 + 6.6 })
    // Zitzakken voor het grote scherm.
    for (let k = 0; k < 6; k++) {
      const x = (G.x0 + G.x1) / 2 - 6 + k * 2.4
      const zz = G.z0 + 4.4 + (k % 2) * 0.5
      const zak = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10).scale(1, 0.6, 1), new THREE.MeshLambertMaterial({ color: k % 2 ? secundair : primair }))
      zak.position.set(x, Y + 0.3, zz)
      add(zak)
      meubels.push({ x0: x - 0.5, x1: x + 0.5, z0: zz - 0.5, z1: zz + 0.5 })
    }
  }

  // ---------- 🏊 zwembad ----------
  const water: { tex: THREE.Texture; tex2: THREE.Texture; plafondTex: THREE.Texture } = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    g.clearRect(0, 0, 256, 256)
    g.strokeStyle = 'rgba(255,255,255,.55)'
    g.lineWidth = 2
    // Schitteringen: een net van onregelmatige lussen (herhaalbaar over de randen).
    for (let i = 0; i < 46; i++) {
      const x = toeval() * 256
      const y = toeval() * 256
      const r = 10 + toeval() * 22
      for (const [dx, dy] of [
        [0, 0],
        [256, 0],
        [-256, 0],
        [0, 256],
        [0, -256],
      ]) {
        g.beginPath()
        g.ellipse(x + dx, y + dy, r, r * (0.6 + toeval() * 0.5), toeval() * 3, 0, Math.PI * 2)
        g.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    const tex2 = tex.clone()
    tex2.needsUpdate = true
    const plafondTex = tex.clone()
    plafondTex.needsUpdate = true
    return { tex, tex2, plafondTex }
  })()
  const waterMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.42, depthWrite: false })
  const waterDoel = new THREE.Color('#38bdf8')
  const bad = { x0: R.zwembad.x0 + 14, x1: R.zwembad.x0 + 39, z0: R.zwembad.z0 + 9, z1: R.zwembad.z0 + 21.5 }
  {
    const P = R.zwembad
    const tegelVloer = tegelMat('#9fb4c0', '#748a97', 8)
    bouwZaal({
      naam: 'Zwembad',
      ...P,
      h: 6.2,
      wand: wandMat('#0b3b4f', '#0e4f66', '#a5f3fc', (g) => {
        g.fillStyle = 'rgba(255,255,255,.06)'
        for (let y = 0; y < 256; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 256; x += 16) g.fillRect(x + 1, y + 1, 14, 14)
      }),
      vloer: tegelVloer,
      plafond: new THREE.MeshBasicMaterial({ color: '#0a2a38' }),
      vloerTegel: 2,
      deuren: [{ kant: 'n', ...d3(deurX.zwembad) }],
      gat: bad,
    })
    // Het bad: een put met blauwe tegels, de bodem met het clublogo, en het wateroppervlak.
    const diep = 1.8
    const badTegel = tegelMat('#0ea5c6', '#0b7f99', 8)
    const bw = bad.x1 - bad.x0
    const bd = bad.z1 - bad.z0
    const bcx = (bad.x0 + bad.x1) / 2
    const bcz = (bad.z0 + bad.z1) / 2
    // De vloer van de hal heeft een gat waar het bad zit: een witte rand eromheen bedekt de naad.
    doos(bw + 1.2, 0.06, 0.6, bcx, 0.03, bad.z0 - 0.3, new THREE.MeshLambertMaterial({ color: '#f1f5f9' }))
    doos(bw + 1.2, 0.06, 0.6, bcx, 0.03, bad.z1 + 0.3, new THREE.MeshLambertMaterial({ color: '#f1f5f9' }))
    doos(0.6, 0.06, bd, bad.x0 - 0.3, 0.03, bcz, new THREE.MeshLambertMaterial({ color: '#f1f5f9' }))
    doos(0.6, 0.06, bd, bad.x1 + 0.3, 0.03, bcz, new THREE.MeshLambertMaterial({ color: '#f1f5f9' }))
    const putUv = (geo: THREE.PlaneGeometry, w: number, h: number) => {
      const uv = geo.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 2), uv.getY(i) * (h / 2))
      return geo
    }
    for (const [w, x, z, ry] of [
      [bw, bcx, bad.z0, 0],
      [bw, bcx, bad.z1, Math.PI],
      [bd, bad.x0, bcz, Math.PI / 2],
      [bd, bad.x1, bcz, -Math.PI / 2],
    ]) {
      const m = new THREE.Mesh(putUv(new THREE.PlaneGeometry(w, diep), w, diep), badTegel)
      m.position.set(x, Y - diep / 2, z)
      m.rotation.y = ry
      add(m)
    }
    const bodemC = document.createElement('canvas')
    bodemC.width = 1024
    bodemC.height = 512
    const bodemTex = canvasTex(bodemC)
    const tekenBodem = (logo: HTMLImageElement | null) => {
      const g = bodemC.getContext('2d')!
      g.fillStyle = '#0ea5c6'
      g.fillRect(0, 0, 1024, 512)
      g.fillStyle = 'rgba(255,255,255,.15)'
      for (let y = 0; y < 512; y += 20) g.fillRect(0, y, 1024, 1)
      for (let x = 0; x < 1024; x += 20) g.fillRect(x, 0, 1, 512)
      // Baanlijnen.
      g.fillStyle = '#0b3b6f'
      for (let k = 0; k < 5; k++) g.fillRect(40, 51 + k * 102 - 6, 944, 12)
      g.globalAlpha = 0.8
      rondLogo(g, logo, thema, 512, 256, 120)
      g.globalAlpha = 1
      bodemTex.needsUpdate = true
    }
    tekenBodem(null)
    void opt.logo.then(tekenBodem)
    const bodem = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bodemTex }))
    bodem.position.set(bcx, Y - diep, bcz)
    add(bodem)
    // Lichtschitteringen op de bodem en het water zelf (twee lagen die tegen elkaar in schuiven).
    water.tex.repeat.set(bw / 4, bd / 4)
    water.tex2.repeat.set(bw / 5, bd / 5)
    const schitter = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: water.tex, color: '#e0faff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }))
    schitter.position.set(bcx, Y - diep + 0.02, bcz)
    const opp = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2), waterMat)
    opp.position.set(bcx, Y - 0.15, bcz)
    const golf = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: water.tex2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
    golf.position.set(bcx, Y - 0.14, bcz)
    add(schitter, opp, golf)
    // Onderwaterlampen langs de wanden, en een blauwe gloed op het plafond met schitteringen.
    for (let x = bad.x0 + 2; x < bad.x1; x += 3) for (const z of [bad.z0 + 0.05, bad.z1 - 0.05]) doos(0.3, 0.12, 0.02, x, -0.6, z, basis('#e0f7ff'))
    water.plafondTex.repeat.set((P.x1 - P.x0) / 6, (P.z1 - P.z0) / 6)
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: water.plafondTex, color: '#7dd3fc', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }))
    pl.position.set((P.x0 + P.x1) / 2, Y + 6.18, (P.z0 + P.z1) / 2)
    add(pl)
    plas(bcx, bcz, 16, '#22d3ee', 0.12, 6.1)
    // Banen: drijvende lijnen in de clubkleuren.
    for (let k = 1; k < 5; k++) {
      const z = bad.z0 + (k * bd) / 5
      const lijn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, bw, 8).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: k % 2 ? primair : secundair, emissive: k % 2 ? primair : secundair, emissiveIntensity: 0.3 }))
      lijn.position.set(bcx, Y - 0.12, z)
      add(lijn)
    }
    // Startblokken en ladders.
    for (let k = 0; k < 5; k++) {
      const z = bad.z0 + ((k + 0.5) * bd) / 5
      doos(0.6, 0.7, 0.55, bad.x0 - 0.45, 0.35, z, new THREE.MeshLambertMaterial({ color: '#e5e7eb' }))
      const nr = tekst(64, 64, (g) => {
        g.fillStyle = thema.primair
        g.fillRect(0, 0, 64, 64)
        g.fillStyle = thema.tekstOpPrimair
        g.font = '900 44px Inter, system-ui, sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(String(k + 1), 32, 34)
      })
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: nr, toneMapped: false }))
      n.position.set(bad.x0 - 0.74, Y + 0.45, z)
      n.rotation.y = -Math.PI / 2
      add(n)
    }
    goud.push({ x: bad.x0 - 0.45, y: Y + 1.0, z: bad.z0 + (2.5 * bd) / 5 })
    // Het bad en de blokken: daar loop je niet door.
    meubels.push({ x0: bad.x0 - 0.75, x1: bad.x1, z0: bad.z0, z1: bad.z1 })
    // Ligbedden langs de zuidwand, met parasols en planten.
    const bed = mergeGeometries([new THREE.BoxGeometry(0.75, 0.12, 1.9).translate(0, 0.35, 0), new THREE.BoxGeometry(0.75, 0.12, 0.7).rotateX(-0.6).translate(0, 0.6, -0.85)])
    const bedden: THREE.Matrix4[] = []
    for (let k = 0; k < 10; k++) {
      const x = P.x0 + 6 + k * 2.2
      const z = P.z1 - 2.2
      bedden.push(new THREE.Matrix4().makeTranslation(x, Y, z))
      meubels.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 1.3, z1: z + 1.0 })
    }
    const beddenMesh = new THREE.InstancedMesh(bed, new THREE.MeshLambertMaterial({ color: '#f8fafc' }), bedden.length)
    bedden.forEach((m, i) => beddenMesh.setMatrixAt(i, m))
    add(beddenMesh)
    for (const x of [P.x0 + 3, P.x1 - 3]) {
      for (const z of [P.z0 + 3, P.z1 - 3]) {
        doos(0.8, 0.7, 0.8, x, 0.35, z, new THREE.MeshLambertMaterial({ color: '#334155' }), true)
        const blad = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1).scale(1, 1.5, 1), new THREE.MeshLambertMaterial({ color: '#15803d', emissive: '#052e16', emissiveIntensity: 0.6 }))
        blad.position.set(x, Y + 1.6, z)
        add(blad)
      }
    }
    // Een grote clubnaam op de achterwand, blauw opgelicht.
    const naam = tekst(1024, 160, (g) => {
      g.fillStyle = '#e0f7ff'
      g.shadowColor = '#22d3ee'
      g.shadowBlur = 30
      g.font = '900 104px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(thema.naam.toUpperCase(), 512, 84, 1000)
    })
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.5), new THREE.MeshBasicMaterial({ map: naam, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }))
    nm.position.set((P.x0 + P.x1) / 2, Y + 4.4, P.z1 - 0.05)
    nm.rotation.y = Math.PI
    add(nm)
  }

  // ---------- 🧖 sauna & wellness ----------
  const kaarsjes: { sp: THREE.Sprite; f: number }[] = []
  const bubbels: { m: THREE.InstancedMesh; c: THREE.Vector3; n: number } = { m: null as unknown as THREE.InstancedMesh, c: new THREE.Vector3(), n: 0 }
  const saunaGloed: THREE.MeshBasicMaterial[] = []
  {
    const S = R.sauna
    const houtTex = tekst(256, 256, (g) => {
      for (let y = 0; y < 256; y += 16) {
        const v = 150 + Math.floor(toeval() * 30)
        g.fillStyle = `rgb(${v},${Math.floor(v * 0.66)},${Math.floor(v * 0.38)})`
        g.fillRect(0, y, 256, 16)
        g.fillStyle = 'rgba(60,30,10,.4)'
        g.fillRect(0, y, 256, 1)
      }
    })
    houtTex.wrapS = houtTex.wrapT = THREE.RepeatWrapping
    const houtMat = new THREE.MeshLambertMaterial({ map: houtTex, emissive: '#3b1d08', emissiveIntensity: 0.5 })
    bouwZaal({
      naam: 'Sauna',
      ...S,
      h: 4.2,
      wand: wandMat('#2a1608', '#4a2a12', '#ffcf8a', (g) => {
        g.fillStyle = 'rgba(0,0,0,.18)'
        for (let x = 0; x < 256; x += 20) g.fillRect(x, 0, 2, 256)
      }),
      vloer: tegelMat('#3b3530', '#2a2622', 3),
      plafond: new THREE.MeshBasicMaterial({ color: '#1c120a' }),
      vloerTegel: 1.2,
      deuren: [{ kant: 'n', ...d3(deurX.sauna) }],
    })
    // Twee saunacabines tegen de oostwand: houten wanden, een glazen voorkant, banken in trappen
    // en een warme gloed binnen.
    for (let k = 0; k < 2; k++) {
      const cz = S.z0 + 5 + k * 7
      const cx = S.x1 - 2.6
      const w = 4.6
      const d = 5
      doos(0.12, 2.5, d, cx - w / 2 + 0.06, 1.25, cz, houtMat)
      doos(w, 0.12, d, cx, 2.56, cz, houtMat)
      doos(w, 2.5, 0.12, cx, 1.25, cz - d / 2, houtMat)
      doos(w, 2.5, 0.12, cx, 1.25, cz + d / 2, houtMat)
      const ruit = new THREE.Mesh(new THREE.PlaneGeometry(d - 1.2, 2.2), new THREE.MeshStandardMaterial({ color: '#ffb46b', transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }))
      ruit.position.set(cx - w / 2 + 0.07, Y + 1.25, cz)
      ruit.rotation.y = Math.PI / 2
      add(ruit)
      for (let t = 0; t < 2; t++) doos(1.0, 0.45 + t * 0.45, d - 0.4, cx + 0.9 - t * 1.0, (0.45 + t * 0.45) / 2, cz, houtMat)
      const gloed = basis('#ff9a3c')
      saunaGloed.push(gloed)
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 0.06), gloed)
      g.position.set(cx, Y + 0.5, cz - d / 2 + 0.08)
      add(g)
      plas(cx - 0.3, cz, 2.6, '#ff8a2a', 0.45, 0.5)
      plas(cx - w / 2 - 1.2, cz, 2, '#ff8a2a', 0.25)
      // De kachel met stenen.
      doos(0.6, 0.6, 0.6, cx - 1.2, 0.3, cz - d / 2 + 0.6, new THREE.MeshLambertMaterial({ color: '#374151' }))
      for (let i = 0; i < 9; i++) {
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11 + toeval() * 0.05, 0), new THREE.MeshLambertMaterial({ color: '#57534e', emissive: '#7c2d12', emissiveIntensity: 0.4 }))
        st.position.set(cx - 1.4 + toeval() * 0.4, Y + 0.68 + toeval() * 0.1, cz - d / 2 + 0.4 + toeval() * 0.4)
        add(st)
      }
      const bord = tekst(512, 128, (gg) => {
        gg.fillStyle = '#2a1608'
        gg.fillRect(0, 0, 512, 128)
        gg.fillStyle = '#ffd7a3'
        gg.font = '800 60px Inter, system-ui, sans-serif'
        gg.textAlign = 'center'
        gg.textBaseline = 'middle'
        gg.fillText(k ? 'SAUNA · 90°' : 'STOOMBAD · 45°', 256, 66, 500)
      })
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: bord, toneMapped: false }))
      b.position.set(cx - w / 2 - 0.01, Y + 2.85, cz)
      b.rotation.y = -Math.PI / 2
      add(b)
      meubels.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 })
    }
    // Het bubbelbad.
    const jx = S.x0 + 7
    const jz = S.z0 + 8
    const kuip = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.7, 32, 1, true), new THREE.MeshLambertMaterial({ color: '#e7e5e4', side: THREE.DoubleSide }))
    kuip.position.set(jx, Y + 0.35, jz)
    const rand = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.12, 8, 40).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f5f5f4' }))
    rand.position.set(jx, Y + 0.7, jz)
    const jw = new THREE.Mesh(new THREE.CircleGeometry(1.98, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.75 }))
    jw.position.set(jx, Y + 0.6, jz)
    add(kuip, rand, jw)
    plas(jx, jz, 3.4, '#22d3ee', 0.3, 0.62)
    meubels.push({ x0: jx - 2.2, x1: jx + 2.2, z0: jz - 2.2, z1: jz + 2.2 })
    goud.push({ x: jx + 2.9, y: Y + 0.5, z: jz })
    const n = licht ? 24 : 60
    const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }), n)
    add(bm)
    bubbels.m = bm
    bubbels.c.set(jx, Y + 0.6, jz)
    bubbels.n = n
    // Ligbedden en kaarsjes langs de westwand.
    const bed = mergeGeometries([new THREE.BoxGeometry(0.8, 0.14, 1.9).translate(0, 0.38, 0), new THREE.BoxGeometry(0.8, 0.14, 0.7).rotateX(-0.7).translate(0, 0.66, -0.85)])
    const bedden: THREE.Matrix4[] = []
    for (let k = 0; k < 6; k++) {
      const z = S.z0 + 14 + k * 1.6
      const x = S.x0 + 2.2
      bedden.push(new THREE.Matrix4().compose(new THREE.Vector3(x, Y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)))
      meubels.push({ x0: x - 1.2, x1: x + 1.0, z0: z - 0.5, z1: z + 0.5 })
    }
    const bm2 = new THREE.InstancedMesh(bed, new THREE.MeshLambertMaterial({ color: '#d6c3a5' }), bedden.length)
    bedden.forEach((m, i) => bm2.setMatrixAt(i, m))
    add(bm2)
    const vlamTex = tekst(32, 64, (g) => {
      const gr = g.createRadialGradient(16, 40, 0, 16, 40, 24)
      gr.addColorStop(0, 'rgba(255,240,200,1)')
      gr.addColorStop(0.4, 'rgba(255,170,60,.8)')
      gr.addColorStop(1, 'rgba(255,120,20,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 32, 64)
    })
    for (let k = 0; k < (licht ? 8 : 18); k++) {
      const x = S.x0 + 0.5 + (k % 2) * 0.25
      const z = S.z0 + 2 + k * 1.2
      doos(0.08, 0.14, 0.08, x, 0.07, z, new THREE.MeshLambertMaterial({ color: '#f5f5dc' }))
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: vlamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      sp.scale.set(0.12, 0.24, 1)
      sp.position.set(x, Y + 0.24, z)
      add(sp)
      kaarsjes.push({ sp, f: toeval() * 10 })
      plas(x, z, 0.8, '#ffb347', 0.35)
    }
  }

  // ---------- 🎡 speelhal: voor de jeugd ----------
  // Een ballenbad, trampolines (je veert mee!), een klimmuur, een glijbaan, een dansvloer die
  // oplicht waar je staat, een grijpautomaat, en Krachtje (de mascotte). Op de oostwand de
  // graffitimuur van de kelder, op de westwand een tactiekbord (beide in kelderspel.ts).
  const S = R.speelhal
  const trampolines: { x: number; z: number; r: number }[] = []
  const dansTegels: { mat: THREE.MeshBasicMaterial; x: number; z: number; f: number }[] = []
  {
    const kleurVloer = tekst(256, 256, (g) => {
      const kleuren = ['#1e3a8a', '#7c2d12', '#14532d', '#581c87']
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.fillStyle = kleuren[(x + y) % 4]
          g.fillRect(x * 64, y * 64, 64, 64)
          g.fillStyle = 'rgba(255,255,255,.06)'
          g.fillRect(x * 64 + 4, y * 64 + 4, 56, 56)
        }
    })
    kleurVloer.wrapS = kleurVloer.wrapT = THREE.RepeatWrapping
    bouwZaal({
      naam: 'Speelhal',
      ...S,
      h: 6,
      wand: wandMat('#0d1b2a', '#173a5c', '#fde047', (g) => {
        // Vrolijke stippen op de muur.
        const kl = ['#f472b6', '#22d3ee', '#facc15', '#4ade80']
        for (let i = 0; i < 14; i++) {
          g.fillStyle = kl[i % 4]
          g.globalAlpha = 0.18
          g.beginPath()
          g.arc(toeval() * 256, 30 + toeval() * 170, 6 + toeval() * 14, 0, Math.PI * 2)
          g.fill()
        }
        g.globalAlpha = 1
      }),
      vloer: new THREE.MeshBasicMaterial({ map: kleurVloer }),
      plafond: new THREE.MeshBasicMaterial({ color: '#0b1626' }),
      vloerTegel: 4,
      deuren: [{ kant: 'n', ...d3(deurX.speelhal) }],
    })
    // Lichtstroken in het plafond en lichtplassen.
    for (let z = S.z0 + 4; z < S.z1; z += 8) {
      doos(S.x1 - S.x0 - 3, 0.04, 0.2, (S.x0 + S.x1) / 2, 5.96, z, basis('#fff7d6'))
      for (let x = S.x0 + 4; x < S.x1; x += 8) plas(x, z, 4, '#fff1c4', 0.16)
    }
    // Een neonbord boven de deur, binnen.
    const neon = tekst(1024, 200, (g) => {
      g.shadowColor = '#22c55e'
      g.shadowBlur = 36
      g.fillStyle = '#ffffff'
      g.font = '900 130px Inter, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('🎡 SPEELHAL', 512, 104, 1000)
    })
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.37), new THREE.MeshBasicMaterial({ map: neon, transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }))
    nb.position.set(deurX.speelhal, Y + 4.2, S.z0 + 0.05)
    add(nb)

    // Het ballenbad: een lage, zachte rand in clubkleur, gevuld met honderden ballen.
    const BB = { x0: S.x0 + 3, x1: S.x0 + 11, z0: S.z0 + 14, z1: S.z0 + 22 }
    const zacht = new THREE.MeshLambertMaterial({ color: primair, emissive: primair, emissiveIntensity: 0.15 })
    doos(BB.x1 - BB.x0, 0.7, 0.4, (BB.x0 + BB.x1) / 2, 0.35, BB.z0, zacht)
    doos(BB.x1 - BB.x0, 0.7, 0.4, (BB.x0 + BB.x1) / 2, 0.35, BB.z1, zacht)
    doos(0.4, 0.7, BB.z1 - BB.z0, BB.x0, 0.35, (BB.z0 + BB.z1) / 2, zacht)
    doos(0.4, 0.7, BB.z1 - BB.z0, BB.x1, 0.35, (BB.z0 + BB.z1) / 2, zacht)
    const nBallen = licht ? 260 : 620
    const ballen = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshLambertMaterial(), nBallen)
    const balKleuren = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ec4899', '#f97316'].map((c) => new THREE.Color(c))
    for (let i = 0; i < nBallen; i++) {
      const m = new THREE.Matrix4().makeTranslation(BB.x0 + 0.35 + toeval() * (BB.x1 - BB.x0 - 0.7), Y + 0.12 + toeval() * 0.42, BB.z0 + 0.35 + toeval() * (BB.z1 - BB.z0 - 0.7))
      ballen.setMatrixAt(i, m)
      ballen.setColorAt(i, balKleuren[i % balKleuren.length])
    }
    add(ballen)
    meubels.push({ x0: BB.x0 - 0.2, x1: BB.x1 + 0.2, z0: BB.z0 - 0.2, z1: BB.z1 + 0.2 })
    goud.push({ x: (BB.x0 + BB.x1) / 2, y: Y + 0.95, z: BB.z0 - 0.75 })

    // Trampolines: daar mag je op lopen, en dan veer je.
    for (const [x, z] of [
      [S.x0 + 16, S.z0 + 17],
      [S.x0 + 20, S.z0 + 17],
      [S.x0 + 18, S.z0 + 21],
    ]) {
      const r = 1.5
      const mat = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#111827' }))
      mat.position.set(x, Y + 0.45, z)
      const rand = new THREE.Mesh(new THREE.TorusGeometry(r + 0.15, 0.14, 8, 36).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: secundair, emissive: secundair, emissiveIntensity: 0.2 }))
      rand.position.set(x, Y + 0.45, z)
      add(mat, rand)
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        doos(0.06, 0.45, 0.06, x + Math.cos(a) * (r + 0.15), 0.22, z + Math.sin(a) * (r + 0.15), new THREE.MeshLambertMaterial({ color: '#9ca3af' }))
      }
      trampolines.push({ x, z, r })
      plas(x, z, 2.2, '#22d3ee', 0.18)
    }

    // Klimmuur op de zuidwand: gekleurde grepen.
    const grepen: THREE.Matrix4[] = []
    const greepKleur: THREE.Color[] = []
    for (let i = 0; i < 70; i++) {
      grepen.push(new THREE.Matrix4().compose(new THREE.Vector3(S.x0 + 3 + toeval() * 11, Y + 0.4 + toeval() * 5, S.z1 - 0.08), new THREE.Quaternion().setFromEuler(new THREE.Euler(toeval() * 3, toeval() * 3, 0)), new THREE.Vector3(1, 1, 1)))
      greepKleur.push(balKleuren[Math.floor(toeval() * balKleuren.length)])
    }
    const greep = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.11, 0), new THREE.MeshLambertMaterial(), grepen.length)
    grepen.forEach((m, i) => {
      greep.setMatrixAt(i, m)
      greep.setColorAt(i, greepKleur[i])
    })
    add(greep)
    doos(11.5, 5.6, 0.1, S.x0 + 8.5, 2.8, S.z1 - 0.06, new THREE.MeshLambertMaterial({ color: '#e5e7eb' }))
    doos(11, 0.3, 2, S.x0 + 8.5, 0.15, S.z1 - 1.2, new THREE.MeshLambertMaterial({ color: '#1d4ed8' }), true)

    // Glijbaan: een toren met een trap en een gele glijbaan naar beneden.
    const tx = S.x0 + 22
    const tz = S.z1 - 4
    doos(2, 2.6, 2, tx, 1.3, tz, new THREE.MeshLambertMaterial({ color: '#ef4444' }), true)
    doos(2.2, 0.15, 2.2, tx, 2.65, tz, new THREE.MeshLambertMaterial({ color: '#facc15' }))
    const baan = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 5), new THREE.MeshLambertMaterial({ color: '#facc15', emissive: '#a16207', emissiveIntensity: 0.3 }))
    baan.position.set(tx + 3.0, Y + 1.35, tz)
    baan.rotation.z = 0
    baan.rotation.y = Math.PI / 2
    baan.rotateX(-0.5)
    add(baan)
    meubels.push({ x0: tx + 1, x1: tx + 5.4, z0: tz - 0.6, z1: tz + 0.6 })

    // Dansvloer: 4 × 4 tegels die oplichten (en feller waar je staat).
    const D = { x0: S.x0 + 24, z0: S.z0 + 4 }
    for (let i = 0; i < 4; i++)
      for (let k = 0; k < 4; k++) {
        const mat = new THREE.MeshBasicMaterial({ color: '#000000', toneMapped: false })
        const t = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2), mat)
        const x = D.x0 + i + 0.5
        const z = D.z0 + k + 0.5
        t.position.set(x, Y + 0.02, z)
        add(t)
        dansTegels.push({ mat, x, z, f: toeval() * 6 })
      }

    // Grijpautomaat met knuffelballen.
    const gx = S.x0 + 14
    const gz = S.z0 + 4
    doos(1.3, 1.0, 1.3, gx, 0.5, gz, new THREE.MeshLambertMaterial({ color: '#be185d' }), true)
    doos(1.3, 0.2, 1.3, gx, 2.3, gz, new THREE.MeshLambertMaterial({ color: '#be185d' }))
    const kast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: '#dbeafe', transparent: true, opacity: 0.2, depthWrite: false }))
    kast.position.set(gx, Y + 1.6, gz)
    add(kast)
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshLambertMaterial({ color: balKleuren[i % balKleuren.length] }))
      b.position.set(gx - 0.4 + toeval() * 0.8, Y + 1.12 + toeval() * 0.15, gz - 0.4 + toeval() * 0.8)
      add(b)
    }
    doos(0.04, 0.5, 0.04, gx, 1.95, gz, new THREE.MeshLambertMaterial({ color: '#9ca3af' }))
    plas(gx, gz + 1.2, 1.4, '#f472b6', 0.3)

    // Krachtje, de mascotte: een grote gele krachtbal met een lach en een clubsjaal.
    const kx = S.x0 + 26
    const kz = S.z0 + 12
    const lijf = new THREE.Mesh(new THREE.SphereGeometry(1.1, 28, 20), new THREE.MeshLambertMaterial({ color: '#facc15', emissive: '#854d0e', emissiveIntensity: 0.25 }))
    lijf.position.set(kx, Y + 1.25, kz)
    const gezicht = tekst(256, 256, (g) => {
      g.fillStyle = '#111827'
      g.beginPath()
      g.arc(90, 100, 16, 0, Math.PI * 2)
      g.arc(166, 100, 16, 0, Math.PI * 2)
      g.fill()
      g.lineWidth = 12
      g.strokeStyle = '#111827'
      g.beginPath()
      g.arc(128, 130, 54, 0.15 * Math.PI, 0.85 * Math.PI)
      g.stroke()
    })
    const gz2 = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ map: gezicht, transparent: true }))
    gz2.position.set(kx, Y + 1.35, kz + 1.06)
    const sjaal = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 10, 28).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: primair }))
    sjaal.position.set(kx, Y + 0.55, kz)
    add(lijf, gz2, sjaal)
    for (const sx of [-1, 1]) doos(0.25, 0.5, 0.35, kx + sx * 0.45, 0.25, kz + 0.3, new THREE.MeshLambertMaterial({ color: '#f8fafc' }))
    meubels.push({ x0: kx - 1.2, x1: kx + 1.2, z0: kz - 1.2, z1: kz + 1.2 })
    // Zitzakken.
    for (let k = 0; k < 5; k++) {
      const x = S.x0 + 4 + k * 2.2
      const z = S.z0 + 27
      const zak = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10).scale(1, 0.55, 1), new THREE.MeshLambertMaterial({ color: balKleuren[k % balKleuren.length] }))
      zak.position.set(x, Y + 0.3, z)
      add(zak)
      meubels.push({ x0: x - 0.55, x1: x + 0.55, z0: z - 0.55, z1: z + 0.55 })
    }
  }

  // ---------- de boulevard aankleden ----------
  {
    const Bv = R.boulevard
    // Drank- en snoepautomaten met een verlichte voorkant.
    for (const [x, kleur, label] of [
      [ox + 8.6, '#0ea5e9', '🥤 DRANK'],
      [ox + 10.2, '#f97316', '🍫 SNOEP'],
      [ox - 9.5, '#22c55e', '💧 WATER'],
    ] as const) {
      doos(1.3, 2.1, 0.8, x, 1.05, B0 + 0.45, new THREE.MeshLambertMaterial({ color: '#1f2937' }), true)
      const voor = tekst(128, 256, (g) => {
        g.fillStyle = kleur
        g.fillRect(0, 0, 128, 256)
        g.fillStyle = 'rgba(255,255,255,.85)'
        for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) g.fillRect(12 + k * 38, 40 + r * 36, 28, 26)
        g.fillStyle = '#ffffff'
        g.font = '900 20px Inter, system-ui, sans-serif'
        g.textAlign = 'center'
        g.fillText(label, 64, 24)
      })
      const vlak = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshBasicMaterial({ map: voor, toneMapped: false }))
      vlak.position.set(x, Y + 1.1, B0 + 0.86)
      add(vlak)
      plas(x, B0 + 1.4, 1.2, kleur, 0.3)
    }
    // Bankjes en planten langs de boulevard.
    for (let x = Bv.x0 + 6; x < Bv.x1 - 4; x += 12) {
      if ([deurX.fitness, deurX.cinema, deurX.gaming, deurX.zwembad, deurX.sauna, deurX.speelhal].some((d) => Math.abs(d - x) < 3.5) || Math.abs(x - ox) < 6) continue
      doos(2.2, 0.45, 0.6, x, 0.22, B1 - 0.6, new THREE.MeshLambertMaterial({ color: '#7c5a3a' }), true)
      doos(0.7, 0.6, 0.7, x + 2.2, 0.3, B1 - 0.6, new THREE.MeshLambertMaterial({ color: '#334155' }), true)
      const blad = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1).scale(1, 1.4, 1), new THREE.MeshLambertMaterial({ color: '#16a34a', emissive: '#052e16', emissiveIntensity: 0.6 }))
      blad.position.set(x + 2.2, Y + 1.25, B1 - 0.6)
      add(blad)
    }
    // Posters van de club tussen de deuren.
    const posters = ['SAMEN STERK', 'ONZE CLUB', 'KRACHTBAL!', 'ALLEZ ALLEZ']
    let pi = 0
    for (let x = Bv.x0 + 10; x < Bv.x1 - 6; x += 16) {
      if ([deurX.fitness, deurX.cinema, deurX.gaming].some((d) => Math.abs(d - x) < 4) || Math.abs(x - ox) < 8) continue
      const tx2 = posters[pi++ % posters.length]
      const pt = tekst(256, 360, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, 360)
        gr.addColorStop(0, thema.primair)
        gr.addColorStop(1, '#0b1220')
        g.fillStyle = gr
        g.fillRect(0, 0, 256, 360)
        g.strokeStyle = thema.secundair
        g.lineWidth = 10
        g.strokeRect(5, 5, 246, 350)
        g.fillStyle = '#ffffff'
        g.font = '900 40px Inter, system-ui, sans-serif'
        g.textAlign = 'center'
        tx2.split(' ').forEach((w, i) => g.fillText(w, 128, 160 + i * 48, 230))
        g.font = '700 18px Inter, system-ui, sans-serif'
        g.fillText(thema.naam.toUpperCase(), 128, 330, 230)
      })
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.97), new THREE.MeshBasicMaterial({ map: pt, toneMapped: false }))
      p.position.set(x, Y + 2.1, B0 + 0.03)
      add(p)
    }
  }

  // ---------- alle wandvlakken en lichtplassen ----------
  for (const [mat, w] of wanden) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(w.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(w.uv, 2))
    g.computeVertexNormals()
    add(new THREE.Mesh(g, mat))
  }
  for (const p of plassen.values()) {
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), p.mat, p.m.length)
    p.m.forEach((m, i) => im.setMatrixAt(i, m))
    add(im)
  }

  const m4 = new THREE.Matrix4()
  const kleur = new THREE.Color()
  let laatsteSpel = 0
  return {
    groep,
    mag: (x, z) => opVloer(vloeren, meubels, x, z),
    ruimte(x, z) {
      const r = zalen.find((zz) => zz.naam !== 'Boulevard' && zz.naam !== 'Lobby' && x > zz.x0 && x < zz.x1 && z > zz.z0 && z < zz.z1)
      return r ? r.naam : null
    },
    doek,
    plekken: {
      bad: { ...bad, y: Y - 0.15 },
      popcorn: { x: R.cinema.x1 - 3, z: R.cinema.z1 - 2.2, y: Y + 1.05 },
      popcornBord: { x: R.cinema.x1 - 3, y: Y + 3.6, z: R.cinema.z1 - 0.06, ry: Math.PI, b: 3.2, h: 1.2 },
      loopbanden,
      loopbandBord: { x: R.fitness.x0 + 7, y: Y + 2.7, z: R.fitness.z1 - 0.06, ry: Math.PI, b: 4, h: 2 },
      zetels: zetelPlekken,
      arcade: { x: R.gaming.x1 - 1.7, z: R.gaming.z0 + 6.3 },
      scoreBord: { x: R.gaming.x1 - 0.06, y: Y + 3.05, z: R.gaming.z0 + 6.3, ry: -Math.PI / 2, b: 3.2, h: 1.8 },
      kampioenBord: { x: ox - 12.5, y: Y + 2.3, z: B0 + 0.03, ry: 0, b: 4.2, h: 2.4 },
      graffiti: { x: R.speelhal.x1 - 0.04, z: R.speelhal.z0, dx: 0, dz: 1, ry: -Math.PI / 2, max: R.speelhal.z1 - R.speelhal.z0 },
      tactiek: { x: R.speelhal.x0 + 0.06, y: Y + 1.9, z: R.speelhal.z0 + 8, ry: Math.PI / 2, b: 3.2, h: 2 },
      goud,
    },
    zetWaterKleur(hex) {
      waterDoel.set(hex)
    },
    trampoline(x, z) {
      for (const t of trampolines) {
        const d = Math.hypot(x - t.x, z - t.z)
        if (d < t.r) return 1 - (d / t.r) * 0.4
      }
      return 0
    },
    update(seconden, speler) {
      if (!groep.visible) return
      // Het water kleurt zacht naar de verf van de bezoekers.
      waterMat.color.lerp(waterDoel, 0.03)
      // De dansvloer: golven van kleur, en feller onder je voeten.
      for (const t of dansTegels) {
        const onder = speler && Math.abs(speler.x - t.x) < 0.5 && Math.abs(speler.z - t.z) < 0.5
        kleur.setHSL((seconden * 0.15 + t.f * 0.1 + (t.x + t.z) * 0.07) % 1, 0.85, onder ? 0.65 : 0.25 + 0.15 * Math.max(0, Math.sin(seconden * 3 + t.f)))
        t.mat.color.copy(kleur)
      }
      // Water: twee lagen schitteringen die tegen elkaar in schuiven, en het plafond erboven.
      water.tex.offset.set(seconden * 0.03, seconden * 0.02)
      water.tex2.offset.set(-seconden * 0.025, seconden * 0.035)
      water.plafondTex.offset.set(seconden * 0.02, -seconden * 0.03)
      // Gaming: de neon verschiet van kleur, en het spel speelt (10 beelden per seconde).
      neonMats.forEach((m, i) => m.color.copy(kleur.setHSL((seconden * 0.08 + i * 0.12) % 1, 0.9, 0.6)))
      if (seconden - laatsteSpel > 0.1) {
        laatsteSpel = seconden
        tekenSpel()
      }
      // Sauna: de gloed ademt, de kaarsjes flakkeren, het bubbelbad borrelt.
      for (const g of saunaGloed) g.color.setRGB(1, 0.55 + Math.sin(seconden * 1.3) * 0.08, 0.22)
      for (const k of kaarsjes) {
        const f = 0.85 + Math.sin(seconden * 13 + k.f) * 0.08 + Math.sin(seconden * 7.3 + k.f * 2) * 0.07
        k.sp.scale.set(0.12 * f, 0.24 * f, 1)
      }
      if (bubbels.m) {
        for (let i = 0; i < bubbels.n; i++) {
          const t = (seconden * 0.6 + i * 0.137) % 1
          const a = i * 2.4
          const r = 0.3 + ((i * 0.37) % 1) * 1.5
          m4.makeTranslation(bubbels.c.x + Math.cos(a) * r, bubbels.c.y - 0.5 + t * 0.52, bubbels.c.z + Math.sin(a) * r)
          bubbels.m.setMatrixAt(i, m4)
        }
        bubbels.m.instanceMatrix.needsUpdate = true
      }
    },
  }
}
