import type { ShotPoint } from '@/lib/match-engine'

// Het wedstrijdverloop als deelbaar beeld (zie components/Verloop3D.tsx): per doelpoging een piek
// op het veld, zo hoog als de punten die ze opleverde (of, bij een misser, zo hoog als het gevaar
// dat ze had), afgespeeld over de wedstrijdtijd met de stand erbij. Dit bestand is het zuivere
// model: uit de worpen (ShotPoint) de pieken, de tijdas en de stand per moment. Geen DOM, geen
// three — zodat het getest kan worden en het beeld en de export op dezelfde cijfers werken.

export type Kant = 'home' | 'away'

export type Piek = {
  /** Landingspunt, genormaliseerd (x over de breedte, y over de lengte, zie lib/field.ts). */
  x: number
  y: number
  kant: Kant
  /** Doelpunt (voor `kant`), eigen doelpunt (punten voor de ándere kant) of een misser. */
  soort: 'doelpunt' | 'eigen' | 'misser'
  /** Punten die dit moment opleverde (0 bij een misser). */
  punten: number
  /** De hoogte van de piek, 0..1 (2 punten = 1). Bij een misser: het geschatte gevaar. */
  hoogte: number
  /** Positie op de tijdas, 0..1. */
  t: number
  /** Omschrijving voor de tijdlijn (bv. "1e helft 12:40"). */
  tijdLabel: string
  shirtNumber: number
  type: ShotPoint['type']
  /** Stand ná dit moment. */
  stand: [number, number]
  /** Wie wierp (bij een eigen doelpunt is dat niet `kant`). */
  werper: Kant
  /** Verwachte punten van deze poging (kans × puntwaarde): de hoogte van de bult, zoals xG. */
  verwacht: number
  /** Wedstrijdminuut (doorlopend over beide helften), als de klok bekend is. */
  minuut: number | null
}

export type Verloop = {
  pieken: Piek[]
  /** Hoe de tijdas opgebouwd is: echte klok (per helft) of enkel de volgorde van de worpen. */
  tijdas: 'klok' | 'volgorde'
  /** Duur van elke helft op de tijdas in seconden (bij 'volgorde': gelijke helften). */
  helften: [number, number]
  /** Eindstand. */
  stand: [number, number]
  /** Positie (0..1) waar de rust valt. */
  rust: number
}

/**
 * Hoeveel gevaar een misser had, 0..1: een geschatte scoringskans × de puntwaarde, geschaald. Een
 * rugworp van dichtbij komt hoog, een nekworp van ver nauwelijks boven het veld uit. Het is een
 * schatting op worptype en afstand (geen model per reeks): de hoogte van een misser leest dus als
 * "hoe dicht het bij een doelpunt zat", niet als een exact cijfer.
 */
export function gevaar(type: ShotPoint['type'], distance: number | null): number {
  return Math.max(0.06, Math.min(0.6, verwachtePunten(type, distance) / 2))
}

/** Geschatte scoringskans op afstand: dichtbij ± 0,6, voorbij 15 m nog ± 0,1. */
function kans(distance: number | null): number {
  const d = distance ?? 9
  return Math.max(0.08, Math.min(0.65, 0.75 - d * 0.045))
}

