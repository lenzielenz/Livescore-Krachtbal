'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { balOp, balSpoor, bezitOp, bezitTijdlijn, decodeer, op, ploegKleuren, snelheid, type Ploeg, type Reconstructie, type Spoor, type StadionThema, type Veld } from '@/lib/virtueel'
import { bouwStadion } from './stadion'

// Virtueel krachtbal: een gereconstrueerd wedstrijdfragment in 3D. Je kijkt vanop de tribune,
// volgt de bal, kruipt in het hoofd van een speler of loopt zelf over het veld (WASD/pijltjes of
// de joystick op gsm, slepen om rond te kijken). Alle posities komen uit src/lib/virtueel.ts; deze
// component bouwt enkel de scène en tekent elke frame de stand op het huidige tijdstip.

type Modus = 'tribune' | 'bal' | 'speler' | 'lopen'
const MODI: { id: Modus; label: string; uitleg: string }[] = [
  { id: 'tribune', label: 'Tribune', uitleg: 'Draai, zoom en verschuif vrij rond het veld.' },
  { id: 'bal', label: 'Volg de bal', uitleg: 'De camera blijft bij de bal, langs de zijlijn.' },
  { id: 'speler', label: 'Spelersblik', uitleg: 'Kijk door de ogen van een speler. Kies hieronder wie.' },
  { id: 'lopen', label: 'Loop rond', uitleg: 'WASD of pijltjes om te lopen, sleep om rond te kijken. Op gsm: joystick links onder.' },
]
const SNELHEDEN = [0.25, 0.5, 1, 2]
const OOGHOOGTE = 1.7

