import * as THREE from 'three'

import { GEVEL, type Rechthoek } from '@/lib/virtueel'
import { FANDORP } from './fandorp'
import { RING } from './ring'
import { SHOW_DUUR, type Vuurwerk } from './vuurwerk'

// Het feest rond het vuurwerk: druk je op de rode knop, dan is het niet enkel boven het dak feest,
// maar overal waar je bent. Wat er gebeurt hangt af van waar je staat:
//  • overal: confetti die rond je neerdwarrelt, blijft liggen en wegkwijnt;
//  • in de gangen: trussen met moving heads die gekleurde bundels over de vloer laten zwiepen;
//  • op het veld, het plein, in het fandorp en achter het stadion: zoeklichten die de lucht
//    afzoeken, en confettikanonnen die op de grote momenten van de show afgaan;
//  • in de kelder: een discobal met lichtvlekjes over de boulevard, moving heads in elke zaal,
//    confettikanonnen, het zwembad dat in de clubkleuren verschiet, een beat uit de boxen, en het
//    vuurwerk dat je gedempt door het plafond hoort dreunen (met wat stof dat bij een zware knal
//    van het plafond dwarrelt);
//  • de muziek en het dempen van het vuurwerk volgen je: luid in de kelder, zachter in de gangen,
//    de stadionboxen op het veld, een feesttent in het fandorp.
// Alles staat uit (onzichtbaar, geen kosten) zolang er geen show is.

export type FeestPlek = 'kelder' | 'gang' | 'verdiep' | 'veld' | 'dak' | 'fandorp' | 'buiten' | 'lucht'

export const FEEST_MELDING: Record<FeestPlek, string> = {
  kelder: '🪩 Disco in de kelder! Het vuurwerk dreunt door het plafond',
  gang: '🎉 Feest in de gangen: lichtshow en confetti!',
  verdiep: '🥂 Confetti in de loges — kijk door het raam naar het vuurwerk',
  veld: '🎆 De stadionboxen gaan aan: confetti op het veld!',
  dak: '🎆 Kijk omhoog! Beneden is het ook feest',
  fandorp: '🎡 Feest in het fandorp: zoeklichten en confetti!',
  buiten: '🔦 De zoeklichten zoeken de lucht af — confetti op het plein!',
  lucht: '🎆 Vlieg niet te dicht bij het vuurwerk!',
}

/** Hoe luid de beat speelt, en hoe gedempt je het vuurwerk hoort (0 = open lucht, 1 = kelder). */
const KLANK: Record<FeestPlek, { muziek: number; demp: number }> = {
  kelder: { muziek: 1, demp: 1 },
  gang: { muziek: 0.4, demp: 0.35 },
  verdiep: { muziek: 0.3, demp: 0.45 },
  veld: { muziek: 0.45, demp: 0 },
  dak: { muziek: 0.12, demp: 0 },
  fandorp: { muziek: 0.6, demp: 0 },
  buiten: { muziek: 0.25, demp: 0 },
  lucht: { muziek: 0.05, demp: 0 },
}

/** Op deze momenten (s na de start) gaan de confettikanonnen af, gelijk met de show. */
const KANON_MOMENTEN = [1.4, 14, 29.5, 44, 50.5, 58.2]

// ---------- confetti ----------

const vertex = /* glsl */ `
  attribute vec3 aV;
  attribute vec4 aT;     // geboorte, levensduur, vloer, zaad
  attribute vec3 aKleur;
  attribute float aGrootte;
  uniform float uTijd;
  uniform float uSchaal;
  varying vec3 vKleur;
  varying float vAlfa;
  varying float vDraai;
  void main() {
    float t = uTijd - aT.x;
    if (t < 0.0 || t > aT.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlfa = 0.0; return; }
    // Veel luchtweerstand en weinig gewicht: een snipper valt traag (± 1,2 m/s) en waait wat heen en weer.
    float k = 2.2;
    float g = 2.6;
    float e = exp(-k * t);
    vec3 p = position + aV * (1.0 - e) / k;
    p.y -= g * (t / k - (1.0 - e) / (k * k));
    float z = aT.w;
    float zweef = smoothstep(aT.z + 0.05, aT.z + 0.7, p.y) * min(1.0, t);
    p.x += sin(t * 2.7 + z) * 0.35 * zweef;
    p.z += cos(t * 2.1 + z * 1.3) * 0.35 * zweef;
    float lig = step(p.y, aT.z + 0.02);
    p.y = max(p.y, aT.z + 0.02);
    // Een draaiende snipper is nu eens breed, dan eens een streepje; op de grond ligt hij stil.
    vDraai = mix(abs(sin(t * (5.0 + fract(z) * 6.0) + z)), 0.8, lig);
    vAlfa = 1.0 - smoothstep(0.8, 1.0, t / aT.y);
    vKleur = aKleur * mix(0.55 + 0.6 * vDraai, 0.75, lig);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aGrootte * uSchaal / -mv.z, 0.0, 28.0);
  }`

