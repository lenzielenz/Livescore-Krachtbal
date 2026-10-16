'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import {
  PIJL_KLEUREN,
  actieRond,
  balOp,
  cameraStandpunt,
  heatKleur,
  isDoelpunt,
  positieOp,
  somHeat,
  spoor,
  tijdLabel,
  uitkomstKleur,
  uitkomstLabel,
  veldLijnen,
  worpBoog,
  type Actie,
  type AppData,
  type AppWorp,
  type CameraStandpunt,
  type Pijl,
  type XY,
} from '@/lib/app-analyse-veld'

import './app-3d-stappen.css'

// De wedstrijd in 3D: het veld op ware grootte, de worpen als bogen door de lucht (met de tophoogte
// die de app mat), de heatmap op het gras, en spelers en bal op hun plaats op elk moment.
//
// Stap voor stap: elke actie (worp of pas) heeft haar fases — aanloop, loslaten, hoogste punt,
// landing of vangst; pas en ontvangst. Bij elke stap glijden spelers en bal naar hun plaats op dat
// moment, met een spoor van waar ze vandaan kwamen. Door honderden acties: de tijdstrook, de
// doorzoekbare lijst, "volgend doelpunt" en de pijltjestoetsen.
//
// Tekenen: pijlen op het veld zetten om te tonen hoe en wat; bewaren als (gedeelde) notitie.
//
// Assen: app-x (lengte) → X, app-y (breedte) → Z, hoogte → Y. Het midden van het veld ligt op 0.

export interface Tekening {
  id: string | number
  tijdS: number | null
  tekst: string
  auteurNaam: string
  pijlen: Pijl[]
  gedeeld: boolean
}

export interface Arena3DProps {
  data: AppData
  kleuren: { thuis: string; uit: string }
  worpen: AppWorp[]
  acties: Actie[]
  heatSpelers: string[]
  gekozen?: AppWorp | null
  onKies?: (w: AppWorp | null) => void
  naamVan: (id?: string | null) => string
  tekeningen: Tekening[]
  magBewaren: boolean
  onBewaar?: (t: { tekst: string; tijdS: number; pijlen: Pijl[]; gedeeld: boolean }) => Promise<void>
}

