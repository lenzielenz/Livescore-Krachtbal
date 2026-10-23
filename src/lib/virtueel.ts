// Virtueel krachtbal: een wedstrijdfragment dat uit video gereconstrueerd werd (positie van elke
// speler en van de bal, ~30 keer per seconde), om in 3D af te spelen en zelf door te lopen.
//
// De reconstructie zelf gebeurt buiten dit platform; hier komt enkel het resultaat binnen, als
// statisch bestand in public/virtueel/<slug>.json (kolommen in base64, zie decodeer). Deze module
// is puur: decoderen, een positie op een willekeurig tijdstip opvragen (interpolatie), waar de bal
// is (in de handen van een speler of in de lucht) en welke ploeg balbezit heeft. De 3D-weergave
// zit in src/app/(frontend)/virtueel/[slug]/VirtueelViewer.tsx.

import { logoBron } from './logo-bron'

export type Veld = { length_m: number; width_m: number; goal_a: number; goal_b: number }
export type Ploeg = { id: number; naam: string; thuis: boolean; tenue: string[] }

export type Reconstructie = {
  versie: number
  duur_s: number
  veld: Veld
  ploegen: Ploeg[]
  kolommen: {
    n: number
    woorden: { ent: string[]; fase: (string | null)[]; track: (string | null)[] }
    t: string
    soort: string
    ent: string
    team: string
    x: string
    y: string
    z: string
    fase: string
    track: string
  }
}

/** Eén fragment in de catalogus van /virtueel. */
export type VirtueelFragment = {
  slug: string
  titel: string
  datum: string
  plaats: string
  beschrijving: string
}

export const FRAGMENTEN: VirtueelFragment[] = [
  {
    slug: '2026-10-07-sint-michiels',
    titel: 'Oefenpot in Sint-Michiels',
    datum: '2026-10-07',
    plaats: 'Sint-Michiels',
    beschrijving: '41 seconden spel, rood tegen grijs: elke worp, vangst en loopbeweging, gereconstrueerd uit één gsm-video.',
  },
]

export const fragment = (slug: string) => FRAGMENTEN.find((f) => f.slug === slug) ?? null

export type BalFase = 'held' | 'arc' | 'flight' | 'ground' | null

/** Het pad van één speler of van de bal, gesorteerd op tijd. Ontbrekende metingen zijn weggelaten. */
export type Spoor = {
  id: string
  bal: boolean
  team: number | null
  /** Het volgnummer (track) van deze speler in de meting — de bal verwijst ernaar als houder. */
  track: string | null
  t: Float64Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
  fase: BalFase[]
  houder: (string | null)[]
}

const ONTBREEKT = -32768

function bytes(b64: string): Uint8Array {
  const s = atob(b64)
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}

