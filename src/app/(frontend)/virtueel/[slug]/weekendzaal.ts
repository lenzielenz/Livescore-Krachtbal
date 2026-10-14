import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { GEVEL, type StadionThema, type WeekendBord, type WeekendZaal } from '@/lib/virtueel'
import { weekendTelling } from '@/lib/virtueel-weekend'
import { bouwBordlicht } from './bordlicht'
import { canvasTex } from './stadion'

// De weekendzaal in de noordgang, tegenover de hall of fame: een muur vol ledborden met de
// wedstrijden van het komende speelweekend. Wat gespeeld is, staat er met de eindstand; wat bezig
// is, met de live-stand en een rood pulserende gloed. Het stadion verandert dus mee met de
// kalender: elke keer je komt kijken, hangt er iets anders. Op zaterdag en zondag werkt de muur
// zichzelf bij via het gedeelde live-weekendkanaal (zie VirtueelViewer).
//
// Vlot: alle borden delen één textuur-atlas en zijn één mesh; kaders en gloed zijn samengevoegd of
// instanced. Bijwerken = de atlas opnieuw tekenen, geen nieuwe geometrie.

const BORD = { b: 2.9, h: 1.45, celB: 512, celH: 256, kol: 4 }
/** Twee rijen, zoals een vertrekbord: onderaan op ooghoogte, daarboven de tweede rij. */
const RIJEN_Y = [1.45, 3.35]
const STAP = 3.3

/** De gloed achter een bord: live rood, je eigen club goud, een uitslag groen, de rest koel blauw. */
function gloedKleur(b: WeekendBord): string {
  if (b.status === 'live') return '#ef4444'
  if (b.eigen) return '#fbbf24'
  return b.status === 'gespeeld' ? '#22c55e' : '#38bdf8'
}

export type Weekendzaal = { update: (seconden: number) => void; werkBij: (zaal: WeekendZaal) => void }

const STATUS: Record<WeekendBord['status'], { tekst: string; kleur: string }> = {
  live: { tekst: '● LIVE', kleur: '#ef4444' },
  gespeeld: { tekst: 'EINDSTAND', kleur: '#22c55e' },
  gepland: { tekst: 'GEPLAND', kleur: '#64748b' },
  wacht: { tekst: 'WACHT OP UITSLAG', kleur: '#f59e0b' },
}

/** Tekst op één regel passend maken (kleiner lettertype tot het past). */
function past(g: CanvasRenderingContext2D, tekst: string, max: number, grootte: number, gewicht = 800): void {
  let px = grootte
  do {
    g.font = `${gewicht} ${px}px Inter, system-ui, sans-serif`
    px -= 1
  } while (g.measureText(tekst).width > max && px > 10)
}

function tekenBord(g: CanvasRenderingContext2D, x: number, y: number, b: WeekendBord, thema: StadionThema): void {
  const { celB: W, celH: H } = BORD
  const bg = g.createLinearGradient(x, y, x, y + H)
  bg.addColorStop(0, '#0f172a')
  bg.addColorStop(1, '#020617')
  g.fillStyle = bg
  g.fillRect(x, y, W, H)
  // Ledraster: fijne puntjes, zoals een echt scorebord.
  g.fillStyle = 'rgba(255,255,255,.035)'
  for (let py = y + 4; py < y + H; py += 6) for (let px = x + 4; px < x + W; px += 6) g.fillRect(px, py, 2, 2)
  g.strokeStyle = b.eigen ? '#fcd34d' : b.status === 'live' ? '#ef4444' : '#334155'
  g.lineWidth = b.eigen ? 10 : 6
  g.strokeRect(x + 4, y + 4, W - 8, H - 8)

  // Bovenbalk: dag + uur en de status; daaronder de reeks.
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillStyle = b.eigen ? '#fcd34d' : '#e2e8f0'
  g.font = '900 26px Inter, system-ui, sans-serif'
  g.fillText(`${b.dag} ${b.uur}`, x + 22, y + 34)
  const st = STATUS[b.status]
  g.font = '900 20px Inter, system-ui, sans-serif'
  const stB = g.measureText(st.tekst).width + 22
  g.fillStyle = st.kleur
  g.beginPath()
  g.roundRect(x + W - 20 - stB, y + 19, stB, 30, 15)
  g.fill()
  g.fillStyle = '#0b1220'
  g.textAlign = 'center'
  g.fillText(st.tekst, x + W - 20 - stB / 2, y + 35)
  g.textAlign = 'left'
  g.fillStyle = b.eigen ? 'rgba(252,211,77,.9)' : 'rgba(148,163,184,.95)'
  const reeks = b.eigen ? `★ JOUW CLUB · ${b.reeks}` : b.reeks
  past(g, reeks, W - 44, 20, 700)
  g.fillText(reeks, x + 22, y + 72)

  // Ploegen met hun clubkleur, en rechts de stand (of het aftrapuur).
  const scoreB = 150
  const rij = (naam: string, kleur: string, ry: number, punten: number | null) => {
    g.fillStyle = kleur
    g.fillRect(x + 22, ry - 22, 10, 44)
    g.fillStyle = '#ffffff'
    g.textAlign = 'left'
    past(g, naam, W - scoreB - 70, 34)
    g.fillText(naam, x + 46, ry + 2)
    if (punten != null) {
      g.fillStyle = b.status === 'live' ? '#fca5a5' : '#fbbf24'
      g.textAlign = 'right'
      g.font = '900 54px "Courier New", ui-monospace, monospace'
      g.fillText(String(punten), x + W - 28, ry + 4)
    }
  }
  rij(b.thuis, b.thuisKleur, y + 124, b.score?.home ?? null)
  rij(b.uit, b.uitKleur, y + 192, b.score?.away ?? null)
  if (!b.score) {
    g.textAlign = 'right'
    g.fillStyle = b.status === 'wacht' ? '#f59e0b' : 'rgba(226,232,240,.9)'
    g.font = '900 46px "Courier New", ui-monospace, monospace'
    g.fillText(b.status === 'wacht' ? '?–?' : b.uur, x + W - 28, y + 160)
  }
  // Een dun streepje in de eigen clubkleur onderaan bij je eigen wedstrijden.
  if (b.eigen) {
    g.fillStyle = thema.primair
    g.fillRect(x + 10, y + H - 16, W - 20, 6)
  }
}

