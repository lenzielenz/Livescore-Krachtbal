'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { balOp, balSpoor, bezitOp, bezitTijdlijn, decodeer, GEVEL, op, ploegKleuren, snelheid, stap, stapMet, WERELD_STRAAL, type Ploeg, type Rechthoek, type Reconstructie, type Spoor, type StadionThema, type Veld } from '@/lib/virtueel'
import { pasStandenToe, type WeekendStand } from '@/lib/virtueel-weekend'
import { bouwEregalerij } from './erezaal'
import { bouwOmgeving } from './omgeving'
import { bouwSfeer } from './sfeer'
import { bouwStadion } from './stadion'
import { bouwWeekendzaal } from './weekendzaal'
import { bouwFotogalerij } from './fotogalerij'
import { bouwWegwijzers, type Bestemming } from './wegwijzers'
import { bouwGangleven } from './gangleven'
import { bouwBuitenkant } from './buitenkant'
import { bouwSterren } from './sterren'
import { bouwVerdiep } from './verdiep'
import { bouwLift, LIFT_X } from './lift'
import { bouwRing } from './ring'
import { bouwKelder } from './kelder'
import { bouwAvatar } from './avatar'
import { bouwKleedkamer, KLEED, type Kleedkamer } from './kleedkamer'
import { bouwKelderspel, type KelderActie, type Kelderspel } from './kelderspel'
import { bouwGoudjacht, type GoudPlek, type Goudjacht } from './goudjacht'
import { Badkiezer, Doelworp, Loopband } from './Kelderspellen'
import { bouwGokkantoor, type Gokkantoor } from './gokkantoor'
import { WedkantoorPaneel } from './Wedkantoor'
import type { WedkantoorStats } from '@/lib/virtueel-wedkantoor'
import { bouwGangafwerking } from './gangafwerking'
import { bouwVideoscherm, CINEMA_VIDEO_ID, type Videoscherm } from './videoscherm'
import { GraffitiSpuiter } from './GraffitiSpuiter'
import { laadTactiek, Tactiekbord } from './Tactiekbord'
import { muurLengte, type Tag } from '@/lib/virtueel-graffiti'
import { GOUDEN_BALLEN, legeSporen, waterKleur, type BordId, type Sporenstaat, type SpoorSoort } from '@/lib/virtueel-sporen'
import type { Tactiek } from '@/lib/virtueel-tactiek'
import { VERDIEPEN } from '@/lib/virtueel-lift'

// Virtueel krachtbal: een gereconstrueerd wedstrijdfragment in 3D, in een stadion in je
// clubkleuren. Je kijkt vanop de tribune, volgt de bal, kruipt in het hoofd van een speler, loopt
// zelf over het veld of wandelt buiten rond het stadion en door de poort naar binnen (WASD/pijltjes
// of de joystick op gsm, slepen om rond te kijken), of maakt een rondvlucht. Alle posities komen uit src/lib/virtueel.ts; deze
// component bouwt enkel de scène en tekent elke frame de stand op het huidige tijdstip.

type Modus = 'zweven' | 'buiten' | 'rondvlucht' | 'tribune' | 'bal' | 'speler' | 'lopen'
const MODI: { id: Modus; label: string; uitleg: string; kort?: string }[] = [
  { id: 'zweven', label: 'Zweven', uitleg: 'Zweef vrij rond je stadion: WASD of pijltjes, Spatie/E omhoog, Q/C omlaag, Shift sneller, sleep om rond te kijken. Op gsm: joystick + ▲▼.', kort: 'Joystick om te zweven, ▲▼ voor de hoogte, sleep om rond te kijken.' },
  { id: 'buiten', label: 'Wandelen', uitleg: 'Wandel over het plein en door de hoofdingang naar binnen. Via de hoeken van de tribunes kom je aan het veld.', kort: 'Joystick om te wandelen, sleep om rond te kijken.' },
  { id: 'rondvlucht', label: 'Rondvlucht', uitleg: 'Een rondvlucht rond het stadion.' },
  { id: 'tribune', label: 'Tribune', uitleg: 'Draai, zoom en verschuif vrij rond het veld.' },
  { id: 'bal', label: 'Volg de bal', uitleg: 'De camera blijft bij de bal, langs de zijlijn.' },
  { id: 'speler', label: 'Spelersblik', uitleg: 'Kijk door de ogen van een speler. Kies hieronder wie.' },
  { id: 'lopen', label: 'Op het veld', uitleg: 'Loop tussen de spelers: WASD of pijltjes (Shift = sneller), sleep om rond te kijken. Op gsm: joystick links onder.', kort: 'Joystick om te lopen, sleep om rond te kijken.' },
]
/** Rondkijken rond het stadion: altijd beschikbaar. */
const VERKENNEN: Modus[] = ['zweven', 'buiten', 'rondvlucht']
/** De views om de wedstrijd te volgen: verschijnen zodra je aan het veld bent. */
const VELD: Modus[] = ['tribune', 'bal', 'speler', 'lopen']
const WANDELEN: Modus[] = ['lopen', 'buiten']
const BESTUURBAAR: Modus[] = ['lopen', 'buiten', 'zweven']
const OOGHOOGTE = 1.7
const RUIMTE_MELDING: Record<string, string> = {
  Fitness: '💪 Fitness · samen sterker',
  Cinema: '🎬 Cinema · de film loopt',
  Gaming: '🎮 Gaming',
  Zwembad: '🏊 Zwembad',
  Sauna: '🧖 Sauna & wellness',
  Speelhal: '🎡 Speelhal · spring, klim en glij!',
  Wedkantoor: '🎰 Wedkantoor · draai gratis aan het bonusrad',
}
/** Wat je ergens kan doen: bij de kleedkamer (muur, bord) of in de kelder (zie kelderspel.ts). */
type Nabij = { soort: 'muur' } | { soort: 'bord' } | { soort: 'rad' } | { soort: 'stats' } | KelderActie
const ACTIE_LABEL: Record<Nabij['soort'], string> = {
  muur: '🎨 Spuit op de muur',
  bord: '📋 Tactiekbord',
  kmuur: '🎨 Spuit op de muur',
  kbord: '📋 Tactiekbord',
  bad: '🦆 Eendjes & verf',
  popcorn: '🍿 Pof popcorn',
  loopband: '🏃 Op de loopband',
  zetel: '💺 Ga zitten',
  arcade: '🎮 Speel Doelworp',
  rad: '🎡 Draai aan het rad (gratis)',
  stats: '📊 Bekijk de statistieken',
}
type Muur = 'kleedkamer' | 'kelder'