const fragment = /* glsl */ `
  varying vec3 vKleur;
  varying float vAlfa;
  varying float vDraai;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (abs(c.x) > 0.5 * max(0.14, vDraai) || abs(c.y) > 0.3) discard;
    gl_FragColor = vec4(vKleur, vAlfa);
  }`

class Snippers {
  readonly punten: THREE.Points
  readonly mat: THREE.ShaderMaterial
  private n: number
  private cursor = 0
  private veranderd = false
  private pos: Float32Array
  private v: Float32Array
  private t: Float32Array
  private kleur: Float32Array
  private grootte: Float32Array
  private attrs: THREE.BufferAttribute[]

  constructor(n: number) {
    this.n = n
    this.pos = new Float32Array(n * 3)
    this.v = new Float32Array(n * 3)
    this.t = new Float32Array(n * 4).fill(-1000)
    this.kleur = new Float32Array(n * 3)
    this.grootte = new Float32Array(n)
    const geo = new THREE.BufferGeometry()
    const mk = (a: Float32Array, k: number) => new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage)
    this.attrs = [mk(this.pos, 3), mk(this.v, 3), mk(this.t, 4), mk(this.kleur, 3), mk(this.grootte, 1)]
    geo.setAttribute('position', this.attrs[0])
    geo.setAttribute('aV', this.attrs[1])
    geo.setAttribute('aT', this.attrs[2])
    geo.setAttribute('aKleur', this.attrs[3])
    geo.setAttribute('aGrootte', this.attrs[4])
    this.mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { uTijd: { value: 0 }, uSchaal: { value: 600 } }, transparent: true, depthWrite: false })
    this.punten = new THREE.Points(geo, this.mat)
    this.punten.frustumCulled = false
    this.punten.userData.los = true
  }

  zet(px: number, py: number, pz: number, vx: number, vy: number, vz: number, t0: number, leven: number, vloer: number, k: THREE.Color, grootte: number) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.n
    this.pos.set([px, py, pz], i * 3)
    this.v.set([vx, vy, vz], i * 3)
    this.t.set([t0, leven, vloer, Math.random() * 100], i * 4)
    this.kleur.set([k.r, k.g, k.b], i * 3)
    this.grootte[i] = grootte
    this.veranderd = true
  }

  /** Confetti komt in schokken (een kanon, een wolk boven je hoofd): dan gewoon alles opnieuw sturen. */
  stuur() {
    if (!this.veranderd) return
    this.veranderd = false
    for (const a of this.attrs) a.needsUpdate = true
  }

  dispose() {
    this.punten.geometry.dispose()
    this.mat.dispose()
  }
}

// ---------- lichtbundels ----------

/** Een kegel met de punt in de oorsprong, langs -y; fel aan de lamp, uitdovend naar het einde. */
function bundelGeometrie(lengte: number, straal: number) {
  const g = new THREE.CylinderGeometry(0.06, straal, lengte, 20, 1, true).translate(0, -lengte / 2, 0)
  const pos = g.attributes.position
  const kl = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const f = 1 - -pos.getY(i) / lengte
    kl.set([f, f, f], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(kl, 3))
  return g
}

let vlekTex: THREE.Texture | null = null
function lichtvlek() {
  if (vlekTex) return vlekTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.55, 'rgba(255,255,255,.55)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  vlekTex = new THREE.CanvasTexture(c)
  return vlekTex
}

