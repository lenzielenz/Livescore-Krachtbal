import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { rondeDoos } from './rond'

// De grote rode knop op het dak, en de vuurwerkshow die erop volgt:
//  • een stalen zuil met geel-zwarte waarschuwingsstrepen, een opengeklapt glazen kapje en een grote
//    rode knop die gloeit en indrukt;
//  • vuurwerk zoals op een nationale feestdag: pioenen, ringen, palmen, gouden treurwilgen,
//    knetterende glitter, flitsende saluutschoten, clubkleuren, en een finale die de lucht vult;
//  • tweemaal een formatie straaljagers die laag over het stadion scheert met rookstrepen in de
//    clubkleuren: eerst in een V, daarna een "bomb burst" die als een bloem openwaaiert;
//  • geluid: de doffe knal van het afschieten, de klap (met vertraging naargelang de afstand), het
//    geknetter, en het gebulder van de jets.
// Alle vonken en rook zijn één deeltjeswolk op de GPU: de baan van elke vonk (met luchtweerstand en
// zwaartekracht) wordt in de shader uitgerekend, de CPU schrijft enkel nieuwe vonken bij.

export const SHOW_DUUR = 66

type Kleur = THREE.Color

// ---------- de deeltjes ----------

const vertex = /* glsl */ `
  attribute vec3 aV;
  attribute vec4 aT;     // geboorte, levensduur, luchtweerstand, zwaartekracht
  attribute vec3 aKleur;
  attribute vec4 aExtra; // grootte (m), flikkering, groei (rook), zaad
  uniform float uTijd;
  uniform float uSchaal;
  uniform float uRook;
  varying vec3 vKleur;
  varying float vAlfa;
  void main() {
    float t = uTijd - aT.x;
    if (t < 0.0 || t > aT.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlfa = 0.0; return; }
    float k = aT.z;
    float e = exp(-k * t);
    float s = k > 0.001 ? (1.0 - e) / k : t;
    vec3 p = position + aV * s;
    p.y -= aT.w * (k > 0.001 ? (t / k - (1.0 - e) / (k * k)) : 0.5 * t * t);
    float a = t / aT.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float grootte = aExtra.x * (1.0 + aExtra.z * t);
    if (uRook > 0.5) {
      vAlfa = 0.55 * smoothstep(0.0, 0.04, a) * pow(1.0 - a, 1.6);
      vKleur = aKleur;
    } else {
      // Eerst witheet, dan de kleur, en op het einde een oranje gloed die uitdooft.
      vec3 heet = mix(vec3(1.0, 0.97, 0.9) * 2.2, aKleur * 1.7, smoothstep(0.0, 0.12, a));
      vKleur = mix(heet, vec3(1.0, 0.45, 0.12) * 0.8, smoothstep(0.65, 1.0, a) * 0.6);
      vAlfa = pow(1.0 - a, 1.3);
      if (aExtra.y > 0.0) {
        float f = fract(sin(aExtra.w * 91.7 + floor(t * 26.0) * 13.3) * 4375.85);
        vAlfa *= mix(1.0, step(0.45, f) * 1.6, aExtra.y);
      }
      grootte *= mix(1.25, 0.55, a);
    }
    gl_PointSize = clamp(grootte * uSchaal / -mv.z, 0.0, 200.0);
  }`

const fragment = /* glsl */ `
  uniform float uRook;
  varying vec3 vKleur;
  varying float vAlfa;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float zacht = uRook > 0.5 ? smoothstep(0.5, 0.0, d) * 0.9 : smoothstep(0.5, 0.0, d) + smoothstep(0.18, 0.0, d) * 1.5;
    gl_FragColor = vec4(vKleur, vAlfa * zacht);
  }`

class Wolk {
  readonly punten: THREE.Points
  private n: number
  private cursor = 0
  private van = Infinity
  private tot = -1
  private rond = false
  private pos: Float32Array
  private v: Float32Array
  private t: Float32Array
  private kleur: Float32Array
  private extra: Float32Array
  private attrs: THREE.BufferAttribute[]
  readonly mat: THREE.ShaderMaterial

  constructor(n: number, rook: boolean) {
    this.n = n
    this.pos = new Float32Array(n * 3)
    this.v = new Float32Array(n * 3)
    this.t = new Float32Array(n * 4).fill(-1000)
    this.kleur = new Float32Array(n * 3)
    this.extra = new Float32Array(n * 4)
    const geo = new THREE.BufferGeometry()
    const mk = (a: Float32Array, k: number) => new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage)
    this.attrs = [mk(this.pos, 3), mk(this.v, 3), mk(this.t, 4), mk(this.kleur, 3), mk(this.extra, 4)]
    geo.setAttribute('position', this.attrs[0])
    geo.setAttribute('aV', this.attrs[1])
    geo.setAttribute('aT', this.attrs[2])
    geo.setAttribute('aKleur', this.attrs[3])
    geo.setAttribute('aExtra', this.attrs[4])
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uTijd: { value: 0 }, uSchaal: { value: 600 }, uRook: { value: rook ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: rook ? THREE.NormalBlending : THREE.AdditiveBlending,
    })
    this.punten = new THREE.Points(geo, this.mat)
    this.punten.frustumCulled = false
    this.punten.renderOrder = rook ? 5 : 6
  }

  zet(px: number, py: number, pz: number, vx: number, vy: number, vz: number, t0: number, leven: number, weerstand: number, zwaarte: number, k: Kleur, grootte: number, flikker = 0, groei = 0) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.n
    if (this.cursor === 0) this.rond = true
    this.pos.set([px, py, pz], i * 3)
    this.v.set([vx, vy, vz], i * 3)
    this.t.set([t0, leven, weerstand, zwaarte], i * 4)
    this.kleur.set([k.r, k.g, k.b], i * 3)
    this.extra.set([grootte, flikker, groei, Math.random() * 100], i * 4)
    this.van = Math.min(this.van, i)
    this.tot = Math.max(this.tot, i)
  }

  /** Stuur enkel het stuk dat deze frame veranderde naar de GPU. */
  stuur() {
    if (this.tot < 0) return
    const [a, b] = this.rond ? [0, this.n - 1] : [this.van, this.tot]
    const k = [3, 3, 4, 3, 4]
    this.attrs.forEach((at, j) => {
      at.clearUpdateRanges()
      at.addUpdateRange(a * k[j], (b - a + 1) * k[j])
      at.needsUpdate = true
    })
    this.van = Infinity
    this.tot = -1
    this.rond = false
  }

  dispose() {
    this.punten.geometry.dispose()
    this.mat.dispose()
  }
}