const kort = (id: string) => id.replace(/^T\d-/, '')

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
  const geheel = useRef<HTMLDivElement>(null)
  const [vol, setVol] = useState(false)
  const joystickRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<{ sporen: Spoor[]; duur: number; veld: Veld; ploegen: Ploeg[]; kleuren: Record<number, string> } | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [modus, setModus] = useState<Modus>('zweven')
  const [uitleg, setUitleg] = useState(true)
  const [aanVeld, setAanVeld] = useState(false)
  const [welkom, setWelkom] = useState(true)
  const [klaar, setKlaar] = useState(false)
  const [hoog, setHoog] = useState(0)
  const [gekozen, setGekozen] = useState<string | null>(null)
  // De labels boven de spelers staan altijd aan.
  const namen = true
  const [bezit, setBezit] = useState<number | null>(null)
  const [stick, setStick] = useState({ x: 0, y: 0 })
  // Wat je in en rond het stadion kan doen: spuiten op de graffitimuur, het tactiekbord, de lift.
  const [nabij, setNabij] = useState<Nabij | null>(null)
  const [paneel, setPaneel] = useState<'graffiti' | 'tactiek' | 'bad' | 'loopband' | 'doelworp' | 'wedkantoor' | null>(null)
  // De statistieken van de pronostiek voor het wedkantoor (zie lib/virtueel-wedkantoor.ts).
  const [wedStats, setWedStats] = useState<WedkantoorStats | null>(null)
  const wedStatsRef = useRef<WedkantoorStats | null>(null)
  const gokRef = useRef<Gokkantoor | null>(null)
  // Welke graffitimuur / welk tactiekbord open staat: dat bij de kleedkamer of dat in de speelhal.
  const [welkeMuur, setWelkeMuur] = useState<Muur>('kleedkamer')
  const [zit, setZit] = useState<number | null>(null)
  const [goud, setGoud] = useState(0)
  const [melding, setMelding] = useState<string | null>(null)
  const [geluid, setGeluid] = useState(false)
  const [liftPaneel, setLiftPaneel] = useState<{ hier: number; rijdt: boolean; doel: number | null } | null>(null)
  const [muur, setMuur] = useState<{ tags: Tag[]; lengte: number }>({ tags: [], lengte: muurLengte(0) })
  const muurRef = useRef(muur)
  muurRef.current = muur
  const [kelderMuur, setKelderMuur] = useState<{ tags: Tag[]; lengte: number }>({ tags: [], lengte: muurLengte(0) })
  const kelderMuurRef = useRef(kelderMuur)
  kelderMuurRef.current = kelderMuur
  // Wat bezoekers in het stadion achterlieten (eendjes, popcorn, meters, zetels, scores, borden, goud).
  const [sporen, setSporen] = useState<Sporenstaat>(() => legeSporen())
  const sporenRef = useRef(sporen)
  sporenRef.current = sporen
  const kleedRef = useRef<Kleedkamer | null>(null)
  const spelRef = useRef<Kelderspel | null>(null)
  const goudRef = useRef<Goudjacht | null>(null)
  const waterRef = useRef<((hex: string) => void) | null>(null)
  // Wat de knoppen aan de scène vragen: waar sta je, en ga zitten.
  const handRef = useRef<{ positie: () => { x: number; z: number }; zitNeer: (nr: number) => void; staOp: () => void } | null>(null)
  const videoRef = useRef<Videoscherm | null>(null)

  // Wat de tekenlus nodig heeft, zonder bij elke wijziging de scène opnieuw te bouwen.
  const st = useRef({ tijd: 0, spelend: false, modus: 'zweven' as Modus, gekozen: null as string | null, namen: true, stick: { x: 0, y: 0 }, hoog: 0, spoel: false, pauze: false, liftKeuze: null as number | null, naarHuis: false, zit: null as number | null })
  st.current.modus = modus
  st.current.gekozen = gekozen
  st.current.namen = namen
  st.current.stick = stick
  st.current.hoog = hoog
  // Staat de spuitbus of het tactiekbord open, dan hoeft het stadion erachter niet te tekenen.
  st.current.pauze = paneel != null

  // Het welkom verschijnt pas als het eerste beeld van het stadion er staat, en verdwijnt na zes
  // seconden.
  // De uitleg van een modus staat er even, en verdwijnt dan vanzelf (zachtjes) uit beeld.
  useEffect(() => {
    if (welkom && klaar) return
    setUitleg(true)
    const t = setTimeout(() => setUitleg(false), 5000)
    return () => clearTimeout(t)
  }, [modus, welkom, klaar])

  useEffect(() => {
    if (!welkom || !klaar) return
    const t = setTimeout(() => setWelkom(false), 6000)
    return () => clearTimeout(t)
  }, [welkom, klaar])

  // De graffitimuur van je club: alles wat er ooit op gespoten is (staat in de databank, dus ook
  // na een update van de site blijft hij vol).
  useEffect(() => {
    let weg = false
    for (const welke of ['kleedkamer', 'kelder'] as const) {
      fetch(`/api/virtueel/graffiti?club=${thema.clubId ?? ''}&muur=${welke}`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<{ tags: Tag[]; lengte: number }>) : null))
        .then((m) => {
          if (weg || !m) return
          if (welke === 'kleedkamer') {
            setMuur(m)
            kleedRef.current?.zetTags(m.tags, m.lengte)
          } else {
            setKelderMuur(m)
            spelRef.current?.zetTags(m.tags, m.lengte)
          }
        })
        .catch(() => {})
    }
    return () => {
      weg = true
    }
  }, [thema.clubId])

  // De sporen van je club (zie lib/virtueel-sporen.ts): alles is afgeleid op de server.
  const pasSporenToe = useCallback((s: Sporenstaat) => {
    setSporen(s)
    sporenRef.current = s
    spelRef.current?.zetStaat(s)
    goudRef.current?.zetGevonden(s.vondsten.mijn)
    if (goudRef.current) setGoud(goudRef.current.aantal())
    if (s.borden.kleedkamer) kleedRef.current?.zetTactiek(s.borden.kleedkamer)
  }, [])
  const herlaadSporen = useCallback(() => {
    fetch(`/api/virtueel/sporen?club=${thema.clubId ?? ''}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<Sporenstaat>) : null))
      .then((s) => s && pasSporenToe(s))
      .catch(() => {})
  }, [thema.clubId, pasSporenToe])
  useEffect(() => herlaadSporen(), [herlaadSporen])
  useEffect(() => {
    let weg = false
    fetch('/api/virtueel/wedkantoor', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<WedkantoorStats>) : null))
      .then((s) => {
        if (weg || !s) return
        wedStatsRef.current = s
        setWedStats(s)
        gokRef.current?.zetStats(s)
      })
      .catch(() => {})
    return () => {
      weg = true
    }
  }, [])
  // Iets achterlaten in het stadion. Daarna halen we de (afgeleide) toestand opnieuw op — na een
  // tel, zodat een eendje eerst rustig kan landen.
  const herlaadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const laat = useCallback(
    async (soort: SpoorSoort, waarde: unknown): Promise<boolean> => {
      try {
        const r = await fetch('/api/virtueel/sporen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ soort, waarde }) })
        if (r.status === 401) {
          setMelding('🔒 Log in om iets achter te laten voor de volgende')
          return false
        }
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setMelding(d.error ?? 'Dat lukte even niet')
          return false
        }
        if (herlaadTimer.current) clearTimeout(herlaadTimer.current)
        herlaadTimer.current = setTimeout(herlaadSporen, 1200)
        return true
      } catch {
        return false
      }
    },
    [herlaadSporen],
  )
  // Een tactiekbord bewaren we pas als je even stopt met schuiven (en zeker bij het sluiten).
  const bordTimer = useRef<{ t: ReturnType<typeof setTimeout>; doe: () => void } | null>(null)
  const bewaarBord = (bord: BordId, t: Tactiek) => {
    if (bordTimer.current) clearTimeout(bordTimer.current.t)
    const doe = () => {
      bordTimer.current = null
      void laat('bord', { id: bord, tactiek: t })
    }
    bordTimer.current = { t: setTimeout(doe, 1500), doe }
  }
  const sluitPaneel = () => {
    if (bordTimer.current) {
      clearTimeout(bordTimer.current.t)
      bordTimer.current.doe()
    }
    setPaneel(null)
  }
  const loopKlaar = useCallback((meter: number) => void laat('loopband', { meter }).then((ok) => ok && setMelding(`🏃 ${meter} m erbij voor de club!`)), [laat])
  const worpKlaar = useCallback((score: number) => {
    if (score > 0) void laat('doelworp', { score }).then((ok) => ok && setMelding(`🎮 ${score} punten staan op het bord!`))
  }, [laat])

  // Een melding (bv. van de lift) staat er even en verdwijnt dan.
  useEffect(() => {
    if (!melding) return
    const t = setTimeout(() => setMelding(null), 2800)
    return () => clearTimeout(t)
  }, [melding])

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
        // Het fragment speelt meteen, en blijft in een lus spelen (er is geen tijdbalk meer).
        st.current.spelend = true
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
    // alpha: het grote scherm is een gat in het canvas waarachter de video speelt (videoscherm.ts).
    const renderer = new THREE.WebGLRenderer({ antialias: !licht, powerPreference: 'high-performance', alpha: true })
    renderer.setPixelRatio(pixels)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.className = 'vk-canvas'
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog('#0b1626', 140, 420)
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
    const omgeving = bouwOmgeving(scene, { thema, licht, logo: stadion.logo })
    const sfeer = bouwSfeer(scene, { thema, licht, logo: stadion.logo })
    // De hall of fame hangt in de gangen; het kopbord op de achterwand van de zuidtribune, recht
    // tegenover de hoofdingang.
    const zuidTribune = stadion.obstakels.find((o) => o.z0 > 0 && o.x1 - o.x0 > 30)
    const erezaal = bouwEregalerij(scene, { thema, logo: stadion.logo, kopbordZ: (zuidTribune?.z1 ?? 22) - 0.45, renderer, licht })
    // De tribunes (hun voetafdruk) — de gangen liggen erachter.
    const lang = (o: Rechthoek) => o.x1 - o.x0 > 30
    const tribunes = {
      zuid: zuidTribune,
      noord: stadion.obstakels.find((o) => o.z1 < 0 && lang(o)),
      oost: stadion.obstakels.find((o) => o.x0 > 0 && !lang(o)),
      west: stadion.obstakels.find((o) => o.x1 < 0 && !lang(o)),
    }
    // De fotogalerij: supportersfoto's van je club op de achterwanden van de kopse tribunes.
    const fotogalerij = thema.fotos?.length ? bouwFotogalerij(scene, { thema, kaders: thema.fotos, oost: tribunes.oost, west: tribunes.west }) : null
    // Het verdiep boven de zuidgang: lift, VIP-loges (twee met een aquarium) en de gang met de oude
    // bekers uit de beginjaren van de club.
    const tribuneZ = zuidTribune?.z1 ?? 22.65
    const verdiep = bouwVerdiep(scene, { thema, renderer, licht, tribuneZ, vroeger: thema.erezaal?.vroeger ?? [], logo: stadion.logo })
    // Buiten aan de westkant: de kleedkamer met douches en tactiekbord, en de graffitimuur.
    const kleedkamer = bouwKleedkamer(scene, { thema, licht, logo: stadion.logo })
    kleedRef.current = kleedkamer
    kleedkamer.zetTactiek(sporenRef.current.borden.kleedkamer ?? laadTactiek())
    if (muurRef.current.tags.length) kleedkamer.zetTags(muurRef.current.tags, muurRef.current.lengte)
    // De afwerking van de gangen: ledplint, inleglijnen, banken en planten.
    const gangafwerking = bouwGangafwerking(scene, { thema, licht, oost: tribunes.oost, west: tribunes.west })
    // De ringwandeling op het dak (met de brug naar de lift).
    const liftZ = tribuneZ + 2.6
    const ring = bouwRing(scene, { thema, licht, liftX: LIFT_X, liftZ })
    // Bewegwijzering naar alles wat er in de gangen te vinden is.
    const bestemmingen: Bestemming[] = [
      { naam: 'Hall of Fame & bekers', icoon: '🏆', x: 0, z: GEVEL.B - 4, kleur: '#fbbf24' },
      ...(fotogalerij && tribunes.oost ? [{ naam: 'Fotogalerij', icoon: '📸', x: tribunes.oost.x1, z: 0, kleur: '#f472b6' }] : []),
      ...(fotogalerij && tribunes.west ? [{ naam: 'Fotogalerij', icoon: '📸', x: tribunes.west.x0, z: 0, kleur: '#f472b6' }] : []),
      ...(thema.weekend ? [{ naam: 'Dit weekend', icoon: '⚡', x: 0, z: -GEVEL.B + 4, kleur: '#38bdf8' }] : []),
      { naam: 'Lift · -1 tot dak', icoon: '🛗', x: LIFT_X, z: liftZ + 1, kleur: '#a78bfa' },
      { naam: 'Kleedkamers', icoon: '🚿', x: -GEVEL.A, z: 10, kleur: '#34d399' },
      { naam: 'Graffitimuur', icoon: '🎨', x: -GEVEL.A, z: 0, kleur: '#f472b6' },
      { naam: 'Hoofdingang', icoon: '🚪', x: 0, z: GEVEL.B, kleur: '#e2e8f0' },
    ]
    const wegwijzers = bouwWegwijzers(scene, { thema, logo: stadion.logo, bestemmingen, tribunes })
    // Leven in de gangen: wandelaars, een bar in elke hoek en het logo in de vloer.
    const gangleven = bouwGangleven(scene, { thema, licht, logo: stadion.logo })
    // De buitenkant tot in de details: dakrand, traptorens, portalen, fonteinen en het plein.
    const buitenkant = bouwBuitenkant(scene, { thema, licht })
    const obstakels = [
      ...stadion.obstakels,
      ...omgeving.obstakels,
      ...sfeer.obstakels,
      ...erezaal.obstakels,
      ...wegwijzers.obstakels,
      ...gangleven.obstakels,
      ...buitenkant.obstakels,
      ...kleedkamer.obstakels,
      ...gangafwerking.obstakels,
    ]
    // De Hollywood-sterren in de zuidgang: enkel op vrije vloer (niet onder een vitrine, zuil of de lift).
    const sterren = bouwSterren(scene, {
      thema,
      sterren: thema.erezaal?.sterren ?? [],
      tribuneZ,
      vrij: (x, z) =>
        Math.abs(x - LIFT_X) > 2.6 &&
        !obstakels.some((o) => x + 0.95 > o.x0 && x - 0.95 < o.x1 && z + 0.95 > o.z0 && z - 0.95 < o.z1),
    })
    // De weekendzaal in de noordgang: de wedstrijden van dit weekend, met de standen. Op zaterdag en
    // zondag luistert ze mee op het gedeelde live-weekendkanaal (één poller voor alle kijkers).
    const noordTribune = stadion.obstakels.find((o) => o.z1 < 0 && o.x1 - o.x0 > 30)
    const weekendzaal = thema.weekend ? bouwWeekendzaal(scene, { thema, zaal: thema.weekend, wandZ: (noordTribune?.z0 ?? -22) + 0.45 }) : null
    let weekendStroom: EventSource | null = null
    if (thema.weekend?.bezig && weekendzaal && typeof EventSource !== 'undefined') {
      let huidig = thema.weekend
      weekendStroom = new EventSource(`/api/live/stream?date=${encodeURIComponent(huidig.zaterdag)}&view=weekend`)
      weekendStroom.addEventListener('scores', (e) => {
        try {
          const nieuw = pasStandenToe(huidig, JSON.parse((e as MessageEvent<string>).data) as WeekendStand[])
          if (nieuw === huidig) return
          huidig = nieuw
          weekendzaal.werkBij(nieuw)
        } catch {
          // Een kapot bericht: de muur blijft gewoon staan zoals hij was.
        }
      })
    }
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

    // Alles hierboven staat boven de grond. Ben je in de kelder, dan hoeft dat niet getekend te
    // worden (je ziet het toch niet): enkel de lichten blijven aan.
    const bovengronds = scene.children.filter((o) => !(o as THREE.Light).isLight)
    let inKelder = false
    // De lift van de kelder tot op het dak, en de kelder zelf (-1).
    const lift = bouwLift(scene, { thema, renderer, tribuneZ, licht })
    const kelder = bouwKelder(scene, { thema, licht, liftX: LIFT_X, liftZ, logo: stadion.logo })
    // Wat bezoekers in de kelder achterlaten (eendjes, popcorn, borden, zetels, muur en bord).
    const kelderspel = bouwKelderspel(kelder.groep, { thema, plekken: kelder.plekken, zetWaterKleur: kelder.zetWaterKleur, licht })
    spelRef.current = kelderspel
    waterRef.current = kelder.zetWaterKleur
    kelderspel.zetStaat(sporenRef.current)
    if (kelderMuurRef.current.tags.length) kelderspel.zetTags(kelderMuurRef.current.tags, kelderMuurRef.current.lengte)
    if (sporenRef.current.borden.kelder) kelderspel.zetTactiek(sporenRef.current.borden.kelder)
    // Het wedkantoor: de schermen met de pronostiek, en het bonusrad (gratis, voor de fun).
    const gokkantoor = bouwGokkantoor(kelder.groep, { thema, plek: kelder.plekken.wedkantoor, renderer, logo: stadion.logo, licht })
    gokRef.current = gokkantoor
    if (wedStatsRef.current) gokkantoor.zetStats(wedStatsRef.current)
    // Echte krachtbal op het grote scherm in het stadion, en in de cinema in de kelder.
    const cinema = kelder.doek
    const video = bouwVideoscherm(scene, {
      houder: el,
      thema,
      schermen: [
        {
          ...stadion.scherm,
          ry: Math.PI / 2,
          titel: 'Krachtbalwedstrijd op het grote scherm',
          zichtbaar: (c) => c.position.y > -0.5 && c.position.x > stadion.scherm.x + 0.3 && c.position.distanceTo(new THREE.Vector3(stadion.scherm.x, stadion.scherm.y, stadion.scherm.z)) < 260,
        },
        {
          ...cinema,
          titel: 'Film in de cinema',
          videoId: CINEMA_VIDEO_ID,
          zichtbaar: (c) => c.position.y < -0.5 && c.position.z > cinema.z + 0.3 && c.position.z < cinema.z + 32 && Math.abs(c.position.x - cinema.x) < 13,
        },
      ],
    })
    videoRef.current = video
    const raakt = (lijst: Rechthoek[], x: number, z: number) => lijst.some((o) => x > o.x0 - 0.35 && x < o.x1 + 0.35 && z > o.z0 - 0.35 && z < o.z1 + 0.35)
    // In de kooi en in de deuropening mag je altijd staan (op het verdiep waar de kooi is).
    const bijKooi = (x: number, z: number) => lift.binnen(x, z) || (Math.abs(x - lift.x) < 0.55 && z > lift.zDeur - 0.3 && z < lift.zDeur + 0.5)
    // De goudjacht: zes ballen in de kelder, en zes boven (kleedkamer, hall of fame, plein, westkant,
    // het verdiep en de ring op het dak). Elke plek schuift tot ze op vrije, bereikbare vloer ligt.
    const vrij = (v: number, x: number, z: number) =>
      v === -1 ? kelder.mag(x, z) : v === 2 ? ring.mag(x, z) : v === 1 ? !raakt([...verdiep.obstakels, ...lift.obstakels(1)], x, z) : !raakt([...obstakels, ...lift.obstakels(0)], x, z) && Math.hypot(x, z) < WERELD_STRAAL - 2
    const zoekVrij = (v: number, x: number, z: number): { x: number; z: number } => {
      for (let r = 0; r <= 8; r += 0.5)
        for (let k = 0; k < (r ? 16 : 1); k++) {
          const a = (k / 16) * Math.PI * 2
          if (vrij(v, x + Math.cos(a) * r, z + Math.sin(a) * r)) return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r }
        }
      return { x, z }
    }
    const ringNoord = (() => {
      for (let dz = -6; dz <= 6; dz += 0.25) if (ring.mag(6, -GEVEL.B + dz)) return { x: 6, z: -GEVEL.B + dz }
      return { x: 6, z: -GEVEL.B }
    })()
    const boven: [number, number, number][] = [
      [0, KLEED.x0 + 3, KLEED.z1 - 2.5],
      [0, 7, GEVEL.B - 3.5],
      [0, omgeving.start.x + 7, omgeving.start.z - 9],
      [0, -GEVEL.A - 14, -12],
      [1, lift.x + 9, lift.zDeur + 1.4],
      [2, ringNoord.x, ringNoord.z],
    ]
    const goudPlekken: GoudPlek[] = [
      ...kelder.plekken.goud.map((p) => ({ ...p, verdiep: -1 })),
      ...boven.map(([v, x, z]) => {
        const p = zoekVrij(v, x, z)
        return { ...p, y: (VERDIEPEN.find((q) => q.nr === v)?.y ?? 0) + 0.95, verdiep: v }
      }),
    ]
    const goudjacht = bouwGoudjacht(scene, kelder.groep, goudPlekken)
    goudRef.current = goudjacht
    goudjacht.zetGevonden(sporenRef.current.vondsten.mijn)
    setGoud(goudjacht.aantal())

    // Camera's.
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.set(0, 0, 0)
    orbit.enableDamping = true
    orbit.maxPolarAngle = Math.PI / 2 - 0.06
    orbit.minDistance = 4
    orbit.maxDistance = 150
    const doel = new THREE.Vector3()
    const kijk = new THREE.Vector3()
    const tmp = new THREE.Vector3()
    // Lopen: eigen positie + kijkrichting.
    const loper = { pos: W(cx - 8, -1.5), yaw: 0.35, pitch: -0.08 }
    loper.pos.y = OOGHOOGTE
    const toetsen = new Set<string>()
    const opToets = (e: KeyboardEvent) => {
      if (!BESTUURBAAR.includes(st.current.modus)) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyQ', 'KeyC'].includes(e.code)) {
        toetsen.add(e.code)
        e.preventDefault()
      }
    }
    const losToets = (e: KeyboardEvent) => toetsen.delete(e.code)
    window.addEventListener('keydown', opToets)
    window.addEventListener('keyup', losToets)
    let sleep: { x: number; y: number } | null = null
    const neer = (e: PointerEvent) => {
      if (!BESTUURBAAR.includes(st.current.modus)) return
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
      video.maat(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    maat()
    const ro = new ResizeObserver(maat)
    ro.observe(el)

    // Ben je (zwevend of wandelend) aan het veld? Binnen de ledborden en niet te hoog.
    const opVeld = (p: THREE.Vector3) => Math.abs(p.x) < cx + marge + 1.5 && Math.abs(p.z) < cz + marge + 1.5 && p.y < 30

    let vorige = performance.now()
    let laatsteUi = 0
    let vorigeModus: Modus | null = null
    // Zweven: waar je was, zodat je na een view terugkeert waar je vertrok. Begin: hoog boven het
    // plein, met de hoofdingang en de welkomstboog voor je.
    const zweef = { pos: new THREE.Vector3(0, 9, GEVEL.B + 46), yaw: Math.PI, pitch: -0.12 }
    // Wandelen: op welk verdiep je bent (0 = gelijkvloers, 1 = loges) en hoe hoog je vloer nu is
    // (in de lift rijdt die mee).
    let opVerdiep = 0
    let vloer = 0
    let laatsteRuimte: string | null = null
    let wandel: { x: number; z: number; yaw: number; pitch: number; verdiep: number } | null = null
    // Jijzelf (enkel te zien in de spiegel van de kleedkamer).
    const avatar = bouwAvatar(scene, thema)
    const vorigePos = { x: 0, z: 0 }
    let liftNu = lift.update(0, { x: 0, z: 0, verdiep: 0, actief: false, keuze: null }).lift
    // Op een trampoline in de speelhal: hoe ver je in de sprong bent.
    let sprong = 0
    let sprongHoogte = 0
    handRef.current = {
      positie: () => ({ x: loper.pos.x, z: loper.pos.z }),
      zitNeer(nr) {
        const p = kelderspel.zetel(nr)
        if (!p) return
        st.current.zit = nr
        loper.pos.x = p.x
        loper.pos.z = p.z + 0.05
        // De zetels kijken naar het doek (naar -z).
        loper.yaw = Math.PI
        loper.pitch = 0.08
        toetsen.clear()
      },
      staOp() {
        // Een stapje achteruit, uit de rij.
        const p = st.current.zit != null ? kelderspel.zetel(st.current.zit) : null
        if (p) loper.pos.z = p.z + 1.0
        st.current.zit = null
      },
    }
    let laatsteModus: Modus | null = null
    let frames = 0
    let getekend = false
    let frameTijd = 0
    let raf = 0
    const tik = (nu: number) => {
      raf = requestAnimationFrame(tik)
      // De rAF-tijdstempel kan net vóór performance.now() liggen: nooit een negatieve stap.
      const dt = Math.max(0, Math.min(0.1, (nu - vorige) / 1000))
      vorige = nu
      const s = st.current
      if (s.pauze) return
      if (s.spelend) {
        // Het fragment is kort: aan het einde begint het gewoon opnieuw.
        s.tijd += dt
        if (s.tijd >= duur) s.tijd %= duur
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
      // 🏠: terug naar het begin (wandelend: de ingang op het plein; zwevend: boven het plein).
      if (s.naarHuis) {
        s.naarHuis = false
        if (s.modus === 'buiten') {
          wandel = null
          opVerdiep = 0
          vloer = 0
          s.liftKeuze = null
          loper.pos.set(omgeving.start.x, OOGHOOGTE, omgeving.start.z)
          loper.yaw = omgeving.start.yaw
          loper.pitch = 0.12
        } else if (s.modus === 'zweven') {
          loper.pos.set(0, 9, GEVEL.B + 46)
          loper.yaw = Math.PI
          loper.pitch = -0.12
        }
        toetsen.clear()
      }
      if (s.modus !== vorigeModus) {
        // Ga je weg uit het wandelen, dan onthouden we waar je was (en op welk verdiep): kom je
        // terug, dan wandel je daar verder. Stond je in de lift, dan zetten we je net ervoor.
        if (vorigeModus === 'buiten') {
          const inDeLift = lift.binnen(loper.pos.x, loper.pos.z)
          wandel = {
            x: inDeLift ? lift.x : loper.pos.x,
            z: inDeLift ? lift.zDeur + 1.2 : loper.pos.z,
            yaw: loper.yaw,
            pitch: loper.pitch,
            verdiep: inDeLift && liftNu.toestand === 'rijden' ? Math.round(liftNu.van) : opVerdiep,
          }
        }
        if (vorigeModus === 'zweven') {
          zweef.pos.copy(loper.pos)
          zweef.yaw = loper.yaw
          zweef.pitch = loper.pitch
        }
        laatsteModus = vorigeModus
        if (s.zit != null) {
          handRef.current?.staOp()
          setZit(null)
        }
        if (s.modus === 'zweven') {
          loper.pos.copy(zweef.pos)
          loper.yaw = zweef.yaw
          loper.pitch = zweef.pitch
          toetsen.clear()
        }
        if (s.modus === 'tribune') {
          camera.position.set(-6, 15.5, 21)
          orbit.target.set(0, 0, 0)
        }
        if (s.modus === 'lopen') {
          // Kom je zwevend of wandelend aan het veld, dan begin je daar; anders aan de middenlijn.
          const vanBuiten = (laatsteModus === 'zweven' || laatsteModus === 'buiten') && opVeld(loper.pos)
          if (!vanBuiten) loper.pos.set(-4, OOGHOOGTE, cz + 1.5)
          loper.pos.y = OOGHOOGTE
          if (!vanBuiten) loper.yaw = Math.PI * 0.9
          loper.pitch = -0.05
          toetsen.clear()
        }
        opVerdiep = 0
        vloer = 0
        s.liftKeuze = null
        if (s.modus === 'buiten') {
          if (wandel) {
            opVerdiep = wandel.verdiep
            vloer = VERDIEPEN.find((x) => x.nr === wandel!.verdiep)?.y ?? 0
            loper.pos.set(wandel.x, OOGHOOGTE, wandel.z)
            loper.yaw = wandel.yaw
            loper.pitch = wandel.pitch
          } else {
            loper.pos.set(omgeving.start.x, OOGHOOGTE, omgeving.start.z)
            loper.yaw = omgeving.start.yaw
            loper.pitch = 0.12
          }
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
      } else if (s.modus === 'rondvlucht') {
        const a = nu / 1000 * 0.07
        const r = GEVEL.A + 42
        camera.position.set(Math.sin(a) * r, 34 + Math.sin(a * 2.3) * 8, Math.cos(a) * r * 0.85)
        camera.lookAt(0, 3, 0)
      } else if (s.modus === 'zweven') {
        const vooruit = (toetsen.has('KeyW') || toetsen.has('ArrowUp') ? 1 : 0) - (toetsen.has('KeyS') || toetsen.has('ArrowDown') ? 1 : 0) - s.stick.y
        const opzij = (toetsen.has('KeyD') ? 1 : 0) - (toetsen.has('KeyA') ? 1 : 0) + s.stick.x
        const draai = (toetsen.has('ArrowLeft') ? 1 : 0) - (toetsen.has('ArrowRight') ? 1 : 0)
        const stijg = (toetsen.has('Space') || toetsen.has('KeyE') ? 1 : 0) - (toetsen.has('KeyQ') || toetsen.has('KeyC') ? 1 : 0) + s.hoog
        loper.yaw += draai * dt * 1.6
        const tempo = toetsen.has('ShiftLeft') || toetsen.has('ShiftRight') ? 22 : 9
        // Vooruit = waar je naar kijkt (ook omhoog of omlaag), opzij blijft horizontaal.
        const cp = Math.cos(loper.pitch)
        loper.pos.x += (Math.sin(loper.yaw) * cp * vooruit - Math.cos(loper.yaw) * opzij) * tempo * dt
        loper.pos.z += (Math.cos(loper.yaw) * cp * vooruit + Math.sin(loper.yaw) * opzij) * tempo * dt
        loper.pos.y += (Math.sin(loper.pitch) * vooruit + stijg) * tempo * 0.7 * dt
        loper.pos.y = Math.max(1.4, Math.min(90, loper.pos.y))
        const r = Math.hypot(loper.pos.x, loper.pos.z)
        if (r > WERELD_STRAAL) {
          loper.pos.x *= WERELD_STRAAL / r
          loper.pos.z *= WERELD_STRAAL / r
        }
        // Zachte zweefbeweging.
        camera.position.set(loper.pos.x, loper.pos.y + Math.sin(nu / 900) * 0.08, loper.pos.z)
        camera.lookAt(
          loper.pos.x + Math.sin(loper.yaw) * cp,
          loper.pos.y + Math.sin(loper.pitch),
          loper.pos.z + Math.cos(loper.yaw) * cp,
        )
      } else if (WANDELEN.includes(s.modus)) {
        const vooruit = (toetsen.has('KeyW') || toetsen.has('ArrowUp') ? 1 : 0) - (toetsen.has('KeyS') || toetsen.has('ArrowDown') ? 1 : 0) - s.stick.y
        const opzij = (toetsen.has('KeyD') ? 1 : 0) - (toetsen.has('KeyA') ? 1 : 0) + s.stick.x
        const draai = (toetsen.has('ArrowLeft') ? 1 : 0) - (toetsen.has('ArrowRight') ? 1 : 0)
        loper.yaw += draai * dt * 1.8
        const tempo = toetsen.has('ShiftLeft') || toetsen.has('ShiftRight') ? 7.5 : 3.8
        const fx = Math.sin(loper.yaw)
        const fz = Math.cos(loper.yaw)
        // Muren, tribunes en gebouwen houden je tegen; langs een muur schuif je verder. Op elk
        // verdiep gelden de muren van daar; in de kelder en op het dak sta je enkel op de vloer.
        const v = s.modus === 'buiten' ? opVerdiep : 0
        // Zit je in de cinema? Wie wegloopt, staat eerst recht (achter de zetel).
        if (s.zit != null && Math.hypot(vooruit, opzij) > 0.2) {
          handRef.current?.staOp()
          setZit(null)
        }
        const zitHier = s.zit != null && s.modus === 'buiten' && v === -1
        const doelPos = zitHier ? { x: loper.pos.x, z: loper.pos.z } : { x: loper.pos.x + (fx * vooruit - fz * opzij) * tempo * dt, z: loper.pos.z + (fz * vooruit + fx * opzij) * tempo * dt }
        const schacht = lift.obstakels(v)
        const naar =
          v === -1
            ? stapMet((x, z) => kelder.mag(x, z) && !raakt(schacht, x, z), loper.pos, doelPos)
            : v === 2
              ? stapMet((x, z) => (ring.mag(x, z) || bijKooi(x, z)) && !raakt(schacht, x, z), loper.pos, doelPos)
              : stap(GEVEL, v === 1 ? [...verdiep.obstakels, ...schacht] : [...obstakels, ...schacht], loper.pos, doelPos)
        loper.pos.x = naar.x
        loper.pos.z = naar.z
        const deining = Math.hypot(vooruit, opzij) > 0.05 ? Math.sin(nu / 140) * 0.035 : 0
        // Trampoline: je veert vanzelf op en neer (hoger in het midden).
        const veer = s.modus === 'buiten' && v === -1 ? kelder.trampoline(loper.pos.x, loper.pos.z) : 0
        if (veer > 0) {
          sprong += dt
          sprongHoogte = Math.abs(Math.sin(sprong * 3.1)) * 1.5 * veer
        } else {
          sprong = 0
          sprongHoogte = Math.max(0, sprongHoogte - dt * 4)
        }
        const oog = (s.modus === 'buiten' ? vloer : 0) + (zitHier ? 1.15 : OOGHOOGTE) + sprongHoogte
        camera.position.set(loper.pos.x, oog + deining, loper.pos.z)
        camera.lookAt(
          loper.pos.x + Math.sin(loper.yaw) * Math.cos(loper.pitch),
          oog + Math.sin(loper.pitch),
          loper.pos.z + Math.cos(loper.yaw) * Math.cos(loper.pitch),
        )
      }

      stadion.update(nu / 1000, { tijd: t, duur, bezit: bezitAandeel(t), ploegen: scorePloegen })
      omgeving.update(nu / 1000)
      sfeer.update(nu / 1000, dt)
      erezaal.update(nu / 1000)
      weekendzaal?.update(nu / 1000)
      fotogalerij?.update(nu / 1000)
      gangleven.update(nu / 1000)
      buitenkant.update(nu / 1000)
      sterren.update(nu / 1000)
      kleedkamer.update(nu / 1000)
      // De spiegel in de kleedkamer: enkel aan als je er wandelend binnen bent, en dan sta jij erin.
      const voorSpiegel = s.modus === 'buiten' && opVerdiep === 0 && kleedkamer.binnen(loper.pos.x, loper.pos.z)
      kleedkamer.spiegel(voorSpiegel)
      // De spiegelwanden in de lift: aan als je erin of ervoor staat, zodat je jezelf ziet instappen.
      const inLift = s.modus === 'buiten' && lift.bijKooi(loper.pos.x, loper.pos.z, opVerdiep)
      lift.spiegels(inLift)
      avatar.zichtbaar(voorSpiegel || inLift)
      if (voorSpiegel || inLift) {
        const tempo = dt > 0 ? Math.hypot(loper.pos.x - vorigePos.x, loper.pos.z - vorigePos.z) / dt : 0
        avatar.update(loper.pos.x, inLift ? vloer : 0, loper.pos.z, loper.yaw, loper.pitch, tempo, nu / 1000)
      }
      vorigePos.x = loper.pos.x
      vorigePos.z = loper.pos.z
      gangafwerking.update(nu / 1000)
      verdiep.update(nu / 1000)
      ring.update(nu / 1000)
      kelder.update(nu / 1000, { x: loper.pos.x, z: loper.pos.z })
      kelderspel.update(nu / 1000, dt)
      gokkantoor.update(nu / 1000, dt)
      goudjacht.update(nu / 1000, inKelder)
      // De lift: deuren, kooi en de verdiepaanduiding. Sta je in de kooi, dan kies je je verdiep
      // (het paneel op je scherm) en rij je mee.
      const wandelt = s.modus === 'buiten'
      const r = lift.update(dt, { x: loper.pos.x, z: loper.pos.z, verdiep: opVerdiep, actief: wandelt, keuze: wandelt ? s.liftKeuze : null })
      if (r.keuzeGebruikt) s.liftKeuze = null
      liftNu = r.lift
      if (wandelt) {
        if (r.vloerY != null) vloer = r.vloerY
        if (r.aangekomen != null) {
          opVerdiep = r.aangekomen
          const v = VERDIEPEN.find((x) => x.nr === opVerdiep)!
          vloer = v.y
          setMelding(`🛗 ${v.label === 'D' ? 'Dak' : `Verdiep ${v.label}`} · ${v.naam}`)
        }
        // Een gouden krachtbal gevonden?
        const nr = goudjacht.raak(loper.pos.x, loper.pos.z, opVerdiep)
        if (nr != null) {
          const n = goudjacht.aantal()
          setGoud(n)
          setMelding(n >= GOUDEN_BALLEN ? '🏆 Alle 12 gouden ballen! Je naam staat bij de goudzoekers' : `🟡 Gouden krachtbal gevonden! ${n}/${GOUDEN_BALLEN}`)
          void laat('vondst', { nr })
        }
        // In de kelder: een melding als je een zaal binnenstapt.
        const ruimte = opVerdiep === -1 ? kelder.ruimte(loper.pos.x, loper.pos.z) : null
        if (ruimte !== laatsteRuimte) {
          laatsteRuimte = ruimte
          if (ruimte) setMelding(RUIMTE_MELDING[ruimte] ?? ruimte)
        }
      }
      // Onder de grond: enkel de kelder (en de lift) tekenen; erboven: de kelder niet.
      const nuInKelder = camera.position.y < -0.5
      if (nuInKelder !== inKelder) {
        inKelder = nuInKelder
        for (const o of bovengronds) o.visible = !inKelder
        kelder.groep.visible = inKelder
      }
      renderer.render(scene, camera)
      video.render(camera)
      if (!getekend) {
        getekend = true
        setKlaar(true)
      }

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

      // De bezitsbalk en de knoppen ~12 keer per seconde bijwerken is genoeg.
      if (nu - laatsteUi > 80) {
        laatsteUi = nu
        setBezit(bezitOp(sporen, t))
        // Enkel echt aan het veld: niet als je erboven of eronder (de kelder ligt onder het veld) loopt.
        setAanVeld((s.modus === 'zweven' || (s.modus === 'buiten' && opVerdiep === 0)) && opVeld(loper.pos))
        // In de kooi: het paneel om je verdiep te kiezen (en tijdens de rit waar je heen gaat).
        const inKooi = s.modus === 'buiten' && lift.binnen(loper.pos.x, loper.pos.z) && (liftNu.toestand === 'rijden' || Math.round(liftNu.hoogte) === opVerdiep)
        const paneel = inKooi ? { hier: opVerdiep, rijdt: liftNu.toestand === 'rijden' || liftNu.toestand === 'sluiten', doel: liftNu.toestand === 'rijden' || liftNu.toestand === 'sluiten' ? liftNu.doel : (s.liftKeuze ?? null) } : null
        setLiftPaneel((oud) => (JSON.stringify(oud) === JSON.stringify(paneel) ? oud : paneel))
        const kk = s.modus === 'buiten' && opVerdiep === 0
        const kl = s.modus === 'buiten' && opVerdiep === -1 && s.zit == null
        const nb: Nabij | null =
          kk && kleedkamer.bijMuur(loper.pos.x, loper.pos.z)
            ? { soort: 'muur' }
            : kk && kleedkamer.bijBord(loper.pos.x, loper.pos.z)
              ? { soort: 'bord' }
              : kl
                ? ((): Nabij | null => {
                    const g = gokkantoor.nabij(loper.pos.x, loper.pos.z)
                    return g ? { soort: g } : kelderspel.nabij(loper.pos.x, loper.pos.z)
                  })()
                : null
        setNabij((oud) => (JSON.stringify(oud) === JSON.stringify(nb) ? oud : nb))
      }
    }
    raf = requestAnimationFrame(tik)

    return () => {
      cancelAnimationFrame(raf)
      weekendStroom?.close()
      video.dispose()
      kleedRef.current = null
      videoRef.current = null
      spelRef.current = null
      gokRef.current = null
      goudRef.current = null
      waterRef.current = null
      handRef.current = null
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
  }, [data, thema, laat])

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

  // Volledig scherm voor de hele installatie (beeld, afspeelbalk en spelerskeuze), niet enkel het
  // canvas. Kan de browser geen element op volledig scherm zetten (iPhone), dan vult de viewer het
  // venster zelf. Op gsm draait het beeld liggend waar de browser dat toelaat.
  const naarVol = async () => {
    const el = geheel.current
    if (!el) return
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' })
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {})
        return
      } catch {
        // valt terug op het venster vullen
      }
    }
    setVol(true)
  }
  const uitVol = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    setVol(false)
  }
  const fullscreen = () => (vol ? uitVol() : void naarVol())
  useEffect(() => {
    const wissel = () => setVol(document.fullscreenElement === geheel.current)
    document.addEventListener('fullscreenchange', wissel)
    return () => document.removeEventListener('fullscreenchange', wissel)
  }, [])
  // Venster vullen zonder echte fullscreen: de pagina erachter mag niet mee scrollen; Escape sluit.
  useEffect(() => {
    if (!vol || document.fullscreenElement) return
    const vorig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setVol(false)
    window.addEventListener('keydown', esc)
    return () => {
      document.body.style.overflow = vorig
      window.removeEventListener('keydown', esc)
    }
  }, [vol])
  // F = volledig scherm aan/uit.
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || e.repeat || (e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return
      if (vol) uitVol()
      else void naarVol()
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  })

  const doeActie = (a: Nabij) => {
    switch (a.soort) {
      case 'muur':
      case 'kmuur':
        setWelkeMuur(a.soort === 'muur' ? 'kleedkamer' : 'kelder')
        setPaneel('graffiti')
        break
      case 'bord':
      case 'kbord':
        setWelkeMuur(a.soort === 'bord' ? 'kleedkamer' : 'kelder')
        setPaneel('tactiek')
        break
      case 'bad':
        setPaneel('bad')
        break
      case 'loopband':
        setPaneel('loopband')
        break
      case 'arcade':
        setPaneel('doelworp')
        break
      case 'stats':
        setPaneel('wedkantoor')
        break
      case 'rad': {
        // Gratis, voor de fun: het rad hier geeft geen boosters (die win je op /pronostiek/rad).
        const draai = gokRef.current?.draai()
        if (!draai) break
        setMelding('🎡 Het rad draait…')
        void draai.then((m) => setMelding(m >= 10 ? `🎉 JACKPOT! ×${m} — enkel voor de fun` : `🎡 ×${String(m).replace('.', ',')}! (gratis, voor de fun)`))
        break
      }
      case 'popcorn':
        spelRef.current?.popcorn()
        void laat('popcorn', {}).then((ok) => ok && setMelding('🍿 Pop pop pop! Eentje erbij op de teller'))
        break
      case 'zetel':
        handRef.current?.zitNeer(a.nr)
        setZit(a.nr)
        void laat('zetel', { nr: a.nr }).then((ok) => ok && setMelding('💺 Je naam staat nu op deze zetel'))
        break
    }
  }

  if (fout) return <p className="vk-fout">Dit fragment kon niet geladen worden: {fout}</p>

  const ploegNaam = (team: number | null) => {
    const p = data?.ploegen.find((x) => x.id === team)
    return p ? `${p.naam} (${p.thuis ? 'thuis' : 'uit'})` : 'Onbekend'
  }

  return (
    <div className={`vk modus-${modus}${vol ? ' vol' : ''}`} ref={geheel}>
      <div className={`vk-scene modus-${modus}`} ref={houder} onContextMenu={(e) => e.preventDefault()}>
        {!klaar && <div className="vk-laden">Stadion opbouwen…</div>}
        {data && (
          <>
            <div className="vk-hud">
              <div className="vk-modi" role="tablist" aria-label="Camera">
                {MODI.filter((m) => VERKENNEN.includes(m.id) || aanVeld || VELD.includes(modus)).map((m, i, lijst) => (
                  <span key={m.id} className="vk-modi-item">
                    {i > 0 && VELD.includes(m.id) && !VELD.includes(lijst[i - 1].id) && <i className="vk-modi-streep" aria-hidden />}
                    <button role="tab" aria-selected={modus === m.id} className={modus === m.id ? 'actief' : ''} onClick={() => setModus(m.id)}>
                      {m.label}
                    </button>
                  </span>
                ))}
              </div>
              {bezit != null && VELD.includes(modus) && (
                <span className="vk-bezit">
                  <i style={{ background: data.kleuren[bezit] }} /> Balbezit · {ploegNaam(bezit)}
                </span>
              )}
            </div>
            {welkom && klaar && (
              <div className="vk-welkom" aria-live="polite">
                <span>Welkom in stadion</span>
                <b>{thema.naam}</b>
                <small>Zweef of wandel naar het veld om de wedstrijd te volgen</small>
                {!vol && (
                  <button className="vk-welkom-vol" onClick={() => void naarVol()}>
                    ⛶ Beleef het op volledig scherm
                  </button>
                )}
              </div>
            )}
            {aanVeld && !VELD.includes(modus) && (
              <div className="vk-aanveld" role="dialog" aria-label="Je bent aan het veld">
                <b>🏟️ Je bent aan het veld</b>
                <span>Hoe wil je de wedstrijd volgen?</span>
                <div className="vk-aanveld-knoppen">
                  {MODI.filter((m) => VELD.includes(m.id)).map((m) => (
                    <button key={m.id} onClick={() => setModus(m.id)}>{m.label}</button>
                  ))}
                </div>
              </div>
            )}
            {VELD.includes(modus) && (
              <button className="vk-terugbuiten" onClick={() => setModus('zweven')}>↩ Naar buiten</button>
            )}
            {nabij && !paneel && zit == null && (
              <button className="vk-actie" onClick={() => doeActie(nabij)}>
                {ACTIE_LABEL[nabij.soort]}
              </button>
            )}
            {zit != null && !paneel && (
              <button
                className="vk-actie"
                onClick={() => {
                  handRef.current?.staOp()
                  setZit(null)
                }}
              >
                🚶 Opstaan
              </button>
            )}
            {modus === 'buiten' && !welkom && (
              <span className="vk-goud" title="Gouden krachtballen gevonden — ze liggen overal in het stadion">
                🟡 {goud}/{GOUDEN_BALLEN}
              </span>
            )}
            {liftPaneel && (
              <div className="vk-lift" role="dialog" aria-label="Lift: kies je verdiep">
                <b>🛗 {liftPaneel.rijdt ? 'Onderweg…' : 'Waar wil je naartoe?'}</b>
                <div className="vk-lift-knoppen">
                  {[...VERDIEPEN].reverse().map((v) => (
                    <button
                      key={v.nr}
                      className={`${v.nr === liftPaneel.hier && !liftPaneel.rijdt ? 'hier' : ''}${v.nr === liftPaneel.doel ? ' gekozen' : ''}`}
                      disabled={liftPaneel.rijdt || v.nr === liftPaneel.hier}
                      onClick={() => {
                        st.current.liftKeuze = v.nr
                        setLiftPaneel({ ...liftPaneel, doel: v.nr })
                      }}
                    >
                      <span className="nr">{v.label}</span>
                      <span className="tekst">
                        <b>{v.naam}</b>
                        <small>{v.nr === liftPaneel.hier && !liftPaneel.rijdt ? 'Je bent hier' : v.sub}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {melding && (
              <div className="vk-melding" aria-live="polite">
                {melding}
              </div>
            )}
            {(modus === 'buiten' || modus === 'zweven') && !welkom && (
              <button
                className="vk-huis"
                onClick={() => {
                  st.current.naarHuis = true
                  setMelding('🏠 Terug bij het begin')
                }}
                aria-label="Terug naar het begin"
                title="Terug naar het begin"
              >
                🏠
              </button>
            )}
            <button
              className={`vk-geluid${geluid ? ' aan' : ''}`}
              onClick={() => {
                videoRef.current?.geluid(!geluid)
                setGeluid(!geluid)
              }}
              aria-label={geluid ? 'Geluid van het grote scherm uit' : 'Geluid van het grote scherm aan'}
              title="Geluid van het grote scherm"
            >
              {geluid ? '🔊' : '🔇'}
            </button>
            <button className="vk-vol" onClick={fullscreen} aria-label={vol ? 'Volledig scherm sluiten' : 'Volledig scherm'} title={vol ? 'Sluiten (Esc)' : 'Volledig scherm (F)'}>
              {vol ? '✕' : '⛶'}
            </button>
            {!(welkom && klaar) && (
              <p className={`vk-uitleg${uitleg ? '' : ' weg'}`} aria-hidden={!uitleg}>
                <span className="lang">{MODI.find((m) => m.id === modus)?.uitleg}</span>
                <span className="kort">{MODI.find((m) => m.id === modus)?.kort ?? MODI.find((m) => m.id === modus)?.uitleg}</span>
              </p>
            )}
            {modus === 'zweven' && (
              <div className="vk-hoog" aria-label="Hoogte">
                {([[1, '▲', 'Omhoog'], [-1, '▼', 'Omlaag']] as const).map(([r, t, l]) => (
                  <button
                    key={r}
                    aria-label={l}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId)
                      setHoog(r)
                    }}
                    onPointerUp={() => setHoog(0)}
                    onPointerCancel={() => setHoog(0)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <GraffitiSpuiter
              open={paneel === 'graffiti'}
              onSluit={() => setPaneel(null)}
              tags={welkeMuur === 'kelder' ? kelderMuur.tags : muur.tags}
              lengte={welkeMuur === 'kelder' ? kelderMuur.lengte : muur.lengte}
              muur={welkeMuur}
              club={{ naam: thema.naam, primair: thema.primair, secundair: thema.secundair }}
              ingelogd={Boolean(thema.ingelogd)}
              onGeplaatst={(tag, lengte) => {
                if (welkeMuur === 'kelder') {
                  const nieuw = { tags: [...kelderMuur.tags, tag], lengte }
                  setKelderMuur(nieuw)
                  spelRef.current?.zetTags(nieuw.tags, nieuw.lengte)
                } else {
                  const nieuw = { tags: [...muur.tags, tag], lengte }
                  setMuur(nieuw)
                  kleedRef.current?.zetTags(nieuw.tags, nieuw.lengte)
                }
                setMelding('🎨 Je tag staat op de muur!')
              }}
            />
            <Tactiekbord
              open={paneel === 'tactiek'}
              onSluit={sluitPaneel}
              kleur={{ wij: thema.primair, tekstWij: thema.tekstOpPrimair }}
              bord={welkeMuur}
              begin={sporen.borden[welkeMuur] ?? null}
              onWijzig={(t) => {
                if (welkeMuur === 'kelder') spelRef.current?.zetTactiek(t)
                else kleedRef.current?.zetTactiek(t)
                if (thema.ingelogd) bewaarBord(welkeMuur, t)
              }}
            />
            <Badkiezer
              open={paneel === 'bad'}
              onSluit={() => setPaneel(null)}
              eenden={sporen.eenden.length}
              onEend={(kleur) => {
                setPaneel(null)
                const pos = handRef.current?.positie()
                const spel = spelRef.current
                if (!pos || !spel) return
                const { u, v } = spel.mikpunt(pos.x, pos.z)
                spel.werpEend(u, v, kleur, pos)
                void laat('eend', { u, v, kleur }).then((ok) => ok && setMelding('🦆 Plons! Je eendje blijft in het bad'))
              }}
              onVerf={(kleur) => {
                setPaneel(null)
                waterRef.current?.(waterKleur([...sporen.verf, kleur].slice(-6)))
                void laat('verf', { kleur }).then((ok) => ok && setMelding('🎨 Het water kleurt mee!'))
              }}
            />
            <WedkantoorPaneel open={paneel === 'wedkantoor'} onSluit={() => setPaneel(null)} stats={wedStats} />
            <Loopband open={paneel === 'loopband'} onSluit={() => setPaneel(null)} onKlaar={loopKlaar} />
            <Doelworp open={paneel === 'doelworp'} onSluit={() => setPaneel(null)} onKlaar={worpKlaar} kleur="#facc15" />
            {BESTUURBAAR.includes(modus) && !paneel && (
              <div className="vk-joy" ref={joystickRef} onPointerDown={joyNeer} onPointerMove={joyZet} onPointerUp={joyLos} onPointerCancel={joyLos} aria-hidden>
                <span style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }} />
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
