import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { brusselsParts, brusselsWallUtc } from './datetime'

// Live-pronostiek: per speelweekend mag elke deelnemer maar een beperkt aantal wedstrijden
// voorspellen. Zo blijft het globale competitieklassement eerlijk (iedereen evenveel kansen).
export const LIVE_PRONOSTIEK_MAX_PER_WEEKEND = Number(process.env.PRONOSTIEK_MAX_PER_WEEKEND) || 3

// De speelweek start élke maandagochtend om 08:00 (Belgische tijd): vanaf dan kan je opnieuw
// pronostiekeren voor de komende wedstrijden. Een wedstrijd op maandag vóór 08:00 hoort dus nog
// bij het vórige weekend.
export const WEEKEND_RESET_HOUR = 8

/** Het speelweek-venster (maandag 08:00 → volgende maandag 08:00, Belgische tijd) waarin een datum valt. */
export function weekendRange(dateIso: string): { startIso: string; endIso: string } {
  const at = new Date(dateIso)
  const p = brusselsParts(at)
  // Aantal dagen terug tot maandag; maandag vóór de reset (08:00) telt nog bij het vorige weekend.
  let back = p.weekdayMon0
  if (p.weekdayMon0 === 0 && p.hour < WEEKEND_RESET_HOUR) back = 7
  // Kalenderdatum van die maandag (zuiver datum-rekenwerk → geen DST-gedoe).
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day) - back * 86_400_000)
  const start = brusselsWallUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), WEEKEND_RESET_HOUR)
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000)
  const end = brusselsWallUtc(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), WEEKEND_RESET_HOUR)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

/** Hoeveel wedstrijden deze gebruiker dit weekend al voorspelde (optioneel één match uitsluiten). */
export async function countUserWeekendPredictions(
  payload: Payload,
  userId: number,
  dateIso: string,
  excludeMatchId?: number,
): Promise<number> {
  const { startIso, endIso } = weekendRange(dateIso)
  const res = await payload
    .find({
      collection: 'matches',
      where: { and: [{ date: { greater_than_equal: startIso } }, { date: { less_than: endIso } }, competitionWhere()] },
      depth: 0,
      limit: 500,
      select: { scorePredictions: true, date: true },
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  let n = 0
  for (const m of res.docs) {
    if (excludeMatchId != null && Number((m as { id: number }).id) === excludeMatchId) continue
    const ps = Array.isArray((m as { scorePredictions?: unknown }).scorePredictions) ? ((m as { scorePredictions: { userId?: unknown }[] }).scorePredictions) : []
    if (ps.some((p) => rel(p?.userId) === userId || Number(p?.userId) === userId)) n += 1
  }
  return n
}