/** Zet de base64-kolommen om in één spoor per speler en één voor de bal. */
export function decodeer(r: Reconstructie): Spoor[] {
  const k = r.kolommen
  const t = new Int32Array(bytes(k.t).buffer)
  const soort = bytes(k.soort)
  const ent = new Uint16Array(bytes(k.ent).buffer)
  const team = new Int8Array(bytes(k.team).buffer)
  const x = new Int16Array(bytes(k.x).buffer)
  const y = new Int16Array(bytes(k.y).buffer)
  const z = new Int16Array(bytes(k.z).buffer)
  const fase = bytes(k.fase)
  const track = new Uint16Array(bytes(k.track).buffer)

  const rijen = new Map<string, number[]>()
  for (let i = 0; i < k.n; i++) {
    if (x[i] === ONTBREEKT || y[i] === ONTBREEKT) continue
    const id = k.woorden.ent[ent[i]]
    const lijst = rijen.get(id) ?? []
    lijst.push(i)
    rijen.set(id, lijst)
  }
  // De meting levert de bal twee keer: ruw ('ball') en als afgewerkte baan met fases en houder
  // ('bal-baan'). Die laatste is wat we tonen; de ruwe enkel als er geen baan is.
  if (rijen.has('bal-baan')) rijen.delete('ball')

  const sporen: Spoor[] = []
  for (const [id, ix] of rijen) {
    ix.sort((a, b) => t[a] - t[b])
    const isBal = soort[ix[0]] === 1
    const tracks = new Map<string, number>()
    if (!isBal) for (const i of ix) {
      const w = k.woorden.track[track[i]]
      if (w) tracks.set(w, (tracks.get(w) ?? 0) + 1)
    }
    sporen.push({
      id,
      bal: isBal,
      team: team[ix[0]] < 0 ? null : team[ix[0]],
      track: [...tracks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      t: Float64Array.from(ix, (i) => t[i] / 1000),
      x: Float32Array.from(ix, (i) => x[i] / 100),
      y: Float32Array.from(ix, (i) => y[i] / 100),
      z: Float32Array.from(ix, (i) => (z[i] === ONTBREEKT ? 0 : z[i] / 100)),
      fase: ix.map((i) => (isBal ? ((k.woorden.fase[fase[i]] ?? null) as BalFase) : null)),
      houder: ix.map((i) => (isBal ? (k.woorden.track[track[i]] ?? null) : null)),
    })
  }
  return sporen.sort((a, b) => Number(a.bal) - Number(b.bal) || a.id.localeCompare(b.id, 'nl', { numeric: true }))
}

/** Langer dan dit zonder meting = niet in beeld (bv. de speler liep even uit het camerabeeld). */
export const MAX_GAT_S = 1.0

/** Laatste index met t[i] <= tijd, of -1. */
function index(sp: Spoor, tijd: number): number {
  let lo = 0
  let hi = sp.t.length - 1
  if (hi < 0 || tijd < sp.t[0]) return -1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (sp.t[m] <= tijd) lo = m
    else hi = m - 1
  }
  return lo
}

export type Stand = { x: number; y: number; z: number; fase: BalFase; houder: string | null; i: number }

/** Positie op `tijd` (seconden), lineair tussen twee metingen. Null als de speler niet in beeld is. */
export function op(sp: Spoor, tijd: number): Stand | null {
  const i = index(sp, tijd)
  if (i < 0) return null
  const laatste = sp.t.length - 1
  if (i === laatste) return tijd - sp.t[i] <= 0.1 ? { x: sp.x[i], y: sp.y[i], z: sp.z[i], fase: sp.fase[i], houder: sp.houder[i], i } : null
  const gat = sp.t[i + 1] - sp.t[i]
  if (gat > MAX_GAT_S) return tijd - sp.t[i] <= 0.1 ? { x: sp.x[i], y: sp.y[i], z: sp.z[i], fase: sp.fase[i], houder: sp.houder[i], i } : null
  const a = gat > 0 ? (tijd - sp.t[i]) / gat : 0
  return {
    x: sp.x[i] + (sp.x[i + 1] - sp.x[i]) * a,
    y: sp.y[i] + (sp.y[i + 1] - sp.y[i]) * a,
    z: sp.z[i] + (sp.z[i + 1] - sp.z[i]) * a,
    fase: sp.fase[i],
    houder: sp.houder[i],
    i,
  }
}

/** Snelheid (m/s) rond `tijd`, over een venster van ±0.25 s: zo trilt de looprichting niet. */
export function snelheid(sp: Spoor, tijd: number): { vx: number; vy: number } {
  const a = op(sp, tijd - 0.25)
  const b = op(sp, tijd + 0.25)
  if (!a || !b) return { vx: 0, vy: 0 }
  return { vx: (b.x - a.x) / 0.5, vy: (b.y - a.y) / 0.5 }
}

/** Hoogte van de bal in de handen. */
export const HANDHOOGTE = 1.15

export type BalStand = { x: number; y: number; z: number; fase: BalFase; houder: Spoor | null }

/**
 * Waar de bal is: in de handen van zijn houder (vóór de speler, op handhoogte) of op zijn eigen
 * gemeten plek in de lucht of op de grond.
 */
