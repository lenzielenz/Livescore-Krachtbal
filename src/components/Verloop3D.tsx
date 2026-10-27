'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { saveOrShareBlob, slugFilename } from '@/lib/client-download'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn } from '@/lib/club-colors'
import { freeThrowNorm, goalLineNorm, totalLengthM } from '@/lib/field'
import type { ShotPoint } from '@/lib/match-engine'
import { bouwVerloop, standOp, tijdLabelOp, type Piek, type Verloop } from '@/lib/wedstrijdverloop'

// Het wedstrijdverloop als deelbaar 3D-beeld: het veld in de kleuren van beide clubs (elke helft
// in haar clubkleur, met banen), rondom wapperende vlaggen van beide clubs, op elke doelpoging een
// piek zo hoog als de punten die ze opleverde (een misser: zo hoog als het gevaar dat ze had), de
// stand bovenaan en de tijdlijn onderaan — afgespeeld over de wedstrijdtijd.
//
// Alles beweegt vloeiend in één doorlopende tekenlus: de vlaggen wapperen altijd, de camera zweeft
// zacht, een piek groeit met een kleine veerkracht en krijgt een lichtring als het een doelpunt
// is, de stand klopt even op als ze verandert, en verschuiven op de tijdlijn glijdt in plaats van
// te springen. Op een traag toestel tekent de lus de helft van de beelden; als de pagina verborgen
// is, staat ze stil.
//
// Eén beeld van 1080 × 1350 (4:5, voor Instagram en WhatsApp): three tekent de 3D-laag in een
// verborgen canvas, en elk beeld wordt met de kop en de tijdlijn samengesteld op het zichtbare
// canvas. Dat ene canvas is ook wat opgenomen (video) of bewaard (PNG) wordt. Het model (pieken,
// stand, tijdas) zit in lib/wedstrijdverloop.ts.

const W = 1080
const H = 1350
const KOP = 250
const VELD_H = 850
const TIJDLIJN_Y = KOP + VELD_H
/** Hoe lang de hele wedstrijd op de tijdas duurt bij snelheid 1, in seconden. */
const AFSPEELDUUR = 18
/** Even blijven staan op het eindbeeld (ook in de video). */
const NAHOUD = 1.6
/** Hoe lang een piek groeit, als deel van de tijdas. */
const GROEI = 0.03
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
const MAX_PIEK_M = 7
/** Hoe lang de lichtring rond een doelpunt uitdijt, in seconden. */
const RING_S = 1.2

type Kleuren = { home: string; away: string }
type Modus = 'stil' | 'speelt' | 'opname'

