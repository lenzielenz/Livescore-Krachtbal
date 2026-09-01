import type { Payload, Where } from 'payload'

// Een wedstrijd verwijderen raakt meer dan de `matches`-rij zelf: negen collections hebben een
// `match`-relatie. Eén bron van waarheid, gebruikt door zowel de losse verwijderknop
// (api/matches/manage) als de volledige-seizoensvervanging (season-import-run).
//
// Deze lijst is niet vrijblijvend, en dat is niet vanzelfsprekend. In Postgres staat elke
// `match_id` als NOT NULL mét een sleutel die bij het verwijderen op NULL wil zetten. Vergeet je
// hier één collection, dan botst de database op haar eigen NOT NULL en weigert ze de wedstrijd —
// met een onleesbare `Failed query: delete from "matches"` in het scherm van wie op het
// prullenbakje drukte. Precies dat gebeurde toen `cv-events` erbij kwam en hier niet: elke
// video-analyse werd onverwijderbaar. `tests/unit/match-cleanup` bewaakt dat nu.
export const MATCH_DEPENDENT_COLLECTIONS = [
  'throws',
  'possessions',
  'match-events',
  'matchsheets',
  'accidents',
  'processed-ops',
  'match-instants',
  'match-mvp-votes',
  'cv-events',
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
 *
 * Geeft het aantal wedstrijden terug dat er daarna écht niet meer staat — niet het aantal dat we
 * probeerden te verwijderen. Dat verschil is geen muggenzifterij: hetzelfde gat dat één
 * video-analyse onverwijderbaar maakte (een collection die hier niet opgeruimd werd, waarna de
 * database de wedstrijd weigert) zou hier "247 wedstrijden vervangen" melden terwijl er nul weg
 * waren, en het volledige speelplan er daarna dubbel in staan.
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
  if (!ids.length) return 0
  // Natellen in plaats van geloven.
  let over = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await payload
      .count({ collection: 'matches', where: { id: { in: ids.slice(i, i + CHUNK) } }, overrideAccess: true })
      .catch(() => ({ totalDocs: 0 }))
    over += res.totalDocs
  }
  return ids.length - over
}

/**
 * Wat de gebruiker te lezen krijgt als het misgaat.
 *
 * Een databasefout draagt de mislukte query mee, en die belandde rechtstreeks in een venstertje
 * op de telefoon: `Failed query: delete from "matches" where "matches"."id" = $1`. Daar kan
 * niemand iets mee, en het toont bovendien de binnenkant van de database aan wie ernaar kijkt.
 * De echte fout hoort in de serverlogs; op het scherm hoort te staan wat er aan de hand is.
 */
export function leesbareFout(err: unknown): string {
  const bericht = err instanceof Error ? err.message : String(err ?? '')
  if (/failed query|violates|constraint|syntax error at/i.test(bericht)) {
    return 'De wedstrijd kon niet verwijderd worden: er hangt nog data aan die niet mee opgeruimd is. '
      + 'Dit is een fout van de app — meld ze, ze staat in de serverlogs.'
  }
  return bericht || 'Verwijderen mislukt.'
}