export function bouwWeekendzaal(scene: THREE.Scene, opt: { thema: StadionThema; zaal: WeekendZaal; wandZ: number }): Weekendzaal {
  const { thema } = opt
  let zaal = opt.zaal
  const { A, B, R } = GEVEL
  const muurZ = -B + 0.66
  const poort = GEVEL.poorten.find((p) => p.zijde === 'z-') ?? { van: -3, tot: 3 }

  // ---------- plaatsen: twee rijen langs de binnenkant van de noordgevel ----------
  // Eerst de onderste rij, het dichtst bij het midden (de noordpoort) — daar staan je eigen
  // wedstrijden, op ooghoogte.
  const xs: number[] = []
  for (let x = poort.tot + 1.2 + BORD.b / 2; x + BORD.b / 2 < A - R; x += STAP) xs.push(x, -x)
  const plekken = RIJEN_Y.flatMap((y) => xs.map((x) => ({ x, y })))
  const n = Math.min(zaal.borden.length, plekken.length)

  // ---------- licht: een koel blauwe lichtlijn en vloergloed maken er een eigen zaal van ----------
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * (A - R) - 1, 0.14),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', toneMapped: false }),
  )
  band.position.set(0, 4.62, muurZ + 0.02)
  const vloerC = document.createElement('canvas')
  vloerC.width = 8
  vloerC.height = 128
  const vg = vloerC.getContext('2d')!
  const vgr = vg.createLinearGradient(0, 0, 0, 128)
  vgr.addColorStop(0, 'rgba(56,189,248,.32)')
  vgr.addColorStop(1, 'rgba(56,189,248,0)')
  vg.fillStyle = vgr
  vg.fillRect(0, 0, 8, 128)
  const vloer = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * (A - R) - 1, 5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vloerC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  vloer.position.set(0, 0.04, muurZ + 2.5)
  scene.add(band, vloer)

  // ---------- het kopbord op de achterwand van de noordtribune ----------
  const kopC = document.createElement('canvas')
  kopC.width = 1536
  kopC.height = 400
  const kopTex = canvasTex(kopC)
  const tekenKop = () => {
    const g = kopC.getContext('2d')!
    const bg = g.createLinearGradient(0, 0, 1536, 0)
    bg.addColorStop(0, '#0b1220')
    bg.addColorStop(1, '#0c4a6e')
    g.fillStyle = bg
    g.fillRect(0, 0, 1536, 400)
    g.strokeStyle = '#38bdf8'
    g.lineWidth = 12
    g.strokeRect(6, 6, 1524, 388)
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    g.fillStyle = '#38bdf8'
    g.font = '900 44px Inter, system-ui, sans-serif'
    g.fillText('⚡ DIT WEEKEND', 70, 84)
    if (zaal.live > 0) {
      g.fillStyle = '#ef4444'
      g.beginPath()
      g.roundRect(440, 60, 190, 50, 25)
      g.fill()
      g.fillStyle = '#ffffff'
      g.font = '900 30px Inter, system-ui, sans-serif'
      g.fillText('● LIVE NU', 462, 86)
    }
    g.fillStyle = '#ffffff'
    past(g, zaal.datum, 1400, 96, 900)
    g.fillText(zaal.datum, 70, 192)
    g.fillStyle = 'rgba(255,255,255,.88)'
    past(g, weekendTelling(zaal), 1400, 46, 700)
    g.fillText(weekendTelling(zaal), 70, 282)
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.font = '600 28px Inter, system-ui, sans-serif'
    g.fillText(
      zaal.borden.length ? 'Draai je om: elke wedstrijd hangt aan de muur, met de stand zodra er gespeeld is' : 'De muur vult zich zodra er wedstrijden gepland staan',
      70,
      350,
      1400,
    )
    kopTex.needsUpdate = true
  }
  tekenKop()
  const kop = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.73), new THREE.MeshBasicMaterial({ map: kopTex, toneMapped: false }))
  kop.position.set(0, 3.1, opt.wandZ - 0.02)
  kop.rotation.y = Math.PI
  const kopKader = new THREE.Mesh(new THREE.BoxGeometry(10.9, 3.13, 0.14), new THREE.MeshLambertMaterial({ color: '#111827' }))
  kopKader.position.set(0, 3.1, opt.wandZ + 0.06)
  scene.add(kopKader, kop)

  if (n === 0) return { update() {}, werkBij() {} }

  // ---------- de borden: één atlas, één mesh ----------
  const rijen = Math.ceil(n / BORD.kol)
  const atlasC = document.createElement('canvas')
  atlasC.width = BORD.kol * BORD.celB
  atlasC.height = rijen * BORD.celH
  const atlas = canvasTex(atlasC)
  const tekenBorden = () => {
    const g = atlasC.getContext('2d')!
    zaal.borden.slice(0, n).forEach((b, i) => tekenBord(g, (i % BORD.kol) * BORD.celB, Math.floor(i / BORD.kol) * BORD.celH, b, thema))
    atlas.needsUpdate = true
  }
  tekenBorden()
  const vlakken: THREE.BufferGeometry[] = []
  const kaders: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const { x, y } = plekken[i]
    const vlak = new THREE.PlaneGeometry(BORD.b, BORD.h)
    const u0 = (i % BORD.kol) / BORD.kol
    const u1 = u0 + 1 / BORD.kol
    const v1 = 1 - Math.floor(i / BORD.kol) / rijen
    const v0 = v1 - 1 / rijen
    vlak.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
    vlakken.push(vlak.translate(x, y, muurZ + 0.08))
    kaders.push(new THREE.BoxGeometry(BORD.b + 0.14, BORD.h + 0.14, 0.1).translate(x, y, muurZ))
  }
  scene.add(new THREE.Mesh(mergeGeometries(vlakken), new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false })))
  scene.add(new THREE.Mesh(mergeGeometries(kaders), new THREE.MeshLambertMaterial({ color: '#0b1220' })))

  // Elk bord zijn eigen verlichting (bordlicht.ts), met een koeler licht dan in de hall of fame.
  const bordlicht = bouwBordlicht(
    scene,
    plekken.slice(0, n).map(({ x, y }, i) => ({
      pos: new THREE.Vector3(x, y, muurZ),
      rot: new THREE.Quaternion(),
      b: BORD.b,
      h: BORD.h,
      kleur: gloedKleur(zaal.borden[i]),
      vloer: y === RIJEN_Y[0],
    })),
    { licht: '#e0f2fe' },
  )

  // ---------- rode gloed achter wat live is ----------
  const gloedC = document.createElement('canvas')
  gloedC.width = gloedC.height = 128
  const gg = gloedC.getContext('2d')!
  const ggr = gg.createRadialGradient(64, 64, 16, 64, 64, 64)
  ggr.addColorStop(0, 'rgba(239,68,68,.7)')
  ggr.addColorStop(1, 'rgba(239,68,68,0)')
  gg.fillStyle = ggr
  gg.fillRect(0, 0, 128, 128)
  const gloedMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gloedC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const gloed = new THREE.InstancedMesh(new THREE.PlaneGeometry(BORD.b + 1.4, BORD.h + 1.1), gloedMat, n)
  const m4 = new THREE.Matrix4()
  const zetGloed = () => {
    for (let i = 0; i < n; i++) {
      const { x, y } = plekken[i]
      const aan = zaal.borden[i]?.status === 'live'
      m4.makeTranslation(x, y, muurZ + 0.04)
      if (!aan) m4.scale(new THREE.Vector3(0, 0, 0))
      gloed.setMatrixAt(i, m4)
    }
    gloed.instanceMatrix.needsUpdate = true
  }
  zetGloed()
  scene.add(gloed)

  return {
    update(seconden) {
      gloedMat.opacity = 0.55 + 0.45 * Math.sin(seconden * 3.2)
      bordlicht.update(seconden)
    },
    werkBij(nieuw) {
      // Zelfde wedstrijden, nieuwe standen: de borden blijven waar ze hangen.
      const perId = new Map(nieuw.borden.map((b) => [b.id, b]))
      zaal = { ...nieuw, borden: zaal.borden.map((b) => perId.get(b.id) ?? b) }
      tekenBorden()
      tekenKop()
      zetGloed()
      zaal.borden.slice(0, n).forEach((b, i) => bordlicht.kleur(i, gloedKleur(b)))
    },
  }
}
