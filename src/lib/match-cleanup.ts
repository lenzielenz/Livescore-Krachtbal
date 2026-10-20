import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'

// Wat er mee moet als een wedstrijd verdwijnt.
//
// Deze lijst is niet vrijblijvend, en dat is niet vanzelfsprekend. In Postgres staat elke
// `match_id` hieronder als NOT NULL mét een sleutel die bij het verwijderen op NULL wil zetten.
// Die twee spreken elkaar tegen: vergeet je hier één collection, dan botst de database op haar
// eigen NOT NULL en weigert ze de héle verwijdering — met een onleesbare
// `Failed query: delete from "matches"` in het scherm van wie op het prullenbakje drukte.
// Precies dat gebeurde toen `cv-events` erbij kwam en hier niet: elke video-analyse werd
// onverwijderbaar. `tests/int/match-verwijderen` bewaakt de volledigheid nu tegen de échte
// collections, niet tegen deze lijst zelf.
//
// DE VOLGORDE IS ECHT. `throws.possession_id` is óók NOT NULL met dezelfde sleutel, dus balbezit
// verwijderen vóór de worpen erin, weigert de database net zo goed. Worpen dus eerst — en één
// voor één, niet parallel: wie deze lijst in een `Promise.all` gooit, laat de volgorde aan het
// toeval over en krijgt een fout die zich maar bij sommige wedstrijden voordoet.
export const MATCH_VERPLICHTE_COLLECTIONS = [
  'throws',
  'possessions',
  'match-events',
  'matchsheets',
  'processed-ops',
  'match-instants',
  'match-mvp-votes',
  'cv-events',
  'analyse-notities',
  'afgelastingen',
  'aftrap-wijzigingen',
] as const satisfies readonly CollectionSlug[]

// Wat hier bewust NIET in staat: `accidents`. Dat is als enige nullable — een
// verzekeringsdossier overleeft zijn wedstrijd met opzet, op élk pad (beheerpaneel, de knop in
// de app én de seizoensvervanging): de database koppelt de verwijzing los en het dossier blijft.
// Een medisch dossier verdwijnt nooit als neveneffect van een opruimactie.

/**
 * De kinderen van één wedstrijd verwijderen, in de juiste volgorde.
 *
 * Gebruikt door de `beforeDelete`-hook op Matches, zodat élke weg naar het verwijderen hier
 * langskomt: het beheerpaneel, de REST-API en de knop in de app. Eén lijst op één plek is het
 * verschil tussen "werkt overal" en "werkt in de app maar niet in /admin" — precies de val waar
 * dit project al in getrapt is.
 *
 * Fouten worden hier niet weggeslikt: gaat er iets mis, dan hoort de verwijdering te mislukken
 * mét die fout, in plaats van door te lopen tot de database iets onleesbaars zegt.
 */
export async function verwijderMatchKinderen(
  payload: Payload,
  matchId: number | string,
  req?: PayloadRequest,
): Promise<void> {
  const where = { match: { equals: matchId } }
  // De foto's van een afgelasting hangen (NOT NULL) aan de afgelasting, niet aan de wedstrijd: eerst weg.
  const afgelastingen = await payload.find({ collection: 'afgelastingen', where, depth: 0, limit: 100, req, overrideAccess: true })
  if (afgelastingen.docs.length) {
    await payload.delete({ collection: 'afgelasting-fotos', where: { afgelasting: { in: afgelastingen.docs.map((a) => a.id) } }, req, overrideAccess: true })
  }
  for (const collection of MATCH_VERPLICHTE_COLLECTIONS) {
    await payload.delete({ collection, where, req, overrideAccess: true })
  }
}

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
    for (const collection of MATCH_VERPLICHTE_COLLECTIONS) {
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
