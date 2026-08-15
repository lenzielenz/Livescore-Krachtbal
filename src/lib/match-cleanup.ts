import type { Payload, Where } from 'payload'

// Een wedstrijd verwijderen raakt meer dan de `matches`-rij zelf: acht collections hebben een
// `match`-relatie en worden anders wees-records. Eén bron van waarheid, gebruikt door zowel de
// losse verwijderknop (api/matches/manage) als de volledige-seizoensvervanging (season-import-run).
export const MATCH_DEPENDENT_COLLECTIONS = [
  'throws',
  'possessions',
  'match-events',
  'matchsheets',
  'accidents',
  'processed-ops',
  'match-instants',
  'match-mvp-votes',
] as const

/** Hoeveel wedstrijden voldoen aan `where`? Voor de proefronde vóór een bulk-verwijdering. */
export async function countMatches(payload: Payload, where: Where): Promise<number> {
  const res = await payload.count({ collection: 'matches', where, overrideAccess: true }).catch(() => ({ totalDocs: 0 }))
  return res.totalDocs
}

/**
 * Verwijder alle wedstrijden die aan `where` voldoen, met al hun afhankelijke data (worpen,
 * balbezit, wedstrijdblad, worpstatistieken …). In blokken van 500 id's, zodat een grote
 * IN-clausule (bv. bij duizenden historische wedstrijden) de database niet overbelast.
 * Geeft het aantal verwijderde wedstrijden terug.
 */
export async function deleteMatchesCascade(payload: Payload, where: Where): Promise<number> {
  const ids: number[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({ collection: 'matches', where, depth: 0, limit: 500, page, overrideAccess: true })
    for (const d of res.docs) ids.push(d.id as number)
    if (!res.hasNextPage) break
    page += 1
  }
  const CHUNK = 500
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    for (const collection of MATCH_DEPENDENT_COLLECTIONS) {
      await payload.delete({ collection, where: { match: { in: chunk } }, overrideAccess: true }).catch(() => {})
    }
    await payload.delete({ collection: 'matches', where: { id: { in: chunk } }, overrideAccess: true }).catch(() => {})
  }
  return ids.length
}