type Bundel = {
  draai: THREE.Group
  mat: THREE.MeshBasicMaterial
  vlek: THREE.Mesh | null
  vlekMat: THREE.MeshBasicMaterial | null
  /** Hoogte van de lamp boven de vloer (voor waar de vlek valt). */
  boven: number
  fase: number
  tempo: number
  kantel: [number, number]
  /** Kleur: welke uit het palet, en of hij mee verschiet. */
  kleur: number
  sterk: number
}

const additief = (kleur: THREE.ColorRepresentation, map?: THREE.Texture) =>
  // `map: undefined` doorgeven doet three waarschuwen (41 keer per bezoek): de sleutel enkel zetten als er een textuur is.
  new THREE.MeshBasicMaterial({ color: kleur, ...(map ? { map } : {}), vertexColors: !map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false })

function maakBundel(ouder: THREE.Object3D, x: number, y: number, z: number, o: { lengte: number; straal: number; vloer: number | null; omhoog?: boolean; kantel: [number, number]; tempo: number; kleur: number; sterk: number; kop?: THREE.Material }): Bundel {
  const voet = new THREE.Group()
  voet.position.set(x, y, z)
  if (o.omhoog) voet.rotation.x = Math.PI
  ouder.add(voet)
  const draai = new THREE.Group()
  draai.rotation.order = 'YXZ'
  voet.add(draai)
  const mat = additief('#ffffff')
  const kegel = new THREE.Mesh(bundelGeometrie(o.lengte, o.straal), mat)
  kegel.frustumCulled = false
  kegel.renderOrder = 7
  draai.add(kegel)
  if (o.kop) {
    const kop = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.34, 12).translate(0, -0.12, 0), o.kop)
    draai.add(kop)
  }
  let vlek: THREE.Mesh | null = null
  let vlekMat: THREE.MeshBasicMaterial | null = null
  if (o.vloer != null) {
    vlekMat = additief('#ffffff', lichtvlek())
    vlek = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), vlekMat)
    vlek.position.y = o.vloer + 0.03
    vlek.renderOrder = 7
    ouder.add(vlek)
  }
  return { draai, mat, vlek, vlekMat, boven: o.vloer != null ? y - o.vloer : 0, fase: Math.random() * 10, tempo: o.tempo, kantel: o.kantel, kleur: o.kleur, sterk: o.sterk }
}

// ---------- muziek ----------

class Beat {
  private ac: AudioContext
  private uit: GainNode
  private ruis: AudioBuffer
  private stap = 0
  private volgende = 0
  private static TEMPO = 60 / 126 / 4
  // Een simpele housebas: per maat een andere grondtoon (A, F, C, G).
  private static BAS = [55, 43.65, 65.41, 49]

  constructor(ac: AudioContext, bus: AudioNode) {
    this.ac = ac
    this.uit = ac.createGain()
    this.uit.gain.value = 0
    this.uit.connect(bus)
    const n = ac.sampleRate
    this.ruis = ac.createBuffer(1, n, ac.sampleRate)
    const d = this.ruis.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    this.volgende = ac.currentTime + 0.05
  }

  volume(v: number) {
    this.uit.gain.setTargetAtTime(v, this.ac.currentTime, 0.35)
  }

  /** Plan de tikken van de komende kwart seconde in. */
  speel() {
    const nu = this.ac.currentTime
    // Na een pauze (tabblad op de achtergrond) niet alle gemiste tikken in één keer inhalen.
    if (this.volgende < nu - 0.1) this.volgende = nu + 0.05
    while (this.volgende < nu + 0.25) {
      this.tik(this.stap, this.volgende)
      this.stap = (this.stap + 1) % 64
      this.volgende += Beat.TEMPO
    }
  }

  private ruisBron(t: number, duur: number) {
    const s = this.ac.createBufferSource()
    s.buffer = this.ruis
    s.start(t, Math.random() * 0.5)
    s.stop(t + duur)
    return s
  }