function veldTextuur(data: AppData): THREE.CanvasTexture {
  const v = data.veld
  const px = 40
  const marge = 4
  const c = document.createElement('canvas')
  c.width = Math.round((v.lengte + 2 * marge) * px)
  c.height = Math.round((v.breedte + 2 * marge) * px)
  const g = c.getContext('2d')!
  g.fillStyle = '#1b3a22'
  g.fillRect(0, 0, c.width, c.height)
  const X = (x: number) => (x + marge) * px
  const Y = (y: number) => (y + marge) * px
  for (let x = 0, i = 0; x < v.lengte; x += 2.5, i++) {
    g.fillStyle = i % 2 ? '#2a6034' : '#2f6b3a'
    g.fillRect(X(x), Y(0), Math.min(2.5, v.lengte - x) * px, v.breedte * px)
  }
  g.fillStyle = 'rgba(255,255,255,0.05)'
  g.fillRect(X(0), Y(0), v.doellijn_a * px, v.breedte * px)
  g.fillRect(X(v.doellijn_b), Y(0), (v.lengte - v.doellijn_b) * px, v.breedte * px)
  g.strokeStyle = 'rgba(255,255,255,0.95)'
  g.lineWidth = 0.1 * px
  g.strokeRect(X(0), Y(0), v.lengte * px, v.breedte * px)
  for (const l of veldLijnen(v)) {
    g.lineWidth = (l.soort === 'doel' ? 0.14 : 0.08) * px
    g.setLineDash(l.soort === 'vwl' ? [0.5 * px, 0.4 * px] : [])
    g.beginPath()
    g.moveTo(X(l.x), Y(0))
    g.lineTo(X(l.x), Y(v.breedte))
    g.stroke()
  }
  g.setLineDash([])
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.font = `${Math.round(0.9 * px)}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.fillText('DOELGEBIED A', X(v.doellijn_a / 2), Y(v.breedte + 1.6))
  g.fillText('DOELGEBIED B', X((v.doellijn_b + v.lengte) / 2), Y(v.breedte + 1.6))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function heatTextuur(data: AppData, ids: string[]): THREE.CanvasTexture | null {
  const { raster, max } = somHeat(ids.map((id) => data.spelers?.[id]?.heat))
  if (!raster.length || max <= 0) return null
  const k = raster[0].length
  const r = raster.length
  const klein = document.createElement('canvas')
  klein.width = k
  klein.height = r
  const g = klein.getContext('2d')!
  const img = g.createImageData(k, r)
  for (let i = 0; i < r; i++)
    for (let j = 0; j < k; j++) {
      const [R, G, B, A] = heatKleur((raster[i][j] || 0) / max)
      const o = (i * k + j) * 4
      img.data[o] = R
      img.data[o + 1] = G
      img.data[o + 2] = B
      img.data[o + 3] = A
    }
  g.putImageData(img, 0, 0)
  const groot = document.createElement('canvas')
  groot.width = k * 8
  groot.height = r * 8
  const gg = groot.getContext('2d')!
  gg.filter = 'blur(6px)'
  gg.drawImage(klein, 0, 0, groot.width, groot.height)
  const t = new THREE.CanvasTexture(groot)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function nummerSprite(tekst: string, kleur: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = kleur
  g.beginPath()
  g.arc(64, 64, 54, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = '#fff'
  g.stroke()
  g.fillStyle = '#fff'
  g.font = 'bold 56px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(tekst, 64, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }))
  s.scale.set(0.9, 0.9, 0.9)
  s.renderOrder = 10
  return s
}

function leegGroep(g: THREE.Group) {
  for (const c of [...g.children]) {
    g.remove(c)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose()
    })
  }
}

const OMHOOG = new THREE.Vector3(0, 1, 0)

/** Een pijl die op het gras ligt: een schacht en een punt, net boven de heatmap. */
function pijlMesh(a: THREE.Vector3, b: THREE.Vector3, kleur: string, voorlopig = false): THREE.Group {
  const g = new THREE.Group()
  const richting = b.clone().sub(a)
  const lengte = richting.length()
  if (lengte < 0.05) return g
  richting.normalize()
  const kop = Math.min(1.1, lengte * 0.4)
  const mat = new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: voorlopig ? 0.6 : 0.95, depthWrite: false })
  const schacht = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, Math.max(0.01, lengte - kop), 12), mat)
  schacht.quaternion.setFromUnitVectors(OMHOOG, richting)
  schacht.position.copy(a).addScaledVector(richting, (lengte - kop) / 2)
  const punt = new THREE.Mesh(new THREE.ConeGeometry(0.4, kop, 20), mat.clone())
  punt.quaternion.setFromUnitVectors(OMHOOG, richting)
  punt.position.copy(b).addScaledVector(richting, -kop / 2)
  schacht.renderOrder = 5
  punt.renderOrder = 5
  g.add(schacht, punt)
  return g
}

export function Arena3D({
  data,
  kleuren,
  worpen,
  acties,
  heatSpelers,
  gekozen,
  onKies,
  naamVan,
  tekeningen,
  magBewaren,
  onBewaar,
}: Arena3DProps) {
  const omhulsel = useRef<HTMLDivElement>(null)
  const houder = useRef<HTMLDivElement>(null)
  const staat = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    bogen: THREE.Group
    heat: THREE.Mesh
    spelers: Map<string, THREE.Group>
    sporen: THREE.Group
    pijlen: THREE.Group
    bal: THREE.Mesh
    balSchaduw: THREE.Mesh
    worpVan: Map<THREE.Object3D, AppWorp>
    grond: THREE.Mesh
  } | null>(null)
  const [t, setT] = useState(0)
  const [speelt, setSpeelt] = useState(false)
  const [tempo, setTempo] = useState(1)
  const [toon, setToon] = useState({ bogen: true, heat: true, spelers: true, sporen: true })
  const [enkelActie, setEnkelActie] = useState(true)
  const [stap, setStap] = useState<{ a: number; f: number } | null>(null)
  const [lijst, setLijst] = useState(false)
  const [zoek, setZoek] = useState('')
  const [teken, setTeken] = useState(false)
  const [kleur, setKleur] = useState<string>(PIJL_KLEUREN[0])
  const [pijlen, setPijlen] = useState<Pijl[]>([])
  const [voorlopig, setVoorlopig] = useState<Pijl | null>(null)
  const [getoond, setGetoond] = useState<Tekening['id'] | null>(null)
  const [notitie, setNotitie] = useState('')
  const [gedeeld, setGedeeld] = useState(true)
  const [bewaren, setBewaren] = useState<'' | 'bezig' | 'klaar' | string>('')
  const [fout, setFout] = useState<string | null>(null)

  const duur = data.duur_s ?? Math.max(1, ...Object.values(data.spelers ?? {}).map((s) => s.pad?.at(-1)?.[0] ?? 0))
  const tRef = useRef(0)
  tRef.current = t
  const onKiesRef = useRef(onKies)
  onKiesRef.current = onKies
  const tekenRef = useRef({ teken, kleur })
  tekenRef.current = { teken, kleur }
  const v = data.veld
  const thuisId = data.ploegen?.find((p) => p.thuis)?.id ?? 0
  const naar3 = useMemo(() => (x: number, y: number, h = 0) => new THREE.Vector3(x - v.lengte / 2, h, y - v.breedte / 2), [v])
  const kleurTeam = useCallback((team?: number) => (team === thuisId ? kleuren.thuis : kleuren.uit), [thuisId, kleuren])

  // Waar staan we: de gekozen stap, of (bij vrij afspelen) de actie rond het huidige moment.
  const huidig = useMemo(() => {
    if (stap && acties[stap.a]) return stap
    const a = actieRond(acties, t)
    if (a < 0) return null
    const f = Math.max(0, acties[a].fasen.reduce((best, fase, i) => (fase.t <= t + 0.01 ? i : best), 0))
    return { a, f }
  }, [stap, acties, t])
  const actie = huidig ? acties[huidig.a] : undefined

  // Tijdstrook: bij een lange wedstrijd een venster van 5 minuten rond de huidige actie (anders
  // wordt het bij honderden acties een streepjescode), met een minikaart van de hele wedstrijd.
  const VENSTER_S = 300
  const venster = useMemo(() => {
    const lengte = Math.max(duur, 0.001)
    if (lengte <= VENSTER_S * 1.2) return { van: 0, tot: lengte, lengte, ingezoomd: false }
    const midden = actie?.t ?? t
    const van = Math.max(0, Math.min(lengte - VENSTER_S, midden - VENSTER_S / 2))
    return { van, tot: van + VENSTER_S, lengte: VENSTER_S, ingezoomd: true }
  }, [duur, actie, t])

  // ── Vloeiend naar een moment (spelers glijden naar hun plaats) ──
  const anim = useRef(0)
  const gaNaar = useCallback((doel: number) => {
    cancelAnimationFrame(anim.current)
    setSpeelt(false)
    const van = tRef.current
    const start = performance.now()
    const duurMs = Math.min(900, 250 + Math.abs(doel - van) * 120)
    const stapje = (nu: number) => {
      const f = Math.min(1, (nu - start) / duurMs)
      const zacht = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2
      setT(van + (doel - van) * zacht)
      if (f < 1) anim.current = requestAnimationFrame(stapje)
    }
    anim.current = requestAnimationFrame(stapje)
  }, [])

  const zetStap = useCallback(
    (a: number, f: number) => {
      const ac = acties[a]
      if (!ac) return
      const fi = Math.max(0, Math.min(ac.fasen.length - 1, f))
      setStap({ a, f: fi })
      setGetoond(null)
      gaNaar(ac.fasen[fi].t)
      onKiesRef.current?.(ac.worp ?? null)
    },
    [acties, gaNaar],
  )
  const volgendeFase = () => {
    if (!huidig) return zetStap(0, 0)
    const ac = acties[huidig.a]
    if (huidig.f < ac.fasen.length - 1) zetStap(huidig.a, huidig.f + 1)
    else if (huidig.a < acties.length - 1) zetStap(huidig.a + 1, 0)
  }
  const vorigeFase = () => {
    if (!huidig) return
    if (huidig.f > 0) zetStap(huidig.a, huidig.f - 1)
    else if (huidig.a > 0) zetStap(huidig.a - 1, acties[huidig.a - 1].fasen.length - 1)
  }
  const volgendeActie = (richting: 1 | -1) => {
    const a = huidig ? huidig.a + richting : 0
    if (a >= 0 && a < acties.length) zetStap(a, Math.min(1, acties[a].fasen.length - 1))
  }
  const volgendDoelpunt = () => {
    const vanaf = huidig ? huidig.a + 1 : 0
    const i = acties.findIndex((ac, k) => k >= vanaf && ac.worp && isDoelpunt(ac.worp))
    const j = i >= 0 ? i : acties.findIndex((ac) => ac.worp && isDoelpunt(ac.worp))
    if (j >= 0) zetStap(j, Math.min(1, acties[j].fasen.length - 1))
  }

  // Een worp die elders (lijst, tactiekbord, tik op een boog) gekozen werd: naar die actie.
  useEffect(() => {
    if (!gekozen) return
    if (actie?.worp === gekozen) return
    const i = acties.findIndex((ac) => ac.worp === gekozen)
    if (i >= 0) zetStap(i, 1)
    // Alleen reageren op een nieuwe keuze, niet op elke stap.
  }, [gekozen])

  // ── De scène één keer opbouwen ──
  useEffect(() => {
    const el = houder.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch {
      setFout('Je toestel ondersteunt geen 3D (WebGL).')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b0f14')
    scene.fog = new THREE.Fog('#0b0f14', 90, 220)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.49
    controls.minDistance = 4
    controls.maxDistance = 220
    controls.target.set(0, 0, 0)

    scene.add(new THREE.HemisphereLight('#dbeafe', '#1f2937', 0.9))
    const zon = new THREE.DirectionalLight('#fff7ed', 2.2)
    zon.position.set(-20, 40, 18)
    zon.castShadow = true
    zon.shadow.mapSize.set(2048, 2048)
    const sc = zon.shadow.camera as THREE.OrthographicCamera
    sc.left = -35
    sc.right = 35
    sc.top = 20
    sc.bottom = -20
    scene.add(zon)

    const marge = 4
    const grond = new THREE.Mesh(
      new THREE.PlaneGeometry(v.lengte + 2 * marge, v.breedte + 2 * marge),
      new THREE.MeshStandardMaterial({ map: veldTextuur(data), roughness: 0.95 }),
    )
    grond.rotation.x = -Math.PI / 2
    grond.receiveShadow = true
    scene.add(grond)
    const rand = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#10161d', roughness: 1 }))
    rand.rotation.x = -Math.PI / 2
    rand.position.y = -0.02
    scene.add(rand)

    for (const x of [v.doellijn_a, v.doellijn_b]) {
      for (const y of [0, v.breedte]) {
        const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12), new THREE.MeshStandardMaterial({ color: '#f8fafc' }))
        paal.position.copy(naar3(x, y, 0.6))
        paal.castShadow = true
        scene.add(paal)
      }
    }

    const heat = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.85 }))
    heat.rotation.x = -Math.PI / 2
    heat.position.y = 0.02
    heat.visible = false
    scene.add(heat)

    const bogen = new THREE.Group()
    const sporen = new THREE.Group()
    const pijlen = new THREE.Group()
    scene.add(bogen, sporen, pijlen)

    const spelers = new Map<string, THREE.Group>()
    for (const sp of Object.values(data.spelers ?? {})) {
      const kleur = sp.team === thuisId ? kleuren.thuis : kleuren.uit
      const g = new THREE.Group()
      const lijf = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 6, 16), new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.5, metalness: 0.1 }))
      lijf.position.y = 0.85
      lijf.castShadow = true
      g.add(lijf)
      const kop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: '#f1d4b8', roughness: 0.7 }))
      kop.position.y = 1.72
      kop.castShadow = true
      g.add(kop)
      const nr = nummerSprite(sp.rugnummer != null ? String(sp.rugnummer) : sp.naam.slice(0, 2), kleur)
      nr.position.y = 2.45
      g.add(nr)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.85 }))
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.03
      ring.name = 'ring'
      g.add(ring)
      g.visible = false
      scene.add(g)
      spelers.set(sp.id, g)
    }

    const bal = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#facc15', emissiveIntensity: 0.6, roughness: 0.4 }),
    )
    bal.castShadow = true
    bal.visible = false
    scene.add(bal)
    const balSchaduw = new THREE.Mesh(new THREE.CircleGeometry(0.25, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 }))
    balSchaduw.rotation.x = -Math.PI / 2
    balSchaduw.position.y = 0.025
    balSchaduw.visible = false
    scene.add(balSchaduw)

    staat.current = { renderer, scene, camera, controls, bogen, heat, spelers, sporen, pijlen, bal, balSchaduw, worpVan: new Map(), grond }

    const maat = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(maat)
    ro.observe(el)
    maat()
    camera.position.set(...cameraStandpunt('overzicht', camera.aspect, v.lengte, v.breedte, camera.fov))

    let frame = 0
    const lus = () => {
      frame = requestAnimationFrame(lus)
      controls.update()
      renderer.render(scene, camera)
    }
    lus()

    // Muis/vinger: in tekenmodus een pijl trekken over het gras, anders tikken op een boog.
    const ray = new THREE.Raycaster()
    const vlak = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const opGras = (e: PointerEvent): XY | null => {
      const r = renderer.domElement.getBoundingClientRect()
      const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(m, camera)
      const p = new THREE.Vector3()
      if (!ray.ray.intersectPlane(vlak, p)) return null
      return { x: p.x + v.lengte / 2, y: p.z + v.breedte / 2 }
    }
    let start: { x: number; y: number } | null = null
    let trek: XY | null = null
    const neer = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY }
      if (tekenRef.current.teken) {
        trek = opGras(e)
        renderer.domElement.setPointerCapture(e.pointerId)
      }
    }
    const beweeg = (e: PointerEvent) => {
      if (!tekenRef.current.teken || !trek) return
      const p = opGras(e)
      if (p) setVoorlopig({ van: trek, naar: p, kleur: tekenRef.current.kleur })
    }
    const op = (e: PointerEvent) => {
      if (tekenRef.current.teken) {
        const p = opGras(e)
        if (trek && p && Math.hypot(p.x - trek.x, p.y - trek.y) > 0.6) {
          const nieuw = { van: trek, naar: p, kleur: tekenRef.current.kleur }
          setPijlen((o) => [...o, nieuw])
        }
        trek = null
        setVoorlopig(null)
        return
      }
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return
      const r = renderer.domElement.getBoundingClientRect()
      const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(m, camera)
      const raak = ray.intersectObjects(bogen.children, true)[0]
      const st = staat.current
      if (!st || !raak) return
      let o: THREE.Object3D | null = raak.object
      while (o && !st.worpVan.has(o)) o = o.parent
      if (o) onKiesRef.current?.(st.worpVan.get(o)!)
    }
    renderer.domElement.addEventListener('pointerdown', neer)
    renderer.domElement.addEventListener('pointermove', beweeg)
    renderer.domElement.addEventListener('pointerup', op)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', neer)
      renderer.domElement.removeEventListener('pointermove', beweeg)
      renderer.domElement.removeEventListener('pointerup', op)
      controls.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          ;(x as THREE.MeshStandardMaterial).map?.dispose()
          x.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
      staat.current = null
    }
    // Eén keer per dataset; kleuren en spelers veranderen niet binnen een analyse.
  }, [data])

  // Tekenmodus: de camera staat stil zolang je tekent.
  useEffect(() => {
    const st = staat.current
    if (st) st.controls.enabled = !teken
  }, [teken])

  // ── Worpbogen (en bij een pas: de pas als lage boog) ──
  useEffect(() => {
    const st = staat.current
    if (!st) return
    leegGroep(st.bogen)
    st.worpVan.clear()
    st.bogen.visible = toon.bogen
    const enkel = enkelActie && actie
    const lijst = enkel ? (actie.worp ? [actie.worp] : []) : worpen
    for (const w of lijst) {
      const pts = worpBoog(w, 48).map(([x, y, h]) => naar3(x, y, h))
      if (pts.length < 2) continue
      const kleur = new THREE.Color(uitkomstKleur(w.uitkomst))
      const actief = gekozen === w || actie?.worp === w
      const dim = !enkel && (gekozen || actie?.worp) && !actief
      const g = new THREE.Group()
      const buis = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, actief ? 0.11 : 0.065, 8, false),
        new THREE.MeshStandardMaterial({ color: kleur, emissive: kleur, emissiveIntensity: actief ? 0.9 : 0.35, transparent: true, opacity: dim ? 0.18 : 0.95 }),
      )
      buis.castShadow = !dim
      g.add(buis)
      const land = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.5, 32), new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: dim ? 0.25 : 0.95 }))
      land.rotation.x = -Math.PI / 2
      land.position.copy(pts[pts.length - 1]).setY(0.04)
      g.add(land)
      const vertrek = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: dim ? 0.2 : 0.85 }))
      vertrek.rotation.x = -Math.PI / 2
      vertrek.position.copy(pts[0]).setY(0.04)
      g.add(vertrek)
      st.bogen.add(g)
      st.worpVan.set(g, w)
    }
    if (actie?.pas?.van_xy && actie.pas.naar_xy) {
      const [x0, y0] = actie.pas.van_xy
      const [x1, y1] = actie.pas.naar_xy
      const pts = Array.from({ length: 25 }, (_, i) => {
        const s = i / 24
        return naar3(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, 1.6 + 1.2 * 4 * s * (1 - s) - 0.2 * s)
      })
      const k = new THREE.Color(kleurTeam(actie.team))
      st.bogen.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.08, 8, false),
          new THREE.MeshStandardMaterial({ color: k, emissive: k, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }),
        ),
      )
    }
  }, [worpen, gekozen, actie, enkelActie, toon.bogen, naar3, kleurTeam])

  // ── Heatmap op het gras ──
  useEffect(() => {
    const st = staat.current
    if (!st) return
    const mat = st.heat.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    const tex = toon.heat ? heatTextuur(data, heatSpelers) : null
    mat.map = tex
    mat.needsUpdate = true
    st.heat.visible = Boolean(tex)
    if (tex) {
      const r = data.veld.raster ?? 0.5
      const rij = data.spelers?.[heatSpelers[0]]?.heat ?? []
      const w = (rij[0]?.length ?? 0) * r
      const h = rij.length * r
      st.heat.scale.set(w, h, 1)
      st.heat.position.set(w / 2 - v.lengte / 2, 0.02, h / 2 - v.breedte / 2)
    }
  }, [data, heatSpelers, toon.heat, v])

  // ── Spelers, sporen en bal op tijdstip t ──
  useEffect(() => {
    const st = staat.current
    if (!st) return
    const betrokken = new Set([actie?.wie, actie?.naar].filter(Boolean) as string[])
    leegGroep(st.sporen)
    for (const sp of Object.values(data.spelers ?? {})) {
      const g = st.spelers.get(sp.id)
      if (!g) continue
      const p = toon.spelers ? positieOp(sp.pad, t) : null
      g.visible = Boolean(p)
      if (!p) continue
      g.position.copy(naar3(p.x, p.y, 0))
      const ring = g.getObjectByName('ring') as THREE.Mesh | undefined
      if (ring) ring.scale.setScalar(betrokken.has(sp.id) ? 1.6 : 1)
      if (toon.sporen) {
        const pts = spoor(sp.pad, t - 2.5, t).map((q) => naar3(q.x, q.y, 0.06))
        if (pts.length >= 2) {
          const lijn = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: kleurTeam(sp.team), transparent: true, opacity: betrokken.has(sp.id) ? 0.95 : 0.55 }),
          )
          st.sporen.add(lijn)
        }
      }
    }
    const b = toon.spelers ? balOp(data, t) : null
    st.bal.visible = Boolean(b)
    st.balSchaduw.visible = Boolean(b)
    if (b) {
      st.bal.position.copy(naar3(b.x, b.y, b.h))
      st.balSchaduw.position.copy(naar3(b.x, b.y, 0.025))
    }
  }, [t, data, toon.spelers, toon.sporen, naar3, actie, kleurTeam])

  // ── Pijlen: wat je nu tekent, en een bewaarde tekening die je bekijkt ──
  const zichtbarePijlen = useMemo(() => {
    const bewaard = getoond != null ? (tekeningen.find((k) => k.id === getoond)?.pijlen ?? []) : []
    return [...bewaard, ...pijlen]
  }, [getoond, tekeningen, pijlen])
  useEffect(() => {
    const st = staat.current
    if (!st) return
    leegGroep(st.pijlen)
    for (const p of zichtbarePijlen) st.pijlen.add(pijlMesh(naar3(p.van.x, p.van.y, 0.14), naar3(p.naar.x, p.naar.y, 0.14), p.kleur))
    if (voorlopig) st.pijlen.add(pijlMesh(naar3(voorlopig.van.x, voorlopig.van.y, 0.14), naar3(voorlopig.naar.x, voorlopig.naar.y, 0.14), voorlopig.kleur, true))
  }, [zichtbarePijlen, voorlopig, naar3])

  // ── Vrij afspelen ──
  useEffect(() => {
    if (!speelt) return
    let vorig = performance.now()
    let id = 0
    const stapje = (nu: number) => {
      const dt = ((nu - vorig) / 1000) * tempo
      vorig = nu
      const volgende = tRef.current + dt
      if (volgende >= duur) {
        setT(duur)
        setSpeelt(false)
        return
      }
      setT(volgende)
      id = requestAnimationFrame(stapje)
    }
    id = requestAnimationFrame(stapje)
    return () => cancelAnimationFrame(id)
  }, [speelt, tempo, duur])

  const standpunt = (s: CameraStandpunt) => {
    const st = staat.current
    if (!st) return
    st.camera.position.set(...cameraStandpunt(s, st.camera.aspect, v.lengte, v.breedte, st.camera.fov))
    st.controls.target.set(0, 0, 0)
    st.controls.update()
  }

  const toets = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return
    if (e.key === 'ArrowRight') volgendeFase()
    else if (e.key === 'ArrowLeft') vorigeFase()
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') volgendeActie(1)
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') volgendeActie(-1)
    else if (e.key === ' ') setSpeelt((s) => !s)
    else if (e.key.toLowerCase() === 'g') volgendDoelpunt()
    else return
    e.preventDefault()
  }

  const bewaar = async () => {
    if (!onBewaar || pijlen.length === 0) return
    setBewaren('bezig')
    try {
      await onBewaar({ tekst: notitie.trim() || `Tekening op ${tijdLabel(t)}`, tijdS: t, pijlen, gedeeld })
      setPijlen([])
      setNotitie('')
      setBewaren('klaar')
    } catch (e) {
      setBewaren((e as Error).message || 'Bewaren mislukt.')
    }
  }

  const gefilterdeLijst = useMemo(() => {
    const z = zoek.trim().toLowerCase()
    return acties
      .map((ac, i) => ({ ac, i }))
      .filter(({ ac }) => !z || `${naamVan(ac.wie)} ${naamVan(ac.naar)} ${uitkomstLabel(ac.uitkomst)} ${ac.soort}`.toLowerCase().includes(z))
  }, [acties, zoek, naamVan])

  const actieTekst = (ac: Actie) =>
    ac.soort === 'pas'
      ? `Pas ${naamVan(ac.wie)} → ${naamVan(ac.naar)}`
      : `${naamVan(ac.wie)} · ${ac.worp?.type === 'rug' ? 'rugworp' : 'nekworp'} · ${uitkomstLabel(ac.uitkomst)}${ac.naar ? ` (${naamVan(ac.naar)})` : ''}`
  const actieKleur = (ac: Actie) => (ac.soort === 'pas' ? kleurTeam(ac.team) : uitkomstKleur(ac.worp && isDoelpunt(ac.worp) ? 'goal' : ac.uitkomst))

  return (
    <div className="a3d-geheel" ref={omhulsel} tabIndex={0} onKeyDown={toets} aria-label="3D-analyse; pijltjes om door de acties te stappen">
      <div className={`a3d${teken ? ' tekent' : ''}`}>
        <div ref={houder} className="a3d-doek">
          {fout && <p className="a3d-fout">{fout}</p>}
        </div>
        <div className="a3d-camera">
          {(
            [
              ['overzicht', 'Overzicht'],
              ['zijkant', 'Zijkant'],
              ['boven', 'Boven'],
              ['achterA', 'Achter A'],
              ['achterB', 'Achter B'],
            ] as [CameraStandpunt, string][]
          ).map(([s, l]) => (
            <button key={s} type="button" onClick={() => standpunt(s)}>{l}</button>
          ))}
        </div>
        <div className="a3d-teken">
          <button type="button" className={teken ? 'aan' : ''} onClick={() => setTeken((x) => !x)} aria-pressed={teken}>
            ✏️ {teken ? 'Klaar met tekenen' : 'Pijl tekenen'}
          </button>
          {teken && (
            <>
              {PIJL_KLEUREN.map((k) => (
                <button key={k} type="button" className={`a3d-kleur${kleur === k ? ' aan' : ''}`} style={{ background: k }} onClick={() => setKleur(k)} aria-label={`Kleur ${k}`} />
              ))}
              <button type="button" onClick={() => setPijlen((o) => o.slice(0, -1))} disabled={pijlen.length === 0} aria-label="Laatste pijl weg">↶</button>
              <button type="button" onClick={() => setPijlen([])} disabled={pijlen.length === 0}>Wissen</button>
            </>
          )}
        </div>
        {teken && pijlen.length === 0 && <p className="a3d-hint">Sleep over het gras om een pijl te zetten.</p>}
        <div className="a3d-bediening">
          <button type="button" className="a3d-speel" onClick={() => (t >= duur ? (setT(0), setSpeelt(true)) : (setStap(null), setSpeelt((s) => !s)))} aria-label={speelt ? 'Pauze' : 'Afspelen'}>
            {speelt ? '❚❚' : '▶'}
          </button>
          <input
            type="range"
            min={0}
            max={duur}
            step={0.05}
            value={t}
            onChange={(e) => {
              setSpeelt(false)
              setStap(null)
              setT(Number(e.target.value))
            }}
            aria-label="Tijd in de wedstrijd"
          />
          <span className="a3d-tijd">{tijdLabel(t, true)}</span>
          <select value={tempo} onChange={(e) => setTempo(Number(e.target.value))} aria-label="Tempo">
            {[0.25, 0.5, 1, 2, 4].map((x) => (
              <option key={x} value={x}>{x}×</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stap voor stap */}
      <div className="a3d-stappen">
        <div className="a3d-stapkop">
          <button type="button" onClick={() => volgendeActie(-1)} disabled={!huidig || huidig.a === 0} aria-label="Vorige actie" title="Vorige actie (↑)">⏮</button>
          <button type="button" onClick={vorigeFase} disabled={!huidig || (huidig.a === 0 && huidig.f === 0)} aria-label="Vorige stap" title="Vorige stap (←)">◀</button>
          <div className="a3d-actie">
            {actie ? (
              <>
                <span className="a3d-teller">Actie {huidig!.a + 1} / {acties.length} · {tijdLabel(actie.t, true)}</span>
                <b style={{ color: actieKleur(actie) }}>{actieTekst(actie)}</b>
              </>
            ) : (
              <span className="a3d-teller">Geen acties met deze filter.</span>
            )}
          </div>
          <button type="button" onClick={volgendeFase} disabled={!acties.length} aria-label="Volgende stap" title="Volgende stap (→)">▶</button>
          <button type="button" onClick={() => volgendeActie(1)} disabled={!huidig || huidig.a >= acties.length - 1} aria-label="Volgende actie" title="Volgende actie (↓)">⏭</button>
        </div>
        {actie && (
          <div className="a3d-fasen">
            {actie.fasen.map((f, i) => (
              <button key={i} type="button" className={stap && huidig?.f === i ? 'aan' : huidig?.f === i ? 'half' : ''} onClick={() => zetStap(huidig!.a, i)}>
                <span>{i + 1}</span> {f.naam}
                <small>{tijdLabel(f.t, true)}</small>
              </button>
            ))}
          </div>
        )}
        <div className="a3d-strook" role="group" aria-label="Acties op de tijdlijn">
          <div className="a3d-strook-nu" style={{ left: `${((t - venster.van) / venster.lengte) * 100}%` }} />
          {acties.map((ac, i) =>
            ac.t < venster.van || ac.t > venster.tot ? null : (
              <button
                key={ac.id}
                type="button"
                className={`a3d-merk ${ac.soort}${huidig?.a === i ? ' aan' : ''}`}
                style={{ left: `${((ac.t - venster.van) / venster.lengte) * 100}%`, background: actieKleur(ac) }}
                title={`${tijdLabel(ac.t, true)} · ${actieTekst(ac)}`}
                aria-label={`${tijdLabel(ac.t, true)} · ${actieTekst(ac)}`}
                onClick={() => zetStap(i, Math.min(1, ac.fasen.length - 1))}
              />
            ),
          )}
        </div>
        {venster.ingezoomd && (
          <>
            <div className="a3d-strook-as">
              <span>{tijdLabel(venster.van)}</span>
              <span>Venster van {Math.round(venster.lengte / 60)} min · tik hieronder om te verspringen</span>
              <span>{tijdLabel(venster.tot)}</span>
            </div>
            <div
              className="a3d-mini"
              role="slider"
              aria-label="Hele wedstrijd"
              aria-valuemin={0}
              aria-valuemax={Math.round(duur)}
              aria-valuenow={Math.round(t)}
              tabIndex={0}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const tijd = ((e.clientX - r.left) / r.width) * duur
                const i = actieRond(acties, tijd)
                if (i >= 0) zetStap(i, Math.min(1, acties[i].fasen.length - 1))
              }}
            >
              {acties.map((ac) =>
                ac.soort === 'worp' ? (
                  <i key={ac.id} style={{ left: `${(ac.t / duur) * 100}%`, background: actieKleur(ac), opacity: ac.worp && isDoelpunt(ac.worp) ? 1 : 0.45 }} />
                ) : null,
              )}
              <b style={{ left: `${(venster.van / duur) * 100}%`, width: `${(venster.lengte / duur) * 100}%` }} />
            </div>
          </>
        )}
        <div className="a3d-snel">
          <button type="button" onClick={volgendDoelpunt} title="Volgend doelpunt (G)">⚑ Volgend doelpunt</button>
          <button type="button" className={lijst ? 'aan' : ''} onClick={() => setLijst((x) => !x)}>☰ Alle acties ({acties.length})</button>
          <label><input type="checkbox" checked={enkelActie} onChange={(e) => setEnkelActie(e.target.checked)} /> Enkel deze actie</label>
          <label><input type="checkbox" checked={toon.sporen} onChange={(e) => setToon((o) => ({ ...o, sporen: e.target.checked }))} /> Sporen</label>
          <label><input type="checkbox" checked={toon.bogen} onChange={(e) => setToon((o) => ({ ...o, bogen: e.target.checked }))} /> Bogen</label>
          <label><input type="checkbox" checked={toon.heat} onChange={(e) => setToon((o) => ({ ...o, heat: e.target.checked }))} /> Heatmap</label>
          <label><input type="checkbox" checked={toon.spelers} onChange={(e) => setToon((o) => ({ ...o, spelers: e.target.checked }))} /> Spelers</label>
        </div>
        {lijst && (
          <div className="a3d-lijst">
            <input type="search" placeholder="Zoek speler, afloop, pas…" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoek in de acties" />
            <ol>
              {gefilterdeLijst.map(({ ac, i }) => (
                <li key={ac.id}>
                  <button type="button" className={huidig?.a === i ? 'aan' : ''} onClick={() => zetStap(i, Math.min(1, ac.fasen.length - 1))}>
                    <span className="a3d-nr">{i + 1}</span>
                    <span className="a3d-lt">{tijdLabel(ac.t, true)}</span>
                    <i style={{ background: actieKleur(ac) }} />
                    <span className="a3d-lw">{actieTekst(ac)}</span>
                  </button>
                </li>
              ))}
              {gefilterdeLijst.length === 0 && <li className="appa-uitleg">Niets gevonden.</li>}
            </ol>
          </div>
        )}

        {(pijlen.length > 0 || tekeningen.length > 0) && (
          <div className="a3d-tekeningen">
            {pijlen.length > 0 && (
              <div className="a3d-bewaar">
                {magBewaren ? (
                  <>
                    <input value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder={`Wat toon je hier? (op ${tijdLabel(t)})`} maxLength={2000} />
                    <label><input type="checkbox" checked={gedeeld} onChange={(e) => setGedeeld(e.target.checked)} /> Delen</label>
                    <button type="button" className="appa-knop vol" onClick={bewaar} disabled={bewaren === 'bezig'}>
                      {bewaren === 'bezig' ? 'Bewaren…' : `Bewaar ${pijlen.length} ${pijlen.length === 1 ? 'pijl' : 'pijlen'}`}
                    </button>
                  </>
                ) : (
                  <span className="appa-uitleg">Pijlen tonen kan altijd; bewaren als notitie kan met een account dat de analyse mag zien.</span>
                )}
              </div>
            )}
            {bewaren && bewaren !== 'bezig' && <p className="appa-uitleg">{bewaren === 'klaar' ? 'Bewaard als notitie.' : bewaren}</p>}
            {tekeningen.length > 0 && (
              <div className="a3d-bewaarde">
                <span className="a3d-teller">Tekeningen</span>
                {tekeningen.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className={getoond === k.id ? 'aan' : ''}
                    onClick={() => {
                      if (getoond === k.id) return setGetoond(null)
                      setStap(null)
                      if (k.tijdS != null) gaNaar(k.tijdS)
                      setGetoond(k.id)
                    }}
                  >
                    ✏️ {k.tijdS != null ? tijdLabel(k.tijdS) : ''} {k.tekst.slice(0, 40)} <small>{k.auteurNaam}{k.gedeeld ? ' · gedeeld' : ''}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <p className="a3d-toetsen">Toetsen: ← → stap · ↑ ↓ actie · G volgend doelpunt · spatie afspelen</p>
      </div>
    </div>
  )
}

export default Arena3D
