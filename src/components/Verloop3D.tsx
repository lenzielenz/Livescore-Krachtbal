'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'

import { saveOrShareBlob, slugFilename } from '@/lib/client-download'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, inkOn, readableOnDark, relativeLuminance } from '@/lib/club-colors'
import { freeThrowNorm, goalLineNorm, totalLengthM } from '@/lib/field'
import type { ShotPoint } from '@/lib/match-engine'
import { afkorting, bouwTijdwarp, bouwVerloop, cijfersTot, klokOp, momentumOp, standOp, tijdLabelOp, type Verloop } from '@/lib/wedstrijdverloop'

// Het wedstrijdverloop in 3D, in de stijl van de bekende voetbalanimaties (IntelliGoal en de
// "data portraits" van Alexander Bogachev): het veld is een doek dat golft, in de kleuren van beide
// clubs, en alles op het scherm komt uit de wedstrijd zelf.
//
// - Twee clubkleuren, elk in de banen van de club (primaire en secundaire kleur), die elkaar raken
//   op een golvende naad. Wie drukt, duwt die naad over de middenlijn naar de tegenstander; bij de
//   rust wisselen de ploegen van kant en schuiven de kleuren mee om.
// - Elke doelpoging duwt een bult uit het doek, zo hoog als haar verwachte punten (zoals xG), in de
//   banen van de ploeg die wierp. Een doelpunt krijgt een gele ring en kleurt het hele doek even in
//   de kleur van de scorer.
// - Het doek golft traag in grote plooien, zwelt op waar de druk ligt en glanst in de plooien.
// - De gloed achter het veld helt over naar de ploeg die voor staat of drukt.
// - Onderaan één momentumlijn die uitslaat naar de ploeg die drukt; op het einde de cijfers.
// - Dramatische tijd: rond een doelpunt of grote kans vertraagt het afspelen, de rustige stukken
//   gaan sneller (zie bouwTijdwarp). Alles is zacht uitgevlakt, zodat het doek ademt.
//
// Techniek: één fijn raster; golven, bulten en naad in de shaders (bulten als datatextuur). Eén beeld
// van 1080 × 1080: three tekent het doek op een doorzichtig canvas, achtergrond, kop en tijdlijn
// komen er in 2D omheen. Dat ene canvas wordt ook opgenomen (video) of bewaard (PNG).

const W = 1080
const H = 1080
/** Hoe lang de hele wedstrijd duurt bij snelheid 1, in seconden (verdeeld volgens de dramatische tijd). */
const AFSPEELDUUR = 24
/** Even blijven staan op het eindbeeld (ook in de video). */
const NAHOUD = 2.5
/** Hoe lang een bult groeit, als deel van de tijdas. */
const GROEI = 0.03
/** Hoogte (m) van een bult per verwacht punt. */
const BULT_M = 9.5
/** Breedte (m) van een bult. */
const BULT_S = 0.72
const MAX_BULTEN = 512
const GEEL = '#f5c518'
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'

type Kleur2 = { a: string; b: string }
type Kleuren = { home: Kleur2; away: Kleur2 }
type Modus = 'stil' | 'speelt' | 'opname'