export function balOp(sporen: Spoor[], tijd: number): BalStand | null {
  const bal = sporen.find((s) => s.bal)
  if (!bal) return null
  const s = op(bal, tijd)
  if (!s) return null
  if (s.fase === 'held' && s.houder) {
    const houder = sporen.find((p) => !p.bal && p.track === s.houder) ?? null
    const h = houder ? op(houder, tijd) : null
    if (houder && h) {
      const v = snelheid(houder, tijd)
      const len = Math.hypot(v.vx, v.vy)
      const dx = len > 0.3 ? (v.vx / len) * 0.3 : 0
      const dy = len > 0.3 ? (v.vy / len) * 0.3 : 0
      return { x: h.x + dx, y: h.y + dy, z: HANDHOOGTE, fase: 'held', houder }
    }
  }
  return { x: s.x, y: s.y, z: Math.max(0.15, s.z), fase: s.fase, houder: null }
}

/** Welke ploeg heeft de bal (of had hem het laatst vast)? Null vóór de eerste vangst. */
export function bezitOp(sporen: Spoor[], tijd: number): number | null {
  const bal = sporen.find((s) => s.bal)
  if (!bal) return null
  for (let i = index(bal, tijd); i >= 0; i--) {
    if (bal.fase[i] !== 'held' || !bal.houder[i]) continue
    const houder = sporen.find((p) => !p.bal && p.track === bal.houder[i])
    if (houder) return houder.team
  }
  return null
}

/** Het balspoor van de laatste `duur` seconden, als lijst punten (voor de lichtstreep). */
export function balSpoor(sporen: Spoor[], tijd: number, duur = 2, stap = 1 / 30): { x: number; y: number; z: number }[] {
  const uit: { x: number; y: number; z: number }[] = []
  for (let t = Math.max(0, tijd - duur); t <= tijd + 1e-9; t += stap) {
    const b = balOp(sporen, t)
    if (b) uit.push({ x: b.x, y: b.y, z: b.z })
    else uit.length = 0
  }
  return uit
}

/** Tenuekleuren uit de wedstrijdinstellingen. */
export const TENUE: Record<string, string> = {
  rood: '#e5484d', wit: '#eef2f6', zwart: '#3f3f46', grijs: '#a1a1aa', blauw: '#3b82f6', lichtblauw: '#7dd3fc', groen: '#22c55e',
  geel: '#facc15', oranje: '#f97316', paars: '#a855f7', roze: '#f472b6', bordeaux: '#9f1239', marine: '#1e3a8a', navy: '#1e3a8a',
}

/** Eén kleur per ploeg uit haar tenue, zonder dat beide ploegen dezelfde krijgen. */
export function ploegKleuren(ploegen: Ploeg[]): Record<number, string> {
  const uit: Record<number, string> = {}
  const reserve = ['#73d8c6', '#ef937f']
  for (const p of ploegen) {
    const vrij = p.tenue.map((n) => TENUE[n.toLowerCase()]).find((c) => c && !Object.values(uit).includes(c))
    uit[p.id] = vrij ?? reserve[p.id % 2]
  }
  return uit
}

// ---------- het stadion in de kleuren van je club ----------

/** Eén bord in de hall of fame in de gangen: een titel, een beker of een referendumprijs. */
export type EreBord = {
  soort: 'titel' | 'beker' | 'referendum'
  jaar: string
  kop: string
  tekst: string
  /** Wat deze prijs bijzonder maakt, bv. "3de titel in 1ste Nationale Heren · 6de titel van de club". */
  extra?: string
  /** Het hoeveelste van zijn soort voor de club (1 = de eerste ooit). */
  nummer?: number
}
/** Een ster in de vloer (zoals de Walk of Fame): één per gewonnen referendumprijs. */
export type EreSter = { naam: string; prijs: string; jaar: string }
/**
 * De hall of fame: een kopbord en de borden, recentste eerst. `eigen` = de prijzen van je club.
 * `sterren`: elke referendumprijs van je club (een ster in de vloer). `vroeger`: de oudste titels en
 * bekers, oudste eerst — de gang met de oude bekers op het verdiep.
 */
export type EreZaal = { eigen: boolean; kop: string; totaal: string; borden: EreBord[]; sterren?: EreSter[]; vroeger?: EreBord[] }