  private tik(stap: number, t: number) {
    const ac = this.ac
    const tel = stap % 16
    if (tel % 4 === 0) {
      // De kick.
      const o = ac.createOscillator()
      o.frequency.setValueAtTime(150, t)
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
      const g = ac.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.8, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
      o.connect(g).connect(this.uit)
      o.start(t)
      o.stop(t + 0.36)
    }
    if (tel === 4 || tel === 12) {
      // De clap.
      const f = ac.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1500
      f.Q.value = 0.8
      const g = ac.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.45, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      this.ruisBron(t, 0.18).connect(f).connect(g).connect(this.uit)
    }
    {
      // De hihat: open op de tussentel, zacht op de zestienden.
      const open = tel % 4 === 2
      const f = ac.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 7000
      const g = ac.createGain()
      g.gain.setValueAtTime(open ? 0.16 : 0.04, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.09 : 0.03))
      this.ruisBron(t, 0.1).connect(f).connect(g).connect(this.uit)
    }
    if (tel % 4 === 2) {
      // De bas, telkens tussen de kicks in.
      const o = ac.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = Beat.BAS[Math.floor(stap / 16) % 4]
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(900, t)
      f.frequency.exponentialRampToValueAtTime(180, t + 0.14)
      const g = ac.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
      o.connect(f).connect(g).connect(this.uit)
      o.start(t)
      o.stop(t + 0.18)
    }
  }

  /** De feesttoeter: drie stoten, zoals op elk goed feest. */
  toeter() {
    const ac = this.ac
    const t0 = ac.currentTime + 0.05
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.22
      const lang = i === 2 ? 0.6 : 0.16
      for (const fr of [466, 587]) {
        const o = ac.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(fr * 0.94, t)
        o.frequency.linearRampToValueAtTime(fr, t + 0.04)
        const g = ac.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.02)
        g.gain.setValueAtTime(0.09, t + lang - 0.03)
        g.gain.exponentialRampToValueAtTime(0.0001, t + lang)
        o.connect(g).connect(this.uit)
        o.start(t)
        o.stop(t + lang + 0.02)
      }
    }
  }

  stil() {
    this.uit.gain.cancelScheduledValues(this.ac.currentTime)
    this.uit.gain.setTargetAtTime(0, this.ac.currentTime, 0.4)
  }
}

// ---------- het feest ----------

export type FeestZaal = Rechthoek & { naam: string; h: number }

export type Feest = {
  /** De kelder doet mee: bundels, discobal en kanonnen in de zalen (aan de groep van de kelder). */
  kelder: (groep: THREE.Group, o: { y: number; zalen: FeestZaal[] }) => void
  /** Waar je nu bent, voor wat er gebeurt (en de melding). */
  waar: (p: THREE.Vector3) => FeestPlek
  /** De kleur van het zwembad tijdens de show (of null: de gewone kleur). */
  water: () => string | null
  update: (o: { seconden: number; camera: THREE.PerspectiveCamera; hoogte: number; vloer: number | null }) => void
  dispose: () => void
}

