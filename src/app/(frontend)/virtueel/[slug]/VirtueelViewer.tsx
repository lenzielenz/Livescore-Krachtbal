'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { balOp, balSpoor, bezitOp, bezitTijdlijn, decodeer, GEVEL, gevelAfstand, op, ploegKleuren, snelheid, stap, stapMet, VERDIEP_RAMEN, vrij as vrijVanGevel, WERELD_STRAAL, type Ploeg, type Rechthoek, type Reconstructie, type Spoor, type StadionThema, type Veld } from '@/lib/virtueel'
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
import { bouwTuin } from './tuin'
import { bouwSterren } from './sterren'
import { bouwVerdiep } from './verdiep'
import { bouwLift, LIFT_X } from './lift'
import { bouwRing, RING } from './ring'
import { bouwVuurwerk, type Vuurwerk } from './vuurwerk'
import { bouwFeest, FEEST_MELDING, type FeestPlek } from './feest'
import { bouwMeter } from './meter'
import { bouwKelder } from './kelder'
import { AVATAR_LAAG, bouwAvatar, EIGEN_LAAG, type Avatar } from './avatar'
import { bouwPopcornDoosje } from './popcornkraam'
import { bouwKleedkamer, KLEED, type Kleedkamer } from './kleedkamer'
import { bouwKelderspel, type KelderActie, type Kelderspel } from './kelderspel'
import { bouwGoudjacht, type GoudPlek, type Goudjacht } from './goudjacht'
import { bouwSamenvoeger } from './samenvoegen'
import { bouwZichtbaarheid } from './zichtbaarheid'
import { Badkiezer, Doelworp, Loopband } from './Kelderspellen'
import { bouwGokkantoor, type Gokkantoor } from './gokkantoor'
import { WedkantoorPaneel } from './Wedkantoor'
import { bouwPhotobooth, type BoothFoto, type Photobooth as Photobooth3D } from './photobooth'
import { Photobooth } from './Photobooth'
import { Wedkiosk } from './Wedkiosk'
import { Fanshop } from './Fanshop'
import { Praat, type Supporter } from './Praat'
import { Superstar } from './Superstar'
import { bouwKluis } from './kluis'
import { bouwBakman } from './bakman'
import { bouwFandorp, type Kermisspel, type Rit, type RitInfo } from './fandorp'
import { KermisspelPaneel } from './KermisspelPaneel'
import { bouwOefencomplex } from './oefencomplex'
import { bouwSamen, type Samen } from './samen'
import { namen as namenRij, nieuwGeheugen, volgAanwezigen, type Aanwezige } from '@/lib/virtueel-aanwezig'
import { gebeurtenisTekst, roepTekst, type Gebeurtenis } from '@/lib/virtueel-praat'
import { bouwHelikopter, type Helikopter, type Vluchtinfo } from './helikopter'
import { werpAfstand, type BalId, type SuperstarStand } from '@/lib/virtueel-superstar'
import type { SuperstarHal } from './superstar'
import { StadionPlan, type PlanDoel, type PlanHier } from './StadionPlan'
import { bouwSpelersbus } from './spelersbus'
import { bouwNabewerking, NEUTRAAL, type Stemming } from './nabewerking'
import { bouwMist, bouwStof, samen } from './atmosfeer'
import type { WedkantoorStats } from '@/lib/virtueel-wedkantoor'
import { bouwGangafwerking } from './gangafwerking'
import { bouwVideoscherm, CINEMA_VIDEO_ID, type Videoscherm } from './videoscherm'
import { GraffitiSpuiter } from './GraffitiSpuiter'
import { laadTactiek, Tactiekbord } from './Tactiekbord'
import { muurLengte, type Tag } from '@/lib/virtueel-graffiti'
import { GOUDEN_BALLEN, legeSporen, waterKleur, type BordId, type Sporenstaat, type SpoorSoort, type Warmte } from '@/lib/virtueel-sporen'
import type { Tactiek } from '@/lib/virtueel-tactiek'
import { VERDIEPEN } from '@/lib/virtueel-lift'

// Virtueel krachtbal: je eigen stadion in je clubkleuren, als spel. Je wandelt (WASD/pijltjes of de
// joystick op gsm, slepen om rond te kijken) en ziet je eigen mannetje voor je: van het plein door
// de poort naar binnen, de gangen, de kelder, het fandorp en het dak, op zoek naar de gouden ballen.
// Op het veld speelt een gereconstrueerd wedstrijdfragment. Alle posities komen uit
// src/lib/virtueel.ts; deze component bouwt de scène en tekent elke frame de stand.

/** Hoe je kijkt bij het wandelen: je mannetje voor je (camera erachter) of door je eigen ogen. */
type Zicht = 'mannetje' | 'ogen'
type Modus = 'zweven' | 'buiten' | 'rondvlucht' | 'tribune' | 'bal' | 'speler' | 'lopen'
const MODI: { id: Modus; label: string; uitleg: string; kort?: string }[] = [
  { id: 'zweven', label: 'Zweven', uitleg: 'Zweef vrij rond je stadion: WASD of pijltjes, Spatie/E omhoog, Q/C omlaag, Shift sneller, sleep om rond te kijken. Op gsm: joystick + ▲▼.', kort: 'Joystick om te zweven, ▲▼ voor de hoogte, sleep om rond te kijken.' },
  { id: 'buiten', label: 'Wandelen', uitleg: 'Wandel rond in je stadion: WASD of pijltjes, Shift om te lopen, sleep om rond te kijken. Zoek de gouden ballen en ontdek de gangen, de kelder, het fandorp en het dak.', kort: 'Joystick om te wandelen, sleep om rond te kijken.' },
  { id: 'rondvlucht', label: 'Rondvlucht', uitleg: 'Een rondvlucht rond het stadion.' },
  { id: 'tribune', label: 'Tribune', uitleg: 'Draai, zoom en verschuif vrij rond het veld.' },
  { id: 'bal', label: 'Volg de bal', uitleg: 'De camera blijft bij de bal, langs de zijlijn.' },
  { id: 'speler', label: 'Spelersblik', uitleg: 'Kijk door de ogen van een speler. Kies hieronder wie.' },
  { id: 'lopen', label: 'Op het veld', uitleg: 'Loop tussen de spelers: WASD of pijltjes (Shift = sneller), sleep om rond te kijken. Op gsm: joystick links onder.', kort: 'Joystick om te lopen, sleep om rond te kijken.' },
]
/** De views om de wedstrijd te volgen: verschijnen zodra je aan het veld bent. */
const VELD: Modus[] = ['tribune', 'bal', 'speler', 'lopen']
const WANDELEN: Modus[] = ['lopen', 'buiten']
const BESTUURBAAR: Modus[] = ['lopen', 'buiten', 'zweven']
const OOGHOOGTE = 1.7
/** Hoeveel pixels we hoogstens per beeld tekenen (zie `maat`). */
const MAX_PIXELS = 3_000_000
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
type Nabij = { soort: 'muur' } | { soort: 'bord' } | { soort: 'rad' } | { soort: 'stats' } | { soort: 'kiosk' } | { soort: 'booth' } | { soort: 'knop' } | { soort: 'fanshop' } | { soort: 'superstar' } | { soort: 'kluis' } | { soort: 'heli' } | { soort: 'rit'; id: string } | { soort: 'spel'; id: string } | KelderActie
const ACTIE_LABEL: Record<Nabij['soort'], string> = {
  muur: '🎨 Spuit op de muur',
  bord: '📋 Tactiekbord',
  kmuur: '🎨 Spuit op de muur',
  kbord: '📋 Tactiekbord',
  bad: '🦆 Eendjes & verf',
  popcorn: '🍿 Neem een doosje popcorn',
  loopband: '🏃 Op de loopband',
  zetel: '💺 Ga zitten',
  arcade: '🎮 Speel Doelworp',
  rad: '🎡 Draai aan het rad (gratis)',
  stats: '📊 Bekijk de statistieken',
  kiosk: '🎟️ Zet een pronostiek',
  knop: '🔴 Druk op de grote rode knop',
  fanshop: '🛍️ Fanshop: kleed je figuur aan',
  superstar: '★ Superstar: werp zo ver je kan',
  kluis: '🔐 De kluis',
  heli: '🚁 De clubhelikopter',
  // De ritten en kermisspelletjes hebben elk hun eigen tekst (zie kermis.ts).
  rit: '',
  spel: '',
  booth: '📸 Neem een selfie',
}
type Muur = 'kleedkamer' | 'kelder'

const RIT_START: Record<string, string> = {
  reuzenrad: '🎡 Instappen! Kijk rond: je ziet straks het hele terrein.',
  draaimolen: '🎠 Hop, op een krachtbal! Hou je vast.',
  zweefmolen: '🪂 Riem vast… daar gaan we, zweven!',
  botsautos: "💥 Gas geven met de joystick (of de pijltjes) — en botsen maar!",
}
const RIT_BEDANKT: Record<string, string> = {
  reuzenrad: '🎡 Bedankt voor de rit! Tot de volgende keer.',
  draaimolen: '🎠 Rondje gedaan! Nog eentje?',
  zweefmolen: '🪂 Wat een zwier! Nog eens?',
  botsautos: '💥 Einde van de rit. Wie botste het hardst?',
}