export type StadionThema = {
  naam: string
  /** Initialen voor als er geen (bruikbaar) logo is. */
  kort: string
  primair: string
  secundair: string
  /** Leesbare tekstkleur op de primaire kleur. */
  tekstOpPrimair: string
  logoUrl: string | null
  reclames: { url: string; naam: string }[]
  /** Optioneel: de erelijst voor de hall of fame in de gangen. */
  erezaal?: EreZaal | null
  /** Optioneel: de wedstrijden van het (komende) speelweekend voor de weekendzaal. */
  weekend?: WeekendZaal | null
  /** Optioneel: supportersfoto's van live wedstrijden van je club, als collages. */
  fotos?: FotoKader[] | null
  /** De club van wie kijkt (voor de graffitimuur); null = de algemene muur. */
  clubId?: number | null
  /** Ingelogd? Enkel dan kan je op de graffitimuur spuiten. */
  ingelogd?: boolean
  /** Wie kijkt (om jezelf niet dubbel te zien tussen de andere supporters). */
  ikId?: string | null
}

/** Eén kader in de fotogalerij: 1 tot 4 foto's door elkaar, met een onderschrift. */
export type FotoKader = {
  fotos: { url: string; auteur: string }[]
  /** Bv. "KBC St. Michiels A – KRB Jabbeke" of "3 wedstrijden". */
  titel: string
  /** Bv. "12 oktober · foto's van Lotte, Jan". */
  sub: string
  /** Een getal om de schikking (kantelingen, volgorde) per kader te variëren. */
  zaad: number
}

/** Eén wedstrijd op de weekendmuur. De stand is afgeleid (buildScoreboards), nooit opgeslagen. */
export type WeekendBord = {
  id: number
  /** "ZA" of "ZO". */
  dag: string
  uur: string
  reeks: string
  thuis: string
  uit: string
  thuisKleur: string
  uitKleur: string
  status: 'gepland' | 'live' | 'gespeeld' | 'wacht'
  /** Enkel bij live en gespeeld. */
  score: { home: number; away: number } | null
  /** Een wedstrijd van je eigen club. */
  eigen: boolean
}
/** De weekendzaal: de wedstrijden van het komende (of lopende) speelweekend. */
export type WeekendZaal = {
  /** De zaterdag (YYYY-MM-DD): sleutel voor het gedeelde live-weekendkanaal. */
  zaterdag: string
  /** Bv. "za 17 – zo 18 oktober". */
  datum: string
  /** Over het hele weekend, ook wat niet aan de muur past (zie weekendTelling). */
  totaal: number
  gespeeld: number
  live: number
  /** Wordt er nu (za/zo) gespeeld? Enkel dan luistert de zaal mee naar live-standen. */
  bezig: boolean
  borden: WeekendBord[]
}

/** Zonder ingelogde club: het stadion van Krachtbal Live zelf. */
export const STANDAARD_THEMA: StadionThema = {
  naam: 'Krachtbal Live',
  kort: 'KL',
  primair: '#2563eb',
  secundair: '#e2e8f0',
  tekstOpPrimair: '#ffffff',
  logoUrl: null,
  reclames: [],
}

function luminantie(hex: string): number {
  const h = hex.replace('#', '')
  const c = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4)
}

/**
 * Het thema voor het stadion uit de gegevens van een club. Twee bijna gelijke clubkleuren (of een
 * ontbrekende tweede) geven een saai stadion; dan wordt de tweede kleur wit of donker, wat het
 * best afsteekt.
 */
export function stadionThema(club: { naam: string; primair: string | null; secundair: string | null; logoUrl: string | null }, reclames: StadionThema['reclames'] = []): StadionThema {
  const hex = (v: string | null) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null)
  const primair = hex(club.primair) ?? STANDAARD_THEMA.primair
  let secundair = hex(club.secundair)
  const lp = luminantie(primair)
  if (!secundair || Math.abs(luminantie(secundair) - lp) < 0.08) secundair = lp > 0.45 ? '#111827' : '#f8fafc'
  const kort = club.naam
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
  return {
    naam: club.naam,
    kort: kort || 'KL',
    primair,
    secundair,
    tekstOpPrimair: lp > 0.45 ? '#0b1220' : '#ffffff',
    logoUrl: logoBron(club.logoUrl),
    reclames,
  }
}