// ---------- geluid ----------

class Geluid {
  private ac: AudioContext | null = null
  private ruis: AudioBuffer | null = null
  private uit: GainNode | null = null

  wek() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ac ??= new Ctx()
      void this.ac.resume?.()
      if (!this.ruis) {
        const n = this.ac.sampleRate * 2
        this.ruis = this.ac.createBuffer(1, n, this.ac.sampleRate)
        const d = this.ruis.getChannelData(0)
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
        // Een compressor als limiter: de finale mag luid zijn, maar niet kraken.
        const comp = this.ac.createDynamicsCompressor()
        comp.threshold.value = -14
        comp.ratio.value = 8
        this.uit = this.ac.createGain()
        this.uit.gain.value = 0.9
        this.uit.connect(comp).connect(this.ac.destination)
      }
    } catch {
      this.ac = null
    }
  }

  private bron(duur: number, wanneer: number) {
    const ac = this.ac!
    const s = ac.createBufferSource()
    s.buffer = this.ruis
    s.loop = duur > 1.9
    s.start(wanneer, Math.random() * 1.5)
    s.stop(wanneer + duur)
    return s
  }

  /** De klap van een bom; `afstand` in m (geluid reist 343 m/s), `kracht` 0–1.5. */
  boem(afstand: number, kracht = 1) {
    const ac = this.ac
    if (!ac || !this.uit) return
    const t = ac.currentTime + afstand / 343
    const luid = Math.min(1, 90 / Math.max(40, afstand)) * kracht
    const s = this.bron(2.2, t)
    const f = ac.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(1800, t)
    f.frequency.exponentialRampToValueAtTime(120, t + 1.2)
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.9 * luid, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0)
    s.connect(f).connect(g).connect(this.uit)
    // De diepe dreun eronder.
    const o = ac.createOscillator()
    o.frequency.setValueAtTime(70, t)
    o.frequency.exponentialRampToValueAtTime(32, t + 0.6)
    const og = ac.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.8 * luid, t + 0.01)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    o.connect(og).connect(this.uit)
    o.start(t)
    o.stop(t + 1)
  }

  /** Het afschieten uit de mortier: een doffe plof, en soms een fluittoon die opstijgt. */
  plof(afstand: number, fluit: boolean) {
    const ac = this.ac
    if (!ac || !this.uit) return
    const t = ac.currentTime + afstand / 343
    const luid = Math.min(1, 60 / Math.max(30, afstand))
    const s = this.bron(0.3, t)
    const f = ac.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 500
    const g = ac.createGain()
    g.gain.setValueAtTime(0.5 * luid, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    s.connect(f).connect(g).connect(this.uit)
    if (fluit) {
      const o = ac.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(900, t + 0.05)
      o.frequency.exponentialRampToValueAtTime(2600, t + 1.6)
      const og = ac.createGain()
      og.gain.setValueAtTime(0.0001, t)
      og.gain.exponentialRampToValueAtTime(0.06 * luid, t + 0.2)
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.7)
      o.connect(og).connect(this.uit)
      o.start(t)
      o.stop(t + 1.8)
    }
  }

  /** Geknetter: een regen van korte tikjes. */
  knetter(afstand: number, duur: number) {
    const ac = this.ac
    if (!ac || !this.uit) return
    const t0 = ac.currentTime + afstand / 343 + 0.25
    const luid = Math.min(1, 80 / Math.max(40, afstand))
    const n = Math.floor(duur * 70)
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.random() * duur
      const s = this.bron(0.02, t)
      const f = ac.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 2500 + Math.random() * 3000
      const g = ac.createGain()
      g.gain.setValueAtTime(0.25 * luid * Math.random(), t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018)
      s.connect(f).connect(g).connect(this.uit)
    }
  }

  /** Het gebulder van een formatie jets die overvliegt (aanzwellen, doppler, wegsterven). */
  jets(over: number) {
    const ac = this.ac
    if (!ac || !this.uit) return
    const t = ac.currentTime
    const s = this.bron(over + 6, t)
    const f = ac.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 0.7
    f.frequency.setValueAtTime(500, t)
    f.frequency.linearRampToValueAtTime(1400, t + over)
    f.frequency.exponentialRampToValueAtTime(260, t + over + 4)
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.6, t + over)
    g.gain.exponentialRampToValueAtTime(0.0001, t + over + 5.5)
    s.connect(f).connect(g).connect(this.uit)
  }

  /** Een piep bij het aftellen. */
  piep(laatste: boolean) {
    const ac = this.ac
    if (!ac || !this.uit) return
    const t = ac.currentTime
    const o = ac.createOscillator()
    o.type = 'square'
    o.frequency.value = laatste ? 1320 : 880
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (laatste ? 0.7 : 0.18))
    o.connect(g).connect(this.uit)
    o.start(t)
    o.stop(t + 0.8)
  }
}

