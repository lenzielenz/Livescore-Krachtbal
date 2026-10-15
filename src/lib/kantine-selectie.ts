import { brusselsDayBoundsUtc, brusselsParts, dateStrBE, shiftDateStr } from './datetime'

// Persoonlijk kantinescherm: wat elke ingelogde gebruiker zelf samenstelt voor de tv in zijn
// kantine. Het tornooischerm werkte, dus hetzelfde idee nu voor de competitie — maar dan per
// gebruiker in plaats van één centrale lijst.
//
// De keuze bestaat uit drie lagen, en die vullen elkaar aan:
//   • clubs  — alles van die club, heel het seizoen, zonder er nog naar om te kijken
//   • ploegen — hetzelfde, maar toegespitst op één of enkele ploegen
//   • losse wedstrijden — een boeiende match van een andere club die er deze keer bij mag
//
// Deze module bevat enkel de pure regels (wat is een geldige keuze, welk tijdvenster telt, in
// welke volgorde hoort het op het scherm). De databasequery's staan in de API-route, zodat dit
// stuk zonder database te testen valt.

export type KantineSelectie = {
  clubIds: number[]
  teamIds: number[]
  matchIds: number[]
}

export const LEGE_SELECTIE: KantineSelectie = { clubIds: [], teamIds: [], matchIds: [] }

/** Hoeveel dagen vooruit tonen we geplande wedstrijden? Een week: de kantine leeft per weekend. */
export const GEPLAND_DAGEN = 7

/** Bovengrens per laag — een scherm met honderd borden is geen scherm meer. */
const MAX_PER_LAAG = 50

function ids(raw: unknown): number[] {
  const lijst = Array.isArray(raw) ? raw : []
  const uniek = new Set<number>()
  for (const x of lijst) {
    const n = Number(x)
    if (Number.isFinite(n) && n > 0) uniek.add(n)
  }
  return [...uniek].slice(0, MAX_PER_LAAG)
}

/**
 * Maak van wat er in de database staat (json, dus alles kan) een bruikbare selectie. Nooit gooien:
 * een scherm dat door rommel in het profiel wit blijft, is erger dan een leeg scherm.
 */
export function sanitizeKantineSelectie(raw: unknown): KantineSelectie {
  if (!raw || typeof raw !== 'object') return { ...LEGE_SELECTIE }
  const o = raw as Record<string, unknown>
  return { clubIds: ids(o.clubIds), teamIds: ids(o.teamIds), matchIds: ids(o.matchIds) }
}

/** Heeft de gebruiker al iets gekozen? Zo niet, toont het scherm uitleg in plaats van leegte. */
export function selectieIsLeeg(s: KantineSelectie): boolean {
  return s.clubIds.length === 0 && s.teamIds.length === 0 && s.matchIds.length === 0
}

/**
 * Het tijdvenster van het scherm, in UTC-grenzen op de Belgische kalender.
 *
 * `dagStart` = GISTEREN (niet vandaag): de eindstand van de vorige speeldag mag op het scherm
 * blijven staan tot er iets nieuws is, in plaats van een leeg scherm te tonen zodra alle
 * wedstrijden van vandaag nog moeten beginnen of de laatste van gisteren pas net voorbij is.
 * `dagEinde` = het einde van vandaag (voor de sortering: "vandaag" vs "later deze week", zie
 * `rang` hieronder). `geplandTot` = een week vooruit, zodat je doordeweeks ziet wat eraan komt.
 */
export function schermVenster(nu: Date = new Date()): {
  dagStart: string
  dagEinde: string
  geplandTot: string
  vandaagStart: string
  uitslagenVanaf: string
} {
  const gisteren = new Date(nu.getTime() - 24 * 60 * 60 * 1000)
  const { start: dagStart } = brusselsDayBoundsUtc(dateStrBE(gisteren))
  const { start: vandaagStart, end } = brusselsDayBoundsUtc(dateStrBE(nu))
  const geplandTot = new Date(new Date(end).getTime() + (GEPLAND_DAGEN - 1) * 24 * 60 * 60 * 1000)
  // De uitslagenbalk toont het hele speelweekend. Op zondag is "gisteren" de zaterdag en valt dat
  // samen; op maandag reikt het weekend verder terug dan gisteren — dan telt het weekend.
  const weekend = weekendStart(nu)
  const uitslagenVanaf = weekend < dagStart ? weekend : dagStart
  return { dagStart, dagEinde: end, geplandTot: geplandTot.toISOString(), vandaagStart, uitslagenVanaf }
}

/**
 * Begin (UTC) van het lopende speelweekend: de zaterdag van dit weekend, of doordeweeks die van
 * het voorbije. Op de Belgische kalender, zodat een avondwedstrijd niet in de verkeerde dag valt.
 */
export function weekendStart(nu: Date = new Date()): string {
  const terug = (brusselsParts(nu).weekdayMon0 - 5 + 7) % 7 // za 0, zo 1, ma 2 … vr 6
  return brusselsDayBoundsUtc(shiftDateStr(dateStrBE(nu), -terug)).start
}

