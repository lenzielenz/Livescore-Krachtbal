import { brusselsDayBoundsUtc, dateStrBE } from './datetime'

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
 * `dagStart`/`dagEinde` = vandaag (alles van vandaag hoort erop, ook wat al gedaan is — in de
 * kantine wil je de uitslag van de match die net gespeeld is blijven zien). `geplandTot` = een
 * week vooruit, zodat je doordeweeks ziet wat eraan komt.
 */
export function schermVenster(nu: Date = new Date()): { dagStart: string; dagEinde: string; geplandTot: string } {
  const { start, end } = brusselsDayBoundsUtc(dateStrBE(nu))
  const geplandTot = new Date(new Date(end).getTime() + (GEPLAND_DAGEN - 1) * 24 * 60 * 60 * 1000)
  return { dagStart: start, dagEinde: end, geplandTot: geplandTot.toISOString() }
}

export type SchermWedstrijd = { id: number; status: string; date?: string | null }

/** Rang van een wedstrijd op het scherm: bezig eerst, dan wat vandaag nog komt, dan de rest. */
function rang(m: SchermWedstrijd, dagEinde: string): number {
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