// ---------- de jets ----------

function jetGeometrie(): { romp: THREE.BufferGeometry; kleur: THREE.BufferGeometry; kap: THREE.BufferGeometry } {
  // Neus naar +z, lengte ± 12 m.
  const romp = new THREE.CylinderGeometry(0.75, 0.6, 9, 14).rotateX(Math.PI / 2)
  const neus = new THREE.ConeGeometry(0.75, 3, 14).rotateX(Math.PI / 2).translate(0, 0, 6)
  const vleugel = new THREE.BufferGeometry()
  // Een deltavleugel (twee driehoeken met wat dikte).
  const vl = [
    [0, 0, 2.2],
    [-5.2, -0.1, -2.6],
    [5.2, -0.1, -2.6],
    [0, 0, -3.2],
  ]
  const p: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c)
  tri(vl[0], vl[1], vl[3])
  tri(vl[0], vl[3], vl[2])
  tri(vl[0], vl[3], vl[1])
  tri(vl[0], vl[2], vl[3])
  vleugel.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  vleugel.computeVertexNormals()
  const staart = new THREE.BufferGeometry()
  staart.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, -1.8, 0, 3.2, -4.6, 0, 0.5, -4.4, 0, 0.5, -1.8, 0, 0.5, -4.4, 0, 3.2, -4.6], 3))
  staart.computeVertexNormals()
  const hoogteroer = new THREE.BufferGeometry()
  hoogteroer.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -3, -2.2, 0, -4.6, 2.2, 0, -4.6, 0, 0, -3, 2.2, 0, -4.6, -2.2, 0, -4.6], 3))
  hoogteroer.computeVertexNormals()
  const kap = new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 2.6).translate(0, 0.45, 2.2)
  // De vleugeltips en de neus in clubkleur.
  const tips = mergeGeometries([new THREE.ConeGeometry(0.76, 1.2, 14).rotateX(Math.PI / 2).translate(0, 0, 6.9), new THREE.BoxGeometry(1.4, 0.12, 0.9).translate(-4.4, -0.1, -2.2), new THREE.BoxGeometry(1.4, 0.12, 0.9).translate(4.4, -0.1, -2.2)])
  const strip = (g: THREE.BufferGeometry) => g.toNonIndexed()
  return {
    romp: mergeGeometries([strip(romp), strip(neus), vleugel, staart, hoogteroer].map((g) => { g.deleteAttribute('uv'); return g })),
    kleur: tips,
    kap,
  }
}

type Jet = { groep: THREE.Group; pos: THREE.Vector3; vel: THREE.Vector3; rook: Kleur; brander: THREE.Sprite; navL: THREE.Mesh; navR: THREE.Mesh }

// ---------- de knop ----------

export type VuurwerkKnop = {
  /** Sta je bij de knop (op het dak)? */
  bij: (x: number, z: number) => boolean
  /** Botsvlak (de zuil). */
  obstakel: { x0: number; x1: number; z0: number; z1: number }
  druk: () => void
  update: (seconden: number, klaar: boolean) => void
}

