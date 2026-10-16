'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import {
  balOp,
  cameraStandpunt,
  heatKleur,
  positieOp,
  somHeat,
  tijdLabel,
  uitkomstKleur,
  uitkomstLabel,
  veldLijnen,
  worpBoog,
  type AppData,
  type CameraStandpunt,
  type AppWorp,
} from '@/lib/app-analyse-veld'

// De wedstrijd in 3D: het veld op ware grootte, de worpen als bogen door de lucht (met de tophoogte
// die de app mat), de heatmap op het gras, en een herhaling waarin de spelers en de bal bewegen.
// Draaien, zoomen en verschuiven met muis of vingers; camerastandpunten met één tik.
//
// Assen: app-x (lengte) → X, app-y (breedte) → Z, hoogte → Y. Het midden van het veld ligt op 0.

type Standpunt = CameraStandpunt

export interface Arena3DProps {
  data: AppData
  kleuren: { thuis: string; uit: string }
  worpen: AppWorp[]
  heatSpelers: string[]
  gekozen?: AppWorp | null
  onKies?: (w: AppWorp | null) => void
  naamVan: (id?: string | null) => string
}

function veldTextuur(data: AppData): THREE.CanvasTexture {
  const v = data.veld
  const px = 40 // pixels per meter
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

export function Arena3D({ data, kleuren, worpen, heatSpelers, gekozen, onKies, naamVan }: Arena3DProps) {
  const houder = useRef<HTMLDivElement>(null)
  const staat = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    bogen: THREE.Group
    heat: THREE.Mesh
    spelers: Map<string, THREE.Group>
    bal: THREE.Mesh
    balSchaduw: THREE.Mesh
    worpVan: Map<THREE.Object3D, AppWorp>
  } | null>(null)
  const [t, setT] = useState(0)
  const [speelt, setSpeelt] = useState(false)
  const [tempo, setTempo] = useState(1)
  const [toon, setToon] = useState({ bogen: true, heat: true, spelers: true })
  const [fout, setFout] = useState<string | null>(null)
  const duur = data.duur_s ?? Math.max(1, ...Object.values(data.spelers ?? {}).map((s) => s.pad?.at(-1)?.[0] ?? 0))
  const onKiesRef = useRef(onKies)
  onKiesRef.current = onKies
  const tRef = useRef(0)
  tRef.current = t
  const v = data.veld
  const thuisId = data.ploegen?.find((p) => p.thuis)?.id ?? 0
  const naar3 = useMemo(() => (x: number, y: number, h = 0) => new THREE.Vector3(x - v.lengte / 2, h, y - v.breedte / 2), [v])

  // De scène één keer opbouwen.
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
    scene.fog = new THREE.Fog('#0b0f14', 70, 160)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500)
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

    // Doelpalen-achtige merktekens op de doellijnen, zodat je je oriënteert.
    for (const x of [v.doellijn_a, v.doellijn_b]) {
      for (const y of [0, v.breedte]) {
        const paal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12), new THREE.MeshStandardMaterial({ color: '#f8fafc' }))
        paal.position.copy(naar3(x, y, 0.6))
        paal.castShadow = true
        scene.add(paal)
      }
    }

    const heat = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.85 }),
    )
    heat.rotation.x = -Math.PI / 2
    heat.position.y = 0.02
    heat.visible = false
    scene.add(heat)

    const bogen = new THREE.Group()
    scene.add(bogen)

    const spelers = new Map<string, THREE.Group>()
    for (const sp of Object.values(data.spelers ?? {})) {
      const kleur = sp.team === thuisId ? kleuren.thuis : kleuren.uit
      const g = new THREE.Group()
      const lijf = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.28, 1.1, 6, 16),
        new THREE.MeshStandardMaterial({ color: kleur, roughness: 0.5, metalness: 0.1 }),
      )
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

    staat.current = { renderer, scene, camera, controls, bogen, heat, spelers, bal, balSchaduw, worpVan: new Map() }

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

    // Tikken op een boog = die worp kiezen (niet bij slepen).
    const ray = new THREE.Raycaster()
    ray.params.Line = { threshold: 0.4 }
    let start: { x: number; y: number } | null = null
    const neer = (e: PointerEvent) => (start = { x: e.clientX, y: e.clientY })
    const op = (e: PointerEvent) => {
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return
      const r = renderer.domElement.getBoundingClientRect()
      const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(m, camera)
      const raak = ray.intersectObjects(bogen.children, true)[0]
      const st = staat.current
      if (!st) return
      if (raak) {
        let o: THREE.Object3D | null = raak.object
        while (o && !st.worpVan.has(o)) o = o.parent
        onKiesRef.current?.(o ? st.worpVan.get(o)! : null)
      } else onKiesRef.current?.(null)
    }
    renderer.domElement.addEventListener('pointerdown', neer)
    renderer.domElement.addEventListener('pointerup', op)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', neer)
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

  // Worpbogen (opnieuw bij een andere filter of keuze).
  useEffect(() => {
    const st = staat.current
    if (!st) return
    for (const c of [...st.bogen.children]) {
      st.bogen.remove(c)
      c.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
        ;(m.material as THREE.Material | undefined)?.dispose?.()
      })
    }
    st.worpVan.clear()
    st.bogen.visible = toon.bogen
    for (const w of worpen) {
      const pts = worpBoog(w, 48).map(([x, y, h]) => naar3(x, y, h))
      if (pts.length < 2) continue
      const kleur = new THREE.Color(uitkomstKleur(w.uitkomst))
      const actief = gekozen === w
      const dim = gekozen && !actief
      const g = new THREE.Group()
      const buis = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, actief ? 0.11 : 0.065, 8, false),
        new THREE.MeshStandardMaterial({
          color: kleur,
          emissive: kleur,
          emissiveIntensity: actief ? 0.9 : 0.35,
          transparent: true,
          opacity: dim ? 0.22 : 0.95,
        }),
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
  }, [worpen, gekozen, toon.bogen, naar3])

  // Heatmap op het gras.
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

  // Spelers en bal op tijdstip t.
  useEffect(() => {
    const st = staat.current
    if (!st) return
    for (const sp of Object.values(data.spelers ?? {})) {
      const g = st.spelers.get(sp.id)
      if (!g) continue
      const p = toon.spelers ? positieOp(sp.pad, t) : null
      g.visible = Boolean(p)
      if (p) g.position.copy(naar3(p.x, p.y, 0))
    }
    const b = toon.spelers ? balOp(data, t) : null
    st.bal.visible = Boolean(b)
    st.balSchaduw.visible = Boolean(b)
    if (b) {
      st.bal.position.copy(naar3(b.x, b.y, b.h))
      st.balSchaduw.position.copy(naar3(b.x, b.y, 0.025))
    }
  }, [t, data, toon.spelers, naar3])

  // Afspelen.
  useEffect(() => {
    if (!speelt) return
    let vorig = performance.now()
    let id = 0
    const stap = (nu: number) => {
      const dt = ((nu - vorig) / 1000) * tempo
      vorig = nu
      const volgende = tRef.current + dt
      if (volgende >= duur) {
        setT(duur)
        setSpeelt(false)
        return
      }
      setT(volgende)
      id = requestAnimationFrame(stap)
    }
    id = requestAnimationFrame(stap)
    return () => cancelAnimationFrame(id)
  }, [speelt, tempo, duur])

  // Een gekozen worp: de herhaling springt er net vóór.
  useEffect(() => {
    if (gekozen?.tijd_s != null) setT(Math.max(0, gekozen.tijd_s - 1))
  }, [gekozen])

  const standpunt = (s: Standpunt) => {
    const st = staat.current
    if (!st) return
    st.camera.position.set(...cameraStandpunt(s, st.camera.aspect, v.lengte, v.breedte, st.camera.fov))
    st.controls.target.set(0, 0, 0)
    st.controls.update()
  }

  return (
    <div className="a3d">
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
          ] as [Standpunt, string][]
        ).map(([s, l]) => (
          <button key={s} type="button" onClick={() => standpunt(s)}>{l}</button>
        ))}
      </div>
      {gekozen && (
        <div className="a3d-kaart">
          <b>{naamVan(gekozen.identiteit)}</b> · {gekozen.type === 'rug' ? 'rugworp' : 'nekworp'} ·{' '}
          <span style={{ color: uitkomstKleur(gekozen.uitkomst) }}>{uitkomstLabel(gekozen.uitkomst)}</span>
          <br />
          {gekozen.afstand != null && `${gekozen.afstand.toFixed(1)} m`}
          {gekozen.tophoogte != null && ` · top ${gekozen.tophoogte.toFixed(1)} m`}
          {gekozen.worpSnelheid != null && ` · ${Math.round(gekozen.worpSnelheid * 3.6)} km/u`}
          {gekozen.vangerIdentiteit && ` · gevangen door ${naamVan(gekozen.vangerIdentiteit)}`}
        </div>
      )}
      <div className="a3d-bediening">
        <button type="button" className="a3d-speel" onClick={() => (t >= duur ? (setT(0), setSpeelt(true)) : setSpeelt((s) => !s))} aria-label={speelt ? 'Pauze' : 'Afspelen'}>
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
      <div className="a3d-lagen">
        <label><input type="checkbox" checked={toon.bogen} onChange={(e) => setToon((o) => ({ ...o, bogen: e.target.checked }))} /> Worpbogen</label>
        <label><input type="checkbox" checked={toon.heat} onChange={(e) => setToon((o) => ({ ...o, heat: e.target.checked }))} /> Heatmap</label>
        <label><input type="checkbox" checked={toon.spelers} onChange={(e) => setToon((o) => ({ ...o, spelers: e.target.checked }))} /> Spelers en bal</label>
      </div>
    </div>
  )
}

export default Arena3D
