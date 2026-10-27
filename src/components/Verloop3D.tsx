'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { saveOrShareBlob, slugFilename } from '@/lib/client-download'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR } from '@/lib/club-colors'
import { freeThrowNorm, goalLineNorm, totalLengthM } from '@/lib/field'
import type { ShotPoint } from '@/lib/match-engine'
import { bouwVerloop, standOp, tijdLabelOp, type Piek, type Verloop } from '@/lib/wedstrijdverloop'

// Het wedstrijdverloop als deelbaar 3D-beeld: het veld in de kleuren van beide clubs (elke helft
// in haar clubkleur, met maaibanen), op elke doelpoging een piek zo hoog als de punten die ze
// opleverde (een misser: zo hoog als het gevaar dat ze had), de stand bovenaan en de tijdlijn
// onderaan — afgespeeld over de wedstrijdtijd. Eén beeld van 1080 × 1350 (4:5, voor Instagram en
// WhatsApp): de 3D-laag tekent three in een verborgen canvas, en elk beeld wordt met de kop en de
// tijdlijn samengesteld op het zichtbare canvas. Dat ene canvas is ook wat opgenomen (video) of
// bewaard (PNG) wordt, dus wat je ziet is wat je deelt. Het model (pieken, stand, tijdas) zit in
// lib/wedstrijdverloop.ts.

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
const GROEI = 0.025
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
const MAX_PIEK_M = 7

type Kleuren = { home: string; away: string }

const hex = (s: string | null | undefined, terugval: string) => (s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : terugval)
const meng = (a: string, b: string, t: number) => {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t)
  return `#${c.getHexString()}`
}

/** De grasmat als canvas: elke helft in haar clubkleur, met lichtere en donkere banen in de lengte. */
function veldTextuur(kleuren: Kleuren, lengteM: number, goalAreaDepth: number, speelveldM?: number): THREE.CanvasTexture {
  const PX = 24
  const w = 14 * PX
  const h = Math.round(lengteM * PX)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  // Banen van 2 m in de breedte (langs de lengte-as), afwisselend licht en donker.
  for (let i = 0; i < 7; i++) {
    const licht = i % 2 === 0
    const x = i * 2 * PX
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, meng(kleuren.home, licht ? '#ffffff' : '#000000', licht ? 0.14 : 0.18))
    grad.addColorStop(0.46, meng(kleuren.home, licht ? '#ffffff' : '#000000', licht ? 0.14 : 0.18))
    grad.addColorStop(0.54, meng(kleuren.away, licht ? '#ffffff' : '#000000', licht ? 0.14 : 0.18))
    grad.addColorStop(1, meng(kleuren.away, licht ? '#ffffff' : '#000000', licht ? 0.14 : 0.18))
    g.fillStyle = grad
    g.fillRect(x, 0, 2 * PX, h)
  }
  // Doelgebieden iets donkerder, zodat de doellijn leest.
  const gl = goalLineNorm(goalAreaDepth, { speelveldM })
  g.fillStyle = 'rgba(0,0,0,.16)'
  g.fillRect(0, 0, w, gl * h)
  g.fillRect(0, (1 - gl) * h, w, gl * h)
  // Lijnen: zij- en achterlijnen, doellijnen, vrijeworplijnen, middellijn.
  g.strokeStyle = 'rgba(255,255,255,.92)'
  g.lineWidth = 0.12 * PX
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
  t.anisotropy = 4
  return t
}

type Scene3D = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  pieken: { mesh: THREE.Mesh; top: THREE.Mesh | null; piek: Piek }[]
  lengteM: number
  dispose: () => void
}