function bouwKnop(scene: THREE.Scene, x: number, y: number, z: number, ry: number, primair: string): VuurwerkKnop {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = ry
  scene.add(g)
  const staal = new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.8, roughness: 0.35 })
  const zuil = new THREE.Mesh(rondeDoos(0.6, 1.0, 0.6, 0.06), staal)
  zuil.position.y = 0.5
  g.add(zuil)
  // Geel-zwarte waarschuwingsstrepen rond de kop.
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const x2 = c.getContext('2d')!
  x2.fillStyle = '#facc15'
  x2.fillRect(0, 0, 256, 32)
  x2.fillStyle = '#111'
  for (let i = -2; i < 18; i++) {
    x2.beginPath()
    x2.moveTo(i * 16, 32)
    x2.lineTo(i * 16 + 8, 32)
    x2.lineTo(i * 16 + 24, 0)
    x2.lineTo(i * 16 + 16, 0)
    x2.fill()
  }
  const strepen = new THREE.CanvasTexture(c)
  strepen.colorSpace = THREE.SRGBColorSpace
  strepen.wrapS = THREE.RepeatWrapping
  const kraag = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 32, 1, true), new THREE.MeshStandardMaterial({ map: strepen, roughness: 0.5, side: THREE.DoubleSide }))
  kraag.position.y = 1.06
  g.add(kraag)
  const plaat = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 32), new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.6, roughness: 0.3 }))
  plaat.position.y = 1.12
  g.add(plaat)
  // De knop zelf: een rode koepel die gloeit.
  const rood = new THREE.MeshStandardMaterial({ color: '#e11d2e', roughness: 0.25, emissive: '#ff1a1a', emissiveIntensity: 0.6 })
  const knop = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), rood)
  knop.position.y = 1.135
  g.add(knop)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 10, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 1, roughness: 0.2 }))
  ring.position.y = 1.14
  g.add(ring)
  // Het glazen kapje, opengeklapt naar achter.
  const kapje = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }),
  )
  kapje.position.set(0, 1.15, -0.3)
  kapje.rotation.x = -1.9
  kapje.geometry.translate(0, 0, 0.3)
  g.add(kapje)
  // Een gloed rond de knop (in de nabewerking straalt die uit).
  const gloed = new THREE.Sprite(new THREE.SpriteMaterial({ map: zachteVlek(), color: '#ff2a2a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }))
  gloed.scale.set(1.3, 1.3, 1)
  gloed.position.y = 1.2
  g.add(gloed)
  // Een bordje: "Druk voor vuurwerk".
  const b = document.createElement('canvas')
  b.width = 512
  b.height = 160
  const bx = b.getContext('2d')!
  bx.fillStyle = '#0b0f17'
  bx.fillRect(0, 0, 512, 160)
  bx.strokeStyle = primair
  bx.lineWidth = 10
  bx.strokeRect(5, 5, 502, 150)
  bx.fillStyle = '#fff'
  bx.textAlign = 'center'
  bx.font = '900 54px Inter, sans-serif'
  bx.fillText('🎆 DRUK VOOR', 256, 70)
  bx.fillStyle = '#facc15'
  bx.fillText('VUURWERK', 256, 132)
  const bordTex = new THREE.CanvasTexture(b)
  bordTex.colorSpace = THREE.SRGBColorSpace
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.18), new THREE.MeshBasicMaterial({ map: bordTex, toneMapped: false }))
  bord.position.set(0, 0.8, 0.305)
  g.add(bord)

  const wereld = new THREE.Vector3(x, y, z)
  let ingedrukt = -10
  return {
    bij: (px, pz) => Math.hypot(px - wereld.x, pz - wereld.z) < 1.8,
    obstakel: { x0: x - 0.38, x1: x + 0.38, z0: z - 0.38, z1: z + 0.38 },
    druk() {
      ingedrukt = performance.now() / 1000
    },
    update(s, klaar) {
      const sinds = performance.now() / 1000 - ingedrukt
      // Indrukken en terugveren.
      knop.position.y = 1.135 - 0.05 * Math.max(0, 1 - sinds * 3)
      // Klaar om te drukken: de knop pulseert; tijdens de show is hij donker.
      const p = klaar ? 0.5 + 0.5 * Math.sin(s * 4) : 0.05
      rood.emissiveIntensity = 0.25 + p * 1.1
      ;(gloed.material as THREE.SpriteMaterial).opacity = klaar ? 0.35 + p * 0.55 : 0.08
    },
  }
}

let vlekCache: THREE.Texture | null = null
function zachteVlek() {
  if (vlekCache) return vlekCache
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.25, 'rgba(255,255,255,.5)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  vlekCache = new THREE.CanvasTexture(c)
  return vlekCache
}

// ---------- de show ----------

type Soort = 'pioen' | 'ring' | 'palm' | 'wilg' | 'glitter' | 'saluut' | 'club' | 'kroon' | 'hart'
type Bom = { pos: THREE.Vector3; vel: THREE.Vector3; lont: number; soort: Soort; kleur: Kleur; kleur2: Kleur; grootte: number }
type Komeet = { pos: THREE.Vector3; vel: THREE.Vector3; tot: number; kleur: Kleur; sterk: number }

export type Vuurwerk = {
  knop: VuurwerkKnop
  /** Loopt de show (of het aftellen)? */
  bezig: () => boolean
  /** Start de show. */
  start: () => void
  /** Maak het geluid wakker (bij het indrukken: browsers willen een tik van de gebruiker). */
  wek: () => void
  piep: (laatste: boolean) => void
  /** Hoe fel de lucht nu oplicht (0–1), voor de belichting van het stadion. */
  flits: () => number
  update: (seconden: number, dt: number, camera: THREE.PerspectiveCamera, hoogte: number) => void
  dispose: () => void
}