const hex = (s: string | null | undefined, terugval: string) => (s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : terugval)
const meng = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
const klem = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
/** Zacht uitlopen. */
const uitloop = (x: number) => 1 - Math.pow(1 - klem(x), 3)
/** Uitlopen met een kleine overschot: de piek veert even door voor ze stilstaat. */
const veer = (x: number) => {
  const k = klem(x)
  const c = 1.55
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2)
}
const rgba = (kleur: string, a: number) => {
  const c = new THREE.Color(kleur)
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`
}
const initialen = (naam: string) =>
  naam
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()

/** De grasmat als canvas: elke helft in haar clubkleur, met lichtere en donkere banen in de lengte. */
function veldTextuur(kleuren: Kleuren, lengteM: number, goalAreaDepth: number, speelveldM?: number): THREE.CanvasTexture {
  const PX = 32
  const w = 14 * PX
  const h = Math.round(lengteM * PX)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  for (let i = 0; i < 7; i++) {
    const licht = i % 2 === 0
    const tint = (k: string) => meng(k, licht ? '#ffffff' : '#000000', licht ? 0.1 : 0.22)
    const grad = g.createLinearGradient(0, 0, 0, h)
    // Een lange, zachte overgang in het midden: de twee clubkleuren vloeien in elkaar over.
    grad.addColorStop(0, tint(kleuren.home))
    grad.addColorStop(0.4, tint(kleuren.home))
    grad.addColorStop(0.6, tint(kleuren.away))
    grad.addColorStop(1, tint(kleuren.away))
    g.fillStyle = grad
    g.fillRect(i * 2 * PX, 0, 2 * PX, h)
  }
  // Een zachte glans over het hele veld (licht in het midden, donkerder naar de randen).
  const glans = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.62)
  glans.addColorStop(0, 'rgba(255,255,255,.06)')
  glans.addColorStop(1, 'rgba(0,0,0,.22)')
  g.fillStyle = glans
  g.fillRect(0, 0, w, h)
  const gl = goalLineNorm(goalAreaDepth, { speelveldM })
  g.fillStyle = 'rgba(0,0,0,.16)'
  g.fillRect(0, 0, w, gl * h)
  g.fillRect(0, (1 - gl) * h, w, gl * h)
  g.strokeStyle = 'rgba(255,255,255,.92)'
  g.lineWidth = 0.12 * PX
  g.lineCap = 'round'
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth)
  const ft = freeThrowNorm(goalAreaDepth, { speelveldM })
  for (const y of [gl, 1 - gl, ft, 1 - ft, 0.5]) {
    g.beginPath()
    g.moveTo(0, y * h)
    g.lineTo(w, y * h)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Een clubvlag: de clubkleur met een lichte diagonale baan, een zoom aan de stok en de initialen. */
function vlagTextuur(kleur: string, naam: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 512, 320)
  grad.addColorStop(0, meng(kleur, '#ffffff', 0.08))
  grad.addColorStop(1, meng(kleur, '#000000', 0.18))
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 320)
  g.save()
  g.translate(256, 160)
  g.rotate(-0.42)
  g.fillStyle = rgba(meng(kleur, '#ffffff', 0.55), 0.55)
  g.fillRect(-400, -34, 800, 68)
  g.restore()
  g.fillStyle = meng(kleur, '#000000', 0.35)
  g.fillRect(0, 0, 26, 320)
  g.fillStyle = inkOn(kleur)
  g.font = `900 132px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = 'rgba(0,0,0,.35)'
  g.shadowBlur = 12
  g.fillText(initialen(naam) || 'KB', 276, 168, 430)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Een zachte, ronde lichtvlek (voor de gloed onder een piek). */
function gloedTextuur(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,.45)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

// Wapperen in de vertex shader: twee golven die van de stok weg lopen, sterker naar het vrije uiteinde;
// het doek hangt daar ook een tikje door. De plooien krijgen licht en schaduw mee naar de fragment shader.
const VLAG_VS = /* glsl */ `
  uniform float uTijd;
  uniform float uFase;
  varying vec2 vUv;
  varying float vPlooi;
  void main() {
    vUv = uv;
    vec3 p = position;
    float k = uv.x;
    float a = uv.x * 5.2 - uTijd * 3.6 + uFase;
    float b = uv.x * 10.5 + uv.y * 2.2 - uTijd * 5.7 + uFase * 1.7;
    p.z += (sin(a) * 0.36 + sin(b) * 0.09) * k;
    p.y += -k * k * 0.14 + sin(a * 0.8 + 1.3) * 0.05 * k;
    vPlooi = (cos(a) * 0.8 + cos(b) * 0.35) * k;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const VLAG_FS = /* glsl */ `
  uniform sampler2D uKaart;
  varying vec2 vUv;
  varying float vPlooi;
  void main() {
    vec4 c = texture2D(uKaart, vUv);
    float licht = clamp(0.86 + vPlooi * 0.22, 0.55, 1.18);
    gl_FragColor = vec4(c.rgb * licht, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

type PiekObj = {
  piek: Piek
  spits: THREE.Mesh
  top: THREE.Mesh | null
  gloed: THREE.Mesh
  ring: THREE.Mesh | null
  /** Het moment (seconden, echte tijd) waarop de piek verscheen; -1 = nog niet. */
  flits: number
  fase: number
}

type Scene3D = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  pieken: PiekObj[]
  tijd: { value: number }
  lengteM: number
  /** Camera al eens geplaatst (de eerste keer zonder naglijden). */
  geplaatst: boolean
  dispose: () => void
}

function bouwScene(canvas: HTMLCanvasElement, verloop: Verloop, kleuren: Kleuren, teams: { home: string; away: string }, goalAreaDepth: number, speelveldM?: number): Scene3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(W, VELD_H, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#0e141c', 48, 120)
  const camera = new THREE.PerspectiveCamera(36, W / VELD_H, 1, 400)
  const lengteM = totalLengthM(goalAreaDepth, { speelveldM })
  const L2 = lengteM / 2

  scene.add(new THREE.HemisphereLight('#ffffff', '#1a2029', 0.9))
  const zon = new THREE.DirectionalLight('#fff4e0', 1.5)
  zon.position.set(-14, 30, 12)
  scene.add(zon)
  // Elke kant baadt in het licht van haar club.
  for (const [kleur, z] of [
    [kleuren.home, -L2],
    [kleuren.away, L2],
  ] as const) {
    const l = new THREE.PointLight(kleur, 28, 0, 1.4)
    l.position.set(0, 7, z * 0.75)
    scene.add(l)
  }

  const tex = veldTextuur(kleuren, lengteM, goalAreaDepth, speelveldM)
  const veld = new THREE.Mesh(new THREE.PlaneGeometry(14, lengteM), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }))
  // Liggend: de bovenkant van de textuur (y = 0, de thuisachterlijn) komt op -z, net als de pieken
  // (z = (y - 0.5) × lengte), de thuisvlaggen en de thuislijsten.
  veld.rotation.x = -Math.PI / 2
  scene.add(veld)
  const rand = new THREE.Mesh(new THREE.BoxGeometry(14 + 3.2, 0.6, lengteM + 3.2), new THREE.MeshStandardMaterial({ color: '#121820', roughness: 0.85 }))
  rand.position.y = -0.31
  scene.add(rand)
  // Gloeiende lijsten langs de rand: thuiskleur op de thuishelft, uitkleur op de uithelft.
  const lijstGeo = new THREE.BoxGeometry(0.16, 0.08, L2)
  for (const sx of [-1, 1])
    for (const [kleur, sz] of [
      [kleuren.home, -1],
      [kleuren.away, 1],
    ] as const) {
      const lijst = new THREE.Mesh(lijstGeo, new THREE.MeshBasicMaterial({ color: kleur, toneMapped: false }))
      lijst.position.set(sx * (7 + 1.1), 0.02, (sz * L2) / 2)
      scene.add(lijst)
    }

  // De vlaggen: één windrichting voor allemaal (naar +x), elk met een eigen fase zodat ze niet in
  // de maat wapperen. Langs beide zijlijnen en achter beide achterlijnen, in de kleur van de club
  // die die helft verdedigt.
  const tijd = { value: 0 }
  const vlagTex = { home: vlagTextuur(kleuren.home, teams.home), away: vlagTextuur(kleuren.away, teams.away) }
  const doekGeo = new THREE.PlaneGeometry(2.7, 1.65, 30, 10)
  doekGeo.translate(1.35, 0, 0)
  const stokGeo = new THREE.CylinderGeometry(0.05, 0.06, 4.4, 10)
  stokGeo.translate(0, 2.2, 0)
  const knopGeo = new THREE.SphereGeometry(0.1, 12, 8)
  const stokMat = new THREE.MeshStandardMaterial({ color: '#c9d1da', metalness: 0.8, roughness: 0.3 })
  const plekken: { x: number; z: number; kant: 'home' | 'away' }[] = []
  for (const sx of [-1, 1])
    for (const z of [-0.36, -0.14, 0.14, 0.36]) plekken.push({ x: sx * 9.6, z: z * lengteM, kant: z < 0 ? 'home' : 'away' })
  for (const x of [-5, -1.6, 1.8]) {
    plekken.push({ x, z: -L2 - 2.6, kant: 'home' })
    plekken.push({ x, z: L2 + 2.6, kant: 'away' })
  }
  plekken.forEach((p, i) => {
    const stok = new THREE.Mesh(stokGeo, stokMat)
    stok.position.set(p.x, 0, p.z)
    scene.add(stok)
    const knop = new THREE.Mesh(knopGeo, stokMat)
    knop.position.set(p.x, 4.45, p.z)
    scene.add(knop)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uKaart: { value: vlagTex[p.kant] }, uTijd: tijd, uFase: { value: i * 1.37 + (p.x > 0 ? 0.6 : 0) } },
      vertexShader: VLAG_VS,
      fragmentShader: VLAG_FS,
      side: THREE.DoubleSide,
      fog: false,
    })
    const doek = new THREE.Mesh(doekGeo, mat)
    doek.position.set(p.x + 0.04, 4.4 - 0.85, p.z)
    scene.add(doek)
  })

  // De pieken: een gladde, slanke spits (lathe) met een kleurverloop van donker onderaan naar licht
  // bovenaan, een zachte gloed op het veld eronder, en bij een doelpunt een bolletje en een lichtring.
  const profiel: THREE.Vector2[] = []
  for (let i = 0; i <= 20; i++) {
    const h = i / 20
    profiel.push(new THREE.Vector2(0.5 * Math.pow(1 - h, 1.9) + 0.012, h))
  }
  const spitsVoor = (kleur: string) => {
    const geo = new THREE.LatheGeometry(profiel, 32)
    const pos = geo.getAttribute('position')
    const kleuren = new Float32Array(pos.count * 3)
    const onder = new THREE.Color(meng(kleur, '#000000', 0.35))
    const boven = new THREE.Color(meng(kleur, '#ffffff', 0.45))
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      c.copy(onder).lerp(boven, pos.getY(i))
      kleuren.set([c.r, c.g, c.b], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(kleuren, 3))
    return geo
  }
  const spitsGeo = { home: spitsVoor(kleuren.home), away: spitsVoor(kleuren.away) }
  const bolGeo = new THREE.SphereGeometry(0.3, 20, 14)
  const gloedTex = gloedTextuur()
  const gloedGeo = new THREE.PlaneGeometry(2.4, 2.4)
  gloedGeo.rotateX(-Math.PI / 2)
  const ringGeo = new THREE.RingGeometry(0.62, 0.74, 64)
  ringGeo.rotateX(-Math.PI / 2)

  const pieken: PiekObj[] = verloop.pieken.map((piek, i) => {
    const kleur = piek.kant === 'home' ? kleuren.home : kleuren.away
    const doel = piek.soort !== 'misser'
    const x = (piek.x - 0.5) * 14
    const z = (piek.y - 0.5) * lengteM
    const spits = new THREE.Mesh(
      spitsGeo[piek.kant],
      new THREE.MeshStandardMaterial({ vertexColors: true, emissive: kleur, emissiveIntensity: doel ? 0.4 : 0.06, roughness: 0.32, metalness: 0.08, transparent: !doel, opacity: doel ? 1 : 0.6 }),
    )
    spits.position.set(x, 0, z)
    spits.scale.set(1, 0.001, 1)
    spits.visible = false
    scene.add(spits)
    const gloed = new THREE.Mesh(gloedGeo, new THREE.MeshBasicMaterial({ map: gloedTex, color: kleur, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    gloed.position.set(x, 0.03, z)
    scene.add(gloed)
    let top: THREE.Mesh | null = null
    let ring: THREE.Mesh | null = null
    if (doel) {
      top = new THREE.Mesh(bolGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: kleur, emissiveIntensity: 1.1, roughness: 0.15 }))
      top.position.set(x, 0, z)
      top.visible = false
      scene.add(top)
      ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: meng(kleur, '#ffffff', 0.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      ring.position.set(x, 0.05, z)
      ring.visible = false
      scene.add(ring)
    }
    return { piek, spits, top, gloed, ring, flits: -1, fase: i * 0.77 }
  })

  return {
    renderer,
    scene,
    camera,
    pieken,
    tijd,
    lengteM,
    geplaatst: false,
    dispose() {
      for (const t of [tex, vlagTex.home, vlagTex.away, gloedTex]) t.dispose()
      for (const g of [lijstGeo, doekGeo, stokGeo, knopGeo, spitsGeo.home, spitsGeo.away, bolGeo, gloedGeo, ringGeo]) g.dispose()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) {
          if (mesh.geometry) mesh.geometry.dispose()
          const m = mesh.material as THREE.Material | undefined
          if (m && typeof m.dispose === 'function') m.dispose()
        }
      })
      renderer.dispose()
    },
  }
}