/**
 * De middelste strook: enkel wat VANDAAG nog moet beginnen, in volgorde van aanvang. Een wedstrijd
 * die start, schuift naar het live-vak; zo wordt de strook vanzelf korter en verdwijnt ze zodra er
 * niets meer komt. Een geplande wedstrijd van een eerdere dag (nooit gestart) hoort hier niet.
 */
export function komendVandaag<T extends SchermWedstrijd>(matches: T[], vandaagStart: string, dagEinde: string): T[] {
  return matches
    .filter((m) => m.status === 'scheduled' && m.date && m.date >= vandaagStart && m.date < dagEinde)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id)
}

/** De balk onderaan: de eindstanden van het speelweekend, in de volgorde waarin ze gespeeld werden. */
export function weekendUitslagen<T extends SchermWedstrijd>(matches: T[], vanaf: string): T[] {
  return matches
    .filter((m) => m.status === 'finished' && (!m.date || m.date >= vanaf))
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || a.id - b.id)
}

export type SchermWedstrijd = { id: number; status: string; date?: string | null }

/**
 * Rang van een wedstrijd op het scherm: bezig eerst, dan wat vandaag nog komt, dan de rest.
 * Ook gebruikt door KantineScreen.tsx om te bepalen wat er NU op het grote scherm hoort (rang 0-2 =
 * "vandaag", rang 3 = later deze week) — zie de `visible`-berekening daar.
 */
export function rang(m: SchermWedstrijd, dagEinde: string): number {
  if (m.status === 'live') return 0
  if (m.status === 'finished') return 2
  // Gepland: vandaag vóór later deze week.
  return m.date && m.date < dagEinde ? 1 : 3
}

/**
 * Zet de wedstrijden in de volgorde waarin ze op de tv horen: wat bezig is bovenaan (daar kijk je
 * naar), daarna wat vandaag nog begint, dan de uitslagen van vandaag, en achteraan de rest van de
 * week. Binnen elke groep chronologisch.
 */
export function sorteerSchermWedstrijden<T extends SchermWedstrijd>(matches: T[], dagEinde: string): T[] {
  return [...matches].sort((a, b) => {
    const ra = rang(a, dagEinde)
    const rb = rang(b, dagEinde)
    if (ra !== rb) return ra - rb
    const da = a.date ?? ''
    const db = b.date ?? ''
    if (da !== db) return da < db ? -1 : 1
    return a.id - b.id
  })
}

/** Ontdubbel op id met behoud van volgorde (de drie lagen overlappen vaak). */
export function ontdubbel<T extends { id: number }>(matches: T[]): T[] {
  const gezien = new Set<number>()
  const uit: T[] = []
  for (const m of matches) {
    if (gezien.has(m.id)) continue
    gezien.add(m.id)
    uit.push(m)
  }
  return uit
}

/**
 * Het komende speelweekend (zaterdag 00:00 tot maandag 00:00, Belgische kalender): op zaterdag en
 * zondag het lopende weekend, doordeweeks het eerstvolgende.
 */
export function komendWeekend(nu: Date = new Date()): { start: string; einde: string } {
  const dag = brusselsParts(nu).weekdayMon0
  const zaterdag = dag >= 5 ? shiftDateStr(dateStrBE(nu), -(dag - 5)) : shiftDateStr(dateStrBE(nu), 5 - dag)
  return { start: brusselsDayBoundsUtc(zaterdag).start, einde: brusselsDayBoundsUtc(shiftDateStr(zaterdag, 2)).start }
}

/**
 * De voorbeschouwing: zolang er in het komende weekend nog GEEN enkele wedstrijd gestart is, toont
 * de tv álle wedstrijden van dat weekend tegelijk (reeks, dag en uur, de twee ploegen). Zodra er
 * één begint — of er elders iets live is — valt dit weg en neemt het gewone scherm het over.
 */
export function weekendVoorbeschouwing<T extends SchermWedstrijd>(matches: T[], nu: Date = new Date()): T[] {
  if (matches.some((m) => m.status === 'live')) return []
  const { start, einde } = komendWeekend(nu)
  const weekend = matches.filter((m) => m.date && m.date >= start && m.date < einde)
  if (weekend.length === 0 || weekend.some((m) => m.status !== 'scheduled')) return []
  return weekend.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id)
}

/** Kolommen voor de voorbeschouwing: alles moet op één scherm passen, zonder te bladeren. */
export function voorbeschouwingKolommen(aantal: number, breedte: number): number {
  const ideaal = aantal <= 1 ? 1 : aantal <= 4 ? 2 : aantal <= 9 ? 3 : aantal <= 16 ? 4 : 5
  const maxBreedte = breedte < 560 ? 1 : breedte < 900 ? 2 : breedte < 1300 ? 3 : 5
  return Math.max(1, Math.min(ideaal, maxBreedte))
}