export function bouwVuurwerk(
  scene: THREE.Scene,
  opt: { primair: string; secundair: string; licht: boolean; knop: { x: number; y: number; z: number; ry: number } },
): Vuurwerk {
  const licht = opt.licht
  const vonken = new Wolk(licht ? 70000 : 140000, false)
  const rook = new Wolk(licht ? 3000 : 9000, true)
  scene.add(vonken.punten, rook.punten)
  const geluid = new Geluid()
  const knop = bouwKnop(scene, opt.knop.x, opt.knop.y, opt.knop.z, opt.knop.ry, opt.primair)
  const P = new THREE.Color(opt.primair)
  const S = new THREE.Color(opt.secundair)
  // Clubkleuren die te donker zijn voor vuurwerk een beetje oplichten.
  for (const k of [P, S]) {
    const hsl = { h: 0, s: 0, l: 0 }
    k.getHSL(hsl)
    k.setHSL(hsl.h, Math.max(0.55, hsl.s), Math.min(0.75, Math.max(0.5, hsl.l)))
  }
  const WIT = new THREE.Color('#ffffff')
  const GOUD = new THREE.Color('#ffb347')
  const ZILVER = new THREE.Color('#dfe8ff')
  const PALET = [P, S, GOUD, ZILVER, new THREE.Color('#ff3b6b'), new THREE.Color('#38bdf8'), new THREE.Color('#a3e635'), new THREE.Color('#c084fc')]
  const kies = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]
  const veel = licht ? 0.7 : 1

  // Flitsen: lichtbollen op de plaats van een knal, en een licht dat het stadion even verlicht.
  const flitsen = Array.from({ length: 10 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zachteVlek(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }))
    sp.frustumCulled = false
    scene.add(sp)
    return { sp, t: -10, sterk: 0 }
  })
  let flitsI = 0
  const flitsLicht = licht ? null : new THREE.PointLight('#ffffff', 0, 520, 1.2)
  if (flitsLicht) scene.add(flitsLicht)
  let flitsNiveau = 0

  // De jets.
  const jg = jetGeometrie()
  const wit = new THREE.MeshStandardMaterial({ color: '#f1f5f9', metalness: 0.4, roughness: 0.35 })
  const clubMat = new THREE.MeshStandardMaterial({ color: opt.primair, metalness: 0.3, roughness: 0.4 })
  const kapMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.9, roughness: 0.1 })
  const jets: Jet[] = Array.from({ length: 5 }, (_, i) => {
    const groep = new THREE.Group()
    groep.add(new THREE.Mesh(jg.romp, wit), new THREE.Mesh(jg.kleur, clubMat), new THREE.Mesh(jg.kap, kapMat))
    const brander = new THREE.Sprite(new THREE.SpriteMaterial({ map: zachteVlek(), color: '#ffb066', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
    brander.scale.set(4, 4, 1)
    brander.position.set(0, 0, -4.8)
    groep.add(brander)
    const nav = (kleur: string, x: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: kleur, toneMapped: false }))
      m.position.set(x, -0.05, -2.4)
      groep.add(m)
      return m
    }
    const navL = nav('#ff2020', -5.2)
    const navR = nav('#20ff60', 5.2)
    groep.visible = false
    scene.add(groep)
    const rookKleuren = [P, S, WIT, S, P]
    return { groep, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rook: rookKleuren[i].clone(), brander, navL, navR }
  })

  let t0 = -1 // start van de show (in seconden van de klok hieronder)
  let klok = 0
  // De deeltjes tellen hun tijd vanaf een vast nulpunt (zodat een tweede show de eerste niet terugroept).
  let basis = -1
  const nu = () => klok - basis
  let volgende = 0 // tijd van de volgende afschieting
  let pas = 0 // welke vliegpas er al gestart is
  const bommen: Bom[] = []
  const kometen: Komeet[] = []
  const tmp = new THREE.Vector3()
  const cam = new THREE.Vector3()

  // Waar de mortieren staan: rond het veld en achter de tribunes, plus een paar ver weg.
  // (Ver genoeg weg zodat je vanop het dak, waar je ook staat, de bommen vóór je ziet openbarsten.)
  const mortier = () => {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() < 0.25 ? Math.random() * 25 : 75 + Math.random() * 85
    return new THREE.Vector3(Math.cos(a) * r * 1.25, 0, Math.sin(a) * r)
  }
  // Een vonk met een gloeiende staart: twee kopieën die net later dezelfde baan volgen.
  const vonk = (px: number, py: number, pz: number, vx: number, vy: number, vz: number, t: number, leven: number, weerstand: number, zwaarte: number, k: Kleur, grootte: number, flikker = 0) => {
    vonken.zet(px, py, pz, vx, vy, vz, t, leven, weerstand, zwaarte, k, grootte, flikker)
    vonken.zet(px, py, pz, vx, vy, vz, t + 0.035, leven * 0.85, weerstand, zwaarte, k, grootte * 0.7, flikker)
    vonken.zet(px, py, pz, vx, vy, vz, t + 0.075, leven * 0.7, weerstand, zwaarte, k, grootte * 0.45, flikker)
  }

  const schiet = (soort: Soort, opts: Partial<{ van: THREE.Vector3; hoogte: number; kleur: Kleur; kleur2: Kleur; grootte: number }> = {}) => {
    const van = opts.van ?? mortier()
    const hoogte = opts.hoogte ?? 60 + Math.random() * 55
    // Snelheid zodat de bom op de gewenste hoogte stilvalt (ongeveer: v = √(2gh), met wat weerstand).
    const vy = Math.sqrt(2 * 9.8 * hoogte) * 1.08
    const vel = new THREE.Vector3((Math.random() - 0.5) * 8, vy, (Math.random() - 0.5) * 8)
    const kleur = opts.kleur ?? kies(PALET)
    bommen.push({ pos: van.clone(), vel, lont: vy / 9.8 * 0.96, soort, kleur, kleur2: opts.kleur2 ?? kies(PALET), grootte: opts.grootte ?? 0.85 + Math.random() * 0.5 })
    geluid.plof(cam.distanceTo(van), Math.random() < 0.3)
  }

  const flits = (p: THREE.Vector3, kleur: Kleur, sterk: number) => {
    const f = flitsen[flitsI++ % flitsen.length]
    f.sp.position.copy(p)
    ;(f.sp.material as THREE.SpriteMaterial).color.copy(kleur).lerp(WIT, 0.5)
    f.t = klok
    f.sterk = sterk
    if (flitsLicht && sterk > flitsNiveau * 0.6) {
      flitsLicht.position.copy(p)
      flitsLicht.color.copy(kleur).lerp(WIT, 0.4)
      flitsNiveau = sterk
    }
  }

  // Een bolvormige verdeling (gelijkmatig over de bol, met een beetje toeval).
  const bolRichting = (i: number, n: number, uit: THREE.Vector3) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.39996 + Math.random() * 0.2
    return uit.set(Math.cos(a) * r, y, Math.sin(a) * r)
  }

  const ontplof = (b: Bom) => {
    const t = nu()
    const p = b.pos
    const g = b.grootte
    const n = Math.round((b.soort === 'wilg' ? 260 : b.soort === 'glitter' ? 320 : b.soort === 'saluut' ? 60 : 380) * g * veel)
    const afstand = cam.distanceTo(p)
    switch (b.soort) {
      case 'pioen':
      case 'club': {
        const v = 54 * g
        for (let i = 0; i < n; i++) {
          bolRichting(i, n, tmp)
          const k = b.soort === 'club' ? (i % 2 ? P : S) : i % 7 === 0 ? b.kleur2 : b.kleur
          const s = v * (0.9 + Math.random() * 0.2)
          vonk(p.x, p.y, p.z, tmp.x * s, tmp.y * s, tmp.z * s, t, 2.6 + Math.random() * 0.9, 1.25, 6, k, 3.4)
        }
        // Een kern van een andere kleur (dubbele pioen).
        const kern = Math.round(n * 0.3)
        for (let i = 0; i < kern; i++) {
          bolRichting(i, kern, tmp)
          const s = v * 0.45
          vonk(p.x, p.y, p.z, tmp.x * s, tmp.y * s, tmp.z * s, t + 0.05, 2, 1.25, 6, b.soort === 'club' ? WIT : b.kleur2, 2.6)
        }
        flits(p, b.kleur, 1)
        geluid.boem(afstand, 1)
        break
      }
      case 'ring': {
        // Een ring in een schuin vlak, met een stip in het midden.
        const as1 = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize()
        const as2 = new THREE.Vector3(0, 1, 0).cross(as1).normalize()
        const as3 = as1.clone().cross(as2)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          tmp.copy(as2).multiplyScalar(Math.cos(a)).addScaledVector(as3, Math.sin(a))
          const s = 58 * g
          vonk(p.x, p.y, p.z, tmp.x * s, tmp.y * s, tmp.z * s, t, 2.6, 1.3, 5, b.kleur, 3.4)
        }
        for (let i = 0; i < 40 * veel; i++) {
          bolRichting(i, 40, tmp)
          vonken.zet(p.x, p.y, p.z, tmp.x * 6, tmp.y * 6, tmp.z * 6, t, 1.6, 1.5, 4, b.kleur2, 2)
        }
        flits(p, b.kleur, 0.8)
        geluid.boem(afstand, 0.9)
        break
      }
      case 'hart': {
        // Een hart in clubkleur, rechtop, naar de kijker gedraaid.
        const naarCam = cam.clone().sub(p).setY(0).normalize()
        const rechts = new THREE.Vector3(0, 1, 0).cross(naarCam).normalize()
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          const hx = 16 * Math.pow(Math.sin(a), 3)
          const hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)
          tmp.copy(rechts).multiplyScalar(hx).add(new THREE.Vector3(0, hy, 0)).multiplyScalar(3.2 * g)
          vonk(p.x, p.y, p.z, tmp.x, tmp.y, tmp.z, t, 2.8, 1.4, 2.5, P, 3.4)
        }
        flits(p, P, 0.9)
        geluid.boem(afstand, 1)
        break
      }
      case 'palm': {
        // Dikke kometen die een spoor trekken, als de bladeren van een palm.
        const m = Math.round(9 * Math.max(0.6, veel))
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2
          const v = new THREE.Vector3(Math.cos(a) * 40 * g, 18 + Math.random() * 8, Math.sin(a) * 40 * g)
          kometen.push({ pos: p.clone(), vel: v, tot: klok + 2.2, kleur: b.kleur, sterk: 1 })
        }
        flits(p, GOUD, 0.7)
        geluid.boem(afstand, 0.8)
        break
      }
      case 'wilg':
      case 'kroon': {
        // Gouden treurwilg (kamuro): lang brandende vonken die traag uitzakken, flikkerend.
        const v = (b.soort === 'kroon' ? 42 : 34) * g
        for (let i = 0; i < n; i++) {
          bolRichting(i, n, tmp)
          const s = v * (0.85 + Math.random() * 0.3)
          vonk(p.x, p.y, p.z, tmp.x * s, tmp.y * s, tmp.z * s, t, 4.5 + Math.random() * 1.5, 0.75, 7, GOUD, 3.4, 0.5)
        }
        // Ze laten een gloeiend spoor achter: een tweede laag vonken die net wat later en trager is.
        for (let i = 0; i < n * 0.6; i++) {
          bolRichting(i, n * 0.6, tmp)
          const s = v * 0.8
          vonken.zet(p.x, p.y, p.z, tmp.x * s, tmp.y * s, tmp.z * s, t + 0.12, 5, 0.9, 7, new THREE.Color('#ff9a3c'), 2.4, 0.8)
        }
        flits(p, GOUD, 1.1)
        geluid.boem(afstand, 1.1)
        geluid.knetter(afstand, 2.5)
        break
      }
      case 'glitter': {
        for (let i = 0; i < n; i++) {
          bolRichting(i, n, tmp)
          const s = 46 * g * (0.7 + Math.random() * 0.4)
          vonk(p.x, p.y, p.z, tmp.x * s, tmp.y * s, tmp.z * s, t, 2.8 + Math.random(), 1.2, 5, ZILVER, 2.8, 1)
        }
        flits(p, ZILVER, 0.7)
        geluid.boem(afstand, 0.8)
        geluid.knetter(afstand, 2.2)
        break
      }
      case 'saluut': {
        // Een witte flits met een harde knal.
        for (let i = 0; i < n; i++) {
          bolRichting(i, n, tmp)
          vonken.zet(p.x, p.y, p.z, tmp.x * 22, tmp.y * 22, tmp.z * 22, t, 0.5, 3, 2, WIT, 5)
        }
        flits(p, WIT, 1.6)
        geluid.boem(afstand, 1.5)
        break
      }
    }
  }

  // Het draaiboek: wat er wanneer gebeurt (in seconden na de start).
  const draaiboek = (t: number) => {
    if (t < 1.2) return
    if (t < 3) {
      // Opening: drie witte saluutschoten na elkaar.
      if (volgende < 1.3) {
        for (let i = 0; i < 3; i++) schiet('saluut', { van: new THREE.Vector3(-30 + i * 30, 0, 0), hoogte: 60 + i * 12 })
        volgende = 4
      }
      return
    }
    if (t < volgende) return
    const r = Math.random()
    if (t < 22) {
      schiet(r < 0.3 ? 'pioen' : r < 0.45 ? 'ring' : r < 0.6 ? 'palm' : r < 0.75 ? 'glitter' : r < 0.88 ? 'wilg' : 'saluut')
      if (Math.random() < 0.3) schiet('pioen')
      volgende = t + 0.55 + Math.random() * 0.7
    } else if (t < 30) {
      // In de clubkleuren: ringen, harten en pioenen in de twee kleuren.
      const s: Soort = r < 0.4 ? 'club' : r < 0.7 ? 'ring' : 'hart'
      schiet(s, { kleur: Math.random() < 0.5 ? P : S, kleur2: WIT, hoogte: 90 + Math.random() * 40 })
      volgende = t + 0.7 + Math.random() * 0.5
    } else if (t < 38) {
      // Rustiger terwijl de jets hun bloem tekenen, met een paar hoge treurwilgen.
      schiet(r < 0.5 ? 'wilg' : 'glitter', { hoogte: 120 + Math.random() * 30 })
      volgende = t + 1.6 + Math.random()
    } else if (t < 50) {
      schiet(r < 0.25 ? 'pioen' : r < 0.45 ? 'palm' : r < 0.6 ? 'ring' : r < 0.8 ? 'glitter' : 'club')
      schiet(Math.random() < 0.5 ? 'pioen' : 'wilg')
      volgende = t + 0.35 + Math.random() * 0.45
    } else if (t < 57.5) {
      // DE FINALE: alles tegelijk, steeds sneller.
      const n = Math.max(1, Math.round((licht ? 1.5 : 2) * (1 + (t - 50) / 4)))
      for (let i = 0; i < n; i++) schiet(kies<Soort>(['pioen', 'club', 'glitter', 'ring', 'palm', 'saluut', 'pioen']), { hoogte: 60 + Math.random() * 100 })
      volgende = t + 0.3
    } else if (t < 58.5) {
      // Het slot: een gordijn van gouden kronen over de hele breedte, en drie dreunen.
      if (volgende < 58) {
        for (let i = 0; i < (licht ? 4 : 9); i++) schiet('kroon', { van: new THREE.Vector3(-100 + i * (200 / 8), 0, (Math.random() - 0.5) * 30), hoogte: 110 + Math.random() * 25, grootte: 1.4 })
        for (let i = 0; i < 3; i++) schiet('saluut', { hoogte: 70 + i * 10 })
        volgende = 99
      }
    }
  }

  // De vliegpassen.
  const startPas = (welke: 1 | 2) => {
    const kant = Math.random() < 0.5 ? -1 : 1
    jets.forEach((j, i) => {
      j.groep.visible = true
      if (welke === 1) {
        // Een V-formatie, laag dwars over het veld.
        const rij = Math.ceil(i / 2)
        const zij = i === 0 ? 0 : i % 2 ? -1 : 1
        j.pos.set(-760 * kant - rij * 20 * kant, 72 - rij * 3, -8 + zij * rij * 15)
        j.vel.set(125 * kant, 0, 0)
      } else {
        // Recht op het stadion af, en boven het veld trekken ze op en waaieren open.
        j.pos.set((i - 2) * 9, 52 - Math.abs(i - 2) * 2, 760 * kant + Math.abs(i - 2) * 14 * kant)
        j.vel.set(0, 0, -120 * kant)
      }
    })
    geluid.jets(welke === 1 ? 6 : 6.4)
  }
  const bombBurst = (j: Jet, i: number, dt: number) => {
    // Na het midden: de neus omhoog, en dan elk in zijn eigen richting (een waaier).
    const voorbij = j.vel.z < 0 ? j.pos.z < 25 : j.pos.z > -25
    if (!voorbij) return
    const fan = ((i - 2) / 2) * 1.1
    const doel = new THREE.Vector3(Math.sin(fan) * 0.9, Math.cos(fan), Math.sign(j.vel.z) * 0.25).normalize().multiplyScalar(120)
    j.vel.lerp(doel, Math.min(1, dt * 1.4)).setLength(120)
  }

  const voorRichting = new THREE.Vector3()
  return {
    knop,
    bezig: () => t0 >= 0,
    start() {
      geluid.wek()
      t0 = klok
      volgende = 0
      pas = 0
    },
    wek: () => geluid.wek(),
    piep: (laatste) => geluid.piep(laatste),
    flits: () => flitsNiveau,
    update(seconden, dt, camera, hoogte) {
      klok = seconden
      if (basis < 0) basis = seconden
      cam.copy(camera.position)
      vonken.mat.uniforms.uTijd.value = rook.mat.uniforms.uTijd.value = nu()
      vonken.mat.uniforms.uSchaal.value = rook.mat.uniforms.uSchaal.value = hoogte / (2 * Math.tan((camera.fov * Math.PI) / 360))
      knop.update(seconden, t0 < 0)
      if (t0 < 0) return
      const show = seconden - t0
      const t = nu()
      if (show > SHOW_DUUR) {
        t0 = -1
        jets.forEach((j) => (j.groep.visible = false))
        flitsNiveau = 0
        if (flitsLicht) flitsLicht.intensity = 0
        return
      }
      draaiboek(show)
      // De bommen in de lucht: ze stijgen, trekken een spoor, en ontploffen op hun hoogste punt.
      for (let i = bommen.length - 1; i >= 0; i--) {
        const b = bommen[i]
        b.vel.y -= 9.8 * dt
        b.vel.multiplyScalar(1 - 0.02 * dt)
        b.pos.addScaledVector(b.vel, dt)
        b.lont -= dt
        const n = licht ? 1 : 3
        for (let k = 0; k < n; k++)
          vonken.zet(b.pos.x, b.pos.y, b.pos.z, (Math.random() - 0.5) * 3, -4 - Math.random() * 4, (Math.random() - 0.5) * 3, t, 0.5 + Math.random() * 0.4, 2, 4, GOUD, 1.2, 0.3)
        if (b.lont <= 0) {
          ontplof(b)
          bommen.splice(i, 1)
        }
      }
      for (let i = kometen.length - 1; i >= 0; i--) {
        const k = kometen[i]
        k.vel.y -= 9.8 * dt
        k.vel.multiplyScalar(1 - 0.9 * dt)
        k.pos.addScaledVector(k.vel, dt)
        const n = licht ? 2 : 5
        for (let q = 0; q < n; q++) vonken.zet(k.pos.x, k.pos.y, k.pos.z, (Math.random() - 0.5) * 2, -2 - Math.random() * 3, (Math.random() - 0.5) * 2, t, 1.6 + Math.random(), 1.2, 5, q % 2 ? GOUD : k.kleur, 2.6, 0.4)
        if (klok > k.tot) kometen.splice(i, 1)
      }
      // De jets.
      if (pas < 1 && show > 3) {
        pas = 1
        startPas(1)
      }
      if (pas < 2 && show > 29) {
        pas = 2
        startPas(2)
      }
      jets.forEach((j, i) => {
        if (!j.groep.visible) return
        if (pas === 2) bombBurst(j, i, dt)
        j.pos.addScaledVector(j.vel, dt)
        voorRichting.copy(j.pos).add(j.vel)
        j.groep.position.copy(j.pos)
        j.groep.lookAt(voorRichting)
        // Rook aan zolang ze boven of vlakbij het stadion zijn.
        const dichtbij = Math.hypot(j.pos.x, j.pos.z) < 420
        if (dichtbij) {
          const stap = licht ? 4 : 1.6
          const n = Math.max(1, Math.round((j.vel.length() * dt) / stap))
          for (let q = 0; q < n; q++) {
            const f = q / n
            const px = j.pos.x - j.vel.x * dt * f - (j.vel.x / 120) * 6
            const py = j.pos.y - j.vel.y * dt * f - (j.vel.y / 120) * 6
            const pz = j.pos.z - j.vel.z * dt * f - (j.vel.z / 120) * 6
            rook.zet(px, py, pz, (Math.random() - 0.5) * 1.5, -0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 1.5, t, 13 + Math.random() * 3, 0.3, 0.15, j.rook, 3.2, 0, 0.35)
          }
        }
        ;(j.brander.material as THREE.SpriteMaterial).opacity = 0.6 + Math.random() * 0.4
        const knip = Math.floor(seconden * 2.2 + i) % 2 === 0
        j.navL.visible = j.navR.visible = knip
        if (Math.hypot(j.pos.x, j.pos.z) > 900 || j.pos.y > 700) j.groep.visible = false
      })
      // De flitsen doven uit.
      for (const f of flitsen) {
        const a = klok - f.t
        const m = f.sp.material as THREE.SpriteMaterial
        m.opacity = a < 0.35 ? (1 - a / 0.35) * Math.min(1, f.sterk) : 0
        const s = 70 * f.sterk * (1 + a * 1.5)
        f.sp.scale.set(s, s, 1)
      }
      flitsNiveau *= Math.exp(-dt * 7)
      if (flitsLicht) flitsLicht.intensity = flitsNiveau * 9000
      vonken.stuur()
      rook.stuur()
    },
    dispose() {
      vonken.dispose()
      rook.dispose()
      jg.romp.dispose()
      jg.kleur.dispose()
      jg.kap.dispose()
    },
  }
}
