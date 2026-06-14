import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'

// Live-pronostiek: per speelweekend mag elke deelnemer maar een beperkt aantal wedstrijden
// voorspellen. Zo blijft het globale competitieklassement eerlijk (iedereen evenveel kansen).
export const LIVE_PRONOSTIEK_MAX_PER_WEEKEND = Number(process.env.PRONOSTIEK_MAX_PER_WEEKEND) || 3

/** Het speelweek-venster (maandag 00:00 → volgende maandag) waarin een datum valt. */
export function weekendRange(dateIso: string): { startIso: string; endIso: string } {
  const d = new Date(dateIso)
  const dow = (d.getDay() + 6) % 7 // 0 = maandag
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  start.setDate(d.getDate() - dow)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
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