/**
 * Balbezit tot op een tijdstip, als aandeel per ploeg (0–1): de tijd dat een speler van die ploeg
 * de bal vasthad, plus de vlucht na zijn worp. Vooraf één keer opgebouwd, daarna per frame enkel
 * een zoekopdracht.
 */
export function bezitTijdlijn(sporen: Spoor[]): (tijd: number) => [number, number] | null {
  const bal = sporen.find((s) => s.bal)
  if (!bal || bal.t.length === 0) return () => null
  const teamVan = new Map<string, number | null>()
  for (const p of sporen) if (!p.bal && p.track) teamVan.set(p.track, p.team)
  const n = bal.t.length
  const cum = [new Float64Array(n), new Float64Array(n)]
  let team: number | null = null
  for (let i = 1; i < n; i++) {
    const vorig = i - 1
    if (bal.fase[vorig] === 'held' && bal.houder[vorig]) team = teamVan.get(bal.houder[vorig]!) ?? team
    const dt = Math.min(1, bal.t[i] - bal.t[vorig])
    cum[0][i] = cum[0][vorig] + (team === 0 ? dt : 0)
    cum[1][i] = cum[1][vorig] + (team === 1 ? dt : 0)
  }
  return (tijd) => {
    let lo = 0
    let hi = n - 1
    if (tijd < bal.t[0]) return null
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1
      if (bal.t[m] <= tijd) lo = m
      else hi = m - 1
    }
    const a = cum[0][lo]
    const b = cum[1][lo]
    return a + b > 0 ? [a / (a + b), b / (a + b)] : null
  }
}

// ---------- de buitenkant: gevel, poorten en rondlopen ----------

/** Een zijde van de gevel met een opening: `as` is de zijde (z+ = de hoofdingang), van/tot langs die zijde. */
export type Poort = { zijde: 'z+' | 'z-' | 'x+' | 'x-'; van: number; tot: number; /** Hoogte van de opening (standaard die van een poort). */ hoogte?: number }
/** De stadiongevel: een rechthoek met afgeronde hoeken (halve lengte A, halve breedte B, hoekstraal R). */
export type Gevel = { A: number; B: number; R: number; hoogte: number; poorten: Poort[] }

/**
 * Ramen in de zuidgevel op het eerste verdiep (de VIP-hal): openingen in de muur van x0 tot x1
 * (in stukken van 2 m, zoals de gevel gebouwd is), van y0 tot y1. Het raam met `balkon` is een
 * deur naar een klein platformpje buiten. (Het verdiep ligt op y = 7,6, zie virtueel-lift.ts.)
 */
export const VERDIEP_RAMEN = [
  { x0: -30, x1: -28, y0: 8.45, y1: 10.35, balkon: false },
  { x0: -26, x1: -24, y0: 8.45, y1: 10.35, balkon: false },
  { x0: -22, x1: -20, y0: 7.6, y1: 10.35, balkon: true },
] as const

export const GEVEL: Gevel = {
  A: 48,
  B: 31,
  R: 12,
  hoogte: 14,
  poorten: [
    { zijde: 'z+', van: -7, tot: 7 }, // hoofdingang
    { zijde: 'z-', van: -3, tot: 3 },
    { zijde: 'x+', van: -3, tot: 3 },
    { zijde: 'x-', van: -3, tot: 3 },
    // De spelersdeur in de westgang: van de gang rechtstreeks de kleedkamers in.
    { zijde: 'x-', van: 9, tot: 11, hoogte: 2.7 },
  ],
}

/** Getekende afstand tot de gevel: negatief binnen, positief buiten. */
export function gevelAfstand(g: Gevel, x: number, z: number): number {
  const qx = Math.abs(x) - (g.A - g.R)
  const qz = Math.abs(z) - (g.B - g.R)
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - g.R
}