const kort = (id: string) => id.replace(/^T\d-/, '')
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`

// ---------- textuurtjes, allemaal getekend: geen extra bestanden nodig ----------

/** Het hele veld in één textuur: kunstgras in banen van 4 m, de doelgebieden, en alle lijnen. */
function veldTextuur(f: Veld, marge: number): THREE.CanvasTexture {
  const pxm = 40
  const L = f.length_m
  const W = f.width_m
  const w = Math.round((L + 2 * marge) * pxm)
  const h = Math.round((W + 2 * marge) * pxm)
  const X = (x: number) => (x + marge) * pxm
  const Y = (y: number) => (y + marge) * pxm
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  for (let x = 0, k = 0; x < w; x += 4 * pxm, k++) {
    g.fillStyle = k % 2 ? '#2c8549' : '#287a42'
    g.fillRect(x, 0, 4 * pxm, h)
  }
  g.fillStyle = 'rgba(6,24,14,.28)'
  g.fillRect(0, 0, w, Y(0))
  g.fillRect(0, Y(W), w, h - Y(W))
  g.fillRect(0, 0, X(0), h)
  g.fillRect(X(L), 0, w - X(L), h)
  // Doelgebieden achter de doellijnen.
  for (const [a, e] of [[0, f.goal_a], [f.goal_b, L]] as const) {
    g.fillStyle = 'rgba(29,104,140,.6)'
    g.fillRect(X(a), Y(0), (e - a) * pxm, W * pxm)
  }
  // Fijne vezelstructuur.
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  let z = 12345
  const rnd = () => (z = (z * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 16
    d[i] += n * 0.4
    d[i + 1] += n
    d[i + 2] += n * 0.45
  }
  g.putImageData(img, 0, 0)
  const lijn = (x0: number, y0: number, x1: number, y1: number) => {
    g.fillStyle = 'rgba(244,248,245,.95)'
    const dk = 0.1 * pxm
    if (x0 === x1) g.fillRect(X(x0) - dk / 2, Y(Math.min(y0, y1)), dk, Math.abs(y1 - y0) * pxm)
    else g.fillRect(X(Math.min(x0, x1)), Y(y0) - dk / 2, Math.abs(x1 - x0) * pxm, dk)
  }
  lijn(0, 0, L, 0)
  lijn(0, W, L, W)
  lijn(0, 0, 0, W)
  lijn(L, 0, L, W)
  for (const x of [f.goal_a, f.goal_b]) lijn(x, -0.5, x, W + 0.5)
  for (const x of [f.goal_a + 4, f.goal_b - 4, (f.goal_a + f.goal_b) / 2]) lijn(x, 0, x, W)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function tekstSprite(tekst: string, kleur: string, hoogte = 0.32): THREE.Sprite {
  const c = document.createElement('canvas')
  const m = c.getContext('2d')!
  m.font = '800 30px Inter, system-ui, sans-serif'
  const w = Math.ceil(m.measureText(tekst).width + 30)
  c.width = w
  c.height = 48
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(8,14,22,.82)'
  g.beginPath()
  g.roundRect(2, 4, w - 4, 40, 20)
  g.fill()
  g.strokeStyle = kleur
  g.lineWidth = 4
  g.stroke()
  g.font = '800 30px Inter, system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#f8fafc'
  g.fillText(tekst, w / 2, 25)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  s.scale.set((hoogte * w) / 48, hoogte, 1)
  return s
}

function gloedTextuur(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,248,200,1)')
  gr.addColorStop(0.3, 'rgba(253,224,71,.5)')
  gr.addColorStop(1, 'rgba(253,224,71,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

// ---------- spelersfiguur ----------

type Figuur = {
  groep: THREE.Group
  benen: [THREE.Group, THREE.Group]
  armen: [THREE.Group, THREE.Group]
  ring: THREE.Mesh
  label: THREE.Sprite
  hoek: number
}

function maakFiguur(kleur: string, label: string): Figuur {
  const groep = new THREE.Group()
  const tenue = new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.55 })
  const broek = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.7 })
  const huid = new THREE.MeshStandardMaterial({ color: '#e7c3a0', roughness: 0.8 })
  const schoen = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.6 })

  const been = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0.92, 0)
    const dij = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.48, 10), broek)
    dij.position.y = -0.22
    const scheen = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.42, 10), huid)
    scheen.position.y = -0.64
    const voet = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), schoen)
    voet.position.set(0, -0.88, 0.05)
    for (const m of [dij, scheen, voet]) m.castShadow = true
    g.add(dij, scheen, voet)
    groep.add(g)
    return g
  }
  const arm = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 1.48, 0)
    const boven = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 8), tenue)
    boven.position.y = -0.16
    const onder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 8), huid)
    onder.position.y = -0.46
    for (const m of [boven, onder]) m.castShadow = true
    g.add(boven, onder)
    groep.add(g)
    return g
  }
  const romp = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 14), tenue)
  romp.position.y = 1.24
  romp.scale.set(1, 1, 0.72)
  romp.castShadow = true
  const hoofd = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), huid)
  hoofd.position.y = 1.7
  hoofd.castShadow = true
  const haar = new THREE.Mesh(
    new THREE.SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.1),
    new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 0.9 }),
  )
  haar.position.y = 1.715
  haar.rotation.x = -0.25
  groep.add(romp, hoofd, haar)
  const benen: [THREE.Group, THREE.Group] = [been(-0.1), been(0.1)]
  const armen: [THREE.Group, THREE.Group] = [arm(-0.27), arm(0.27)]

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 40),
    new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.35, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  groep.add(ring)

  const lbl = tekstSprite(label, kleur)
  lbl.position.y = 2.2
  groep.add(lbl)
  return { groep, benen, armen, ring, label: lbl, hoek: 0 }
}

// ---------- de component ----------

export function VirtueelViewer({ slug, thema }: { slug: string; thema: StadionThema }) {
  const houder = useRef<HTMLDivElement>(null)
  const joystickRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<{ sporen: Spoor[]; duur: number; veld: Veld; ploegen: Ploeg[]; kleuren: Record<number, string> } | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [tijd, setTijd] = useState(0)
  const [spelend, setSpelend] = useState(false)
  const [snel, setSnel] = useState(1)
  const [modus, setModus] = useState<Modus>('tribune')
  const [gekozen, setGekozen] = useState<string | null>(null)
  const [namen, setNamen] = useState(true)
  const [bezit, setBezit] = useState<number | null>(null)
  const [stick, setStick] = useState({ x: 0, y: 0 })

  // Wat de tekenlus nodig heeft, zonder bij elke wijziging de scène opnieuw te bouwen.
  const st = useRef({ tijd: 0, spelend: false, snel: 1, modus: 'tribune' as Modus, gekozen: null as string | null, namen: true, stick: { x: 0, y: 0 }, spoel: false })
  st.current.spelend = spelend
  st.current.snel = snel
  st.current.modus = modus
  st.current.gekozen = gekozen
  st.current.namen = namen
  st.current.stick = stick

  useEffect(() => {
    let weg = false
    fetch(`/virtueel/${encodeURIComponent(slug)}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Fragment niet gevonden')
        return r.json() as Promise<Reconstructie>
      })
      .then((r) => {
        if (weg) return
        const sporen = decodeer(r)
        setData({ sporen, duur: r.duur_s, veld: r.veld, ploegen: r.ploegen, kleuren: ploegKleuren(r.ploegen) })
        setGekozen(sporen.find((s) => !s.bal)?.id ?? null)
        setSpelend(true)
      })
      .catch((e: Error) => !weg && setFout(e.message))
    return () => {
      weg = true
    }
  }, [slug])

  useEffect(() => {
    const el = houder.current
    if (!data || !el) return
    const { sporen, veld, kleuren, duur } = data
    const cx = veld.length_m / 2
    const cz = veld.width_m / 2
    const W = (x: number, y: number) => new THREE.Vector3(x - cx, 0, y - cz)

    // Lichte modus voor gsm's en zwakke toestellen: minder pixels, kleinere schaduwkaart, minder
    // publiek. Daarnaast past de beeldscherpte zich aan zodra het afspelen hapert (zie de tekenlus).
    const licht = window.matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4
    let pixels = Math.min(window.devicePixelRatio, licht ? 1.25 : 1.75)
    const renderer = new THREE.WebGLRenderer({ antialias: !licht, powerPreference: 'high-performance' })
    renderer.setPixelRatio(pixels)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.className = 'vk-canvas'
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog('#0b1626', 110, 330)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900)
    camera.position.set(-6, 15.5, 21)

    // Hemel: nachtblauw met een warme gloed van de lichtmasten aan de horizon, en sterren.
    {
      const c = document.createElement('canvas')
      c.width = 4
      c.height = 256
      const g = c.getContext('2d')!
      const gr = g.createLinearGradient(0, 0, 0, 256)
      gr.addColorStop(0, '#03070f')
      gr.addColorStop(0.4, '#0b1828')
      gr.addColorStop(0.49, '#22384b')
      gr.addColorStop(0.52, '#121c26')
      gr.addColorStop(1, '#070b10')
      g.fillStyle = gr
      g.fillRect(0, 0, 4, 256)
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })))
      const n = 700
      const pos = new Float32Array(n * 3)
      let z = 777
      const rnd = () => (z = (z * 16807) % 2147483647) / 2147483647
      for (let i = 0; i < n; i++) {
        const az = rnd() * Math.PI * 2
        const elv = 0.12 + Math.asin(rnd()) * 0.9
        pos.set([400 * Math.cos(elv) * Math.cos(az), 400 * Math.sin(elv), 400 * Math.cos(elv) * Math.sin(az)], i * 3)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdbeafe, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false })))
    }

    // Licht: zacht hemellicht en één "maanlicht" met schaduwen; de lichtmasten staan in stadion.ts.
    scene.add(new THREE.HemisphereLight('#b9d4ff', '#1d3b26', 0.75))
    const zon = new THREE.DirectionalLight('#fff4dc', 1.6)
    zon.position.set(-14, 30, 18)
    zon.castShadow = true
    zon.shadow.mapSize.set(licht ? 1024 : 2048, licht ? 1024 : 2048)
    Object.assign(zon.shadow.camera, { left: -32, right: 32, top: 20, bottom: -20, near: 1, far: 90 })
    zon.shadow.bias = -0.0004
    scene.add(zon)
    const gloed = gloedTextuur()
    // Grond rondom en het veld zelf.
    const grond = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshStandardMaterial({ color: '#16301f', roughness: 1 }))
    grond.rotation.x = -Math.PI / 2
    grond.position.y = -0.02
    grond.receiveShadow = true
    scene.add(grond)
    const marge = 4
    const veldVlak = new THREE.Mesh(
      new THREE.PlaneGeometry(veld.length_m + 2 * marge, veld.width_m + 2 * marge),
      new THREE.MeshStandardMaterial({ map: veldTextuur(veld, marge), roughness: 0.92 }),
    )
    veldVlak.rotation.x = -Math.PI / 2
    veldVlak.receiveShadow = true
    scene.add(veldVlak)

    // Het stadion rondom, in de kleuren van de club die kijkt.
    const stadion = bouwStadion(scene, { veld, marge, thema, licht })
    const bezitAandeel = bezitTijdlijn(sporen)
    const scorePloegen = data.ploegen.map((p) => ({ naam: p.naam, kleur: kleuren[p.id] ?? '#b2bbb6' }))

    // Spelers en bal.
    const figuren = new Map<string, Figuur>()
    for (const s of sporen) {
      if (s.bal) continue
      const f = maakFiguur(kleuren[s.team ?? 0] ?? '#b2bbb6', kort(s.id))
      f.groep.visible = false
      scene.add(f.groep)
      figuren.set(s.id, f)
    }
    const bal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#facc15', emissiveIntensity: 0.45, roughness: 0.4 }))
    bal.castShadow = true
    const balGloed = new THREE.Sprite(new THREE.SpriteMaterial({ map: gloed, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    balGloed.scale.set(1.3, 1.3, 1)
    bal.add(balGloed)
    scene.add(bal)
    const MAX = 90
    const spoorGeo = new THREE.BufferGeometry()
    spoorGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3))
    spoorGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3))
    const spoorLijn = new THREE.Line(spoorGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    spoorLijn.frustumCulled = false
    scene.add(spoorLijn)
    const schaduw = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }))
    schaduw.rotation.x = -Math.PI / 2
    schaduw.position.y = 0.015
    scene.add(schaduw)

    // Camera's.
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.set(0, 0, 0)
    orbit.enableDamping = true
    orbit.maxPolarAngle = Math.PI / 2 - 0.06
    orbit.minDistance = 4
    orbit.maxDistance = 58
    const doel = new THREE.Vector3()
    const kijk = new THREE.Vector3()
    const tmp = new THREE.Vector3()
    // Lopen: eigen positie + kijkrichting.
    const loper = { pos: W(cx - 8, -1.5), yaw: 0.35, pitch: -0.08 }
    loper.pos.y = OOGHOOGTE
    const toetsen = new Set<string>()
    const opToets = (e: KeyboardEvent) => {
      if (st.current.modus !== 'lopen') return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        toetsen.add(e.code)
        e.preventDefault()
      }
    }
    const losToets = (e: KeyboardEvent) => toetsen.delete(e.code)
    window.addEventListener('keydown', opToets)
    window.addEventListener('keyup', losToets)
    let sleep: { x: number; y: number } | null = null
    const neer = (e: PointerEvent) => {
      if (st.current.modus !== 'lopen') return
      sleep = { x: e.clientX, y: e.clientY }
      renderer.domElement.setPointerCapture(e.pointerId)
    }
    const beweeg = (e: PointerEvent) => {
      if (!sleep) return
      loper.yaw -= (e.clientX - sleep.x) * 0.005
      loper.pitch = Math.max(-1.2, Math.min(1.2, loper.pitch - (e.clientY - sleep.y) * 0.004))
      sleep = { x: e.clientX, y: e.clientY }
    }
    const op_ = () => (sleep = null)
    renderer.domElement.addEventListener('pointerdown', neer)
    renderer.domElement.addEventListener('pointermove', beweeg)
    renderer.domElement.addEventListener('pointerup', op_)
    renderer.domElement.addEventListener('pointercancel', op_)

    const maat = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    maat()
    const ro = new ResizeObserver(maat)
    ro.observe(el)

    let vorige = performance.now()
    let laatsteUi = 0
    let vorigeModus: Modus = st.current.modus
    let frames = 0
    let frameTijd = 0
    let raf = 0
    const tik = (nu: number) => {
      raf = requestAnimationFrame(tik)
      const dt = Math.min(0.1, (nu - vorige) / 1000)
      vorige = nu
      const s = st.current
      if (s.spelend) {
        s.tijd += dt * s.snel
        if (s.tijd >= duur) {
          s.tijd = duur
          setSpelend(false)
        }
      }
      const t = s.tijd

      // Spelers.
      const b = balOp(sporen, t)
      for (const sp of sporen) {
        if (sp.bal) continue
        const f = figuren.get(sp.id)!
        const p = op(sp, t)
        // In de spelersblik zit de camera in zijn hoofd: zijn eigen lijf zou het beeld vullen.
        f.groep.visible = Boolean(p) && !(s.modus === 'speler' && s.gekozen === sp.id)
        if (!p) continue
        f.groep.position.copy(W(p.x, p.y))
        const v = snelheid(sp, t)
        const v2 = Math.hypot(v.vx, v.vy)
        // Kijkrichting: waar hij heen loopt; staat hij stil, dan naar de bal.
        let richting = f.hoek
        if (v2 > 0.6) richting = Math.atan2(v.vx, v.vy)
        else if (b) richting = Math.atan2(b.x - p.x, b.y - p.y)
        let verschil = richting - f.hoek
        verschil = Math.atan2(Math.sin(verschil), Math.cos(verschil))
        f.hoek += verschil * Math.min(1, dt * 8)
        f.groep.rotation.y = f.hoek
        const zwaai = Math.sin(t * Math.PI * 2 * (1.4 + v2 * 0.25)) * Math.min(0.9, v2 / 4.5)
        f.benen[0].rotation.x = zwaai
        f.benen[1].rotation.x = -zwaai
        const heeftBal = b?.houder?.id === sp.id
        f.armen[0].rotation.x = heeftBal ? -1.1 : -zwaai * 0.8
        f.armen[1].rotation.x = heeftBal ? -1.1 : zwaai * 0.8
        const mat = f.ring.material as THREE.MeshBasicMaterial
        mat.opacity = heeftBal ? 0.95 : s.gekozen === sp.id && s.modus === 'speler' ? 0.7 : 0.3
        f.label.visible = s.namen && !(s.modus === 'speler' && s.gekozen === sp.id)
      }

      // Bal + spoor.
      bal.visible = Boolean(b)
      schaduw.visible = Boolean(b)
      if (b) {
        bal.position.set(b.x - cx, b.z, b.y - cz)
        bal.rotation.x += dt * (b.fase === 'held' ? 0.5 : 9)
        schaduw.position.set(b.x - cx, 0.015, b.y - cz)
        ;(schaduw.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.4 - b.z * 0.06)
      }
      const pts = b && b.fase !== 'held' ? balSpoor(sporen, t, 1.6) : []
      const pa = spoorGeo.attributes.position as THREE.BufferAttribute
      const ca = spoorGeo.attributes.color as THREE.BufferAttribute
      const n = Math.min(MAX, pts.length)
      const begin = pts.length - n
      for (let i = 0; i < n; i++) {
        const q = pts[begin + i]
        pa.setXYZ(i, q.x - cx, q.z, q.y - cz)
        const a = (i + 1) / n
        ca.setXYZ(i, a, 0.85 * a, 0.25 * a)
      }
      pa.needsUpdate = true
      ca.needsUpdate = true
      spoorGeo.setDrawRange(0, n)

      // Camera.
      if (s.modus !== vorigeModus) {
        if (s.modus === 'tribune') {
          camera.position.set(-6, 15.5, 21)
          orbit.target.set(0, 0, 0)
        }
        if (s.modus === 'lopen') {
          loper.pos.copy(camera.position)
          loper.pos.y = OOGHOOGTE
          const r = new THREE.Vector3()
          camera.getWorldDirection(r)
          loper.yaw = Math.atan2(r.x, r.z)
          loper.pitch = -0.05
          toetsen.clear()
        }
        vorigeModus = s.modus
      }
      orbit.enabled = s.modus === 'tribune'
      if (s.modus === 'tribune') orbit.update()
      else if (s.modus === 'bal' && b) {
        doel.set(b.x - cx, Math.max(0.8, b.z * 0.6), b.y - cz)
        kijk.lerp(doel, Math.min(1, dt * 4))
        // Langs de zijlijn, binnen de ledborden: anders hangt het bord voor de lens.
        const camDoel = tmp.set(kijk.x - 3, 5.5, cz + 3.6)
        camera.position.lerp(camDoel, Math.min(1, dt * 2.5))
        camera.lookAt(kijk)
      } else if (s.modus === 'speler') {
        const sp = sporen.find((x) => x.id === s.gekozen)
        const p = sp && op(sp, t)
        const f = sp && figuren.get(sp.id)
        if (p && f) {
          const oog = W(p.x, p.y)
          oog.y = OOGHOOGTE
          oog.x += Math.sin(f.hoek) * 0.18
          oog.z += Math.cos(f.hoek) * 0.18
          camera.position.lerp(oog, Math.min(1, dt * 10))
          if (b) doel.set(b.x - cx, b.z, b.y - cz)
          else doel.set(oog.x + Math.sin(f.hoek), OOGHOOGTE, oog.z + Math.cos(f.hoek))
          kijk.lerp(doel, Math.min(1, dt * 5))
          camera.lookAt(kijk)
        }
      } else if (s.modus === 'lopen') {
        const vooruit = (toetsen.has('KeyW') || toetsen.has('ArrowUp') ? 1 : 0) - (toetsen.has('KeyS') || toetsen.has('ArrowDown') ? 1 : 0) - s.stick.y
        const opzij = (toetsen.has('KeyD') ? 1 : 0) - (toetsen.has('KeyA') ? 1 : 0) + s.stick.x
        const draai = (toetsen.has('ArrowLeft') ? 1 : 0) - (toetsen.has('ArrowRight') ? 1 : 0)
        loper.yaw += draai * dt * 1.8
        const tempo = toetsen.has('ShiftLeft') || toetsen.has('ShiftRight') ? 7.5 : 3.8
        const fx = Math.sin(loper.yaw)
        const fz = Math.cos(loper.yaw)
        loper.pos.x += (fx * vooruit - fz * opzij) * tempo * dt
        loper.pos.z += (fz * vooruit + fx * opzij) * tempo * dt
        loper.pos.x = Math.max(-cx - marge + 0.3, Math.min(cx + marge - 0.3, loper.pos.x))
        loper.pos.z = Math.max(-cz - marge + 0.3, Math.min(cz + marge - 0.3, loper.pos.z))
        const stap = Math.hypot(vooruit, opzij) > 0.05 ? Math.sin(nu / 140) * 0.035 : 0
        camera.position.set(loper.pos.x, OOGHOOGTE + stap, loper.pos.z)
        camera.lookAt(
          loper.pos.x + Math.sin(loper.yaw) * Math.cos(loper.pitch),
          OOGHOOGTE + Math.sin(loper.pitch),
          loper.pos.z + Math.cos(loper.yaw) * Math.cos(loper.pitch),
        )
      }

      stadion.update(nu / 1000, { tijd: t, duur, bezit: bezitAandeel(t), ploegen: scorePloegen })
      renderer.render(scene, camera)

      // Hapert het? Dan stap voor stap minder pixels, tot het weer vlot loopt.
      frames++
      frameTijd += dt
      if (frames >= 90) {
        if (frameTijd / frames > 1 / 40 && pixels > 0.8) {
          pixels = Math.max(0.8, pixels - 0.25)
          renderer.setPixelRatio(pixels)
          maat()
        }
        frames = 0
        frameTijd = 0
      }

      // De knoppen en tijdlijn ~12 keer per seconde bijwerken is genoeg.
      if (nu - laatsteUi > 80) {
        laatsteUi = nu
        setTijd(t)
        setBezit(bezitOp(sporen, t))
      }
    }
    raf = requestAnimationFrame(tik)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', opToets)
      window.removeEventListener('keyup', losToets)
      orbit.dispose()
      renderer.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        for (const x of mats) {
          ;(x as THREE.MeshStandardMaterial).map?.dispose()
          x.dispose()
        }
      })
      renderer.domElement.remove()
    }
  }, [data, thema])

  const spoel = (t: number) => {
    if (!data) return
    st.current.tijd = Math.max(0, Math.min(data.duur, t))
    setTijd(st.current.tijd)
  }
  const speel = () => {
    if (!data) return
    if (!spelend && st.current.tijd >= data.duur - 0.05) spoel(0)
    setSpelend(!spelend)
  }

  // Joystick (gsm): een duim-knop binnen een cirkel, als stuurvector van -1 tot 1.
  const joyNeer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    joyZet(e)
  }
  const joyZet = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const r = e.currentTarget.getBoundingClientRect()
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2)
    let y = (e.clientY - r.top - r.height / 2) / (r.height / 2)
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    setStick({ x, y })
  }
  const joyLos = () => setStick({ x: 0, y: 0 })

  const fullscreen = () => {
    const el = houder.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => {})
  }

  if (fout) return <p className="vk-fout">Dit fragment kon niet geladen worden: {fout}</p>

  const spelers = data?.sporen.filter((s) => !s.bal) ?? []
  const ploegNaam = (team: number | null) => {
    const p = data?.ploegen.find((x) => x.id === team)
    return p ? `${p.naam} (${p.thuis ? 'thuis' : 'uit'})` : 'Onbekend'
  }

  return (
    <div className="vk">
      <div className={`vk-scene modus-${modus}`} ref={houder}>
        {!data && <div className="vk-laden">3D-veld opbouwen…</div>}
        {data && (
          <>
            <div className="vk-hud">
              <div className="vk-modi" role="tablist" aria-label="Camera">
                {MODI.map((m) => (
                  <button key={m.id} role="tab" aria-selected={modus === m.id} className={modus === m.id ? 'actief' : ''} onClick={() => setModus(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              {bezit != null && (
                <span className="vk-bezit">
                  <i style={{ background: data.kleuren[bezit] }} /> Balbezit · {ploegNaam(bezit)}
                </span>
              )}
            </div>
            <button className="vk-vol" onClick={fullscreen} aria-label="Volledig scherm">⛶</button>
            <p className="vk-uitleg">{MODI.find((m) => m.id === modus)?.uitleg}</p>
            {modus === 'lopen' && (
              <div className="vk-joy" ref={joystickRef} onPointerDown={joyNeer} onPointerMove={joyZet} onPointerUp={joyLos} onPointerCancel={joyLos} aria-hidden>
                <span style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }} />
              </div>
            )}
          </>
        )}
      </div>

      {data && (
        <div className="vk-balk">
          <button className="vk-knop speel" onClick={speel} aria-label={spelend ? 'Pauzeren' : 'Afspelen'}>
            {spelend ? '❚❚' : '▶'}
          </button>
          <button className="vk-knop" onClick={() => spoel(st.current.tijd - 5)} aria-label="5 seconden terug">−5s</button>
          <input
            className="vk-tijdlijn"
            type="range"
            min={0}
            max={data.duur}
            step={0.01}
            value={tijd}
            onChange={(e) => spoel(Number(e.target.value))}
            aria-label="Tijdlijn"
          />
          <span className="vk-klok">{fmt(tijd)} / {fmt(data.duur)}</span>
          <button className="vk-knop" onClick={() => setSnel(SNELHEDEN[(SNELHEDEN.indexOf(snel) + 1) % SNELHEDEN.length])} aria-label="Afspeelsnelheid">
            {snel}×
          </button>
        </div>
      )}

      {data && (
        <div className="vk-spelers">
          <div className="vk-spelers-kop">
            <span>Spelers</span>
            <label className="vk-wissel">
              <input type="checkbox" checked={namen} onChange={(e) => setNamen(e.target.checked)} /> Labels
            </label>
          </div>
          {data.ploegen.map((p) => (
            <div key={p.id} className="vk-ploeg">
              <span className="vk-ploeg-naam">
                <i style={{ background: data.kleuren[p.id] }} />
                {ploegNaam(p.id)}
              </span>
              <div className="vk-chips">
                {spelers
                  .filter((s) => s.team === p.id)
                  .map((s) => (
                    <button
                      key={s.id}
                      className={`vk-chip${gekozen === s.id && modus === 'speler' ? ' actief' : ''}`}
                      style={{ '--kleur': data.kleuren[p.id] } as React.CSSProperties}
                      onClick={() => {
                        setGekozen(s.id)
                        setModus('speler')
                      }}
                      title={`Kijk door de ogen van ${kort(s.id)}`}
                    >
                      {kort(s.id)}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