export function bouwFeest(scene: THREE.Scene, opt: { vuurwerk: Vuurwerk; primair: string; secundair: string; licht: boolean; gangen: Rechthoek[]; kom: Rechthoek }): Feest {
  const { vuurwerk, licht } = opt
  const veel = licht ? 0.5 : 1
  const P = new THREE.Color(opt.primair)
  const S = new THREE.Color(opt.secundair)
  const PALET = [P, S, new THREE.Color('#facc15'), new THREE.Color('#ffffff'), new THREE.Color('#ff3b6b'), new THREE.Color('#38bdf8'), new THREE.Color('#a3e635'), new THREE.Color('#c084fc')]
  const LICHT = [P, S, new THREE.Color('#38bdf8'), new THREE.Color('#ff3b6b'), new THREE.Color('#a3e635'), new THREE.Color('#facc15')]
  const STOF = new THREE.Color('#9ca3af')
  const kies = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]

  const boven = new THREE.Group()
  boven.visible = false
  scene.add(boven)
  const snippers = new Snippers(licht ? 14000 : 36000)
  boven.add(snippers.punten)
  const truss = new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.8, roughness: 0.4 })
  const kopMat = new THREE.MeshStandardMaterial({ color: '#0b0f17', metalness: 0.6, roughness: 0.35 })
  const bundels: Bundel[] = []

  // De gangen: een truss over de lengte, met moving heads eronder die naar de vloer schijnen.
  const TRUSS_Y = 4.8
  for (const g of opt.gangen) {
    const langsX = g.x1 - g.x0 > g.z1 - g.z0
    const lengte = langsX ? g.x1 - g.x0 : g.z1 - g.z0
    const mx = (g.x0 + g.x1) / 2
    const mz = (g.z0 + g.z1) / 2
    const balk = new THREE.Mesh(new THREE.BoxGeometry(langsX ? lengte : 0.3, 0.3, langsX ? 0.3 : lengte), truss)
    balk.position.set(mx, TRUSS_Y + 0.2, mz)
    boven.add(balk)
    const stap = licht ? 16 : 9
    const n = Math.max(2, Math.floor(lengte / stap))
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n
      const x = langsX ? g.x0 + f * lengte : mx
      const z = langsX ? mz : g.z0 + f * lengte
      bundels.push(maakBundel(boven, x, TRUSS_Y, z, { lengte: 7, straal: 0.9, vloer: 0, kantel: [0.25, 0.6], tempo: 0.7 + Math.random() * 0.5, kleur: i % LICHT.length, sterk: 0.5, kop: kopMat }))
    }
  }

  // Zoeklichten: op het plein, in het fandorp, achter het stadion en op de hoeken van het veld.
  const zoek: [number, number][] = [
    [-46, GEVEL.B + 18],
    [46, GEVEL.B + 18],
    [FANDORP.x0 + 8, FANDORP.z0 + 6],
    [FANDORP.x1 - 8, FANDORP.z0 + 6],
    [-30, -GEVEL.B - 14],
    [30, -GEVEL.B - 14],
    ...(licht ? [] : ([[GEVEL.A + 16, -18], [-GEVEL.A - 16, -24]] as [number, number][])),
  ]
  zoek.forEach(([x, z], i) => {
    const sokkel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.1, 14), kopMat)
    sokkel.position.set(x, 0.55, z)
    boven.add(sokkel)
    bundels.push(maakBundel(boven, x, 1.2, z, { lengte: 170, straal: 6, vloer: null, omhoog: true, kantel: [0.12, 0.55], tempo: 0.18 + Math.random() * 0.12, kleur: i % 2 ? -1 : -2, sterk: 0.22 }))
  })
  const kom = opt.kom
  // Op de vier hoeken van het veld: lichtbundels omhoog in de clubkleuren (zoals de stadionshow).
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]])
    bundels.push(maakBundel(boven, sx * (kom.x1 - 6), 0.4, sz * (kom.z1 - 6), { lengte: 90, straal: 3.5, vloer: null, omhoog: true, kantel: [0.1, 0.45], tempo: 0.35, kleur: sx * sz > 0 ? 0 : 1, sterk: 0.3 }))

  // De kanonnen: waar confetti de lucht in gaat op de grote momenten.
  type Kanon = { x: number; y: number; z: number; kracht: number; wolk: Snippers }
  const kanonnen: Kanon[] = [
    // Het plein voor de hoofdingang.
    ...[-24, -8, 8, 24].map((x) => ({ x, y: 0, z: GEVEL.B + 9, kracht: 1, wolk: snippers })),
    // Het fandorp.
    ...[-40, -14, 14, 40].map((x) => ({ x, y: 0, z: (FANDORP.z0 + FANDORP.z1) / 2, kracht: 1.1, wolk: snippers })),
    // Het veld: op de hoeken.
    ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ x: sx * (kom.x1 - 9), y: 0, z: sz * (kom.z1 - 8), kracht: 1.2, wolk: snippers })),
    // In de gangen.
    ...opt.gangen.map((g) => ({ x: (g.x0 + g.x1) / 2, y: 0, z: (g.z0 + g.z1) / 2, kracht: 0.55, wolk: snippers })),
  ]

  // ---------- de kelder ----------
  let kelderGroep: THREE.Group | null = null
  let kelderSnippers: Snippers | null = null
  let kelderY = -7
  let disco: { bal: THREE.Mesh; vlekjes: THREE.Points; richting: THREE.Vector3[]; doos: THREE.Box3; kleur: THREE.PointsMaterial } | null = null
  const kelderBundels: Bundel[] = []

  const metKelder = (groep: THREE.Group, o: { y: number; zalen: FeestZaal[] }) => {
    kelderY = o.y
    const g = new THREE.Group()
    g.visible = false
    g.userData.los = true
    groep.add(g)
    kelderGroep = g
    kelderSnippers = new Snippers(licht ? 8000 : 20000)
    g.add(kelderSnippers.punten)
    for (const z of o.zalen) {
      const b = z.x1 - z.x0
      const d = z.z1 - z.z0
      const langsX = b > d
      const lengte = Math.max(b, d)
      const n = Math.max(1, Math.round(lengte / (licht ? 22 : 13)))
      const hoog = o.y + z.h - 0.35
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n
        const x = langsX ? z.x0 + f * b : (z.x0 + z.x1) / 2
        const zz = langsX ? (z.z0 + z.z1) / 2 : z.z0 + f * d
        kelderBundels.push(maakBundel(g, x, hoog, zz, { lengte: z.h + 2, straal: 0.8, vloer: o.y, kantel: [0.2, 0.55], tempo: 0.8 + Math.random() * 0.6, kleur: (i + kelderBundels.length) % LICHT.length, sterk: 0.55, kop: kopMat }))
      }
      if (z.naam !== 'Lobby') kanonnen.push({ x: (z.x0 + z.x1) / 2, y: o.y, z: (z.z0 + z.z1) / 2, kracht: 0.5, wolk: kelderSnippers })
    }
    // De discobal, op de boulevard recht voor de lobby (daar kom je uit de lift).
    const blv = o.zalen.find((z) => z.naam === 'Boulevard')
    const lobby = o.zalen.find((z) => z.naam === 'Lobby')
    if (blv) {
      const x = lobby ? (lobby.x0 + lobby.x1) / 2 : (blv.x0 + blv.x1) / 2
      const z = (blv.z0 + blv.z1) / 2
      const y = o.y + blv.h - 0.9
      const bal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.7, roughness: 0.2, flatShading: true, emissive: '#c7cdd8', emissiveIntensity: 0.9 }))
      bal.position.set(x, y, z)
      const stang = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), truss)
      stang.position.set(x, y + 0.7, z)
      g.add(bal, stang)
      // De vlekjes: van de bal in alle richtingen, tot op de vloer, de wanden of het plafond.
      const m = licht ? 160 : 420
      const richting: THREE.Vector3[] = []
      for (let i = 0; i < m; i++) {
        const yy = 1 - (2 * (i + 0.5)) / m
        const r = Math.sqrt(1 - yy * yy)
        const a = i * 2.39996
        richting.push(new THREE.Vector3(Math.cos(a) * r, yy, Math.sin(a) * r))
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 3), 3).setUsage(THREE.DynamicDrawUsage))
      const kleur = new THREE.PointsMaterial({ color: '#ffffff', map: lichtvlek(), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      const vlekjes = new THREE.Points(geo, kleur)
      vlekjes.frustumCulled = false
      g.add(vlekjes)
      const doos = new THREE.Box3(new THREE.Vector3(blv.x0 + 0.05, o.y + 0.03, blv.z0 + 0.05), new THREE.Vector3(blv.x1 - 0.05, o.y + blv.h - 0.03, blv.z1 - 0.05))
      disco = { bal, vlekjes, richting, doos, kleur }
    }
    g.traverse((c) => (c.userData.los = true))
  }

  boven.traverse((c) => (c.userData.los = true))

  // ---------- waar ben je ----------
  const waar = (p: THREE.Vector3): FeestPlek => {
    if (p.y < -0.5) return 'kelder'
    if (p.y > RING.y + 14) return 'lucht'
    const inGebouw = Math.abs(p.x) < GEVEL.A + 0.3 && Math.abs(p.z) < GEVEL.B + 0.3
    if (inGebouw) {
      if (p.y > RING.y - 1.5) return 'dak'
      const inKom = p.x > kom.x0 && p.x < kom.x1 && p.z > kom.z0 && p.z < kom.z1
      if (inKom) return 'veld'
      return p.y > 6.5 ? 'verdiep' : 'gang'
    }
    if (p.x > FANDORP.x0 && p.x < FANDORP.x1 && p.z > FANDORP.z0 - 4 && p.z < FANDORP.z1) return 'fandorp'
    return 'buiten'
  }
  const vloerVan = (plek: FeestPlek, cam: THREE.Vector3) => (plek === 'kelder' ? kelderY : plek === 'verdiep' ? 7.6 : plek === 'dak' ? RING.y : plek === 'lucht' ? cam.y - 30 : 0)

  // ---------- confetti afvuren ----------
  let klok = 0
  const kanon = (k: Kanon) => {
    const n = Math.round(260 * k.kracht * veel)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const open = Math.random() * 0.45
      const s = (11 + Math.random() * 9) * Math.sqrt(k.kracht)
      k.wolk.zet(k.x, k.y + 0.6, k.z, Math.cos(a) * Math.sin(open) * s, Math.cos(open) * s, Math.sin(a) * Math.sin(open) * s, klok + Math.random() * 0.15, 9 + Math.random() * 5, k.y, kies(PALET), 0.09)
    }
  }
  /** Een wolk confetti net boven je hoofd, waar je ook bent. */
  const regen = (wolk: Snippers, cam: THREE.Vector3, vloer: number, n: number, kleuren = PALET, grootte = 0.075) => {
    const top = Math.min(cam.y + 2.4, vloer + 4.3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 6
      wolk.zet(cam.x + Math.cos(a) * r, top - Math.random() * 0.6, cam.z + Math.sin(a) * r, (Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5, klok + Math.random() * 1.2, 10 + Math.random() * 6, vloer, kies(kleuren), grootte)
    }
  }

  // ---------- de beat ----------
  let beat: Beat | null = null
  let actief = false
  let einde = -Infinity
  let volgendeRegen = 0
  let vorigeFlits = 0
  let vorigePlek: FeestPlek | null = null
  const kanonGedaan = new Set<number>()
  const tmp = new THREE.Vector3()
  const kleur = new THREE.Color()
  const beweeg = (b: Bundel, s: number, aan: number) => {
    const t = s * b.tempo + b.fase
    b.draai.rotation.y = t
    b.draai.rotation.x = b.kantel[0] + (b.kantel[1] - b.kantel[0]) * (0.5 + 0.5 * Math.sin(t * 1.7))
    // Kleur: < 0 = een vaste clubkleur (zoeklichten: -1 primair, -2 wit), anders verschiet hij mee.
    if (b.kleur === -1) kleur.copy(P)
    else if (b.kleur === -2) kleur.setRGB(1, 1, 1)
    else kleur.copy(LICHT[(b.kleur + Math.floor(s * 0.5)) % LICHT.length])
    b.mat.color.copy(kleur).multiplyScalar(b.sterk * aan)
    if (b.vlek && b.vlekMat) {
      tmp.set(0, -1, 0).applyEuler(b.draai.rotation)
      const af = b.boven / Math.max(0.2, -tmp.y)
      // De voet hangt rechtstreeks in een groep zonder verschuiving: zijn positie is de wereldpositie.
      const wp = b.draai.parent!.position
      b.vlek.position.x = wp.x + tmp.x * af
      b.vlek.position.z = wp.z + tmp.z * af
      const r = 0.6 + af * 0.13
      b.vlek.scale.set(r * 1.6, 1, r * 1.6)
      b.vlekMat.color.copy(kleur).multiplyScalar(0.9 * aan)
    }
  }

  return {
    kelder: metKelder,
    waar,
    water() {
      const t = vuurwerk.tijd()
      if (t < 0) return null
      // Om de twee tellen een andere kleur: de clubkleuren, en ertussen een feestkleur.
      return '#' + [P, S, LICHT[2], P, S, LICHT[3]][Math.floor(t / 2) % 6].getHexString()
    },
    update({ seconden, camera, hoogte, vloer }) {
      klok = seconden
      const t = vuurwerk.tijd()
      const schaal = hoogte / (2 * Math.tan((camera.fov * Math.PI) / 360))
      for (const w of [snippers, kelderSnippers]) {
        if (!w) continue
        w.mat.uniforms.uTijd.value = seconden
        w.mat.uniforms.uSchaal.value = schaal
      }
      const plek = waar(camera.position)
      if (t < 0) {
        if (actief) {
          // Gedaan: de muziek valt stil, de lichten doven, de confetti blijft nog even liggen.
          actief = false
          einde = seconden
          kanonGedaan.clear()
          beat?.stil()
          vuurwerk.dempen(0)
          for (const b of [...bundels, ...kelderBundels]) {
            b.mat.color.setRGB(0, 0, 0)
            b.vlekMat?.color.setRGB(0, 0, 0)
          }
          if (disco) disco.vlekjes.visible = false
        }
        const zichtbaar = seconden - einde < 18
        boven.visible = zichtbaar
        if (kelderGroep) kelderGroep.visible = zichtbaar
        return
      }
      actief = true
      boven.visible = true
      if (kelderGroep) kelderGroep.visible = true
      if (disco) disco.vlekjes.visible = true
      // Langzaam aan, en op het einde langzaam uit.
      const aan = Math.min(1, t / 2) * Math.min(1, Math.max(0, (SHOW_DUUR - t) / 4))
      const inKelder = plek === 'kelder'
      for (const b of inKelder ? kelderBundels : bundels) beweeg(b, seconden, aan)

      // De kanonnen, op de grote momenten.
      KANON_MOMENTEN.forEach((m, i) => {
        if (t < m || kanonGedaan.has(i)) return
        kanonGedaan.add(i)
        // Overal tegelijk: kom je straks ergens anders, dan ligt daar ook al confetti.
        for (const k of kanonnen) kanon(k)
        if (i === 0 || i === 4) beat?.toeter()
      })
      // Confetti boven je hoofd, waar je ook bent (niet als je hoog in de lucht vliegt) — en meteen
      // als je ergens anders binnenstapt.
      if (plek !== vorigePlek) volgendeRegen = 0
      vorigePlek = plek
      if (seconden > volgendeRegen && plek !== 'lucht') {
        volgendeRegen = seconden + 1.8 + Math.random() * 1.2
        const wolk = inKelder ? kelderSnippers : snippers
        if (wolk) regen(wolk, camera.position, vloer ?? vloerVan(plek, camera.position), Math.round(150 * veel))
      }
      // In de kelder: een zware knal boven doet stof van het plafond dwarrelen.
      const fl = vuurwerk.flits()
      if (inKelder && kelderSnippers && fl > vorigeFlits + 0.35) regen(kelderSnippers, camera.position, vloer ?? kelderY, Math.round(70 * veel), [STOF], 0.035)
      vorigeFlits = fl
      // De discobal draait, en zijn vlekjes glijden over de vloer en de wanden.
      if (disco && inKelder) {
        disco.bal.rotation.y = seconden * 0.6
        const pos = disco.vlekjes.geometry.attributes.position as THREE.BufferAttribute
        const c = disco.bal.position
        const hoek = seconden * 0.6
        const cs = Math.cos(hoek)
        const sn = Math.sin(hoek)
        const d = disco.doos
        disco.richting.forEach((r, i) => {
          const rx = r.x * cs - r.z * sn
          const rz = r.x * sn + r.z * cs
          // Waar de straal de boulevard (een doos) verlaat.
          const tx = rx > 0 ? (d.max.x - c.x) / rx : rx < 0 ? (d.min.x - c.x) / rx : Infinity
          const ty = r.y > 0 ? (d.max.y - c.y) / r.y : r.y < 0 ? (d.min.y - c.y) / r.y : Infinity
          const tz = rz > 0 ? (d.max.z - c.z) / rz : rz < 0 ? (d.min.z - c.z) / rz : Infinity
          const s = Math.min(tx, ty, tz, 40)
          pos.setXYZ(i, c.x + rx * s, c.y + r.y * s, c.z + rz * s)
        })
        pos.needsUpdate = true
        disco.kleur.color.setHSL((seconden * 0.1) % 1, 0.4, 0.75).multiplyScalar(aan)
      }
      // De muziek en hoe gedempt je het vuurwerk hoort, naargelang waar je bent.
      const klank = vuurwerk.klank()
      if (klank && !beat) beat = new Beat(klank.ac, klank.bus)
      if (beat) {
        beat.volume(KLANK[plek].muziek * 0.55 * aan)
        beat.speel()
      }
      vuurwerk.dempen(KLANK[plek].demp)
      snippers.stuur()
      kelderSnippers?.stuur()
    },
    dispose() {
      beat?.stil()
      snippers.dispose()
      kelderSnippers?.dispose()
    },
  }
}