/** Verwachte punten van één poging: scoringskans × puntwaarde (rugworp 2, nekworp 1). */
export function verwachtePunten(type: ShotPoint['type'], distance: number | null): number {
  return kans(distance) * (type === 'rug' ? 2 : 1)
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Bouwt het verloop uit de worpen van één wedstrijd (chronologisch, zoals loadMatchThrowData ze geeft). */
export function bouwVerloop(shots: ShotPoint[]): Verloop {
  // Enkel de doelpogingen tellen als piek: de laatste worp van een balbezit, of een doelpunt/eigen
  // doelpunt op een eerdere worp.
  const pogingen = shots.filter((s) => s.isLastThrow || s.outcome === 'goal' || s.outcome === 'own_goal')
  const metKlok = pogingen.length > 0 && pogingen.every((s) => typeof s.gameClock === 'number' && s.gameClock >= 0)
  // De helften: zo lang als de laatste worp erin, afgerond op de minuut (minstens een minuut).
  const duur = (p: number) => {
    const max = Math.max(0, ...pogingen.filter((s) => (s.period ?? 1) === p).map((s) => s.gameClock ?? 0))
    return Math.max(60, Math.ceil(max / 60) * 60)
  }
  const helften: [number, number] = metKlok ? [duur(1), duur(2)] : [Math.max(1, pogingen.filter((s) => (s.period ?? 1) <= 1).length), Math.max(1, pogingen.filter((s) => (s.period ?? 1) >= 2).length)]
  const totaal = helften[0] + helften[1]
  const stand: [number, number] = [0, 0]
  let teller = [0, 0]
  const pieken: Piek[] = pogingen.map((s) => {
    const helft = (s.period ?? 1) >= 2 ? 1 : 0
    const inHelft = metKlok ? Math.min(helften[helft], s.gameClock ?? 0) : (teller[helft] += 1) - 0.5
    const t = (helft === 1 ? helften[0] + inHelft : inHelft) / totaal
    const eigen = s.outcome === 'own_goal'
    const doel = s.outcome === 'goal'
    const punten = doel ? (s.points ?? (s.freeThrow ? 1 : s.type === 'rug' ? 2 : 1)) : eigen ? (s.ownGoalPoints ?? 1) : 0
    const voor: Kant = eigen ? (s.teamSide === 'home' ? 'away' : 'home') : s.teamSide
    if (punten) stand[voor === 'home' ? 0 : 1] += punten
    return {
      x: s.x,
      y: s.y,
      kant: voor,
      soort: doel ? 'doelpunt' : eigen ? 'eigen' : 'misser',
      punten,
      hoogte: punten ? Math.min(1, punten / 2) : gevaar(s.type, s.distance),
      t,
      tijdLabel: metKlok ? `${helft + 1}e helft ${mmss(s.gameClock ?? 0)}` : `${helft + 1}e helft · worp ${Math.round(inHelft + 0.5)}`,
      shirtNumber: s.shirtNumber,
      type: s.type,
      stand: [stand[0], stand[1]],
      werper: s.teamSide,
      verwacht: s.freeThrow ? 1 * kans(s.distance) : verwachtePunten(s.type, s.distance),
      minuut: metKlok ? Math.floor(((helft === 1 ? helften[0] : 0) + (s.gameClock ?? 0)) / 60) + 1 : null,
    }
  })
  teller = [0, 0]
  return { pieken, tijdas: metKlok ? 'klok' : 'volgorde', helften, stand: [stand[0], stand[1]], rust: helften[0] / totaal }
}

/** De stand op een moment van de tijdas (0..1): de laatste piek vóór of op dat moment. */
export function standOp(v: Verloop, t: number): [number, number] {
  let s: [number, number] = [0, 0]
  for (const p of v.pieken) {
    if (p.t > t) break
    s = p.stand
  }
  return s
}

/** "1e helft 12:40" of "rust" of "einde" voor een moment op de tijdas. */
export function tijdLabelOp(v: Verloop, t: number): string {
  if (t >= 1) return 'einde'
  const totaal = v.helften[0] + v.helften[1]
  const s = t * totaal
  if (v.tijdas !== 'klok') return s < v.helften[0] ? '1e helft' : '2e helft'
  if (Math.abs(s - v.helften[0]) < 1) return 'rust'
  return s < v.helften[0] ? `1e helft ${mmss(s)}` : `2e helft ${mmss(s - v.helften[0])}`
}

/**
 * De aanvalsdruk van elke ploeg rond moment `t` (0..1): de verwachte punten van de pogingen vlak
 * ervoor en erna, zacht uitgesmeerd. Pogingen ná `tot` tellen niet mee (de lijn verraadt niets).
 */
export function drukOp(v: Verloop, t: number, tot = 1, breedte = 0.022): [number, number] {
  const d: [number, number] = [0, 0]
  for (const p of v.pieken) {
    if (p.t > tot) break
    const x = (t - p.t) / breedte
    if (Math.abs(x) > 3) continue
    d[p.werper === 'home' ? 0 : 1] += p.verwacht * Math.exp(-x * x)
  }
  return d
}

/** De cijfers tot moment `t`: doelpogingen, raak en verwachte punten per ploeg (thuis, uit). */
export function cijfersTot(v: Verloop, t: number): { pogingen: [number, number]; raak: [number, number]; verwacht: [number, number] } {
  const c = { pogingen: [0, 0] as [number, number], raak: [0, 0] as [number, number], verwacht: [0, 0] as [number, number] }
  for (const p of v.pieken) {
    if (p.t > t) break
    const i = p.werper === 'home' ? 0 : 1
    c.pogingen[i] += 1
    c.verwacht[i] += p.verwacht
    if (p.soort === 'doelpunt') c.raak[i] += 1
  }
  return c
}

/** De klok rechtsboven: de minuut en de helft, met de voortgang in die helft; op het einde "EINDE". */
export function klokOp(v: Verloop, t: number): { groot: string; klein: string; voortgang: number } {
  if (t >= 1) return { groot: 'EINDE', klein: 'Eindstand', voortgang: 1 }
  const totaal = v.helften[0] + v.helften[1]
  const s = t * totaal
  const tweede = s >= v.helften[0]
  const inHelft = tweede ? s - v.helften[0] : s
  const voortgang = Math.min(1, inHelft / v.helften[tweede ? 1 : 0])
  if (v.tijdas !== 'klok') return { groot: tweede ? '2e' : '1e', klein: 'helft', voortgang }
  return { groot: `${Math.floor(s / 60) + 1}'`, klein: tweede ? '2e helft' : '1e helft', voortgang }
}

/** Een korte afkorting van een ploegnaam (zoals BAR, RMA): zonder clubvoorvoegsels als KV of KBK. */
export function afkorting(naam: string): string {
  const woorden = naam.split(/\s+/).filter(Boolean)
  const kern = woorden.filter((w) => !/^[A-Z]{1,4}\.?$/.test(w))
  const w = kern[0] ?? woorden[0] ?? ''
  const delen = w.split('-').filter(Boolean)
  const raw = delen.length > 1 ? `${delen[0][0]}${delen[1].slice(0, 2)}` : w.slice(0, 3)
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() || 'KB'
}