const geldig = (s: string | null | undefined) => (s && /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null)
const meng = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
const klem = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const veer = (x: number) => {
  const k = klem(x)
  return 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2)
}
const rgba = (kleur: string, a: number) => {
  const c = new THREE.Color(kleur)
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`
}
const afstand = (a: string, b: string) => {
  const x = new THREE.Color(a)
  const y = new THREE.Color(b)
  return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b)
}
/** De tweede baankleur: de secundaire clubkleur, of (ontbreekt die of lijkt ze te veel) een tint van de eerste. */
const tweede = (a: string, b: string | null) => (b && afstand(a, b) > 0.35 ? b : relativeLuminance(a) > 0.45 ? meng(a, '#000000', 0.28) : meng(a, '#ffffff', 0.5))

/** De lijnen van het krachtbalveld, wit op doorzichtig: rand, doellijnen, vrijeworplijnen, middellijn. */
function lijnenTextuur(lengteM: number, goalAreaDepth: number, speelveldM?: number): THREE.CanvasTexture {
  const PX = 40
  const w = 14 * PX
  const h = Math.round(lengteM * PX)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.strokeStyle = '#ffffff'
  g.lineWidth = 0.13 * PX
  g.lineCap = 'round'
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth)
  const gl = goalLineNorm(goalAreaDepth, { speelveldM })
  const ft = freeThrowNorm(goalAreaDepth, { speelveldM })
  for (const y of [gl, 1 - gl, ft, 1 - ft, 0.5]) {
    g.beginPath()
    g.moveTo(0, y * h)
    g.lineTo(w, y * h)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  return t
}

/** Een zachte schaduw onder het doek. */
function schaduwTextuur(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')!
  g.filter = 'blur(14px)'
  g.fillStyle = 'rgba(0,0,0,.85)'
  g.fillRect(24, 24, 80, 208)
  return new THREE.CanvasTexture(c)
}

/** De gele doelpuntring. */
function ringTextuur(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  g.strokeStyle = GEEL
  g.lineWidth = 12
  g.beginPath()
  g.arc(64, 64, 48, 0, Math.PI * 2)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Het golven: vier trage golven uit verschillende richtingen (zo lijkt het op een doek in de wind en
// niet op een regelmatig patroon), de zwelling waar de druk ligt, en rimpels eromheen. Dezelfde
// formule staat in golfOp hieronder (voor de hoogte van de doelpuntringen).
const GOLF_GLSL = /* glsl */ `
  float golf(vec2 p) {
    float t = uTijd;
    float w = 0.55 * sin(0.17 * p.y - 1.1 * t)
      + 0.38 * sin(0.21 * p.x + 0.12 * p.y + 0.85 * t + 1.3)
      + 0.26 * sin(-0.15 * p.x + 0.27 * p.y - 1.5 * t + 2.1)
      + 0.12 * sin(0.55 * p.x + 0.4 * p.y - 2.3 * t + 0.7);
    w *= uGolf;
    float dz = p.y - uZwel.x;
    float dx = p.x - uZwel.z;
    float zwel = uZwel.y * exp(-dz * dz / 90.0) * (0.75 + 0.25 * exp(-dx * dx / 40.0));
    float r = sqrt(dz * dz + dx * dx * 0.6);
    float rimpel = uZwel.y * 0.24 * sin(r * 0.75 - t * 3.1) * exp(-r * 0.11);
    return w + zwel + rimpel;
  }
`
function golfOp(x: number, z: number, t: number, golf: number, zwel: THREE.Vector3): number {
  const w =
    golf *
    (0.55 * Math.sin(0.17 * z - 1.1 * t) + 0.38 * Math.sin(0.21 * x + 0.12 * z + 0.85 * t + 1.3) + 0.26 * Math.sin(-0.15 * x + 0.27 * z - 1.5 * t + 2.1) + 0.12 * Math.sin(0.55 * x + 0.4 * z - 2.3 * t + 0.7))
  const dz = z - zwel.x
  const dx = x - zwel.z
  const r = Math.sqrt(dz * dz + dx * dx * 0.6)
  return w + zwel.y * Math.exp((-dz * dz) / 90) * (0.75 + 0.25 * Math.exp((-dx * dx) / 40)) + zwel.y * 0.24 * Math.sin(r * 0.75 - t * 3.1) * Math.exp(-r * 0.11)
}

const DOEK_VS = /* glsl */ `
  uniform sampler2D uBulten;
  uniform int uAantal;
  uniform float uTijd;
  uniform float uGolf;
  uniform vec3 uZwel;
  varying vec3 vNormaal;
  varying vec3 vWereld;
  varying float vH;
  varying float vThuis;
  varying float vUit;
  varying vec2 vUv;
  varying vec2 vPos;
  ${GOLF_GLSL}
  void bulten(vec2 p, out float hT, out float hU) {
    hT = 0.0;
    hU = 0.0;
    for (int i = 0; i < ${MAX_BULTEN}; i++) {
      if (i >= uAantal) break;
      vec4 b = texelFetch(uBulten, ivec2(i, 0), 0);
      if (b.z < 0.002) continue;
      float s = abs(b.w);
      vec2 d = p - b.xy;
      float q = dot(d, d) / (2.0 * s * s);
      if (q > 7.0) continue;
      float v = b.z * exp(-q);
      if (b.w > 0.0) hT += v; else hU += v;
    }
  }
  float hoogte(vec2 p) {
    float a;
    float b;
    bulten(p, a, b);
    return a + b + golf(p);
  }
  void main() {
    vec2 p = position.xz;
    float hT;
    float hU;
    bulten(p, hT, hU);
    float h = hT + hU + golf(p);
    float e = 0.22;
    float hx = hoogte(p + vec2(e, 0.0));
    float hz = hoogte(p + vec2(0.0, e));
    vNormaal = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
    vH = h;
    vThuis = hT;
    vUit = hU;
    vUv = uv;
    vPos = p;
    vec4 w = modelMatrix * vec4(p.x, h, p.y, 1.0);
    vWereld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const DOEK_FS = /* glsl */ `
  uniform sampler2D uLijnen;
  uniform vec3 uThuisA;
  uniform vec3 uThuisB;
  uniform vec3 uUitA;
  uniform vec3 uUitB;
  uniform float uL;
  uniform float uTijd;
  uniform float uNaad;
  uniform float uKant;
  uniform vec4 uVloed;
  varying vec3 vNormaal;
  varying vec3 vWereld;
  varying float vH;
  varying float vThuis;
  varying float vUit;
  varying vec2 vUv;
  varying vec2 vPos;
  void main() {
    float xn = vPos.x / 14.0 + 0.5;
    float yn = vPos.y / uL + 0.5;
    float baan = mod(floor(xn * 7.0), 2.0);
    vec3 thuis = mix(uThuisA, uThuisB, baan);
    vec3 uit = mix(uUitA, uUitB, baan);
    // De naad tussen de twee clubs golft licht; uKant = 1: thuis verdedigt de kant van y = 0,
    // -1: de andere kant (na de rust). Daartussen schuiven de kleuren in elkaar over.
    float naad = uNaad + 0.03 * sin(vPos.x * 0.55 + uTijd * 0.8) + 0.018 * sin(vPos.x * 1.4 - uTijd * 1.15);
    float d = (yn - naad) * uKant;
    float thuisDeel = 1.0 - smoothstep(-0.012, 0.012, d);
    vec3 c = mix(uit, thuis, thuisDeel);
    // Een bult krijgt de banen van de ploeg die wierp; hoe hoger, hoe lichter de top.
    float tot = vThuis + vUit;
    vec3 aanval = mix(thuis, uit, tot > 0.0001 ? vUit / tot : 0.0);
    c = mix(c, aanval, smoothstep(0.12, 1.1, tot));
    c = mix(c, vec3(1.0), smoothstep(2.5, 11.0, vH) * 0.5);
    // Een doelpunt: het hele doek kleurt even in de kleur van de scorer.
    c = mix(c, uVloed.rgb, uVloed.a * 0.55);
    float lijn = texture2D(uLijnen, vUv).a;
    c = mix(c, vec3(1.0), lijn * 0.85);
    // Licht: zon, hemel, glans in de plooien en een zachte rand.
    vec3 n = normalize(vNormaal);
    if (!gl_FrontFacing) n = -n;
    vec3 L = normalize(vec3(-0.45, 1.0, -0.35));
    vec3 V = normalize(cameraPosition - vWereld);
    float licht = max(dot(n, L), 0.0);
    float hemel = 0.5 + 0.5 * n.y;
    float glans = pow(max(dot(reflect(-L, n), V), 0.0), 26.0) * 0.32;
    float rand = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.2;
    c = c * (0.32 + 0.4 * hemel + 0.52 * licht) + glans + rand * c;
    // Een dun licht randje op de naad.
    c += 0.12 * (1.0 - smoothstep(0.0, 0.02, abs(d))) * (1.0 - smoothstep(0.1, 0.9, tot));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

type Doel = { sprite: THREE.Sprite; x: number; z: number; i: number; dx: number }

type Uniforms = {
  uTijd: { value: number }
  uGolf: { value: number }
  uZwel: { value: THREE.Vector3 }
  uAantal: { value: number }
  uNaad: { value: number }
  uKant: { value: number }
  uVloed: { value: THREE.Vector4 }
}

type Scene3D = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  uniforms: Uniforms
  bulten: Float32Array
  bultTex: THREE.DataTexture
  doelen: Doel[]
  lengteM: number
  /** Uitgevlakte toestand: zwelling, naad, kant, overhelling van de gloed. */
  zacht: { a: number; z: number; x: number; naad: number; kant: number; helling: number }
  dispose: () => void
}

function bouwScene(canvas: HTMLCanvasElement, verloop: Verloop, kleuren: Kleuren, goalAreaDepth: number, speelveldM?: number): Scene3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(W, H, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(26, W / H, 1, 600)
  const lengteM = totalLengthM(goalAreaDepth, { speelveldM })

  const n = Math.min(MAX_BULTEN, Math.max(1, verloop.pieken.length))
  const bulten = new Float32Array(n * 4)
  const bultTex = new THREE.DataTexture(bulten, n, 1, THREE.RGBAFormat, THREE.FloatType)
  bultTex.magFilter = THREE.NearestFilter
  bultTex.minFilter = THREE.NearestFilter
  bultTex.needsUpdate = true
  const lijnen = lijnenTextuur(lengteM, goalAreaDepth, speelveldM)
  const uniforms = {
    uBulten: { value: bultTex },
    uAantal: { value: 0 },
    uTijd: { value: 0 },
    uGolf: { value: 1.15 },
    uZwel: { value: new THREE.Vector3(0, 0, 0) },
    uNaad: { value: 0.5 },
    uKant: { value: 1 },
    uVloed: { value: new THREE.Vector4(1, 1, 1, 0) },
    uLijnen: { value: lijnen },
    uThuisA: { value: new THREE.Color(kleuren.home.a) },
    uThuisB: { value: new THREE.Color(kleuren.home.b) },
    uUitA: { value: new THREE.Color(kleuren.away.a) },
    uUitB: { value: new THREE.Color(kleuren.away.b) },
    uL: { value: lengteM },
  }
  // Fijn genoeg dat een bult van een meter breed rond is: ± 7 punten per meter in de breedte.
  const doekGeo = new THREE.PlaneGeometry(14, lengteM, 96, Math.round(lengteM * 4.4))
  doekGeo.rotateX(-Math.PI / 2)
  const doek = new THREE.Mesh(doekGeo, new THREE.ShaderMaterial({ uniforms, vertexShader: DOEK_VS, fragmentShader: DOEK_FS, side: THREE.DoubleSide }))
  doek.frustumCulled = false
  scene.add(doek)
  const schaduwTex = schaduwTextuur()
  const schaduw = new THREE.Mesh(new THREE.PlaneGeometry(14 * 1.9, lengteM * 1.35), new THREE.MeshBasicMaterial({ map: schaduwTex, transparent: true, opacity: 0.7, depthWrite: false }))
  schaduw.rotation.x = -Math.PI / 2
  schaduw.position.set(1.8, -2.4, 2.2)
  scene.add(schaduw)

  // De doelpuntringen: één per doelpunt; doelpunten vlak bij elkaar komen naast elkaar te hangen.
  const ringTex = ringTextuur()
  const doelen: Doel[] = []
  verloop.pieken.forEach((p, i) => {
    if (p.soort === 'misser' || i >= MAX_BULTEN) return
    const x = (p.x - 0.5) * 14
    const z = (p.y - 0.5) * lengteM
    const buren = doelen.filter((d) => Math.hypot(d.x - x, d.z - z) < 1.6).length
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, toneMapped: false }))
    sprite.renderOrder = 10
    sprite.visible = false
    scene.add(sprite)
    doelen.push({ sprite, x, z, i, dx: buren * 1.25 })
  })

  return {
    renderer,
    scene,
    camera,
    uniforms,
    bulten,
    bultTex,
    doelen,
    lengteM,
    zacht: { a: 0, z: 0, x: 0, naad: 0.5, kant: 1, helling: 0 },
    dispose() {
      for (const t of [lijnen, schaduwTex, ringTex, bultTex]) t.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh || (o as THREE.Sprite).isSprite) {
          m.geometry?.dispose()
          const mat = m.material as THREE.Material | undefined
          mat?.dispose()
        }
      })
      renderer.dispose()
    },
  }
}

/** De donkere basis van de achtergrond (één keer getekend); de clubgloed komt er per beeld bovenop. */
function bouwAchtergrond(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const basis = g.createLinearGradient(0, 0, 0, H)
  basis.addColorStop(0, '#16111c')
  basis.addColorStop(1, '#0f0c14')
  g.fillStyle = basis
  g.fillRect(0, 0, W, H)
  return c
}

/** Een clublogo laden (van ons eigen domein, zodat het canvas bewaard en opgenomen kan blijven). */
function laadLogo(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url || !url.startsWith('/')) return Promise.resolve(null)
  return new Promise((ok) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => ok(img.naturalWidth > 0 ? img : null)
    img.onerror = () => ok(null)
    img.src = url
  })
}

export function Verloop3D({
  shots,
  teams,
  colors,
  logos,
  goalAreaDepth = 10,
  speelveldM,
  matchLabel,
}: {
  shots: ShotPoint[]
  teams: { home: string; away: string }
  colors?: { home?: string | null; away?: string | null; homeB?: string | null; awayB?: string | null }
  /** Clublogo's, enkel van het eigen domein (zie /api/match/[id]/verloop). */
  logos?: { home?: string | null; away?: string | null }
  goalAreaDepth?: number
  speelveldM?: number
  matchLabel?: string
}) {
  const verloop = useMemo(() => bouwVerloop(shots), [shots])
  const warp = useMemo(() => bouwTijdwarp(verloop), [verloop])
  const kleuren = useMemo<Kleuren>(() => {
    const ha = geldig(colors?.home) ?? DEFAULT_HOME_COLOR
    let aa = geldig(colors?.away) ?? DEFAULT_AWAY_COLOR
    // Twee keer dezelfde kleur: de uitploeg krijgt de standaardkleur, anders zie je geen helften.
    if (afstand(ha, aa) < 0.15) aa = afstand(ha, DEFAULT_AWAY_COLOR) < 0.15 ? DEFAULT_HOME_COLOR : DEFAULT_AWAY_COLOR
    return { home: { a: ha, b: tweede(ha, geldig(colors?.homeB)) }, away: { a: aa, b: tweede(aa, geldig(colors?.awayB)) } }
  }, [colors?.home, colors?.away, colors?.homeB, colors?.awayB])
  const namen = useMemo(() => ({ home: afkorting(teams.home), away: afkorting(teams.away) }), [teams.home, teams.away])

  const zichtbaar = useRef<HTMLCanvasElement>(null)
  const scene = useRef<Scene3D | null>(null)
  const achtergrond = useRef<HTMLCanvasElement | null>(null)
  const logoBeeld = useRef<{ home: HTMLImageElement | null; away: HTMLImageElement | null }>({ home: null, away: null })
  // `posR` is de afspeelpositie in echte tijd (0..1), `doelT` het moment op de tijdas waar we naartoe
  // gaan, `toonT` wat je ziet (glijdt er achteraan bij verschuiven). Alles in refs: de tekenlus mag
  // React niet elk beeld laten hertekenen.
  const posR = useRef(0)
  const doelT = useRef(0)
  const toonT = useRef(0)
  const modus = useRef<Modus>('speelt')
  const snelheidRef = useRef(1)
  const opnameStart = useRef(0)
  const opnameKlaar = useRef<(() => void) | null>(null)
  const puls = useRef<{ vorige: [number, number]; sinds: [number, number]; vloed: number; vloedKleur: string }>({ vorige: [0, 0], sinds: [-99, -99], vloed: -99, vloedKleur: '#ffffff' })

  const [speelt, setSpeelt] = useState(true)
  const [snelheid, setSnelheid] = useState(1)
  const [tijd, setTijd] = useState(0)
  const [opname, setOpname] = useState<{ pct: number } | null>(null)
  const [klaar, setKlaar] = useState<{ blob: Blob; naam: string } | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    snelheidRef.current = snelheid
  }, [snelheid])

  useEffect(() => {
    let weg = false
    void Promise.all([laadLogo(logos?.home), laadLogo(logos?.away)]).then(([home, away]) => {
      if (!weg) logoBeeld.current = { home, away }
    })
    return () => {
      weg = true
    }
  }, [logos?.home, logos?.away])

  const toonMelding = (m: string) => {
    setMelding(m)
    setTimeout(() => setMelding(null), 5000)
  }

  // Eén beeld op moment `t` (0..1 op de tijdas); `sec` = echte tijd (voor het golven), `dt` = seconden sinds het vorige beeld.
  const teken = (t: number, sec: number, dt: number) => {
    const s = scene.current
    const c = zichtbaar.current
    if (!s || !c) return
    const g = c.getContext('2d')!
    const zachtjes = (snelheid: number) => 1 - Math.exp(-Math.min(dt, 0.2) * snelheid)

    // De bulten: elk groeit (met een kleine veerkracht) zodra zijn moment voorbij is.
    let aantal = 0
    verloop.pieken.forEach((p, i) => {
      if (i >= MAX_BULTEN) return
      const voor = (t - p.t) / GROEI + 1
      const o = i * 4
      s.bulten[o] = (p.x - 0.5) * 14
      s.bulten[o + 1] = (p.y - 0.5) * s.lengteM
      s.bulten[o + 2] = voor <= 0 ? 0 : veer(voor) * p.verwacht * BULT_M
      s.bulten[o + 3] = p.werper === 'home' ? BULT_S : -BULT_S
      aantal = i + 1
    })
    s.uniforms.uAantal.value = aantal
    s.bultTex.needsUpdate = true

    // De zwelling volgt de druk: waar de laatste pogingen vielen, en hoe gevaarlijk ze waren.
    let gewicht = 0
    let zw = 0
    let xw = 0
    for (const p of verloop.pieken) {
      if (p.t > t) break
      const w = Math.exp(-Math.pow((t - p.t) / 0.035, 2)) * p.verwacht
      gewicht += w
      zw += w * (p.y - 0.5) * s.lengteM
      xw += w * (p.x - 0.5) * 14
    }
    const z = s.zacht
    z.a += (Math.min(4.2, gewicht * 2.6) - z.a) * zachtjes(2.5)
    if (gewicht > 0.01) {
      z.z += (zw / gewicht - z.z) * zachtjes(2.5)
      z.x += (xw / gewicht - z.x) * zachtjes(2.5)
    }
    // De naad: thuis verdedigt in de eerste helft de kant van y = 0 en wisselt bij de rust; wie
    // drukt, duwt de naad naar de tegenstander.
    const kantDoel = t < verloop.rust ? 1 : -1
    z.kant += (kantDoel - z.kant) * zachtjes(2)
    const m = momentumOp(verloop, t, t)
    z.naad += (0.5 + 0.2 * m * kantDoel - z.naad) * zachtjes(1.6)
    // De gloed helt over naar wie voor staat, en wat naar wie drukt.
    const stand = standOp(verloop, t)
    const voorsprong = Math.tanh((stand[0] - stand[1]) / 3)
    z.helling += (voorsprong * 0.6 + m * 0.4 - z.helling) * zachtjes(1.5)

    // Een doelpunt: het hele doek kleurt even in de kleur van de scorer.
    const pl = puls.current
    for (const i of [0, 1] as const) {
      if (stand[i] > pl.vorige[i]) {
        pl.sinds[i] = sec
        pl.vloed = sec
        pl.vloedKleur = i === 0 ? kleuren.home.a : kleuren.away.a
      }
      if (stand[i] < pl.vorige[i]) pl.sinds[i] = -99
    }
    pl.vorige = stand
    const vloedSterkte = Math.exp(-Math.max(0, sec - pl.vloed) * 1.8) * (sec >= pl.vloed ? 1 : 0)
    const vk = new THREE.Color(pl.vloedKleur)
    s.uniforms.uVloed.value.set(vk.r, vk.g, vk.b, vloedSterkte)

    s.uniforms.uTijd.value = sec
    s.uniforms.uGolf.value = 1.15 + z.a * 0.25
    s.uniforms.uZwel.value.set(z.z, z.a, z.x)
    s.uniforms.uNaad.value = z.naad
    s.uniforms.uKant.value = z.kant

    // De gele ringen boven de doelpunten, telkens even opploppend.
    for (const d of s.doelen) {
      const p = verloop.pieken[d.i]
      const voor = (t - p.t) / GROEI
      d.sprite.visible = voor > 0.6
      if (!d.sprite.visible) continue
      let h = golfOp(d.x, d.z, sec, s.uniforms.uGolf.value, s.uniforms.uZwel.value)
      for (let i = 0; i < aantal; i++) {
        const o = i * 4
        const ddx = d.x - s.bulten[o]
        const ddz = d.z - s.bulten[o + 1]
        h += s.bulten[o + 2] * Math.exp(-(ddx * ddx + ddz * ddz) / (2 * BULT_S * BULT_S))
      }
      const schaal = 1.5 * veer((voor - 0.6) / 0.8)
      d.sprite.scale.set(schaal, schaal, 1)
      d.sprite.position.set(d.x + d.dx, h + 1.5, d.z)
    }

    // De camera: vast, schuin van opzij, uitgerekend zodat het hele lange krachtbalveld (met pieken
    // tot ± 14 m) tussen kop en tijdlijn past; met een heel zachte zweving.
    const k = s.lengteM / 46
    s.camera.position.set(-97.7 * k + Math.sin(sec * 0.21) * 1.2, 48.9 * k + Math.sin(sec * 0.17) * 0.8, -49.7 * k)
    s.camera.lookAt(0, 4, 0)
    s.renderer.render(s.scene, s.camera)

    // Achtergrond: donker, met de gloed van elke club in haar hoek, sterker voor wie voor staat.
    if (!achtergrond.current) achtergrond.current = bouwAchtergrond()
    g.drawImage(achtergrond.current, 0, 0)
    for (const [kleur, x, y, sterk] of [
      [kleuren.home.a, 150, H * 0.66, 0.12 + 0.22 * Math.max(0, z.helling)],
      [kleuren.away.a, W - 150, H * 0.36, 0.12 + 0.22 * Math.max(0, -z.helling)],
    ] as const) {
      const gl = g.createRadialGradient(x, y, 0, x, y, 640)
      gl.addColorStop(0, rgba(kleur, sterk))
      gl.addColorStop(1, rgba(kleur, 0))
      g.fillStyle = gl
      g.fillRect(0, 0, W, H)
    }
    g.drawImage(s.renderer.domElement, 0, 0)
    tekenKop(g, t, sec, stand)
    tekenTijdlijn(g, t)
  }

  // Bovenaan: per ploeg een kleurbalkje, de afkorting met logo of badge, de stand en de
  // doelpuntminuten; in het midden reeks en datum; rechts de klok met de voortgang in de helft.
  const tekenKop = (g: CanvasRenderingContext2D, t: number, sec: number, stand: [number, number]) => {
    const pl = puls.current
    g.textBaseline = 'alphabetic'
    const blok = (i: 0 | 1, x: number) => {
      const k = i === 0 ? kleuren.home : kleuren.away
      g.fillStyle = k.a
      g.fillRect(x, 54, 22, 7)
      g.fillStyle = k.b
      g.fillRect(x + 22, 54, 22, 7)
      g.fillStyle = 'rgba(255,255,255,.88)'
      g.font = `800 30px ${FONT}`
      g.textAlign = 'left'
      g.fillText(i === 0 ? namen.home : namen.away, x, 98)
      // Logo (rond, op een witte schijf) of een badge in de clubkleuren.
      const bx = x + 118
      const logo = i === 0 ? logoBeeld.current.home : logoBeeld.current.away
      g.save()
      g.beginPath()
      g.arc(bx, 87, 19, 0, Math.PI * 2)
      if (logo) {
        g.fillStyle = '#ffffff'
        g.fill()
        g.clip()
        const r = Math.min(30 / logo.naturalWidth, 30 / logo.naturalHeight)
        g.drawImage(logo, bx - (logo.naturalWidth * r) / 2, 87 - (logo.naturalHeight * r) / 2, logo.naturalWidth * r, logo.naturalHeight * r)
      } else {
        g.fillStyle = k.a
        g.fill()
        g.lineWidth = 4
        g.strokeStyle = k.b
        g.stroke()
      }
      g.restore()
      // De stand, die even oplicht in de clubkleur bij een doelpunt.
      const p = Math.exp(-(sec - pl.sinds[i]) * 4)
      g.save()
      g.translate(x - 4, 196)
      g.scale(1 + 0.12 * p, 1 + 0.12 * p)
      if (p > 0.02) {
        g.shadowColor = rgba(readableOnDark(k.a), 0.9 * p)
        g.shadowBlur = 36 * p
      }
      g.fillStyle = '#ffffff'
      g.font = `900 98px ${FONT}`
      g.fillText(String(stand[i]), 0, 0)
      g.restore()
      // De doelpuntminuten tot nu (de laatste die passen).
      const minuten = verloop.pieken.filter((q) => q.t <= t && q.soort !== 'misser' && q.kant === (i === 0 ? 'home' : 'away') && q.minuut != null).map((q) => `${q.minuut}'`)
      g.font = `700 21px ${FONT}`
      let tekst = ''
      for (let j = minuten.length - 1; j >= 0; j--) {
        const poging = `• ${minuten[j]}  ${tekst}`
        if (g.measureText(poging).width > 190) break
        tekst = poging
      }
      g.fillStyle = 'rgba(255,255,255,.75)'
      g.fillText(tekst.trim(), x, 236)
    }
    blok(0, 60)
    blok(1, 275)
    // Midden: reeks en datum.
    const [reeks, datum] = (matchLabel ?? '').split(' · ')
    g.textAlign = 'center'
    g.fillStyle = 'rgba(255,255,255,.85)'
    g.font = `800 22px ${FONT}`
    if (reeks) g.fillText(reeks, 640, 68, 260)
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.font = `700 19px ${FONT}`
    if (datum) g.fillText(datum, 640, 96, 260)
    // Rechts: de klok.
    const klok = klokOp(verloop, t)
    g.textAlign = 'right'
    g.fillStyle = '#ffffff'
    g.font = `900 ${klok.groot.length > 4 ? 64 : 84}px ${FONT}`
    g.fillText(klok.groot, 1020, 118)
    g.fillStyle = 'rgba(255,255,255,.65)'
    g.font = `700 20px ${FONT}`
    g.fillText(klok.klein, 1020, 150)
    g.fillStyle = 'rgba(255,255,255,.15)'
    g.fillRect(900, 164, 120, 4)
    g.fillStyle = GEEL
    g.fillRect(900, 164, 120 * klok.voortgang, 4)
  }

  // Onderaan: één momentumlijn (boven de as drukt thuis, eronder uit), de doelpunten als bolletjes,
  // rust en einde; op het einde de cijfers erboven.
  const tekenTijdlijn = (g: CanvasRenderingContext2D, t: number) => {
    const x0 = 60
    const x1 = 1020
    const y = 940
    const eind = klem((t - 0.985) / 0.015)
    g.textAlign = 'right'
    g.font = `700 19px ${FONT}`
    g.fillStyle = 'rgba(255,255,255,.75)'
    g.fillText('▲ hogere piek → gevaarlijker', 1020, 836)
    g.fillStyle = GEEL
    g.fillText('○ doelpunt', 1020, 862)
    g.textAlign = 'left'
    g.globalAlpha = 1 - eind
    g.fillStyle = 'rgba(255,255,255,.6)'
    g.font = `800 17px ${FONT}`
    g.fillText('MOMENTUM', x0, 892)
    g.globalAlpha = 1
    if (eind > 0) {
      const c = cijfersTot(verloop, t)
      const kolom = (label: string, waarden: [string, string], x: number) => {
        g.textAlign = 'center'
        g.fillStyle = 'rgba(255,255,255,.6)'
        g.font = `700 18px ${FONT}`
        g.fillText(label, x, 836)
        g.font = `900 30px ${FONT}`
        const mid = g.measureText(' – ').width
        g.fillStyle = readableOnDark(kleuren.home.a)
        g.textAlign = 'right'
        g.fillText(waarden[0], x - mid / 2, 872)
        g.fillStyle = 'rgba(255,255,255,.5)'
        g.textAlign = 'center'
        g.fillText('–', x, 872)
        g.fillStyle = readableOnDark(kleuren.away.a)
        g.textAlign = 'left'
        g.fillText(waarden[1], x + mid / 2, 872)
      }
      g.globalAlpha = eind
      kolom('Doelpogingen', [String(c.pogingen[0]), String(c.pogingen[1])], 170)
      kolom('Raak', [String(c.raak[0]), String(c.raak[1])], 390)
      kolom('Verwachte punten', [c.verwacht[0].toFixed(1).replace('.', ','), c.verwacht[1].toFixed(1).replace('.', ',')], 610)
      g.globalAlpha = 1
    }
    g.fillStyle = 'rgba(255,255,255,.18)'
    g.fillRect(x0, y, x1 - x0, 1.5)
    const rustX = x0 + verloop.rust * (x1 - x0)
    g.fillRect(rustX, y - 34, 1.5, 68)
    // De momentumlijn tot nu, gevuld naar de as in de kleur van de ploeg die drukt.
    const N = 260
    const tot = klem(t)
    const punten: { x: number; m: number }[] = []
    for (let i = 0; i <= N; i++) {
      const s = i / N
      if (s > tot) break
      punten.push({ x: x0 + s * (x1 - x0), m: momentumOp(verloop, s, tot) })
    }
    if (punten.length > 1) {
      for (const [kant, kleur] of [
        [1, kleuren.home.a],
        [-1, kleuren.away.a],
      ] as const) {
        g.beginPath()
        g.moveTo(punten[0].x, y)
        for (const p of punten) g.lineTo(p.x, y - Math.max(0, p.m * kant) * 32 * kant)
        g.lineTo(punten[punten.length - 1].x, y)
        g.closePath()
        g.fillStyle = rgba(kleur, 0.5)
        g.fill()
      }
      g.beginPath()
      punten.forEach((p, i) => (i ? g.lineTo(p.x, y - p.m * 32) : g.moveTo(p.x, y - p.m * 32)))
      g.strokeStyle = 'rgba(255,255,255,.85)'
      g.lineWidth = 1.6
      g.stroke()
    }
    const lx = x0 + tot * (x1 - x0)
    g.fillStyle = 'rgba(255,255,255,.85)'
    g.fillRect(lx - 1, y - 34, 2, 68)
    for (const p of verloop.pieken) {
      if (p.soort === 'misser' || p.t > tot) continue
      g.beginPath()
      g.arc(x0 + p.t * (x1 - x0), y + 50, 6, 0, Math.PI * 2)
      g.fillStyle = p.kant === 'home' ? kleuren.home.a : kleuren.away.a
      g.fill()
      g.lineWidth = 2
      g.strokeStyle = 'rgba(255,255,255,.85)'
      g.stroke()
    }
    g.fillStyle = 'rgba(255,255,255,.5)'
    g.font = `700 16px ${FONT}`
    g.textAlign = 'left'
    g.fillText(verloop.tijdas === 'klok' ? "1'" : 'start', x0, y + 84)
    g.textAlign = 'center'
    if (rustX - x0 > 70 && x1 - rustX > 70) g.fillText('rust', rustX, y + 84)
    g.textAlign = 'right'
    g.fillText('einde', x1, y + 84)
    g.textAlign = 'left'
    g.fillStyle = GEEL
    g.font = `900 18px ${FONT}`
    g.fillText('KRACHTBAL LIVE', x0, 1052)
    g.textAlign = 'right'
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.font = `700 17px ${FONT}`
    g.fillText('krachtbal.live', x1, 1052)
  }

  const tekenRef = useRef(teken)
  tekenRef.current = teken
  const warpRef = useRef(warp)
  warpRef.current = warp

  // De scène opbouwen en de doorlopende tekenlus starten: bij het openen speelt het verloop af van
  // de eerste minuut tot het einde.
  useEffect(() => {
    const c = zichtbaar.current
    if (!c || verloop.pieken.length === 0) return
    const webgl = document.createElement('canvas')
    webgl.width = W
    webgl.height = H
    try {
      scene.current = bouwScene(webgl, verloop, kleuren, goalAreaDepth, speelveldM)
      achtergrond.current = bouwAchtergrond()
      setFout(null)
    } catch (err) {
      setFout((err as Error).message || 'WebGL kon niet starten.')
      return
    }
    posR.current = 0
    doelT.current = 0
    toonT.current = 0
    modus.current = 'speelt'
    setSpeelt(true)
    puls.current = { vorige: [0, 0], sinds: [-99, -99], vloed: -99, vloedKleur: '#ffffff' }
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
      // Traag toestel (gemiddeld trager dan ± 22 beelden per seconde): de helft van de beelden.
      // Nooit tijdens een opname: die moet gelijkmatig lopen.
      beeld++
      if (m !== 'opname' && gemiddeld > 0.045 && beeld % 2 === 1) return
      const dt = Math.min(0.1, (nu - vorige) / 1000)
      vorige = nu
      gemiddeld = gemiddeld * 0.94 + dt * 0.06
      if (m === 'speelt') {
        posR.current = Math.min(1, posR.current + (dt * snelheidRef.current) / AFSPEELDUUR)
        doelT.current = warpRef.current.naarT(posR.current)
        toonT.current = doelT.current
        if (posR.current >= 1) {
          doelT.current = 1
          toonT.current = 1
          modus.current = 'stil'
          setSpeelt(false)
        }
      } else if (m === 'opname') {
        const s = (nu - opnameStart.current) / 1000
        posR.current = Math.min(1, s / AFSPEELDUUR)
        doelT.current = posR.current >= 1 ? 1 : warpRef.current.naarT(posR.current)
        toonT.current = doelT.current
        if (nu - laatsteUi > 200) setOpname({ pct: Math.min(100, Math.round((s / (AFSPEELDUUR + NAHOUD)) * 100)) })
        if (s >= AFSPEELDUUR + NAHOUD) {
          modus.current = 'stil'
          opnameKlaar.current?.()
          opnameKlaar.current = null
        }
      } else {
        const verschil = doelT.current - toonT.current
        toonT.current = Math.abs(verschil) < 1e-4 ? doelT.current : toonT.current + verschil * (1 - Math.exp(-dt * 6))
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
  }, [verloop, kleuren, goalAreaDepth, speelveldM])

  const spring = (t: number) => {
    modus.current = 'stil'
    setSpeelt(false)
    doelT.current = t
    posR.current = warp.naarR(t)
    setTijd(t)
  }
  const afspelen = () => {
    if (doelT.current >= 1) {
      posR.current = 0
      doelT.current = 0
      toonT.current = 0
    } else {
      posR.current = warp.naarR(doelT.current)
      toonT.current = doelT.current
    }
    modus.current = 'speelt'
    setSpeelt(true)
  }
  const pauze = () => {
    modus.current = 'stil'
    setSpeelt(false)
  }

  const bestandsnaam = (ext: string) => `${slugFilename('wedstrijdverloop', teams.home, teams.away, matchLabel) || 'wedstrijdverloop'}.${ext}`

  // PNG van het moment waar je staat.
  const bewaarBeeld = async () => {
    const c = zichtbaar.current
    if (!c) return
    toonT.current = doelT.current
    teken(doelT.current, performance.now() / 1000, 1)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
    if (!blob) return toonMelding('⚠️ Beeld bewaren lukte niet.')
    await saveOrShareBlob(blob, bestandsnaam('png'), `${teams.home} – ${teams.away}${matchLabel ? ` · ${matchLabel}` : ''}`)
  }

  // Video: het canvas opnemen terwijl het verloop van de eerste minuut tot het einde speelt, met een
  // korte nahoud op het eindbeeld. De tekenlus doet het werk (modus 'opname'); hier enkel de
  // recorder. mp4 (H.264) eerst — dat kan je via WhatsApp doorsturen — anders webm. Elk type wordt
  // eerst een halve seconde geprobeerd: sommige toestellen zeggen dat mp4 kan en laten de recorder dan sterven.
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

  // De knoppen en de rand rond het beeld in de clubkleuren.
  const stijl = {
    '--vh': readableOnDark(kleuren.home.a),
    '--vh-inkt': inkOn(readableOnDark(kleuren.home.a)),
    '--va': readableOnDark(kleuren.away.a),
  } as CSSProperties

  return (
    <div className="verloop3d" style={stijl}>
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
