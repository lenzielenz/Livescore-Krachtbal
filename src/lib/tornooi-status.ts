import type { Payload } from 'payload'

// Weergavestatus van een tornooi voor de hub- en groepskaarten. Het interne status-veld zegt
// enkel actief ('live') of afgesloten ('finished') — maar voor supporters is een tornooi pas
// "bezig" zodra er écht gespeeld wordt. Daarvoor kijken we naar de wedstrijden zelf.

/** Tornooien waarin al écht gespeeld is: een wedstrijd live of afgewerkt (bye's tellen niet). */
export async function gestarteTornooien(payload: Payload, ids: number[]): Promise<Set<number>> {
  const uit = new Set<number>()
  if (ids.length === 0) return uit
  const res = await payload
    .find({
      collection: 'tournament-matches',
      where: { and: [{ tournament: { in: ids } }, { status: { not_equals: 'pending' } }] },
      depth: 0,
      limit: 1000,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  for (const m of res.docs as { tournament?: number | { id: number }; status?: string; home?: string | null; away?: string | null }[]) {
    // Een bye is "finished" zonder twee ploegen — dat is loting, geen gespeelde wedstrijd.
    if (m.status === 'finished' && (!m.home || !m.away)) continue
    const tid = typeof m.tournament === 'object' ? m.tournament?.id : m.tournament
    if (tid != null) uit.add(Number(tid))
  }
  return uit
}

/** Badge voor de kaarten: AFGELOPEN · BEZIG (er wordt gespeeld) · NOG NIET GESTART. */
export function tornooiBadge(status: unknown, gestart: boolean): { label: string; cls: string } {
  if (status === 'finished') return { label: 'AFGELOPEN', cls: 'finished' }
  return gestart ? { label: 'BEZIG', cls: 'live' } : { label: 'NOG NIET GESTART', cls: 'pending' }
}