/** De poortopening op dit punt (of undefined). */
export function poortOp(g: Gevel, x: number, z: number): Poort | undefined {
  return g.poorten.find((p) => {
    if (p.zijde === 'z+') return z > g.B - g.R && x >= p.van && x <= p.tot
    if (p.zijde === 'z-') return z < -(g.B - g.R) && x >= p.van && x <= p.tot
    if (p.zijde === 'x+') return x > g.A - g.R && z >= p.van && z <= p.tot
    return x < -(g.A - g.R) && z >= p.van && z <= p.tot
  })
}

/** Staat dit punt in een poortopening? */
export function inPoort(g: Gevel, x: number, z: number): boolean {
  return poortOp(g, x, z) != null
}

/** Dikte van de gevelmuur waar je niet door kan (halve breedte). */
const MUUR = 0.7
/** Hoe ver je van het stadion mag weglopen. */
export const WERELD_STRAAL = 150

export type Rechthoek = { x0: number; x1: number; z0: number; z1: number }

/**
 * Binnen vloeren (de kelder, het dak): je mag staan waar een vloervlak is (met `straal` marge tot de
 * rand) en niet in een meubel. Vloervlakken mogen overlappen: zo maak je doorgangen.
 */
export function opVloer(vloeren: Rechthoek[], meubels: Rechthoek[], x: number, z: number, straal = 0.35): boolean {
  const op = vloeren.some((v) => x > v.x0 + straal && x < v.x1 - straal && z > v.z0 + straal && z < v.z1 - straal)
  return op && !meubels.some((o) => x > o.x0 - straal && x < o.x1 + straal && z > o.z0 - straal && z < o.z1 + straal)
}

/** Mag een wandelaar (straal ~0.35 m) op deze plek staan? */
export function vrij(g: Gevel, obstakels: Rechthoek[], x: number, z: number, straal = 0.35): boolean {
  if (Math.hypot(x, z) > WERELD_STRAAL) return false
  if (Math.abs(gevelAfstand(g, x, z)) < MUUR + straal && !inPoort(g, x, z)) return false
  return !obstakels.some((o) => x > o.x0 - straal && x < o.x1 + straal && z > o.z0 - straal && z < o.z1 + straal)
}

/** Eén stap van een wandelaar: lukt het niet rechtdoor, dan schuift hij langs de muur (enkel x of z). */
export function stap(g: Gevel, obstakels: Rechthoek[], van: { x: number; z: number }, naar: { x: number; z: number }): { x: number; z: number } {
  return stapMet((x, z) => vrij(g, obstakels, x, z), van, naar)
}

/** Zoals `stap`, maar met een eigen regel waar je mag staan (kelder, dak). */
export function stapMet(mag: (x: number, z: number) => boolean, van: { x: number; z: number }, naar: { x: number; z: number }): { x: number; z: number } {
  if (mag(naar.x, naar.z)) return naar
  if (mag(naar.x, van.z)) return { x: naar.x, z: van.z }
  if (mag(van.x, naar.z)) return { x: van.x, z: naar.z }
  return van
}

/**
 * Een beeld van een andere website (een extern clublogo, of een upload die via een ander
 * serveradres binnenkomt) mag zonder CORS-toestemming van die site niet in een WebGL-textuur:
 * dan bleef enkel de witte bol met initialen over. Zulke beelden halen we via onze eigen
 * logo-proxy (zelfde aanpak als de deelkaart), zodat ze van onze eigen origin komen.
 */
export function eigenHerkomst(url: string, hier: string): string {
  try {
    const u = new URL(url, hier)
    if (u.origin === new URL(hier).origin) return url
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return url
    return `/api/logo-proxy?url=${encodeURIComponent(u.href)}`
  } catch {
    return url
  }
}

/**
 * De lichtshow van het virtuele stadion: om de `periode` seconden een show van `duur` seconden,
 * zoals na een doelpunt in een echt stadion. Geeft de voortgang (0 tot 1) tijdens de show, en -1
 * daarbuiten. Gedeeld door de lichtmasten, de gevel en de schijnwerpers, zodat ze samen flitsen.
 */
export function lichtshow(seconden: number, periode = 30, duur = 4.5): number {
  const fase = (((seconden - 12) % periode) + periode) % periode
  return fase < duur ? fase / duur : -1
}