/** De achtergrond van het beeld, één keer getekend: donker, met de gloed van elke club in haar hoek. */
function bouwAchtergrond(kleuren: Kleuren): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const basis = g.createLinearGradient(0, 0, 0, H)
  basis.addColorStop(0, '#0a0f16')
  basis.addColorStop(1, '#111822')
  g.fillStyle = basis
  g.fillRect(0, 0, W, H)
  for (const [kleur, x, y, r] of [
    [kleuren.home, 0, KOP * 0.6, 760],
    [kleuren.away, W, H * 0.92, 820],
  ] as const) {
    const gl = g.createRadialGradient(x, y, 0, x, y, r)
    gl.addColorStop(0, rgba(kleur, 0.34))
    gl.addColorStop(1, rgba(kleur, 0))
    g.fillStyle = gl
    g.fillRect(0, 0, W, H)
  }
  // Vignet.
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,.45)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  return c
}

export function Verloop3D({
  shots,
  teams,
  colors,
  goalAreaDepth = 10,
  speelveldM,
  matchLabel,
}: {
  shots: ShotPoint[]
  teams: { home: string; away: string }
  colors?: { home?: string | null; away?: string | null }
  goalAreaDepth?: number
  speelveldM?: number
  matchLabel?: string
}) {
  const verloop = useMemo(() => bouwVerloop(shots), [shots])
  const kleuren = useMemo<Kleuren>(() => {
    const home = hex(colors?.home, DEFAULT_HOME_COLOR)
    let away = hex(colors?.away, DEFAULT_AWAY_COLOR)
    // Twee keer dezelfde kleur: de uitploeg krijgt de standaardkleur, anders zie je geen helften.
    if (away.toLowerCase() === home.toLowerCase()) away = home.toLowerCase() === DEFAULT_AWAY_COLOR ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
    return { home, away }
  }, [colors?.home, colors?.away])

  const zichtbaar = useRef<HTMLCanvasElement>(null)
  const scene = useRef<Scene3D | null>(null)
  const achtergrond = useRef<HTMLCanvasElement | null>(null)
  // De tijdlijn: `doelT` is waar we naartoe gaan (afspelen, schuifbalk), `toonT` wat je ziet; die
  // glijdt er vloeiend achteraan. Alles in refs: de tekenlus mag React niet elk beeld laten hertekenen.
  const doelT = useRef(1)
  const toonT = useRef(0)
  const modus = useRef<Modus>('stil')
  const snelheidRef = useRef(1)
  const opnameStart = useRef(0)
  const opnameKlaar = useRef<(() => void) | null>(null)
  const stand = useRef<{ vorige: [number, number]; puls: [number, number] }>({ vorige: [0, 0], puls: [-99, -99] })

  const [speelt, setSpeelt] = useState(false)
  const [snelheid, setSnelheid] = useState(1)
  const [tijd, setTijd] = useState(1)
  const [opname, setOpname] = useState<{ pct: number } | null>(null)
  const [klaar, setKlaar] = useState<{ blob: Blob; naam: string } | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    snelheidRef.current = snelheid
  }, [snelheid])

  const toonMelding = (m: string) => {
    setMelding(m)
    setTimeout(() => setMelding(null), 5000)
  }

  // Eén beeld tekenen op moment `t` (0..1 op de tijdas), `sec` = echte tijd in seconden (voor het
  // wapperen en de flitsen), `dt` = seconden sinds het vorige beeld (voor het naglijden).
  const teken = (t: number, sec: number, dt: number) => {
    const s = scene.current
    const c = zichtbaar.current
    if (!s || !c) return
    const g = c.getContext('2d')!
    s.tijd.value = sec

    for (const p of s.pieken) {
      const voor = (t - p.piek.t) / GROEI + 1
      if (voor <= 0) {
        p.spits.visible = false
        ;(p.gloed.material as THREE.MeshBasicMaterial).opacity = 0
        if (p.top) p.top.visible = false
        if (p.ring) p.ring.visible = false
        p.flits = -1
        continue
      }
      if (p.flits < 0 && voor >= 1) p.flits = sec
      const f = veer(voor)
      const hoogte = Math.max(0.001, f * p.piek.hoogte * MAX_PIEK_M)
      p.spits.visible = true
      p.spits.scale.set(0.6 + 0.4 * klem(voor), hoogte, 0.6 + 0.4 * klem(voor))
      const doel = p.piek.soort !== 'misser'
      ;(p.gloed.material as THREE.MeshBasicMaterial).opacity = uitloop(voor) * (doel ? 0.75 + 0.15 * Math.sin(sec * 2.1 + p.fase) : 0.3)
      if (p.top) {
        p.top.visible = voor >= 0.85
        p.top.position.y = hoogte + 0.28 + Math.sin(sec * 2.3 + p.fase) * 0.07
        p.top.scale.setScalar(uitloop((voor - 0.85) / 0.15))
      }
      if (p.ring) {
        const leeftijd = p.flits < 0 ? -1 : sec - p.flits
        p.ring.visible = leeftijd >= 0 && leeftijd < RING_S
        if (p.ring.visible) {
          const k = leeftijd / RING_S
          p.ring.scale.setScalar(1 + uitloop(k) * 4.2)
          ;(p.ring.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - k, 2) * 0.95
        }
      }
    }

    // Camera: schuin op het veld, traag rond het midden naarmate de wedstrijd vordert, met een
    // zachte zweefbeweging; ze glijdt naar haar plek in plaats van te springen.
    const hoek = -0.55 + t * 0.7 + Math.sin(sec * 0.23) * 0.05
    const R = s.lengteM * (0.6 + Math.sin(sec * 0.17) * 0.012)
    const doelPos = new THREE.Vector3(Math.sin(hoek) * R, s.lengteM * (0.5 + Math.sin(sec * 0.31) * 0.01), Math.cos(hoek) * R)
    if (!s.geplaatst || dt >= 1) {
      s.camera.position.copy(doelPos)
      s.geplaatst = true
    } else s.camera.position.lerp(doelPos, 1 - Math.exp(-dt * 3))
    s.camera.lookAt(0, 0.6, 0)
    s.renderer.render(s.scene, s.camera)

    if (!achtergrond.current) achtergrond.current = bouwAchtergrond(kleuren)
    g.drawImage(achtergrond.current, 0, 0)
    g.drawImage(s.renderer.domElement, 0, KOP)

    // Kop: titel, ploegen in hun kleur, de stand groot (klopt even op bij een doelpunt), het moment.
    const nu = standOp(verloop, t)
    const st = stand.current
    for (const i of [0, 1] as const) {
      if (nu[i] > st.vorige[i]) st.puls[i] = sec
      if (nu[i] < st.vorige[i]) st.puls[i] = -99
    }
    st.vorige = nu
    g.textBaseline = 'middle'
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.font = `800 26px ${FONT}`
    g.textAlign = 'left'
    g.fillText('KRACHTBAL LIVE · WEDSTRIJDVERLOOP', 60, 52)
    g.textAlign = 'right'
    g.fillText(tijdLabelOp(verloop, t).toUpperCase(), W - 60, 52)
    const naamBreedte = W / 2 - 60 - 175
    const ploeg = (naam: string, kleur: string, x: number, align: CanvasTextAlign) => {
      const balk = g.createLinearGradient(0, 96, 0, 200)
      balk.addColorStop(0, meng(kleur, '#ffffff', 0.25))
      balk.addColorStop(1, kleur)
      g.fillStyle = balk
      g.beginPath()
      g.roundRect(align === 'left' ? x : x - 14, 96, 14, 104, 7)
      g.fill()
      g.fillStyle = '#ffffff'
      g.font = `900 38px ${FONT}`
      g.textAlign = align
      const tx = align === 'left' ? x + 28 : x - 28
      const delen = naam.length > 13 && naam.includes(' ') ? [naam.slice(0, naam.lastIndexOf(' ')), naam.slice(naam.lastIndexOf(' ') + 1)] : [naam]
      delen.forEach((d, i) => g.fillText(d.toUpperCase(), tx, delen.length === 1 ? 148 : 126 + i * 44, naamBreedte - 28))
    }
    ploeg(teams.home, kleuren.home, 60, 'left')
    ploeg(teams.away, kleuren.away, W - 60, 'right')
    const cijfer = (i: 0 | 1, x: number, align: CanvasTextAlign) => {
      const k = Math.exp(-(sec - st.puls[i]) * 4.5)
      const kleur = i === 0 ? kleuren.home : kleuren.away
      g.save()
      g.translate(x, 150)
      g.scale(1 + 0.22 * k, 1 + 0.22 * k)
      g.font = `900 104px ${FONT}`
      g.textAlign = align
      if (k > 0.02) {
        g.shadowColor = rgba(kleur, 0.9 * k)
        g.shadowBlur = 40 * k
      }
      g.fillStyle = meng('#ffffff', meng(kleur, '#ffffff', 0.2), k * 0.85)
      g.fillText(`${nu[i]}`, 0, 0)
      g.restore()
    }
    cijfer(0, W / 2 - 44, 'right')
    cijfer(1, W / 2 + 44, 'left')
    g.textAlign = 'center'
    g.fillStyle = 'rgba(255,255,255,.4)'
    g.font = `900 60px ${FONT}`
    g.fillText('–', W / 2, 146)
    // Een dunne balk die van de thuiskleur naar de uitkleur loopt.
    const band = g.createLinearGradient(60, 0, W - 60, 0)
    band.addColorStop(0, kleuren.home)
    band.addColorStop(1, kleuren.away)
    g.fillStyle = band
    g.globalAlpha = 0.85
    g.fillRect(60, 244, W - 120, 4)
    g.globalAlpha = 1
    if (matchLabel) {
      g.fillStyle = 'rgba(255,255,255,.55)'
      g.font = `700 24px ${FONT}`
      g.fillText(matchLabel, W / 2, 218, W - 120)
    }

    // Tijdlijn: de helften, per doelpoging een streepje in de clubkleur (zo hoog als de piek) dat
    // zacht inkleurt als je er voorbij bent, en een gloeiende loper.
    const x0 = 70
    const x1 = W - 70
    const y = TIJDLIJN_Y + 118
    g.fillStyle = 'rgba(255,255,255,.1)'
    g.beginPath()
    g.roundRect(x0, y - 4, x1 - x0, 8, 4)
    g.fill()
    const lx = x0 + klem(t) * (x1 - x0)
    const voortgang = g.createLinearGradient(x0, 0, x1, 0)
    voortgang.addColorStop(0, kleuren.home)
    voortgang.addColorStop(1, kleuren.away)
    g.fillStyle = voortgang
    g.beginPath()
    g.roundRect(x0, y - 4, Math.max(8, lx - x0), 8, 4)
    g.fill()
    const rustX = x0 + verloop.rust * (x1 - x0)
    g.fillStyle = 'rgba(255,255,255,.35)'
    g.fillRect(rustX - 1, y - 14, 2, 28)
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.font = `700 22px ${FONT}`
    g.textAlign = 'center'
    g.fillText('1e helft', (x0 + rustX) / 2, y + 40)
    g.fillText('2e helft', (rustX + x1) / 2, y + 40)
    let vorigLabelX = -1000
    for (const p of verloop.pieken) {
      const px = x0 + p.t * (x1 - x0)
      const a = klem((t - p.t) / 0.012 + 1)
      const kleur = p.kant === 'home' ? kleuren.home : kleuren.away
      const h = (14 + p.hoogte * 56) * (0.55 + 0.45 * uitloop(a))
      const breed = p.soort === 'misser' ? 3 : 6
      g.fillStyle = 'rgba(255,255,255,.16)'
      g.fillRect(px - breed / 2, y - 6 - h, breed, h)
      if (a > 0) {
        g.globalAlpha = uitloop(a)
        g.fillStyle = kleur
        g.beginPath()
        g.roundRect(px - breed / 2, y - 6 - h, breed, h, breed / 2)
        g.fill()
        if (p.soort !== 'misser' && px - vorigLabelX > 30) {
          vorigLabelX = px
          g.fillStyle = '#ffffff'
          g.font = `800 20px ${FONT}`
          g.fillText(`+${p.punten}`, px, y - 18 - h)
        }
        g.globalAlpha = 1
      }
    }
    g.save()
    g.shadowColor = 'rgba(255,255,255,.8)'
    g.shadowBlur = 18
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(lx, y, 11, 0, Math.PI * 2)
    g.fill()
    g.restore()
    g.fillStyle = 'rgba(255,255,255,.4)'
    g.font = `700 20px ${FONT}`
    g.textAlign = 'left'
    g.fillText('▲ hoogte = punten (doelpunt) of gevaar (misser)', x0, TIJDLIJN_Y + 200)
    g.textAlign = 'right'
    g.fillText('krachtbal.live', x1, TIJDLIJN_Y + 200)
  }
  const tekenRef = useRef(teken)
  tekenRef.current = teken

  // De scène opbouwen (één keer per wedstrijd/kleuren) en de doorlopende tekenlus starten. Bij het
  // openen glijdt het verloop van leeg naar het eindbeeld: alle pieken groeien op, met hun ringen.
  useEffect(() => {
    const c = zichtbaar.current
    if (!c || verloop.pieken.length === 0) return
    const webgl = document.createElement('canvas')
    webgl.width = W
    webgl.height = VELD_H
    try {
      scene.current = bouwScene(webgl, verloop, kleuren, teams, goalAreaDepth, speelveldM)
      achtergrond.current = bouwAchtergrond(kleuren)
      setFout(null)
    } catch (err) {
      setFout((err as Error).message || 'WebGL kon niet starten.')
      return
    }
    doelT.current = 1
    toonT.current = 0
    stand.current = { vorige: [0, 0], puls: [-99, -99] }
    let raf = 0
    let vorige = performance.now()
    let gemiddeld = 1 / 60
    let beeld = 0
    let laatsteUi = 0
    const lus = (nu: number) => {
      raf = requestAnimationFrame(lus)
      if (document.hidden) {
        vorige = nu
        return
      }
      const m = modus.current
      // Traag toestel (gemiddeld trager dan ± 22 beelden per seconde): de helft van de beelden
      // tekenen. Nooit tijdens een opname: die moet gelijkmatig lopen.
      beeld++
      if (m !== 'opname' && gemiddeld > 0.045 && beeld % 2 === 1) return
      const dt = Math.min(0.1, (nu - vorige) / 1000)
      vorige = nu
      gemiddeld = gemiddeld * 0.94 + dt * 0.06
      if (m === 'speelt') {
        doelT.current = Math.min(1, doelT.current + (dt * snelheidRef.current) / AFSPEELDUUR)
        toonT.current = doelT.current
        if (doelT.current >= 1) {
          modus.current = 'stil'
          setSpeelt(false)
        }
      } else if (m === 'opname') {
        const s = (nu - opnameStart.current) / 1000
        doelT.current = Math.min(1, s / AFSPEELDUUR)
        toonT.current = doelT.current
        if (nu - laatsteUi > 200) setOpname({ pct: Math.min(100, Math.round((s / (AFSPEELDUUR + NAHOUD)) * 100)) })
        if (s >= AFSPEELDUUR + NAHOUD) {
          modus.current = 'stil'
          opnameKlaar.current?.()
          opnameKlaar.current = null
        }
      } else {
        const verschil = doelT.current - toonT.current
        toonT.current = Math.abs(verschil) < 1e-4 ? doelT.current : toonT.current + verschil * (1 - Math.exp(-dt * 5))
      }
      tekenRef.current(toonT.current, nu / 1000, dt)
      if (nu - laatsteUi > 100) {
        laatsteUi = nu
        setTijd(toonT.current)
      }
    }
    raf = requestAnimationFrame(lus)
    return () => {
      cancelAnimationFrame(raf)
      scene.current?.dispose()
      scene.current = null
      achtergrond.current = null
    }
    // teams: enkel de namen tellen (voor de vlaggen); een nieuw object met dezelfde namen herbouwt niet.
  }, [verloop, kleuren, teams.home, teams.away, goalAreaDepth, speelveldM])

  const spring = (t: number) => {
    modus.current = 'stil'
    setSpeelt(false)
    doelT.current = t
    setTijd(t)
  }
  const afspelen = () => {
    if (doelT.current >= 1) {
      doelT.current = 0
      toonT.current = 0
    } else toonT.current = doelT.current
    modus.current = 'speelt'
    setSpeelt(true)
  }
  const pauze = () => {
    modus.current = 'stil'
    setSpeelt(false)
  }

  const bestandsnaam = (ext: string) => `${slugFilename('wedstrijdverloop', teams.home, teams.away, matchLabel) || 'wedstrijdverloop'}.${ext}`

  // PNG van het moment waar je staat (meteen scherp, zonder naglijden).
  const bewaarBeeld = async () => {
    const c = zichtbaar.current
    if (!c) return
    toonT.current = doelT.current
    teken(doelT.current, performance.now() / 1000, 1)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
    if (!blob) return toonMelding('⚠️ Beeld bewaren lukte niet.')
    await saveOrShareBlob(blob, bestandsnaam('png'), `${teams.home} – ${teams.away}${matchLabel ? ` · ${matchLabel}` : ''}`)
  }

  // Video: het canvas opnemen terwijl het verloop van 0 tot 1 speelt (snelheid 1), met een korte
  // nahoud op het eindbeeld. De tekenlus doet het werk (modus 'opname'); hier enkel de recorder.
  // mp4 (H.264) eerst — dat kan je via WhatsApp doorsturen — en anders webm. Elk type wordt eerst
  // een halve seconde geprobeerd: sommige toestellen zeggen dat mp4 kan en laten de recorder dan sterven.
  const neemOp = async () => {
    const c = zichtbaar.current
    if (!c || opname || speelt) return
    const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder
    const cap = c as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
    if (!MR || typeof cap.captureStream !== 'function') return toonMelding('⚠️ Video opnemen kan niet in deze browser. Bewaar het beeld (PNG), of open de site rechtstreeks in Chrome.')
    setKlaar(null)
    setOpname({ pct: 0 })
    spring(0)
    toonT.current = 0
    const stream = cap.captureStream(30)
    const kandidaten = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter((m) => MR.isTypeSupported?.(m))
    let rec: MediaRecorder | null = null
    let mime = 'video/webm'
    for (const m of [...kandidaten, undefined]) {
      try {
        const test = m ? new MR(stream, { mimeType: m }) : new MR(stream)
        test.start(100)
        await new Promise((r) => setTimeout(r, 450))
        const leeft = test.state === 'recording'
        if (test.state !== 'inactive') test.stop()
        if (!leeft) continue
        rec = m ? new MR(stream, { mimeType: m, videoBitsPerSecond: 8_000_000 }) : new MR(stream)
        mime = m ?? (rec.mimeType || 'video/webm')
        break
      } catch {
        continue
      }
    }
    if (!rec) {
      setOpname(null)
      return toonMelding('⚠️ Dit toestel weigert de video-opname te starten. Bewaar het beeld (PNG) of probeer het op een pc.')
    }
    const stukken: BlobPart[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) stukken.push(e.data)
    }
    const gestopt = new Promise<void>((ok) => {
      let klaarMet = false
      const af = () => {
        if (klaarMet) return
        klaarMet = true
        ok()
      }
      rec!.onstop = af
      setTimeout(af, (AFSPEELDUUR + NAHOUD) * 1000 + 6000)
    })
    rec.start(100)
    await new Promise<void>((ok) => {
      opnameKlaar.current = ok
      opnameStart.current = performance.now()
      modus.current = 'opname'
    })
    try {
      if (rec.state === 'recording') rec.requestData()
    } catch {
      /* best-effort */
    }
    try {
      if (rec.state !== 'inactive') rec.stop()
    } catch {
      /* best-effort */
    }
    await gestopt
    setOpname(null)
    setTijd(1)
    if (!stukken.length) return toonMelding('⚠️ De opname bleef leeg. Probeer het opnieuw, of bewaar het beeld (PNG).')
    const blob = new Blob(stukken, { type: mime })
    setKlaar({ blob, naam: bestandsnaam(mime.includes('mp4') ? 'mp4' : 'webm') })
  }

  const bewaarVideo = async () => {
    if (!klaar) return
    await saveOrShareBlob(klaar.blob, klaar.naam, `${teams.home} – ${teams.away}${matchLabel ? ` · ${matchLabel}` : ''}`)
  }

  if (verloop.pieken.length === 0) return <p className="empty">Nog geen doelpogingen aangetekend: het wedstrijdverloop komt zodra er geworpen is.</p>

  return (
    <div className="verloop3d">
      <canvas ref={zichtbaar} width={W} height={H} className="verloop3d-beeld" aria-label={`Wedstrijdverloop ${teams.home} – ${teams.away}`} />
      {fout ? (
        <p className="empty">3D kon niet starten ({fout}). Probeer de video-weergave.</p>
      ) : (
        <>
          <div className="replay-controls">
            <button type="button" className="replay-play" onClick={() => (speelt ? pauze() : afspelen())} disabled={!!opname}>
              {speelt ? '⏸ Pauze' : tijd >= 0.999 ? '↻ Opnieuw' : '▶ Afspelen'}
            </button>
            <input type="range" className="replay-scrub" min={0} max={1000} value={Math.round(tijd * 1000)} onChange={(e) => spring(Number(e.target.value) / 1000)} disabled={!!opname} aria-label="Moment in de wedstrijd" />
            <select value={snelheid} onChange={(e) => setSnelheid(Number(e.target.value))} aria-label="Snelheid" disabled={!!opname}>
              <option value={0.5}>0,5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </div>
          <div className="replay-status">
            <span>
              <b className="replay-step">{tijdLabelOp(verloop, tijd)}</b>
              {verloop.tijdas === 'volgorde' ? ' · zonder klok: in volgorde van de worpen' : ''}
            </span>
            <span className="verloop3d-knoppen">
              <button type="button" onClick={bewaarBeeld} disabled={!!opname}>🖼️ Beeld</button>
              <button type="button" onClick={neemOp} disabled={!!opname || speelt}>
                {opname ? `⏺ ${opname.pct}%` : '🎬 Video maken'}
              </button>
              {klaar && (
                <button type="button" className="replay-rec-save" onClick={bewaarVideo}>
                  📥 Bewaren / delen
                </button>
              )}
            </span>
          </div>
          {melding && <p className="shotmap-note">{melding}</p>}
        </>
      )}
    </div>
  )
}