function bouwScene(canvas: HTMLCanvasElement, verloop: Verloop, kleuren: Kleuren, goalAreaDepth: number, speelveldM?: number): Scene3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(W, VELD_H, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, W / VELD_H, 1, 400)
  const lengteM = totalLengthM(goalAreaDepth, { speelveldM })

  scene.add(new THREE.HemisphereLight('#ffffff', '#20262e', 1.1))
  const zon = new THREE.DirectionalLight('#fff4e0', 1.6)
  zon.position.set(-14, 30, 12)
  scene.add(zon)

  const tex = veldTextuur(kleuren, lengteM, goalAreaDepth, speelveldM)
  const veld = new THREE.Mesh(new THREE.PlaneGeometry(14, lengteM), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }))
  veld.rotation.x = -Math.PI / 2
  // Textuur-y loopt van boven (y=0, thuis) naar onder; na de rotatie wijst +Z naar y=1 (uit).
  veld.rotation.z = Math.PI
  scene.add(veld)
  // Een donkere rand rond het veld, als een podium.
  const rand = new THREE.Mesh(new THREE.BoxGeometry(14 + 3, 0.6, lengteM + 3), new THREE.MeshStandardMaterial({ color: '#141a22', roughness: 0.9 }))
  rand.position.y = -0.31
  scene.add(rand)

  const kegel = new THREE.ConeGeometry(0.42, 1, 14, 1)
  kegel.translate(0, 0.5, 0)
  const bol = new THREE.SphereGeometry(0.32, 14, 10)
  const pieken = verloop.pieken.map((piek) => {
    const kleur = piek.kant === 'home' ? kleuren.home : kleuren.away
    const doel = piek.soort !== 'misser'
    const mat = new THREE.MeshStandardMaterial({
      color: kleur,
      emissive: kleur,
      emissiveIntensity: doel ? 0.55 : 0.08,
      roughness: 0.4,
      transparent: !doel,
      opacity: doel ? 1 : 0.55,
    })
    const mesh = new THREE.Mesh(kegel, mat)
    mesh.position.set((piek.x - 0.5) * 14, 0, (piek.y - 0.5) * lengteM)
    mesh.scale.set(1, 0.001, 1)
    scene.add(mesh)
    let top: THREE.Mesh | null = null
    if (doel) {
      top = new THREE.Mesh(bol, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: kleur, emissiveIntensity: 0.9, roughness: 0.2 }))
      top.position.copy(mesh.position)
      top.visible = false
      scene.add(top)
    }
    return { mesh, top, piek }
  })

  return {
    renderer,
    scene,
    camera,
    pieken,
    lengteM,
    dispose() {
      tex.dispose()
      kegel.dispose()
      bol.dispose()
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m && typeof m.dispose === 'function') m.dispose()
      })
      renderer.dispose()
    },
  }
}

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3)

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
  const [speelt, setSpeelt] = useState(false)
  const [snelheid, setSnelheid] = useState(1)
  const [tijd, setTijd] = useState(0)
  const tijdRef = useRef(0)
  const [opname, setOpname] = useState<{ pct: number } | null>(null)
  const [klaar, setKlaar] = useState<{ blob: Blob; naam: string } | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  const toonMelding = (m: string) => {
    setMelding(m)
    setTimeout(() => setMelding(null), 5000)
  }

  // Eén beeld tekenen op moment `t` (0..1 op de tijdas): de 3D-laag, dan kop en tijdlijn erover.
  const teken = (t: number) => {
    const s = scene.current
    const c = zichtbaar.current
    if (!s || !c) return
    const g = c.getContext('2d')!
    // Pieken: groeien zodra hun moment gepasseerd is.
    for (const p of s.pieken) {
      const f = ease((t - p.piek.t) / GROEI + 1)
      const hoogte = Math.max(0.001, f * p.piek.hoogte * MAX_PIEK_M)
      p.mesh.scale.y = hoogte
      p.mesh.visible = t >= p.piek.t - GROEI
      if (p.top) {
        p.top.visible = f > 0.95
        p.top.position.y = hoogte + 0.2
      }
    }
    // Camera: schuin op het veld, en traag rond het midden draaiend naarmate de wedstrijd vordert.
    const hoek = -0.55 + t * 0.7
    const R = s.lengteM * 0.6
    s.camera.position.set(Math.sin(hoek) * R, s.lengteM * 0.5, Math.cos(hoek) * R)
    s.camera.lookAt(0, 0.5, 0)
    s.renderer.render(s.scene, s.camera)

    // Achtergrond + 3D-laag.
    const achter = g.createLinearGradient(0, 0, 0, H)
    achter.addColorStop(0, '#0b1017')
    achter.addColorStop(1, '#131a24')
    g.fillStyle = achter
    g.fillRect(0, 0, W, H)
    g.drawImage(s.renderer.domElement, 0, KOP)

    // Kop: titel, ploegen in hun kleur, de stand groot, het moment.
    const stand = standOp(verloop, t)
    g.textBaseline = 'middle'
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.font = `800 26px ${FONT}`
    g.textAlign = 'left'
    g.fillText('KRACHTBAL LIVE · WEDSTRIJDVERLOOP', 60, 52)
    g.textAlign = 'right'
    g.fillText(tijdLabelOp(verloop, t).toUpperCase(), W - 60, 52)
    // De ploegnamen aan de rand (max. twee regels), de stand in het midden; de naam krijgt de
    // ruimte tot aan de cijfers, zodat de twee elkaar nooit overlappen.
    const naamBreedte = W / 2 - 60 - 175
    const ploeg = (naam: string, kleur: string, x: number, align: CanvasTextAlign) => {
      g.fillStyle = kleur
      g.fillRect(align === 'left' ? x : x - 14, 96, 14, 104)
      g.fillStyle = '#ffffff'
      g.font = `900 38px ${FONT}`
      g.textAlign = align
      const tx = align === 'left' ? x + 28 : x - 28
      const delen = naam.length > 13 && naam.includes(' ') ? [naam.slice(0, naam.lastIndexOf(' ')), naam.slice(naam.lastIndexOf(' ') + 1)] : [naam]
      delen.forEach((d, i) => g.fillText(d.toUpperCase(), tx, delen.length === 1 ? 148 : 126 + i * 44, naamBreedte - 28))
    }
    ploeg(teams.home, kleuren.home, 60, 'left')
    ploeg(teams.away, kleuren.away, W - 60, 'right')
    g.fillStyle = '#ffffff'
    g.font = `900 104px ${FONT}`
    g.textAlign = 'right'
    g.fillText(`${stand[0]}`, W / 2 - 44, 150)
    g.textAlign = 'left'
    g.fillText(`${stand[1]}`, W / 2 + 44, 150)
    g.textAlign = 'center'
    g.fillStyle = 'rgba(255,255,255,.4)'
    g.font = `900 60px ${FONT}`
    g.fillText('–', W / 2, 146)
    if (matchLabel) {
      g.fillStyle = 'rgba(255,255,255,.5)'
      g.font = `700 24px ${FONT}`
      g.fillText(matchLabel, W / 2, 222, W - 120)
    }

    // Tijdlijn: een balk met de helften, per doelpoging een streepje in de clubkleur (zo hoog als
    // de piek), en de loper.
    const x0 = 70
    const x1 = W - 70
    const y = TIJDLIJN_Y + 118
    g.fillStyle = 'rgba(255,255,255,.12)'
    g.fillRect(x0, y - 4, x1 - x0, 8)
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
      const voorbij = t >= p.t
      const kleur = p.kant === 'home' ? kleuren.home : kleuren.away
      const h = 14 + p.hoogte * 56
      g.fillStyle = voorbij ? kleur : 'rgba(255,255,255,.18)'
      g.fillRect(px - (p.soort === 'misser' ? 1.5 : 3), y - 6 - h, p.soort === 'misser' ? 3 : 6, h)
      // Het puntenlabel enkel als er plaats is (dicht op elkaar: enkel de streepjes).
      if (voorbij && p.soort !== 'misser' && px - vorigLabelX > 30) {
        vorigLabelX = px
        g.fillStyle = '#ffffff'
        g.font = `800 20px ${FONT}`
        g.fillText(`+${p.punten}`, px, y - 18 - h)
      }
    }
    const lx = x0 + Math.min(1, t) * (x1 - x0)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(lx, y, 11, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,.4)'
    g.font = `700 20px ${FONT}`
    g.textAlign = 'left'
    g.fillText('▲ hoogte = punten (doelpunt) of gevaar (misser)', x0, TIJDLIJN_Y + 200)
    g.textAlign = 'right'
    g.fillText('krachtbal.live', x1, TIJDLIJN_Y + 200)
  }

  // De 3D-scène opbouwen (één keer per wedstrijd/kleuren) en het eerste beeld tekenen.
  useEffect(() => {
    const c = zichtbaar.current
    if (!c || verloop.pieken.length === 0) return
    const webgl = document.createElement('canvas')
    webgl.width = W
    webgl.height = VELD_H
    try {
      scene.current = bouwScene(webgl, verloop, kleuren, goalAreaDepth, speelveldM)
      setFout(null)
    } catch (err) {
      setFout((err as Error).message || 'WebGL kon niet starten.')
      return
    }
    tijdRef.current = 0
    setTijd(0)
    teken(0)
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
  }, [verloop, kleuren, goalAreaDepth, speelveldM])

  // Afspelen: de tijdas loopt in AFSPEELDUUR / snelheid seconden van 0 naar 1.
  useEffect(() => {
    if (!speelt) return
    let raf = 0
    let vorige = performance.now()
    const stap = (nu: number) => {
      const dt = (nu - vorige) / 1000
      vorige = nu
      const t = Math.min(1, tijdRef.current + (dt * snelheid) / AFSPEELDUUR)
      tijdRef.current = t
      setTijd(t)
      teken(t)
      if (t >= 1) {
        setSpeelt(false)
        return
      }
      raf = requestAnimationFrame(stap)
    }
    raf = requestAnimationFrame(stap)
    return () => cancelAnimationFrame(raf)
  }, [speelt, snelheid])

  const spring = (t: number) => {
    tijdRef.current = t
    setTijd(t)
    teken(t)
  }
  const afspelen = () => {
    if (tijdRef.current >= 1) spring(0)
    setSpeelt(true)
  }

  const bestandsnaam = (ext: string) => `${slugFilename('wedstrijdverloop', teams.home, teams.away, matchLabel) || 'wedstrijdverloop'}.${ext}`

  // PNG van het eindbeeld (of van het moment waar je staat).
  const bewaarBeeld = async () => {
    const c = zichtbaar.current
    if (!c) return
    teken(tijdRef.current)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
    if (!blob) return toonMelding('⚠️ Beeld bewaren lukte niet.')
    await saveOrShareBlob(blob, bestandsnaam('png'), `${teams.home} – ${teams.away}${matchLabel ? ` · ${matchLabel}` : ''}`)
  }

  // Video: het canvas opnemen terwijl het verloop van 0 tot 1 speelt (snelheid 1), met een korte
  // nahoud op het eindbeeld. mp4 (H.264) eerst — dat kan je via WhatsApp doorsturen — en anders
  // webm. Sommige toestellen zeggen dat mp4 kan en laten de recorder dan toch sterven: elk type
  // wordt daarom eerst een halve seconde geprobeerd (zelfde aanpak als de 2D-replay).
  const neemOp = async () => {
    const c = zichtbaar.current
    if (!c || opname || speelt) return
    const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder
    const cap = c as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
    if (!MR || typeof cap.captureStream !== 'function') return toonMelding('⚠️ Video opnemen kan niet in deze browser. Bewaar het beeld (PNG), of open de site rechtstreeks in Chrome.')
    setKlaar(null)
    setOpname({ pct: 0 })
    spring(0)
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
        rec = m ? new MR(stream, { mimeType: m }) : new MR(stream)
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
      setTimeout(af, 4000)
    })
    rec.start(100)
    const start = performance.now()
    await new Promise<void>((ok) => {
      const stap = (nu: number) => {
        const s = (nu - start) / 1000
        const t = Math.min(1, s / AFSPEELDUUR)
        tijdRef.current = t
        setTijd(t)
        teken(t)
        setOpname({ pct: Math.min(100, Math.round((s / (AFSPEELDUUR + NAHOUD)) * 100)) })
        if (s < AFSPEELDUUR + NAHOUD) requestAnimationFrame(stap)
        else ok()
      }
      requestAnimationFrame(stap)
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
            <button type="button" className="replay-play" onClick={() => (speelt ? setSpeelt(false) : afspelen())} disabled={!!opname}>
              {speelt ? '⏸ Pauze' : tijd >= 1 ? '↻ Opnieuw' : '▶ Afspelen'}
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