const RADAR: Record<Warmte, string> = { heet: '🔥 heet!', warm: '♨️ warm', lauw: '🌤️ lauw', koud: '❄️ koud', niets: '🧭 niets op dit verdiep' }

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
  // Een zacht schaduwvlekje (in plaats van echte schaduwen, die een extra tekenronde kostten).
  const vlek = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false }))
  vlek.rotation.x = -Math.PI / 2
  vlek.position.y = 0.015
  groep.add(vlek)

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
  const [modus, setModus] = useState<Modus>('buiten')
  const [uitleg, setUitleg] = useState(true)
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
  const [paneel, setPaneel] = useState<'graffiti' | 'tactiek' | 'bad' | 'loopband' | 'doelworp' | 'wedkantoor' | 'kiosk' | 'booth' | 'fanshop' | 'superstar' | null>(null)
  // De photobooth in de noordgang: alle selfies van je club (oudste eerst).
  const [boothFotos, setBoothFotos] = useState<BoothFoto[]>([])
  const boothFotosRef = useRef<BoothFoto[]>([])
  // Een doosje popcorn uit de cinema: je houdt het vast (onderaan je beeld, en in de spiegels).
  const [popcornVast, setPopcornVast] = useState(false)
  const popcornVastRef = useRef(false)
  popcornVastRef.current = popcornVast
  boothFotosRef.current = boothFotos
  const boothRef = useRef<Photobooth3D | null>(null)
  // De statistieken van de pronostiek voor het wedkantoor (zie lib/virtueel-wedkantoor.ts).
  const [wedStats, setWedStats] = useState<WedkantoorStats | null>(null)
  const wedStatsRef = useRef<WedkantoorStats | null>(null)
  const gokRef = useRef<Gokkantoor | null>(null)
  const avatarRef = useRef<Avatar | null>(null)
  // Superstar (afstandwerpen in de kelder): de hal en het klassement van heel het platform.
  const sterRef = useRef<SuperstarHal | null>(null)
  const [sterStand, setSterStand] = useState<SuperstarStand | null>(null)
  const herlaadSter = useCallback(() => {
    fetch('/api/virtueel/superstar', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<SuperstarStand>) : null))
      .then((s) => {
        if (!s) return
        setSterStand(s)
        sterRef.current?.zetStand(s, null)
      })
      .catch(() => {})
  }, [])
  const naarWerplijnRef = useRef<() => void>(() => {})
  const opWerplijnRef = useRef(false)
  // De kluis (kelder) en de helikopter (dak): met alle gouden ballen krijg je de sleutel.
  const kluisRef = useRef<ReturnType<typeof bouwKluis> | null>(null)
  const heliRef = useRef<Helikopter | null>(null)
  const [vlucht, setVlucht] = useState<Vluchtinfo | null>(null)
  // De ritten in het fandorp (reuzenrad, draaimolen, zweefmolen, botsauto's) en de kermisspelletjes.
  const rittenRef = useRef<Rit[]>([])
  const ritRef = useRef<Rit | null>(null)
  const spellenRef = useRef<Kermisspel[]>([])
  const [spel, setSpel] = useState<Kermisspel | null>(null)
  // Wandel je weg van het kraam, dan sluit het spelvenster vanzelf.
  useEffect(() => {
    if (spel && !(nabij?.soort === 'spel' && nabij.id === spel.id)) setSpel(null)
  }, [nabij, spel])
  // Op het helikopterplatform zonder sleutel: uitleg hoe je mag vliegen.
  const [heliHulp, setHeliHulp] = useState<{ gevonden: number; sleutel: boolean } | null>(null)
  const [rit, setRit] = useState<RitInfo | null>(null)
  // Samen: de andere supporters van je club die nu ook rondlopen (zie samen.ts).
  const samenRef = useRef<Samen | null>(null)
  const [samenAantal, setSamenAantal] = useState(0)
  // Praten met elkaar (vaste supportersberichten) en elkaar kledij geven (zie lib/virtueel-praat.ts).
  const [supporters, setSupporters] = useState<Supporter[]>([])
  const [praatOpen, setPraatOpen] = useState(false)
  const [praatRegels, setPraatRegels] = useState<{ id: string; tekst: string; t: number }[]>([])
  const herlaadNaCadeau = useRef<() => void>(() => {})
  useEffect(() => {
    if (!praatRegels.length) return
    const t = setTimeout(() => setPraatRegels((r) => r.filter((x) => Date.now() - x.t < 15000)), 2000)
    return () => clearTimeout(t)
  }, [praatRegels])
  useEffect(() => {
    if (!thema.ingelogd || thema.clubId == null) return
    let es: EventSource | null = null
    let weg = false
    let herstart: ReturnType<typeof setTimeout> | null = null
    // Wie binnenkomt of vertrekt, krijg je te zien (en omgekeerd zien zij jou binnenkomen).
    const geheugen = nieuwGeheugen()
    let laatsteLijst: Aanwezige[] = []
    const volg = (lijst: Aanwezige[]) => {
      const v = volgAanwezigen(geheugen, lijst, thema.ikId ?? null)
      const zin = [
        v.alHier.length ? `👥 Ook in het stadion: ${namenRij(v.alHier)}` : '',
        v.binnen.length ? `👋 ${namenRij(v.binnen)} ${v.binnen.length === 1 ? 'stapt' : 'stappen'} het stadion binnen` : '',
        v.weg.length ? `🚪 ${namenRij(v.weg)} ${v.weg.length === 1 ? 'heeft' : 'hebben'} het stadion verlaten` : '',
      ].filter(Boolean)
      if (zin.length) setMelding(zin.join(' · '))
    }
    // Er komt enkel een bericht als de lijst verandert: wie al een tijd weg is, controleren we zelf.
    const wegKlok = setInterval(() => geheugen.begonnen && volg(laatsteLijst), 2000)
    // Wat er geroepen of gegeven wordt: elke gebeurtenis één keer tonen. Wat er al was toen je
    // binnenkwam, slaan we over (behalve een cadeau aan jou).
    const gezien = new Set<string>()
    let eerste = true
    const nieuws = (lijst: Gebeurtenis[]) => {
      const ik = thema.ikId ?? null
      for (const g of lijst) {
        if (gezien.has(g.id)) continue
        gezien.add(g.id)
        const voorMij = g.soort === 'geschenk' && (g.aan === ik || g.van === ik)
        if (eerste && !voorMij) continue
        if (voorMij) herlaadNaCadeau.current()
        if (g.soort === 'geschenk' && g.aan === ik) setMelding(`🎁 ${g.vanNaam} gaf je een cadeau: ${g.artikel}! Trek het aan in de fanshop.`)
        if (g.soort === 'roep') samenRef.current?.zeg(g.van, roepTekst(g.roep, thema.naam))
        else samenRef.current?.zeg(g.van, '🎁')
        const tekst = gebeurtenisTekst(g, ik, thema.naam)
        setPraatRegels((r) => [...r, { id: g.id, tekst, t: Date.now() }].slice(-5))
      }
      eerste = false
    }
    const open = () => {
      if (weg) return
      es = new EventSource('/api/virtueel/aanwezig/stream')
      es.addEventListener('aanwezig', (e) => {
        try {
          // Vroeger enkel de lijst; nu ook wat er geroepen of gegeven werd.
          const data = JSON.parse((e as MessageEvent).data) as Aanwezige[] | { aanwezig: Aanwezige[]; gebeurtenissen: Gebeurtenis[] }
          const lijst = Array.isArray(data) ? data : data.aanwezig
          samenRef.current?.zet(lijst)
          const anderen = lijst.filter((a) => a.id !== thema.ikId)
          setSamenAantal(anderen.length)
          setSupporters((oud) => {
            const nieuw = anderen.map((a) => ({ id: a.id, naam: a.naam })).sort((a, b) => a.naam.localeCompare(b.naam))
            return JSON.stringify(oud) === JSON.stringify(nieuw) ? oud : nieuw
          })
          if (!Array.isArray(data)) nieuws(data.gebeurtenissen)
          laatsteLijst = lijst
          volg(lijst)
        } catch {
          /* een kapot bericht: het volgende komt zo */
        }
      })
      es.onerror = () => {
        es?.close()
        if (!weg) herstart = setTimeout(open, 5000)
      }
    }
    open()
    const bye = () => void fetch('/api/virtueel/aanwezig', { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => {})
    window.addEventListener('pagehide', bye)
    return () => {
      weg = true
      es?.close()
      clearInterval(wegKlok)
      if (herstart) clearTimeout(herstart)
      window.removeEventListener('pagehide', bye)
      bye()
    }
  }, [thema.ingelogd, thema.clubId, thema.ikId])
  opWerplijnRef.current = paneel === 'superstar'
  // De grote rode knop op het dak: aftellen, en dan de vuurwerkshow.
  const vuurwerkRef = useRef<Vuurwerk | null>(null)
  const [aftel, setAftel] = useState<number | null>(null)
  const aftelRef = useRef<number | null>(null)
  // Het stadionplan: verschijnt vanzelf als je voor een wegwijzer staat (✕ = weg tot je verder loopt).
  const [planHier, setPlanHier] = useState<PlanHier | null>(null)
  const [planDoelen, setPlanDoelen] = useState<PlanDoel[]>([])
  const planWegRef = useRef(-1)
  const planBordRef = useRef(-1)
  // Welke graffitimuur / welk tactiekbord open staat: dat bij de kleedkamer of dat in de speelhal.
  const [welkeMuur, setWelkeMuur] = useState<Muur>('kleedkamer')
  const [zit, setZit] = useState<number | null>(null)
  const [goud, setGoud] = useState(0)
  const [radar, setRadar] = useState<Warmte>('niets')
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
  const st = useRef({ tijd: 0, spelend: false, modus: 'buiten' as Modus, gekozen: null as string | null, namen: true, stick: { x: 0, y: 0 }, hoog: 0, spoel: false, pauze: false, liftKeuze: null as number | null, naarHuis: false, zit: null as number | null, zicht: 'mannetje' as Zicht })
  st.current.modus = modus
  st.current.gekozen = gekozen
  st.current.namen = namen
  st.current.stick = stick
  st.current.hoog = hoog
  // Staat de spuitbus of het tactiekbord open, dan hoeft het stadion erachter niet te tekenen.
  // (Superstar is een paneel onderaan: de hal blijft bewegen, je ziet de bal vliegen.)
  st.current.pauze = paneel != null && paneel !== 'superstar'
  // De kijkhoek: wat je het liefst hebt, onthouden in deze browser.
  const [zicht, setZicht] = useState<Zicht>('mannetje')
  useEffect(() => {
    try {
      if (localStorage.getItem('vk-zicht') === 'ogen') setZicht('ogen')
    } catch {
      // Geen opslag (privévenster): dan het standaardzicht.
    }
  }, [])
  st.current.zicht = zicht
  const wisselZicht = () => {
    const nieuw: Zicht = zicht === 'mannetje' ? 'ogen' : 'mannetje'
    setZicht(nieuw)
    try {
      localStorage.setItem('vk-zicht', nieuw)
    } catch {
      // Niet bewaard: geen ramp.
    }
  }

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
    avatarRef.current?.kleedAan(s.mij.outfit)
    kluisRef.current?.zet(s.vondsten.mijn.length, GOUDEN_BALLEN, s.mij.sleutel)
    heliRef.current?.zetVoortgang(s.vondsten.mijn.length, GOUDEN_BALLEN, s.mij.sleutel)
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
    fetch(`/api/virtueel/photobooth?club=${thema.clubId ?? ''}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ fotos: BoothFoto[] }>) : null))
      .then((d) => {
        if (weg || !d) return
        setBoothFotos(d.fotos)
        boothRef.current?.zetFotos(d.fotos)
      })
      .catch(() => {})
    return () => {
      weg = true
    }
  }, [thema.clubId])
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
  herlaadNaCadeau.current = herlaadSporen
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
    // Een langere melding (wie er binnenkomt) blijft wat langer staan.
    const t = setTimeout(() => setMelding(null), melding.length > 40 ? 4500 : 2800)
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

    // Eén profiel voor iedereen: het lichte. Vroeger kregen computers een zwaardere versie
    // (nabewerking, meer publiek, meer deeltjes, grotere schaduwkaart), en die liep er net
    // schokkeriger dan op een gsm. Soepel gaat voor: wat echt zwaar was, is voor iedereen weg (zie
    // ook de schaduwen en de liftspiegels hieronder). `zwak` onthouden we enkel voor de meter.
    const zwak = window.matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4
    const licht = true
    // Scherp genoeg om tekst te lezen: een gsm heeft 3 pixels per schermpunt; aan 1,25 werd het beeld
    // ± 2,4 keer uitvergroot en was alle tekst wazig. Nu tot 2, binnen het pixelbudget (MAX_PIXELS);
    // hapert het toch, dan stapt de bijsturing zelf terug.
    let pixels = Math.min(window.devicePixelRatio, 2)
    // alpha: het grote scherm is een gat in het canvas waarachter de video speelt (videoscherm.ts).
    // Geen antialias op het canvas: op sterke toestellen tekent de nabewerking (nabewerking.ts) het
    // beeld in een eigen buffer, en daar doet de antialias van het canvas niets — ze kostte enkel
    // geheugen en bandbreedte. Op lichte toestellen staat ze sowieso uit.
    const begonnen = performance.now()
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: true })
    renderer.setPixelRatio(pixels)
    // Geen echte schaduwen: die kostten een extra tekenronde van de scène vanuit de zon. De spelers
    // hebben een zacht vlekje en hun ring onder zich (maakFiguur); de rest stond in het licht.
    renderer.shadowMap.enabled = false
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.className = 'vk-canvas'
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    // Wat elke module aan de scène toevoegt, krijgt haar naam mee: zo weet de zichtbaarheidslaag
    // (zichtbaarheid.ts) welk deel van de wereld wat is.
    const bron = (naam: string) => {
      for (const c of scene.children) if (c.userData.bron === undefined) c.userData.bron = naam
    }
    // Veel modules hangen hun stukken rechtstreeks aan de scène. Per module samen in één groep
    // gezet, kan de samenvoeger ze per materiaal bundelen (hij voegt samen binnen een groep). Niet
    // voor modules die later zelf iets van de scène halen (de graffitimuur, de supporters, jijzelf).
    const bundel = () => {
      const groepen = new Map<string, THREE.Group>()
      for (const c of [...scene.children]) {
        const b = c.userData.bron as string | undefined
        const los = (c as THREE.Mesh).isMesh || (c as THREE.Sprite).isSprite || (c as THREE.Points).isPoints || (c as THREE.Line).isLine
        if (!b || !los || ['Kleedkamer', 'Samen', 'Avatar'].includes(b)) continue
        let g = groepen.get(b)
        if (!g) {
          g = new THREE.Group()
          g.userData.bron = b
          scene.add(g)
          groepen.set(b, g)
        }
        g.add(c)
      }
    }
    scene.fog = new THREE.Fog('#0b1626', 140, 420)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900)
    camera.position.set(-6, 15.5, 21)
    // Wat je zelf vasthoudt (het doosje popcorn) hangt aan de camera, op een eigen laag: de gewone
    // camera tekent het, de spiegels niet (daar zie je het in de hand van je figuur).
    camera.layers.enable(EIGEN_LAAG)
    scene.add(camera)
    const fpDoos = bouwPopcornDoosje(1)
    fpDoos.position.set(0.2, -0.27, -0.46)
    fpDoos.rotation.set(0.35, -0.5, 0.08)
    fpDoos.traverse((o) => o.layers.set(EIGEN_LAAG))
    fpDoos.visible = false
    camera.add(fpDoos)

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

    // Licht: zacht hemellicht en één "maanlicht"; meer echte lampen zijn er niet. Elke echte lamp
    // wordt voor elke pixel van elk belicht voorwerp doorgerekend, dus de lichtmasten, spots en
    // lampjes zijn nep-licht (gloed, bundels, lichtplassen). Zonder de vier mastspots iets feller.
    scene.add(new THREE.HemisphereLight('#b9d4ff', '#1d3b26', licht ? 1.05 : 0.75))
    const zon = new THREE.DirectionalLight('#fff4dc', licht ? 2.1 : 1.6)
    zon.position.set(-14, 30, 18)
    zon.castShadow = false
    zon.shadow.mapSize.set(licht ? 1024 : 2048, licht ? 1024 : 2048)
    Object.assign(zon.shadow.camera, { left: -32, right: 32, top: 20, bottom: -20, near: 1, far: 90 })
    zon.shadow.bias = -0.0004
    scene.add(zon, zon.target)
    // De schaduwen: standaard over het veld; wandel je buiten, dan volgt het schaduwvlak jou, zodat
    // ook de bus, de bomen, de auto's en de cabines rondom je een schaduw werpen.
    const zonOffset = zon.position.clone()
    let schaduwBijMij = false
    const schaduwRond = (x: number | null, z: number | null) => {
      const bijMij = x != null && z != null
      if (bijMij) {
        zon.target.position.set(x, 0, z)
        zon.position.set(x + zonOffset.x * 0.7, zonOffset.y, z + zonOffset.z * 0.7)
      }
      if (bijMij === schaduwBijMij) return
      schaduwBijMij = bijMij
      if (!bijMij) {
        zon.target.position.set(0, 0, 0)
        zon.position.copy(zonOffset)
      }
      Object.assign(zon.shadow.camera, bijMij ? { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 } : { left: -32, right: 32, top: 20, bottom: -20, near: 1, far: 90 })
      zon.shadow.camera.updateProjectionMatrix()
    }
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
    bron('Stadion')
    const omgeving = bouwOmgeving(scene, { thema, licht, logo: stadion.logo })
    bron('Omgeving')
    // Het oefencomplex ten noorden van het stadion, met een veld van dezelfde maat (geen wedstrijd).
    const oefen = bouwOefencomplex(scene, { thema, licht, veldTex: veldTextuur(veld, 3), lengte: veld.length_m, breedte: veld.width_m, pleinRand: GEVEL.B + 22 })
    bron('Oefencomplex')
    // Het fandorp aan de overkant van de straat: foodtrucks, feesttent, springkasteel en een reuzenrad.
    const fandorp = bouwFandorp(scene, { thema, licht, straatZ: GEVEL.B + 30, melding: (t) => setMelding(t) })
    bron('Fandorp')
    rittenRef.current = fandorp.ritten
    spellenRef.current = fandorp.spellen
    const ritBezig = () => fandorp.ritten.find((r) => r.inRit()) ?? null
    const sfeer = bouwSfeer(scene, { thema, licht, logo: stadion.logo })
    bron('Sfeer')
    // De hall of fame hangt in de gangen; het kopbord op de achterwand van de zuidtribune, recht
    // tegenover de hoofdingang.
    const zuidTribune = stadion.obstakels.find((o) => o.z0 > 0 && o.x1 - o.x0 > 30)
    const erezaal = bouwEregalerij(scene, { thema, logo: stadion.logo, kopbordZ: (zuidTribune?.z1 ?? 22) - 0.45, renderer, licht })
    bron('Eregalerij')
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
    bron('Fotogalerij')
    // Het verdiep boven de zuidgang: lift, VIP-loges (twee met een aquarium) en de gang met de oude
    // bekers uit de beginjaren van de club.
    const tribuneZ = zuidTribune?.z1 ?? 22.65
    const verdiep = bouwVerdiep(scene, { thema, renderer, licht, tribuneZ, vroeger: thema.erezaal?.vroeger ?? [], logo: stadion.logo })
    bron('Verdiep')
    // Buiten aan de westkant: de kleedkamer met douches en tactiekbord, en de graffitimuur.
    const kleedkamer = bouwKleedkamer(scene, { thema, licht, logo: stadion.logo })
    bron('Kleedkamer')
    kleedRef.current = kleedkamer
    kleedkamer.zetTactiek(sporenRef.current.borden.kleedkamer ?? laadTactiek())
    if (muurRef.current.tags.length) kleedkamer.zetTags(muurRef.current.tags, muurRef.current.lengte)
    // De spelersbus naast de kleedkamers: instappen, rondkijken, en de wedstrijd op de schermen.
    const bus = bouwSpelersbus(scene, { thema, x: -59, z: 23.6, renderer, logo: stadion.logo, licht })
    bron('Spelersbus')
    // Laaghangende nachtmist over het plein en de grasranden rond het stadion.
    const buitenmist = licht
      ? null
      : bouwMist([
          { x: 0, y: 0.25, z: GEVEL.B + 30, b: 90, d: 26, kleur: '#c7d2fe', sterkte: 0.07, lagen: 2 },
          { x: -GEVEL.A - 26, y: 0.25, z: 0, b: 26, d: 80, kleur: '#c7d2fe', sterkte: 0.06, lagen: 2 },
          { x: GEVEL.A + 44, y: 0.25, z: -4, b: 40, d: 60, kleur: '#c7d2fe', sterkte: 0.05, lagen: 2 },
          { x: 0, y: 0.25, z: -GEVEL.B - 22, b: 90, d: 26, kleur: '#c7d2fe', sterkte: 0.06, lagen: 2 },
        ])
    // Stofjes die in het licht van de wandelgangen zweven (tussen de tribunes en de gevel).
    const gangStof =
      licht || !tribunes.zuid || !tribunes.noord || !tribunes.oost || !tribunes.west
        ? null
        : bouwStof([
            { x0: -34, x1: 34, y0: 0.6, y1: 4.2, z0: tribunes.zuid.z1 + 0.5, z1: GEVEL.B - 1.2, aantal: 220, kleur: '#ffe7b8' },
            { x0: -34, x1: 34, y0: 0.6, y1: 4.2, z0: -GEVEL.B + 1.2, z1: tribunes.noord.z0 - 0.5, aantal: 200, kleur: '#dbeafe' },
            { x0: tribunes.oost.x1 + 0.5, x1: GEVEL.A - 1.2, y0: 0.6, y1: 4.2, z0: -16, z1: 16, aantal: 110, kleur: '#ffe7b8' },
            { x0: -GEVEL.A + 1.2, x1: tribunes.west.x0 - 0.5, y0: 0.6, y1: 4.2, z0: -16, z1: 16, aantal: 110, kleur: '#ffe7b8' },
          ])
    const buitenLucht = samen(...[buitenmist, gangStof].filter((x): x is NonNullable<typeof x> => x != null))
    scene.add(buitenLucht.groep)
    bron('Lucht')
    // De photobooth in de noordgang, tegen de achterwand van de noordtribune (de gevel daar is voor
    // de weekendzaal): cabine, polaroids en de mozaïek van het logo, aan de westkant van de gang.
    const photobooth = bouwPhotobooth(scene, { thema, muurZ: (tribunes.noord?.z0 ?? -22.65) - 0.02, ry: Math.PI, x0: 6.6, logo: stadion.logo, licht })
    bron('Photobooth')
    boothRef.current = photobooth
    if (boothFotosRef.current.length) photobooth.zetFotos(boothFotosRef.current)
    // De afwerking van de gangen: ledplint, inleglijnen, banken en planten.
    const gangafwerking = bouwGangafwerking(scene, { thema, licht, oost: tribunes.oost, west: tribunes.west })
    bron('Gangafwerking')
    // De ringwandeling op het dak (met de brug naar de lift).
    const liftZ = tribuneZ + 2.6
    const ring = bouwRing(scene, { thema, licht, liftX: LIFT_X, liftZ })
    bron('Ring')
    // De rode knop staat op het dek van de ring, vlak naast de brug van de lift, met zicht op het veld.
    const vuurwerk = bouwVuurwerk(scene, { primair: thema.primair, secundair: thema.secundair, licht, knop: { x: LIFT_X + 5, y: RING.y, z: GEVEL.B - 1.6, ry: 0 }, dakY: RING.y })
    bron('Vuurwerk')
    vuurwerkRef.current = vuurwerk
    // En tijdens de show is het overal feest: in de gangen, op het plein, in het fandorp en (zie
    // verder) in de kelder — confetti, lichtbundels, zoeklichten en muziek waar je ook bent.
    const feest = bouwFeest(scene, {
      vuurwerk,
      primair: thema.primair,
      secundair: thema.secundair,
      licht,
      gangen:
        tribunes.zuid && tribunes.noord && tribunes.oost && tribunes.west
          ? [
              { x0: -34, x1: 34, z0: tribunes.zuid.z1 + 0.5, z1: GEVEL.B - 1.2 },
              { x0: -34, x1: 34, z0: -GEVEL.B + 1.2, z1: tribunes.noord.z0 - 0.5 },
              { x0: tribunes.oost.x1 + 0.5, x1: GEVEL.A - 1.2, z0: -16, z1: 16 },
              { x0: -GEVEL.A + 1.2, x1: tribunes.west.x0 - 0.5, z0: -16, z1: 16 },
            ]
          : [],
      kom: { x0: tribunes.west?.x0 ?? -GEVEL.A + 8, x1: tribunes.oost?.x1 ?? GEVEL.A - 8, z0: tribunes.noord?.z0 ?? -GEVEL.B + 8, z1: tribunes.zuid?.z1 ?? GEVEL.B - 8 },
    })
    bron('Feest')
    const opDak = (x: number, z: number) => {
      const h = heliRef.current
      return (ring.mag(x, z) || (h?.opPlatform(x, z) ?? false)) && !raakt(h ? [vuurwerk.knop.obstakel, h.obstakel] : [vuurwerk.knop.obstakel], x, z)
    }
    // Bewegwijzering naar alles wat er in de gangen te vinden is.
    const bestemmingen: Bestemming[] = [
      { naam: 'Hall of Fame & bekers', icoon: '🏆', x: 0, z: GEVEL.B - 4, kleur: '#fbbf24' },
      ...(fotogalerij && tribunes.oost ? [{ naam: 'Fotogalerij', icoon: '📸', x: tribunes.oost.x1, z: 0, kleur: '#f472b6' }] : []),
      ...(fotogalerij && tribunes.west ? [{ naam: 'Fotogalerij', icoon: '📸', x: tribunes.west.x0, z: 0, kleur: '#f472b6' }] : []),
      ...(thema.weekend ? [{ naam: 'Dit weekend', icoon: '⚡', x: 0, z: -GEVEL.B + 4, kleur: '#38bdf8' }] : []),
      { naam: 'Lift · -1 tot dak', icoon: '🛗', x: LIFT_X, z: liftZ + 1, kleur: '#a78bfa' },
      { naam: 'Kleedkamers', icoon: '🚿', x: -GEVEL.A, z: 10, kleur: '#34d399' },
      { naam: 'Graffitimuur', icoon: '🎨', x: -GEVEL.A, z: 0, kleur: '#f472b6' },
      { naam: 'Spelersbus', icoon: '🚌', x: -59, z: 20.5, kleur: '#38bdf8' },
      { naam: 'Photobooth', icoon: '📸', x: -12, z: (tribunes.noord?.z0 ?? -22.65) - 3, kleur: '#fb7185' },
      { naam: 'Hoofdingang', icoon: '🚪', x: 0, z: GEVEL.B, kleur: '#e2e8f0' },
      { naam: 'Oefencomplex (noordpoort)', icoon: '🏟️', x: 0, z: -GEVEL.B, kleur: '#4ade80' },
      { naam: 'Fandorp & reuzenrad', icoon: '🎡', x: 0, z: GEVEL.B + 46, kleur: '#facc15' },
      ...(/mich/i.test(thema.naam) ? [{ naam: 'Standbeeld Bakman', icoon: '🦸', x: -40, z: GEVEL.B + 10, kleur: '#ef4444' }] : []),
    ]
    const wegwijzers = bouwWegwijzers(scene, { thema, logo: stadion.logo, bestemmingen, tribunes })
    bron('Wegwijzers')
    // Leven in de gangen: wandelaars, een bar in elke hoek en het logo in de vloer.
    const gangleven = bouwGangleven(scene, { thema, licht, logo: stadion.logo })
    bron('Gangleven')
    // De buitenkant tot in de details: dakrand, traptorens, portalen, fonteinen en het plein.
    const buitenkant = bouwBuitenkant(scene, { thema, licht })
    bron('Buitenkant')
    // Bakman, de held van KBC Sint-Michiels, op zijn sokkel op het plein (enkel in hun stadion).
    const bakman = /mich/i.test(thema.naam) ? bouwBakman(scene, { thema, licht, x: -40, z: GEVEL.B + 10, ry: 0.35 }) : null
    bron('Bakman')
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
      ...photobooth.obstakels,
      ...bus.obstakels,
      ...oefen.obstakels,
      ...fandorp.obstakels,
      ...(bakman?.obstakels ?? []),
    ]
    // De tuinafwerking: een plantenborder met boordsteen, bloemen en warm licht rond de gevel.
    obstakels.push(...bouwTuin(scene, { bestaand: obstakels, bakken: buitenkant.bakken, parking: omgeving.parking }).obstakels)
    bron('Tuin')
    // De Hollywood-sterren in de zuidgang: enkel op vrije vloer (niet onder een vitrine, zuil of de lift).
    const sterren = bouwSterren(scene, {
      thema,
      sterren: thema.erezaal?.sterren ?? [],
      tribuneZ,
      vrij: (x, z) =>
        Math.abs(x - LIFT_X) > 2.6 &&
        !obstakels.some((o) => x + 0.95 > o.x0 && x - 0.95 < o.x1 && z + 0.95 > o.z0 && z - 0.95 < o.z1),
    })
    bron('Sterren')
    // De weekendzaal in de noordgang: de wedstrijden van dit weekend, met de standen. Op zaterdag en
    // zondag luistert ze mee op het gedeelde live-weekendkanaal (één poller voor alle kijkers).
    const noordTribune = stadion.obstakels.find((o) => o.z1 < 0 && o.x1 - o.x0 > 30)
    const weekendzaal = thema.weekend ? bouwWeekendzaal(scene, { thema, zaal: thema.weekend, wandZ: (noordTribune?.z0 ?? -22) + 0.45 }) : null
    bron('Weekendzaal')
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
    bron('Veld')
    bundel()
    const bovengronds = scene.children.filter((o) => !(o as THREE.Light).isLight)
    let inKelder = false
    // De lift van de kelder tot op het dak, en de kelder zelf (-1).
    const lift = bouwLift(scene, { thema, renderer, tribuneZ, licht })
    bron('Lift')
    const kelder = bouwKelder(scene, { thema, licht, liftX: LIFT_X, liftZ, logo: stadion.logo })
    bron('Kelder')
    sterRef.current = kelder.superstar
    herlaadSter()
    feest.kelder(kelder.groep, { y: VERDIEPEN[0].y, zalen: kelder.plekken.vlakken })
    const kluis = bouwKluis(kelder.groep, { ...kelder.plekken.kluis, y: VERDIEPEN.find((v) => v.nr === -1)!.y, primair: thema.primair })
    kluisRef.current = kluis
    kluis.zet(sporenRef.current.vondsten.mijn.length, GOUDEN_BALLEN, sporenRef.current.mij.sleutel)
    const heli = bouwHelikopter(scene, { thema, logo: stadion.logo, y: RING.y, licht })
    bron('Helikopter')
    heliRef.current = heli
    heli.zetVoortgang(sporenRef.current.vondsten.mijn.length, GOUDEN_BALLEN, sporenRef.current.mij.sleutel)
    const supporters = bouwSamen(scene, thema, thema.ikId ?? null)
    bron('Samen')
    samenRef.current = supporters
    // Waar jij bent, een paar keer per seconde naar de server (enkel als je wandelt of vliegt).
    let laatsteMelding = 0
    let laatsteSleutel = ''
    const meldPlek = (nu: number) => {
      if (!thema.ingelogd || thema.clubId == null || nu - laatsteMelding < 350) return
      const s = st.current
      // Zweef je of maak je een rondvlucht, dan ben je er ook (de anderen weten dat je er bent),
      // maar zonder figuur.
      const wandelt = s.modus === 'buiten'
      const vliegt = !wandelt || heli.inVlucht() || ritBezig() != null
      const rond = (v: number, m: number) => Math.round(Math.max(-m, Math.min(m, v)) * 100) / 100
      const plek = { x: rond(wandelt ? loper.pos.x : camera.position.x, 590), y: rond(vliegt ? camera.position.y : vloer, 240), z: rond(wandelt ? loper.pos.z : camera.position.z, 590), yaw: rond(Math.atan2(Math.sin(loper.yaw), Math.cos(loper.yaw)), 4), verdiep: wandelt ? opVerdiep : 0, vliegt }
      const sleutel = JSON.stringify(plek)
      // Stilstaan: elke 3 s een teken van leven, anders enkel als je beweegt.
      if (sleutel === laatsteSleutel && nu - laatsteMelding < 3000) return
      laatsteMelding = nu
      laatsteSleutel = sleutel
      void fetch('/api/virtueel/aanwezig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plek, outfit: sporenRef.current.mij.outfit }),
      }).catch(() => {})
    }
    setPlanDoelen([
      ...bestemmingen.map((b) => ({ ...b, verdiep: 0 })),
      ...kelder.plekken.zalen.map((z) => ({ ...z, kleur: '#a78bfa', verdiep: -1 })),
      { naam: 'Lift', icoon: '🛗', kleur: '#a78bfa', x: LIFT_X, z: liftZ + 1, verdiep: -1 },
      { naam: 'VIP-loges & oude bekers', icoon: '🥂', kleur: '#fbbf24', x: LIFT_X, z: liftZ + 1, verdiep: 1 },
      { naam: 'Ringwandeling', icoon: '🌃', kleur: '#38bdf8', x: LIFT_X, z: GEVEL.B, verdiep: 2 },
      { naam: 'Grote rode knop · vuurwerk', icoon: '🔴', kleur: '#ef4444', x: LIFT_X + 5, z: GEVEL.B - 1.6, verdiep: 2 },
    ])
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
    // De obstakels op de grond, samen met de liftschacht: eenmaal samengevoegd per toestand van de
    // liftdeur, niet bij elke stap een nieuwe lijst van honderden stuks (dat gaf haperingen).
    const grondCache = new Map<Rechthoek[], Rechthoek[]>()
    const grondObstakels = (schacht: Rechthoek[]) => {
      let l = grondCache.get(schacht)
      if (!l) grondCache.set(schacht, (l = [...obstakels, ...schacht]))
      return l
    }
    const raakt = (lijst: Rechthoek[], x: number, z: number) => lijst.some((o) => x > o.x0 - 0.35 && x < o.x1 + 0.35 && z > o.z0 - 0.35 && z < o.z1 + 0.35)
    // In de kooi en in de deuropening mag je altijd staan (op het verdiep waar de kooi is).
    const bijKooi = (x: number, z: number) => lift.binnen(x, z) || (Math.abs(x - lift.x) < 0.55 && z > lift.zDeur - 0.3 && z < lift.zDeur + 0.5)
    // De goudjacht: 25 ballen over het hele terrein — zeven in de kelder (kelder.ts), en 18 hier: in
    // de kleedkamer, de gangen, op het plein, achter het clubhuis, op de parking, in het fandorp, op
    // het oefencomplex, op het verdiep (ook op het balkon) en op het dak (ook op het helikopterplatform).
    // Elke plek schuift tot ze op vrije, bereikbare vloer ligt.
    const vrij = (v: number, x: number, z: number) =>
      v === -1
        ? kelder.mag(x, z)
        : v === 2
          ? opDak(x, z)
          : v === 1
            ? verdiep.opBalkon(x, z) || vrijVanGevel(GEVEL, [...verdiep.obstakels, ...lift.obstakels(1)], x, z)
            : !raakt([...obstakels, ...lift.obstakels(0)], x, z) && Math.hypot(x, z) < WERELD_STRAAL - 2
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
    const ringWest = (() => {
      for (let dx = -6; dx <= 6; dx += 0.25) if (ring.mag(-GEVEL.A + dx, -4)) return { x: -GEVEL.A + dx, z: -4 }
      return { x: -GEVEL.A, z: -4 }
    })()
    const balkon = VERDIEP_RAMEN.find((r) => r.balkon)
    const boven: [number, number, number][] = [
      // Gelijkvloers: binnen.
      [0, KLEED.x0 + 3, KLEED.z1 - 2.5],
      [0, 7, GEVEL.B - 3.5],
      [0, GEVEL.A - 3.2, 14],
      // Buiten rond het stadion.
      [0, omgeving.start.x + 7, omgeving.start.z - 9],
      [0, -GEVEL.A - 14, -12],
      [0, -86, -14],
      [0, 104, 2],
      // Het fandorp.
      [0, -36, 116],
      [0, 44, 100],
      [0, -61, 101],
      // Het oefencomplex.
      [0, -30, -64],
      [0, 46, -121],
      // Het verdiep (loges, gang, balkon).
      [1, lift.x + 9, lift.zDeur + 1.4],
      [1, 30, -GEVEL.B + 5],
      [1, balkon ? (balkon.x0 + balkon.x1) / 2 : -21, GEVEL.B + 0.9],
      // Het dak: de ring en het helikopterplatform.
      [2, ringNoord.x, ringNoord.z],
      [2, ringWest.x, ringWest.z],
      [2, GEVEL.A + 11, 7],
    ]
    // Op wat er ligt, niet erin: van net onder ooghoogte recht naar beneden kijken en de bal op het
    // eerste vlak leggen dat je raakt — de vloer, maar ook het kussen van het springkasteel of een
    // tafel. Vroeger lag hij altijd op vloerhoogte, en dan zat hij onzichtbaar ín het opgeblazen
    // kussen of onder een meubel.
    scene.updateMatrixWorld(true)
    const peil = new THREE.Raycaster()
    // Sprites (borden, gloed) hebben een camera nodig om te raken; ze tellen hieronder toch niet mee.
    peil.camera = camera
    const omlaag = new THREE.Vector3(0, -1, 0)
    const legNeer = (x: number, z: number, vloer: number) => {
      peil.set(new THREE.Vector3(x, vloer + 1.4, z), omlaag)
      peil.far = 1.6
      const raak = peil.intersectObject(scene, true).find((h) => {
        const m = h.object as THREE.Mesh
        if (!m.isMesh || (m as unknown as THREE.Sprite).isSprite) return false
        const mat = m.material as THREE.Material
        if (Array.isArray(mat) || (mat.transparent && mat.opacity < 0.6) || mat.visible === false) return false
        return !h.face || h.face.normal.clone().transformDirection(m.matrixWorld).y > 0.6
      })
      return Math.max(vloer, raak?.point.y ?? vloer) + 0.17
    }
    const goudPlekken: GoudPlek[] = [
      ...kelder.plekken.goud.map((p) => ({ ...p, y: legNeer(p.x, p.z, VERDIEPEN[0].y), verdiep: -1 })),
      ...boven.map(([v, x, z]) => {
        const p = zoekVrij(v, x, z)
        // Op de grond, niet zwevend (een krachtbal heeft een straal van ± 17 cm).
        return { ...p, y: legNeer(p.x, p.z, VERDIEPEN.find((q) => q.nr === v)?.y ?? 0), verdiep: v }
      }),
    ]
    const goudjacht = bouwGoudjacht(scene, kelder.groep, goudPlekken)
    bron('Goudjacht')
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
    // Superstar: op de werplijn gaan staan, met de baan voor je.
    naarWerplijnRef.current = () => {
      const p = kelder.superstar.werpPlek
      loper.pos.x = p.x
      loper.pos.z = p.z
      loper.yaw = p.yaw
      loper.pitch = -0.1
    }
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

    // De nabewerking (gloed, stemming per plek, waas, hitte) kostte 5 à 6 extra beeldvullende
    // tekenrondes per beeld: uit voor iedereen (zie `licht` hierboven).
    const nabewerking = licht ? null : bouwNabewerking(renderer, scene, camera)
    let nabewerkingAan = true
    // De onzichtbare meter (zie meter.ts): hoe vlot het hier loopt, per plek, voor achteraf. De
    // tellers van three tellen over het hele beeld (alle passes, schaduw, spiegels), niet enkel de
    // laatste tekenronde: daarom zetten we ze zelf terug aan het begin van elk beeld.
    const meter = bouwMeter(renderer, { licht: zwak })
    renderer.info.autoReset = false
    const maat = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      // Nooit meer dan ± 2,4 miljoen pixels per beeld. Op een laptop met een scherp scherm (en
      // schaalfactor 1,5) werden dat er acht miljoen, en elke pixel gaat daarna nog vijf keer door
      // de nabewerking: daar liep een gewone laptop op vast. Van op een meter zie je het verschil
      // niet; het beeld wordt wel vloeiend.
      const ratio = Math.max(0.5, Math.min(pixels, Math.sqrt(MAX_PIXELS / Math.max(1, w * h))))
      renderer.setPixelRatio(ratio)
      renderer.setSize(w, h, false)
      nabewerking?.maat(w, h, ratio)
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
    // De loopsnelheid (m/s), die zacht naar de gevraagde snelheid toe groeit.
    const loopV = { x: 0, z: 0 }
    let vloer = 0
    let laatsteRuimte: string | null = null
    // Waar je het vuurwerkfeest beleeft (voor de melding), en of het zwembad mee feest.
    let feestPlek: FeestPlek | null = null
    let waterFeest = false
    let wandel: { x: number; z: number; yaw: number; pitch: number; verdiep: number } | null = null
    // Jijzelf (enkel te zien in de spiegel van de kleedkamer).
    const avatar = bouwAvatar(scene, thema)
    bron('Avatar')
    bundel()
    // Niet tekenen wat je toch niet ziet: de gangen vanop het veld, het oefencomplex vanop het plein,
    // de heli vanuit de gang, en kleine dingen ver weg (zie zichtbaarheid.ts).
    const zicht = (() => {
      const deel = (...namen: string[]) => scene.children.filter((c) => namen.includes(c.userData.bron as string))
      const kom = {
        x0: tribunes.west?.x0 ?? -GEVEL.A + 8,
        x1: tribunes.oost?.x1 ?? GEVEL.A - 8,
        z0: tribunes.noord?.z0 ?? -GEVEL.B + 8,
        z1: tribunes.zuid?.z1 ?? GEVEL.B - 8,
      }
      const dakY = RING.y - 1.5
      const inGebouw = (p: THREE.Vector3) => Math.abs(p.x) < GEVEL.A + 0.3 && Math.abs(p.z) < GEVEL.B + 0.3
      const inKom = (p: THREE.Vector3) => p.x > kom.x0 && p.x < kom.x1 && p.z > kom.z0 && p.z < kom.z1
      const totGevel = (p: THREE.Vector3) => Math.hypot(Math.max(0, Math.abs(p.x) - GEVEL.A), Math.max(0, Math.abs(p.z) - GEVEL.B))
      const ondergronds = (p: THREE.Vector3) => p.y < -0.5
      const poortMidden = GEVEL.poorten.map((q) => {
        const m = (q.van + q.tot) / 2
        return q.zijde === 'z+' ? { x: m, z: GEVEL.B } : q.zijde === 'z-' ? { x: m, z: -GEVEL.B } : q.zijde === 'x+' ? { x: GEVEL.A, z: m } : { x: -GEVEL.A, z: m }
      })
      const bijPoort = (p: THREE.Vector3) => poortMidden.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 12)
      // Net buiten, met zicht door de poorten en de ramen.
      const voorDeGevel = (p: THREE.Vector3, ver: number) => !inGebouw(p) && totGevel(p) < ver && !ondergronds(p) && p.y < dakY
      const ZUID = 1
      const NOORD = 2
      const OOST = 4
      const WEST = 8
      const ALLE_GANGEN = 15
      const OVERKANT: Record<number, number> = { [ZUID]: NOORD, [NOORD]: ZUID, [OOST]: WEST, [WEST]: OOST }
      // In welke gang sta je? De dichtstbijzijnde kant van de kom.
      const gangVan = (p: THREE.Vector3) => {
        const af = [
          [ZUID, p.z - kom.z1],
          [NOORD, kom.z0 - p.z],
          [OOST, p.x - kom.x1],
          [WEST, kom.x0 - p.x],
        ] as const
        return af.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      }
      // Sta je (op de grond) voorbij de gevel aan de kant `kant` (1 = noord, -1 = zuid)? Dan staat
      // het stadion tussen jou en wat aan de overkant ligt.
      const achter = (p: THREE.Vector3, kant: 1 | -1) => p.y < 12 && kant * p.z < -(GEVEL.B - 1) && Math.abs(p.x) < GEVEL.A + 12
      return bouwZichtbaarheid(
        scene,
        [
          {
            objecten: deel('Eregalerij', 'Fotogalerij', 'Photobooth', 'Gangafwerking', 'Wegwijzers', 'Gangleven', 'Sterren', 'Weekendzaal'),
            // Per gang (zuid, noord, oost, west): wat in welke gang staat, en welke gangen je ziet.
            delen: (d) => (d.max.z > kom.z1 - 1 ? ZUID : 0) | (d.min.z < kom.z0 + 1 ? NOORD : 0) | (d.max.x > kom.x1 - 1 ? OOST : 0) | (d.min.x < kom.x0 + 1 ? WEST : 0),
            zichtbaar: (p) => {
              if (ondergronds(p) || (inKom(p) && p.y < dakY)) return 0
              // Vanop het dak kijk je via de open hoeken van de kom tot op de gangvloer.
              if (p.y >= dakY) return ALLE_GANGEN
              // In een gang: die gang en de twee ernaast (om de hoek); de overkant niet.
              if (inGebouw(p)) return ALLE_GANGEN & ~OVERKANT[gangVan(p)]
              // Buiten: door de poorten zie je (ook van ver en schuin) de gangen aan jouw kant.
              const kant = (p.z > GEVEL.B ? ZUID : 0) | (p.z < -GEVEL.B ? NOORD : 0) | (p.x > GEVEL.A ? OOST : 0) | (p.x < -GEVEL.A ? WEST : 0)
              return voorDeGevel(p, 90) ? kant : 0
            },
          },
          // De loges kijken uit op het veld (en door de ramen op het plein): via de open hoeken van de
          // kom zie je ze zelfs vanuit de noordgang.
          // De ramen en het balkon zitten in de zuidgevel: van achter het stadion (noord) zie je ze niet.
          { objecten: deel('Verdiep'), zichtbaar: (p) => !ondergronds(p) && !achter(p, 1) },
          // De lift (in de zuidgang, tot op het dak en in de kelder) zie je door de gevel heen.
          { objecten: deel('Lift'), zichtbaar: (p) => !achter(p, 1) },
          // Vanuit de gangen kijk je door de poorten naar buiten, dus enkel de kom en de overkant tellen.
          { objecten: deel('Oefencomplex'), zichtbaar: (p) => !ondergronds(p) && !(inKom(p) && p.y < 12) && !achter(p, -1) },
          { objecten: deel('Fandorp'), zichtbaar: (p) => !ondergronds(p) && !(inKom(p) && p.y < 12) && !achter(p, 1) },
          // Op het dak: de gangen zijn open naar boven, dus zie je het van overal behalve de kelder.
          { objecten: deel('Ring'), zichtbaar: (p) => !ondergronds(p) },
          // De helikopter staat op een platform tegen de oostgevel: vanuit de andere gangen en van
          // achter de westkant staat het hele stadion ertussen.
          {
            objecten: deel('Helikopter'),
            zichtbaar: (p) => !ondergronds(p) && !(inGebouw(p) && p.y < dakY && !inKom(p) && gangVan(p) !== OOST) && !(p.x < -GEVEL.A && p.y < 12),
          },
          // De tuinborder ligt buiten tegen de gevel: binnen zie je hem enkel vlak bij een poort.
          { objecten: deel('Tuin'), zichtbaar: (p) => !ondergronds(p) && (!inGebouw(p) || p.y >= dakY || (!inKom(p) && bijPoort(p))) },
          // De kleedkamer en de spelersbus staan buiten aan de westkant: vanuit de kom, vanuit de
          // andere gangen en van achter de oostkant zie je ze niet (honderden onderdelen minder).
          {
            objecten: deel('Kleedkamer', 'Spelersbus'),
            zichtbaar: (p) => !ondergronds(p) && !(inGebouw(p) && p.y < dakY && (inKom(p) || gangVan(p) !== WEST)) && !(p.x > GEVEL.A && p.y < 12),
          },
        ],
        { licht },
      )
    })()
    // Wat stilstaat, per materiaal samenvoegen (zie samenvoegen.ts). De kelder doet mee: hij wordt
    // als geheel aan- en uitgezet, en dat mag.
    const samenvoeger = bouwSamenvoeger(scene, scene.children.filter((c) => !(c as THREE.Light).isLight && c !== camera), {
      nieuw: (mesh, top) => zicht.voegToe(mesh, top),
    })
    avatar.kleedAan(sporenRef.current.mij.outfit)
    avatarRef.current = avatar
    const vorigePos = { x: 0, z: 0 }
    let avatarPopcorn = false
    let liftNu = lift.update(0, { x: 0, z: 0, verdiep: 0, actief: false, keuze: null }).lift
    let laatsteRadar = 0
    // In de spelersbus sta je hoger (de vloer van de bus, met treden aan de deur).
    let busHoogte = 0
    let inBus = false
    const tvKijk = new THREE.Vector3()
    // Op een trampoline in de speelhal: hoe ver je in de sprong bent.
    let sprong = 0
    let sprongHoogte = 0
    // Derde persoon: je ziet je eigen mannetje voor je wandelen, de camera hangt een stukje erachter.
    // `achterAf` is de huidige afstand (zacht bijgesteld); in een smalle ruimte (lift, bus, cinema)
    // of waar een muur vlak achter je staat, kijk je gewoon door je eigen ogen.
    const ACHTER = 3.2
    let achterAf = ACHTER
    let derde = false
    let voetY = 0
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
    // De eerste twee seconden tellen niet mee: dan wordt de wereld nog klaargezet.
    let frames = -120
    let getekend = false
    let frameTijd = 0
    let schokken = 0
    let raf = 0
    // De stemming van de plek waar je bent: warm, koel, vochtig, heet (zie nabewerking.ts).
    const STEMMING: Record<string, Stemming> = {
      Sauna: { warmte: 0.85, waas: 0.4, hitte: 1, gloed: 1.15 },
      Zwembad: { warmte: -0.55, waas: 0.3, hitte: 0, gloed: 1.05 },
      Fitness: { warmte: -0.25, waas: 0, hitte: 0, gloed: 1 },
      Cinema: { warmte: 0.15, waas: 0.12, hitte: 0, gloed: 1.25 },
      Gaming: { warmte: -0.15, waas: 0, hitte: 0, gloed: 1.4 },
      Wedkantoor: { warmte: 0.5, waas: 0.06, hitte: 0, gloed: 1.25 },
      Speelhal: { warmte: 0.2, waas: 0, hitte: 0, gloed: 1.15 },
    }
    // De hamam: hoe dieper je in de stoom loopt, hoe korter je zicht (de mist van de scène kruipt
    // dichterbij en kleurt warm wit).
    let hamamNu = 0
    const mist = scene.fog as THREE.Fog
    const mistGewoon = { kleur: mist.color.clone(), near: mist.near, far: mist.far }
    const stoomKleur = new THREE.Color('#e8e0d2')
    const zetStoom = (dt: number) => {
      const s = st.current
      const doel = s.modus === 'buiten' && opVerdiep === -1 ? kelder.hamamMist(loper.pos.x, loper.pos.z) : 0
      hamamNu += (doel - hamamNu) * Math.min(1, dt * 1.6)
      if (hamamNu < 0.005) {
        if (mist.near !== mistGewoon.near) {
          mist.near = mistGewoon.near
          mist.far = mistGewoon.far
          mist.color.copy(mistGewoon.kleur)
        }
        return
      }
      const f = Math.pow(hamamNu, 0.6)
      mist.near = THREE.MathUtils.lerp(mistGewoon.near, 0.2, f)
      mist.far = THREE.MathUtils.lerp(mistGewoon.far, 3.6, f)
      mist.color.copy(mistGewoon.kleur).lerp(stoomKleur, f)
    }
    const stemmingHier = (): Stemming => {
      const s = st.current
      const p = camera.position
      if (p.y < -0.5 && hamamNu > 0.05) return { warmte: 0.45, waas: Math.min(1, 0.4 + hamamNu * 0.6), hitte: 0.5, gloed: 1.4 }
      if (p.y < -0.5) return (s.modus === 'buiten' ? STEMMING[kelder.ruimte(p.x, p.z) ?? ''] : undefined) ?? { warmte: 0.1, waas: 0.04, hitte: 0, gloed: 1.15 }
      if (s.modus !== 'buiten' && s.modus !== 'zweven') return { ...NEUTRAAL, warmte: -0.05 }
      if (inBus) return { warmte: 0.35, waas: 0, hitte: 0, gloed: 1.15 }
      if (s.modus === 'buiten' && opVerdiep === 0 && kleedkamer.binnen(p.x, p.z)) return { warmte: -0.3, waas: 0.25, hitte: 0, gloed: 1 }
      if (p.y > 12) return { warmte: -0.3, waas: 0.05, hitte: 0, gloed: 1.1 }
      if (p.y > 6) return { warmte: 0.35, waas: 0, hitte: 0, gloed: 1.1 }
      const d = gevelAfstand(GEVEL, p.x, p.z)
      if (d > 0.5) return { warmte: -0.28, waas: 0.08, hitte: 0, gloed: 1.05 }
      if (!opVeld(p)) return { warmte: 0.25, waas: 0.05, hitte: 0, gloed: 1.1 }
      return { ...NEUTRAAL }
    }
    const tik = (nu: number) => {
      raf = requestAnimationFrame(tik)
      // De echte tijd sinds het vorige beeld (voor de meter), en begrensd voor de beweging.
      const ruw = nu - vorige
      // De rAF-tijdstempel kan net vóór performance.now() liggen: nooit een negatieve stap.
      const dt = Math.max(0, Math.min(0.1, (nu - vorige) / 1000))
      vorige = nu
      const s = st.current
      if (s.pauze) return
      const werkBegin = performance.now()
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
        // Geen deinende zweefbeweging: het beeld staat stil als jij stilstaat.
        camera.position.set(loper.pos.x, loper.pos.y, loper.pos.z)
        camera.lookAt(
          loper.pos.x + Math.sin(loper.yaw) * cp,
          loper.pos.y + Math.sin(loper.pitch),
          loper.pos.z + Math.cos(loper.yaw) * cp,
        )
      } else if (s.modus === 'buiten' && heli.inVlucht()) {
        // Vliegen met de clubhelikopter: joystick vooruit/achteruit en draaien, stijgen en dalen.
        const vooruit = (toetsen.has('KeyW') || toetsen.has('ArrowUp') ? 1 : 0) - (toetsen.has('KeyS') || toetsen.has('ArrowDown') ? 1 : 0) - s.stick.y
        const draai = (toetsen.has('KeyA') || toetsen.has('ArrowLeft') ? 1 : 0) - (toetsen.has('KeyD') || toetsen.has('ArrowRight') ? 1 : 0) - s.stick.x
        const stijg = (toetsen.has('Space') || toetsen.has('KeyE') ? 1 : 0) - (toetsen.has('KeyQ') || toetsen.has('KeyC') ? 1 : 0) + s.hoog
        heli.stuur(dt, vooruit, draai, stijg, camera)
        // De speler zit in de helikopter: zijn positie volgt (voor de schaduw, de mist, ...).
        loper.pos.x = camera.position.x
        loper.pos.z = camera.position.z
      } else if (s.modus === 'buiten' && ritBezig()) {
        // Op een rit in het fandorp: je draait mee en kijkt vrij rond; in een botsauto stuur je zelf.
        const r = ritBezig()!
        if (r.stuur) {
          const vooruit = (toetsen.has('KeyW') || toetsen.has('ArrowUp') ? 1 : 0) - (toetsen.has('KeyS') || toetsen.has('ArrowDown') ? 1 : 0) - s.stick.y
          const draai = (toetsen.has('KeyA') || toetsen.has('ArrowLeft') ? 1 : 0) - (toetsen.has('KeyD') || toetsen.has('ArrowRight') ? 1 : 0) - s.stick.x
          r.stuur(dt, vooruit, draai)
        }
        r.camera(camera, loper.yaw, loper.pitch)
        loper.pos.x = camera.position.x
        loper.pos.z = camera.position.z
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
        // Zacht vertrekken en uitbollen (± 0,15 s) in plaats van meteen op volle snelheid en abrupt
        // stil: dat schokt minder en is rustiger voor de ogen.
        const wilX = zitHier ? 0 : (fx * vooruit - fz * opzij) * tempo
        const wilZ = zitHier ? 0 : (fz * vooruit + fx * opzij) * tempo
        const volg = Math.min(1, dt * 12)
        loopV.x += (wilX - loopV.x) * volg
        loopV.z += (wilZ - loopV.z) * volg
        if (zitHier) loopV.x = loopV.z = 0
        const doelPos = { x: loper.pos.x + loopV.x * dt, z: loper.pos.z + loopV.z * dt }
        const schacht = lift.obstakels(v)
        const naar =
          v === -1
            ? stapMet((x, z) => kelder.mag(x, z) && !raakt(kluisRef.current ? [...schacht, kluisRef.current.obstakel] : schacht, x, z), loper.pos, doelPos)
            : v === 2
              ? stapMet((x, z) => (opDak(x, z) || bijKooi(x, z)) && !raakt(schacht, x, z), loper.pos, doelPos)
              : v === 1
                ? stapMet((x, z) => verdiep.opBalkon(x, z) || vrijVanGevel(GEVEL, [...verdiep.obstakels, ...schacht], x, z), loper.pos, doelPos)
                : stap(GEVEL, grondObstakels(schacht), loper.pos, doelPos)
        loper.pos.x = naar.x
        loper.pos.z = naar.z
        // Trampoline: je veert vanzelf op en neer (hoger in het midden).
        const veer = s.modus === 'buiten' && v === -1 ? kelder.trampoline(loper.pos.x, loper.pos.z) : s.modus === 'buiten' && v === 0 ? fandorp.springkasteel(loper.pos.x, loper.pos.z) : 0
        if (veer > 0) {
          sprong += dt
          sprongHoogte = Math.abs(Math.sin(sprong * 3.1)) * 1.5 * veer
        } else {
          sprong = 0
          sprongHoogte = Math.max(0, sprongHoogte - dt * 4)
        }
        // Op het springkasteel sta je op het opgeblazen kussen.
        const busDoel = s.modus === 'buiten' && v === 0 ? bus.vloer(loper.pos.x, loper.pos.z) || (veer > 0 ? 0.7 : 0) : 0
        busHoogte += (busDoel - busHoogte) * Math.min(1, dt * 12)
        const oog = (s.modus === 'buiten' ? vloer : 0) + (zitHier ? 1.15 : OOGHOOGTE) + sprongHoogte + busHoogte
        voetY = oog - OOGHOOGTE
        const kijkX = Math.sin(loper.yaw) * Math.cos(loper.pitch)
        const kijkY = Math.sin(loper.pitch)
        const kijkZ = Math.cos(loper.yaw) * Math.cos(loper.pitch)
        // Hoe ver kan de camera achter je hangen voor ze tegen een muur stoot? Zelfde regels als het
        // wandelen op dit verdiep; in kleine stapjes van je hoofd naar achter.
        const magCamera = (x: number, z: number) =>
          v === -1
            ? kelder.mag(x, z)
            : v === 2
              ? opDak(x, z) || bijKooi(x, z)
              : v === 1
                ? verdiep.opBalkon(x, z) || vrijVanGevel(GEVEL, verdiep.obstakels, x, z, 0.15)
                : vrijVanGevel(GEVEL, grondObstakels(schacht), x, z, 0.15) && !bus.binnen(x, z)
        // In de lift (en op andere krappe plekken) kijk je door je eigen ogen; kom je eruit, dan
        // weer zoals je zelf gekozen hebt.
        const krap = s.zicht === 'ogen' || zitHier || lift.binnen(loper.pos.x, loper.pos.z) || (v === 0 && bus.binnen(loper.pos.x, loper.pos.z))
        let vrijAf = 0
        if (!krap) {
          const ax = -Math.sin(loper.yaw)
          const az = -Math.cos(loper.yaw)
          for (let d = 0.3; d <= ACHTER + 0.4; d += 0.25) {
            if (!magCamera(loper.pos.x + ax * d, loper.pos.z + az * d)) break
            vrijAf = d
          }
        }
        const doelAf = Math.max(0, vrijAf - 0.4)
        // Dichterbij meteen (anders zit de camera even in de muur), verder weg zacht.
        achterAf = doelAf < achterAf ? doelAf : achterAf + (doelAf - achterAf) * Math.min(1, dt * 4)
        derde = achterAf > 1.1
        if (derde) {
          // Over je schouder: achter en iets boven je hoofd, kijkend naar een punt voor je.
          const hoofdY = oog + 0.15
          camera.position.set(
            loper.pos.x - kijkX * achterAf,
            Math.max(voetY + 0.5, hoofdY + 0.55 - kijkY * achterAf),
            loper.pos.z - kijkZ * achterAf,
          )
          camera.lookAt(loper.pos.x + kijkX * 3, hoofdY + kijkY * 3, loper.pos.z + kijkZ * 3)
        } else {
          // Geen op-en-neer bij het stappen: dat maakte mensen misselijk. Het beeld glijdt rustig mee.
          camera.position.set(loper.pos.x, oog, loper.pos.z)
          camera.lookAt(loper.pos.x + kijkX, oog + kijkY, loper.pos.z + kijkZ)
        }
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
      // De spiegelwanden in de lift blijven uit: elke spiegel tekende de hele wereld nog eens, en de
      // lift neem je vaak. (De spiegel in de kleedkamer blijft: die staat apart en enkel daar.)
      lift.spiegels(false)
      // Je eigen mannetje: in derde persoon tekent ook de gewone camera het (de spiegel altijd).
      const zieMezelf = WANDELEN.includes(s.modus) && derde && !ritBezig()
      if (zieMezelf) camera.layers.enable(AVATAR_LAAG)
      else camera.layers.disable(AVATAR_LAAG)
      avatar.zichtbaar(voorSpiegel || zieMezelf)
      avatar.zwaai(voorSpiegel)
      if (avatarPopcorn !== popcornVastRef.current) {
        avatarPopcorn = popcornVastRef.current
        avatar.houdVast(avatarPopcorn ? bouwPopcornDoosje(1) : null)
      }
      fpDoos.visible = popcornVastRef.current && s.modus === 'buiten' && !zieMezelf
      if (fpDoos.visible) {
        // Het doosje deint mee met je stappen.
        const stap = Math.hypot(loper.pos.x - vorigePos.x, loper.pos.z - vorigePos.z)
        fpDoos.position.y = -0.27 + Math.sin(nu / 160) * Math.min(0.012, stap * 0.4)
      }
      if (voorSpiegel || zieMezelf) {
        const tempo = dt > 0 ? Math.hypot(loper.pos.x - vorigePos.x, loper.pos.z - vorigePos.z) / dt : 0
        avatar.update(loper.pos.x, voetY, loper.pos.z, loper.yaw, loper.pitch, tempo, nu / 1000)
      }
      vorigePos.x = loper.pos.x
      vorigePos.z = loper.pos.z
      gangafwerking.update(nu / 1000)
      photobooth.update(nu / 1000, dt)
      bus.update(nu / 1000)
      buitenLucht.update(nu / 1000)
      schaduwRond(!licht && s.modus === 'buiten' && opVerdiep === 0 && !inKelder ? loper.pos.x : null, loper.pos.z)
      // In de bus: de schermen tonen de wedstrijd (een tv-camera volgt de bal).
      const nuInBus = s.modus === 'buiten' && opVerdiep === 0 && bus.binnen(loper.pos.x, loper.pos.z)
      if (nuInBus !== inBus) {
        inBus = nuInBus
        if (inBus) setMelding('🚌 Welkom aan boord van de spelersbus')
      }
      if (inBus) {
        if (b) tvKijk.set(b.x - cx, 0, b.y - cz)
        bus.tv(renderer, scene, tvKijk)
      }
      verdiep.update(nu / 1000)
      ring.update(nu / 1000)
      kelder.update(nu / 1000, { x: loper.pos.x, z: loper.pos.z })
      kelderspel.update(nu / 1000, dt)
      gokkantoor.update(nu / 1000, dt)
      goudjacht.update(nu / 1000, inKelder, camera.position)
      if (s.modus === 'buiten' && nu - laatsteRadar > 400) {
        laatsteRadar = nu
        const w = goudjacht.aantal() >= GOUDEN_BALLEN ? 'niets' : goudjacht.warmte(loper.pos.x, loper.pos.z, opVerdiep)
        setRadar((oud) => (oud === w ? oud : w))
      }
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
          heli.zetVoortgang(n, GOUDEN_BALLEN, sporenRef.current.mij.sleutel)
          setMelding(n >= GOUDEN_BALLEN ? `🏆 Alle ${GOUDEN_BALLEN} gouden ballen! Je naam staat bij de goudzoekers` : `🟡 Gouden krachtbal gevonden! ${n}/${GOUDEN_BALLEN}`)
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
      vuurwerk.update(nu / 1000, dt, camera, renderer.domElement.height)
      feest.update({ seconden: nu / 1000, camera, hoogte: renderer.domElement.height, vloer: s.modus === 'buiten' ? vloer : null })
      // Het zwembad verschiet mee in de clubkleuren; na de show weer de kleur van de verf.
      const feestWater = inKelder ? feest.water() : null
      if (feestWater) {
        waterFeest = true
        kelder.zetWaterKleur(feestWater)
      } else if (waterFeest) {
        waterFeest = false
        kelder.zetWaterKleur(waterKleur(sporenRef.current.verf))
      }
      heli.update(nu / 1000, dt)
      if (!inKelder) {
        oefen.update(nu / 1000)
        fandorp.update(nu / 1000, dt)
      }
      for (const r of fandorp.ritten) {
        const uit = r.uitgestapt()
        if (!uit) continue
        loper.pos.x = uit.x
        loper.pos.z = uit.z
        loper.yaw = uit.yaw
        loper.pitch = -0.05
        if (ritRef.current === r) ritRef.current = null
        setMelding(RIT_BEDANKT[r.id] ?? '🎉 Bedankt voor de rit! Tot de volgende keer.')
      }
      supporters.update(nu / 1000, dt, opVerdiep, s.modus !== 'buiten')
      meldPlek(nu)
      kluis.update(nu / 1000, dt)
      const uitstap = heli.uitgestapt()
      if (uitstap) {
        loper.pos.x = uitstap.x
        loper.pos.z = uitstap.z
        loper.yaw = uitstap.yaw
        loper.pitch = -0.05
        opVerdiep = 2
        vloer = VERDIEPEN.find((x) => x.nr === 2)!.y
        s.hoog = 0
      }
      // Op de werplijn van Superstar: je blijft staan, met de baan recht voor je.
      if (opWerplijnRef.current && s.modus === 'buiten' && opVerdiep === -1) {
        const wp = kelder.superstar.werpPlek
        loper.pos.x = wp.x
        loper.pos.z = wp.z
        loper.yaw += (wp.yaw - loper.yaw) * Math.min(1, dt * 4)
        loper.pitch += (-0.06 - loper.pitch) * Math.min(1, dt * 4)
      }
      zetStoom(dt)
      // Geen cameratrilling bij een knal: het beeld blijft rustig (trillen maakte mensen misselijk).
      samenvoeger.update()
      zicht.update(camera.position)
      if (nabewerking && nabewerkingAan) {
        // Tijdens het vuurwerk straalt alles feller uit.
        nabewerking.stemming(vuurwerk.bezig() ? { ...stemmingHier(), gloed: 1.5 } : stemmingHier())
        nabewerking.update(nu / 1000, dt)
        nabewerking.render()
      } else renderer.render(scene, camera)
      video.render(camera)
      if (!getekend) {
        getekend = true
        setKlaar(true)
        meter.zet({ eersteBeeld: performance.now() - begonnen })
      }
      {
        // Waar je bent, voor de meter: de plek (zoals bij het feest), in de kelder de zaal, en apart
        // tijdens het vuurwerk en in de views aan het veld.
        const waar = feest.waar(camera.position)
        const plek =
          s.modus === 'rondvlucht' || VELD.includes(s.modus)
            ? `view:${s.modus}`
            : waar === 'kelder' && laatsteRuimte
              ? `kelder:${laatsteRuimte}`
              : waar
        meter.beeld(ruw, vuurwerk.bezig() ? `vuurwerk:${plek}` : plek, performance.now() - werkBegin)
        renderer.info.reset()
      }

      // Hapert het? Dan stap voor stap lichter, tot het weer vlot loopt: eerst minder pixels (tot
      // 1), dan zonder nabewerking, dan een kleinere schaduwkaart, en pas als laatste onder 1 pixel.
      // Niet enkel een traag gemiddelde telt: ook geregeld een beeld dat te laat komt (een schok)
      // is een reden om lichter te tekenen.
      frames++
      frameTijd += dt
      if (dt > 1 / 28) schokken++
      if (frames <= 0) {
        frameTijd = 0
        schokken = 0
      }
      if (frames >= 90) {
        if (frameTijd / frames > 1 / 40 || schokken > frames * 0.12) {
          const nuRatio = renderer.getPixelRatio()
          if (nuRatio > 1) {
            pixels = Math.max(1, nuRatio - 0.25)
            maat()
            meter.stap(`pixels ${pixels}`)
          } else if (nabewerking && nabewerkingAan) {
            nabewerkingAan = false
            meter.stap('nabewerking uit')
          } else if (zon.shadow.mapSize.x > 1024) {
            zon.shadow.mapSize.set(1024, 1024)
            zon.shadow.map?.dispose()
            zon.shadow.map = null
            meter.stap('schaduw 1024')
          } else if (nuRatio > 0.75) {
            pixels = Math.max(0.75, nuRatio - 0.25)
            maat()
            meter.stap(`pixels ${pixels}`)
          }
          meter.zet({ ratio: renderer.getPixelRatio(), nabewerking: !!nabewerking && nabewerkingAan, schaduw: zon.shadow.mapSize.x })
        }
        frames = 0
        frameTijd = 0
        schokken = 0
      }

      // De bezitsbalk en de knoppen ~12 keer per seconde bijwerken is genoeg.
      if (nu - laatsteUi > 80) {
        laatsteUi = nu
        setBezit(bezitOp(sporen, t))
        // Tijdens het vuurwerk: wat er hier, waar je nu bent, te beleven valt.
        const fp = vuurwerk.bezig() ? feest.waar(camera.position) : null
        if (fp && fp !== feestPlek) setMelding(FEEST_MELDING[fp])
        feestPlek = fp
        // Enkel echt aan het veld: niet als je erboven of eronder (de kelder ligt onder het veld) loopt.
        // In de kooi: het paneel om je verdiep te kiezen (en tijdens de rit waar je heen gaat).
        const inKooi = s.modus === 'buiten' && lift.binnen(loper.pos.x, loper.pos.z) && (liftNu.toestand === 'rijden' || Math.round(liftNu.hoogte) === opVerdiep)
        const paneel = inKooi ? { hier: opVerdiep, rijdt: liftNu.toestand === 'rijden' || liftNu.toestand === 'sluiten', doel: liftNu.toestand === 'rijden' || liftNu.toestand === 'sluiten' ? liftNu.doel : (s.liftKeuze ?? null) } : null
        setLiftPaneel((oud) => (JSON.stringify(oud) === JSON.stringify(paneel) ? oud : paneel))
        const vi = heli.inVlucht() ? heli.info() : null
        setVlucht((oud) => (vi == null ? null : oud && oud.fase === vi.fase && Math.abs(oud.hoogte - vi.hoogte) < 1 && Math.abs(oud.snelheid - vi.snelheid) < 2 ? oud : vi))
        const ri = ritBezig()?.info() ?? null
        setRit((oud) => (ri == null ? null : oud && oud.regel === ri.regel && oud.magUit === ri.magUit ? oud : ri))
        const kk = s.modus === 'buiten' && opVerdiep === 0
        const kl = s.modus === 'buiten' && opVerdiep === -1 && s.zit == null
        const kd = s.modus === 'buiten' && opVerdiep === 2
        const hh = kd && !heli.inVlucht() && heli.opPlatform(loper.pos.x, loper.pos.z) ? { gevonden: goudjacht.aantal(), sleutel: sporenRef.current.mij.sleutel } : null
        setHeliHulp((oud) => (JSON.stringify(oud) === JSON.stringify(hh) ? oud : hh))
        // Voor een wegwijzer: het stadionplan groot op het scherm.
        const bord = kk ? wegwijzers.plekken.findIndex((p) => Math.hypot(p.x - loper.pos.x, p.z - loper.pos.z) < 3.2) : -1
        planBordRef.current = bord
        if (bord !== planWegRef.current) planWegRef.current = -1
        const ph: PlanHier | null =
          bord >= 0 && planWegRef.current !== bord
            ? { x: Math.round(loper.pos.x * 2) / 2, z: Math.round(loper.pos.z * 2) / 2, yaw: Math.round(loper.yaw * 20) / 20, verdiep: 0 }
            : null
        setPlanHier((oud) => (JSON.stringify(oud) === JSON.stringify(ph) ? oud : ph))
        const nb: Nabij | null =
          kd && vuurwerk.knop.bij(loper.pos.x, loper.pos.z)
            ? { soort: 'knop' }
            : kd && heli.bij(loper.pos.x, loper.pos.z)
            ? { soort: 'heli' }
            : kk && !ritBezig() && fandorp.ritten.some((r) => r.bij(loper.pos.x, loper.pos.z))
            ? { soort: 'rit', id: fandorp.ritten.find((r) => r.bij(loper.pos.x, loper.pos.z))!.id }
            : kk && fandorp.spellen.some((g) => g.bij(loper.pos.x, loper.pos.z))
            ? { soort: 'spel', id: fandorp.spellen.find((g) => g.bij(loper.pos.x, loper.pos.z))!.id }
            : kl && kluis.bij(loper.pos.x, loper.pos.z)
            ? { soort: 'kluis' }
            : kk && gangleven.fanshop && Math.hypot(loper.pos.x - gangleven.fanshop.x, loper.pos.z - gangleven.fanshop.z) < 3.6
            ? { soort: 'fanshop' }
            : kk && photobooth.bijBooth(loper.pos.x, loper.pos.z)
            ? { soort: 'booth' }
            : kk && kleedkamer.bijMuur(loper.pos.x, loper.pos.z)
            ? { soort: 'muur' }
            : kk && kleedkamer.bijBord(loper.pos.x, loper.pos.z)
              ? { soort: 'bord' }
              : kl
                ? ((): Nabij | null => {
                    if (kelder.superstar.bijTafel(loper.pos.x, loper.pos.z)) return { soort: 'superstar' }
                    const g = gokkantoor.nabij(loper.pos.x, loper.pos.z)
                    return g ? { soort: g } : kelderspel.nabij(loper.pos.x, loper.pos.z)
                  })()
                : null
        setNabij((oud) => (JSON.stringify(oud) === JSON.stringify(nb) ? oud : nb))
      }
    }
    // Alle shaders nu al klaarzetten, ook die van wat nog verborgen is (de kelder, het vuurwerk, het
    // feest, de helikopter…). Anders bouwt de browser ze pas op het moment dat je er voor het eerst
    // komt — midden in het wandelen, en dat was telkens een schok van een fractie van een seconde.
    {
      const verborgen: THREE.Object3D[] = []
      scene.traverse((o) => {
        if (!o.visible) {
          verborgen.push(o)
          o.visible = true
        }
      })
      const t0 = performance.now()
      try {
        renderer.compile(scene, camera)
        meter.zet({ shaders: performance.now() - t0, ratio: renderer.getPixelRatio(), schaduw: zon.shadow.mapSize.x })
      } catch {
        // Lukt het niet, dan worden ze zoals vroeger gebouwd wanneer ze voor het eerst in beeld komen.
      }
      for (const o of verborgen) o.visible = false
    }
    raf = requestAnimationFrame(tik)

    return () => {
      cancelAnimationFrame(raf)
      nabewerking?.dispose()
      vuurwerk.dispose()
      feest.dispose()
      meter.dispose()
      supporters.dispose()
      samenRef.current = null
      vuurwerkRef.current = null
      weekendStroom?.close()
      video.dispose()
      kleedRef.current = null
      videoRef.current = null
      spelRef.current = null
      gokRef.current = null
      boothRef.current = null
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
      case 'booth':
        setPaneel('booth')
        break
      case 'kiosk':
        setPaneel('kiosk')
        break
      case 'fanshop':
        setPaneel('fanshop')
        break
      case 'kluis': {
        const n = sporenRef.current.vondsten.mijn.length
        if (sporenRef.current.mij.sleutel) {
          setMelding('🗝️ Je hebt de sleutel al: naar de helikopter op het dak!')
          break
        }
        if (n < GOUDEN_BALLEN) {
          setMelding(`🔒 De kluis gaat open met alle ${GOUDEN_BALLEN} gouden ballen. Je hebt er ${n}.`)
          break
        }
        void laat('kluis', {}).then((ok) => {
          if (!ok) return
          kluisRef.current?.open()
          setMelding('🗝️ De kluis gaat open… de sleutel van de clubhelikopter is van jou! Ga naar het dak.')
          herlaadSporen()
        })
        break
      }
      case 'rit': {
        const r = rittenRef.current.find((x) => x.id === a.id)
        if (!r) break
        r.stapIn()
        ritRef.current = r
        setMelding(RIT_START[r.id] ?? '🎉 Instappen!')
        break
      }
      case 'spel': {
        setSpel(spellenRef.current.find((x) => x.id === a.id) ?? null)
        break
      }
      case 'heli': {
        if (!sporenRef.current.mij.sleutel) {
          setMelding(`🔒 Je hebt de sleutel nodig. Die ligt in de kluis in de kelder (alle ${GOUDEN_BALLEN} gouden ballen).`)
          break
        }
        heliRef.current?.stapIn()
        setMelding('🚁 Rotor op toeren… hou je vast!')
        break
      }
      case 'superstar':
        naarWerplijnRef.current()
        setPaneel('superstar')
        herlaadSter()
        break
      case 'knop': {
        const vw = vuurwerkRef.current
        if (!vw) break
        if (vw.bezig() || aftelRef.current != null) {
          setMelding('🎆 De show is al bezig — kijk omhoog!')
          break
        }
        vw.wek()
        vw.knop.druk()
        // Aftellen: 5, 4, 3, 2, 1… en dan barst het los.
        const tel = (n: number) => {
          if (n === 0) {
            aftelRef.current = null
            setAftel(null)
            vw.start()
            return
          }
          aftelRef.current = n
          setAftel(n)
          vw.piep(n === 1)
          setTimeout(() => tel(n - 1), 1000)
        }
        tel(5)
        break
      }
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
        setPopcornVast(true)
        void laat('popcorn', {}).then((ok) => setMelding(ok ? '🍿 Vers gepoft! Je hebt een doosje mee: kijk eens in de spiegel van de lift' : '🍿 Je hebt een doosje popcorn mee'))
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
              {bezit != null && VELD.includes(modus) && (
                <span className="vk-bezit">
                  <i style={{ background: data.kleuren[bezit] }} /> Balbezit · {ploegNaam(bezit)}
                </span>
              )}
            </div>
            {welkom && klaar && (
              <div className="vk-welkom" aria-live="polite">
                <span>Welkom in jullie stadion</span>
                <b>{thema.naam}</b>
                <small>Wandel rond, vervolledig de opdrachten en breng je clubgenoten mee</small>
                {samenAantal > 0 && (
                  <em className="vk-welkom-samen">
                    👥 {samenAantal} {samenAantal === 1 ? 'supporter' : 'supporters'} van je club {samenAantal === 1 ? 'is' : 'zijn'} al binnen
                  </em>
                )}
                {!vol && (
                  <button className="vk-welkom-vol" onClick={() => void naarVol()}>
                    ⛶ Beleef het op volledig scherm
                  </button>
                )}
              </div>
            )}
            {VELD.includes(modus) && (
              <button className="vk-terugbuiten" onClick={() => setModus('buiten')}>↩ Naar buiten</button>
            )}
            {nabij && !paneel && zit == null && aftel == null && !vlucht && !rit && !spel && (
              <button className="vk-actie" onClick={() => doeActie(nabij)}>
                {nabij.soort === 'rit'
                  ? rittenRef.current.find((r) => r.id === nabij.id)?.actie
                  : nabij.soort === 'spel'
                    ? spellenRef.current.find((g) => g.id === nabij.id)?.actie
                    : ACTIE_LABEL[nabij.soort]}
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
                {goud < GOUDEN_BALLEN && (
                  <i className={`vk-radar ${radar}`} title="Goudradar: hoe dicht ben je bij een gouden bal op dit verdiep?">
                    {RADAR[radar]}
                  </i>
                )}
              </span>
            )}
            {modus === 'buiten' && !paneel && (
              <StadionPlan
                hier={planHier}
                doelen={planDoelen}
                onSluit={() => {
                  planWegRef.current = planBordRef.current
                  setPlanHier(null)
                }}
              />
            )}
            {heliHulp && !vlucht && (
              <div className="vk-heli-hulp" aria-label="Zo vlieg je met de clubhelikopter">
                <b>🚁 Vliegen met de clubhelikopter</b>
                <ol>
                  <li className={heliHulp.gevonden >= GOUDEN_BALLEN ? 'klaar' : ''}>
                    Vind alle {GOUDEN_BALLEN} gouden ballen <span>({heliHulp.gevonden}/{GOUDEN_BALLEN})</span>
                  </li>
                  <li className={heliHulp.sleutel ? 'klaar' : ''}>Open de kluis in de kelder (-1) en neem de sleutel</li>
                  <li>{heliHulp.sleutel ? 'Ga naar de deur van de helikopter en stap in!' : 'Kom terug en stap in bij de deur'}</li>
                </ol>
              </div>
            )}
            {spel && modus === 'buiten' && !rit && <KermisspelPaneel key={spel.id} spel={spel} onSluit={() => setSpel(null)} />}
            {rit && (
              <div className="vk-vlucht" aria-label={rit.titel}>
                <div className="vk-vlucht-info">
                  <b>{rit.titel}</b>
                  <span>{rit.regel}</span>
                </div>
                <div className="vk-vlucht-knoppen">
                  <button className="landen" disabled={!rit.magUit} onClick={() => ritRef.current?.stapUit()}>
                    🚪 Uitstappen
                  </button>
                </div>
              </div>
            )}
            {vlucht && (
              <div className="vk-vlucht" aria-label="Helikopter">
                <div className="vk-vlucht-info">
                  <b>🚁 {vlucht.fase === 'opstijgen' ? 'Opstijgen…' : vlucht.fase === 'landen' ? 'Landen…' : 'Je vliegt!'}</b>
                  <span>
                    {Math.round(vlucht.hoogte)} m · {Math.round(vlucht.snelheid)} km/u
                  </span>
                </div>
                <div className="vk-vlucht-knoppen">
                  {(['stijg', 'daal'] as const).map((k) => (
                    <button
                      key={k}
                      onPointerDown={() => (st.current.hoog = k === 'stijg' ? 1 : -1)}
                      onPointerUp={() => (st.current.hoog = 0)}
                      onPointerLeave={() => (st.current.hoog = 0)}
                      onPointerCancel={() => (st.current.hoog = 0)}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {k === 'stijg' ? '⬆️ Stijg' : '⬇️ Daal'}
                    </button>
                  ))}
                  <button className="landen" disabled={vlucht.fase !== 'vliegen'} onClick={() => heliRef.current?.landen()}>
                    🛬 Landen
                  </button>
                </div>
              </div>
            )}
            {aftel != null && (
              <div className="vk-aftel" aria-live="assertive" key={aftel}>
                <b>{aftel}</b>
                <span>{aftel === 1 ? 'kijk omhoog!' : 'vuurwerk over'}</span>
              </div>
            )}
            {thema.ingelogd && thema.clubId != null && !welkom && (
              <button className="vk-samen" title="Praat met de supporters van je club die nu ook in het stadion zijn" onClick={() => setPraatOpen((o) => !o)}>
                {samenAantal > 0 ? `👥 ${samenAantal} ${samenAantal === 1 ? 'supporter' : 'supporters'} hier · 💬` : '💬 Supporterspraat'}
              </button>
            )}
            {praatRegels.length > 0 && !welkom && (
              <ul className="vk-praat-strook" aria-live="polite">
                {praatRegels.map((r) => (
                  <li key={r.id}>{r.tekst}</li>
                ))}
              </ul>
            )}
            <Praat
              open={praatOpen}
              onSluit={() => setPraatOpen(false)}
              clubNaam={thema.naam}
              supporters={supporters}
              kast={sporen.mij}
              onRoep={async (roep, aan) => {
                try {
                  const r = await fetch('/api/virtueel/praat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ roep, aan }) })
                  if (!r.ok) {
                    const d = (await r.json().catch(() => ({}))) as { error?: string }
                    setMelding(d.error ?? 'Dat lukte even niet')
                    return false
                  }
                  return true
                } catch {
                  return false
                }
              }}
              onGeef={async (artikel, aan) => {
                const ok = await laat('geschenk', { id: artikel, aan: Number(aan.id) })
                if (ok) {
                  setMelding(`🎁 Ingepakt en gegeven aan ${aan.naam}!`)
                  herlaadSporen()
                }
                return ok
              }}
            />
            {modus === 'buiten' && !welkom && popcornVast && (
              <button className="vk-popcornvast" onClick={() => setPopcornVast(false)} title="Zet je doosje popcorn weg">
                🍿 Wegzetten
              </button>
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
            {WANDELEN.includes(modus) && !welkom && (
              <button
                className="vk-zicht"
                onClick={wisselZicht}
                aria-label={zicht === 'mannetje' ? 'Kijk door je eigen ogen' : 'Zie je mannetje voor je'}
                title={zicht === 'mannetje' ? 'Kijk door je eigen ogen' : 'Zie je mannetje voor je'}
              >
                {zicht === 'mannetje' ? '👁️' : '🧍'}
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
            <Photobooth
              open={paneel === 'booth'}
              onSluit={() => setPaneel(null)}
              ingelogd={Boolean(thema.ingelogd)}
              eigen={boothFotos.filter((f) => f.eigen)}
              onGehangen={(f) => {
                setBoothFotos((l) => [...l, f])
                boothRef.current?.voegToe(f)
                setMelding('📌 Je polaroid hangt aan de muur!')
              }}
              onVerwijderd={(id) => {
                const nieuw = boothFotosRef.current.filter((f) => f.id !== id)
                setBoothFotos(nieuw)
                boothRef.current?.zetFotos(nieuw)
              }}
            />
            <WedkantoorPaneel open={paneel === 'wedkantoor'} onSluit={() => setPaneel(null)} stats={wedStats} />
            <Superstar
              open={paneel === 'superstar'}
              onSluit={() => setPaneel(null)}
              stand={sterStand}
              ingelogd={Boolean(thema.ingelogd)}
              onNeem={(b: BalId | null) => sterRef.current?.neem(b)}
              onWerp={async (bal, kracht, hoek) => {
                // De server rekent de afstand uit (en bewaart hem); zonder login werp je voor de fun.
                let afstand = werpAfstand(bal, kracht, hoek)
                let bewaard = false
                try {
                  const r = await fetch('/api/virtueel/sporen', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ soort: 'werp', waarde: { bal, kracht, hoek } }),
                  })
                  if (r.ok) {
                    const d = (await r.json()) as { waarde?: { afstand?: number } }
                    if (typeof d.waarde?.afstand === 'number') afstand = d.waarde.afstand
                    bewaard = true
                  }
                } catch {
                  /* dan werp je enkel voor de fun */
                }
                await sterRef.current?.gooi(bal, afstand, hoek)
                if (bewaard) herlaadSter()
                return { afstand, bewaard }
              }}
            />
            <Fanshop
              open={paneel === 'fanshop'}
              onSluit={() => setPaneel(null)}
              thema={thema}
              kast={sporen.mij}
              ingelogd={Boolean(thema.ingelogd)}
              ballen={goud}
              onKoop={async (id) => {
                const ok = await laat('aankoop', { id })
                if (ok) {
                  setMelding('🛍️ Gekocht! Trek het aan in de paskamer')
                  herlaadSporen()
                }
                return ok
              }}
              onDraag={async (outfit) => {
                const ok = await laat('outfit', { outfit })
                if (ok) {
                  avatarRef.current?.kleedAan(outfit)
                  setMelding('👕 Staat je goed! Kijk eens in een spiegel')
                  herlaadSporen()
                }
                return ok
              }}
            />
            <Wedkiosk
              open={paneel === 'kiosk'}
              onSluit={() => setPaneel(null)}
              clubId={thema.clubId ?? null}
              onGezet={(w, h, a) => setMelding(`🎟️ Je pronostiek staat: ${w.thuis} ${h}–${a} ${w.uit}`)}
            />
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
