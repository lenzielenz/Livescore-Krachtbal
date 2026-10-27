import { brusselsMidnightUtc, brusselsParts, brusselsWallUtc, shiftDateStr, zaterdagVan } from '@/lib/datetime'

// Een heel speelweekend verplaatsen: alle wedstrijden van zaterdag + zondag schuiven naar een
// ander weekend, elk met behoud van haar eigen dag (za blijft za, zo blijft zo) en haar aftrapuur
// op de Belgische wandklok. Zuiver rekenwerk, zonder databank: de route en de pagina gebruiken
// dezelfde functies, zodat het voorbeeld op het scherm klopt met wat er bewaard wordt.

const DAG_MS = 86_400_000

/** Het ISO-weeknummer (en het bijbehorende jaar) van een kalenderdatum "YYYY-MM-DD". */
export function isoWeek(datum: string): { jaar: number; week: number } {
  const [y, m, d] = datum.slice(0, 10).split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  // ISO: de week hoort bij het jaar waarin haar donderdag valt.
  const dag = at.getUTCDay() || 7
  at.setUTCDate(at.getUTCDate() + 4 - dag)
  const jaar = at.getUTCFullYear()
  const eersteDonderdag = new Date(Date.UTC(jaar, 0, 1))
  const week = Math.ceil(((at.getTime() - eersteDonderdag.getTime()) / DAG_MS + 1) / 7)
  return { jaar, week }
}

/** "week 43" voor de zaterdag van een speelweekend. */
export function weekLabel(zaterdag: string): string {
  return `week ${isoWeek(zaterdag).week}`
}

/**
 * [start, einde) van een speelweekend, voor de query: de hele speelweek van maandag 0 u tot de
 * maandag erna (Belgische tijd). Een wedstrijd op een weekdag (vrijdagavond) hoort bij het weekend
 * dat erop volgt, precies zoals `zaterdagVan` en de kalender rekenen. Middernacht van maandag, niet
 * "zondag + 24 u": de zondag van de wintertijdwissel duurt 25 uur.
 */
export function weekendGrenzen(zaterdag: string): { start: string; einde: string } {
  return { start: brusselsMidnightUtc(shiftDateStr(zaterdag, -5)).toISOString(), einde: brusselsMidnightUtc(shiftDateStr(zaterdag, 2)).toISOString() }
}

/** Het aantal kalenderdagen tussen twee zaterdagen (positief = later). */
export function dagenTussen(vanZaterdag: string, naarZaterdag: string): number {
  const [a, b] = [vanZaterdag, naarZaterdag].map((s) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  })
  return Math.round((b - a) / DAG_MS)
}

/**
 * Eén aftrap (ISO-instant) een aantal dagen verschuiven met behoud van het Belgische aftrapuur.
 * Over een zomer-/wintertijdgrens heen blijft "14.30 u" dus 14.30 u; het UTC-instant verschuift mee.
 */
export function verschuifAftrap(iso: string, dagen: number): string {
  const p = brusselsParts(new Date(iso))
  const dagStr = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  const nieuw = shiftDateStr(dagStr, dagen)
  const [y, m, d] = nieuw.split('-').map(Number)
  return brusselsWallUtc(y, m, d, p.hour, p.minute).toISOString()
}

export type WeekendWedstrijd = { matchId: number; date: string }

/**
 * De wijzigingen voor een weekendverplaatsing: elke wedstrijd krijgt haar nieuwe aftrap. Een
 * wedstrijd die niet in het bronweekend valt, wordt overgeslagen (bescherming tegen een foute
 * lijst). Geeft ook het aantal dagen terug dat verschoven wordt.
 */
export function weekendVerplaatsing(wedstrijden: WeekendWedstrijd[], vanZaterdag: string, naarZaterdag: string): { dagen: number; wijzigingen: { matchId: number; date: string }[] } {
  const van = zaterdagVan(vanZaterdag)
  const naar = zaterdagVan(naarZaterdag)
  const dagen = dagenTussen(van, naar)
  const wijzigingen = wedstrijden
    .filter((w) => {
      const p = brusselsParts(new Date(w.date))
      const dagStr = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
      return zaterdagVan(dagStr) === van
    })
    .map((w) => ({ matchId: w.matchId, date: verschuifAftrap(w.date, dagen) }))
  return { dagen, wijzigingen }
}

/** Geldige invoer voor de tool: een kalenderdatum "YYYY-MM-DD". */
export function geldigeDatum(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime())
}
