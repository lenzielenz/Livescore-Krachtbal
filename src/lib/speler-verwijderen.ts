import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'

// Een speler verwijderen: wat mag mee, en wat mag het tegenhouden.
//
// Ook hier staat elke `player_id` als NOT NULL met een sleutel die bij het verwijderen op NULL
// wil zetten — dezelfde tegenspraak die een video-analyse onverwijderbaar maakte. Alleen is het
// antwoord hier een ánder: bij een wedstrijd hoort de bijhorende data mee te verdwijnen, bij een
// speler absoluut niet.
//
// Een worp is onwijzigbaar en is de bron van de score. Wie een speler verwijdert en zijn worpen
// mee weggooit, verandert de uitslag van een gespeelde wedstrijd — precies wat het hele platform
// niet mag doen. Vandaar: worpen, sancties en wedstrijdbladen HOUDEN de verwijdering tegen, met
// een uitleg waar iemand iets mee kan. Wat wél meegaat is wat enkel van deze speler is en nergens
// een verslag van maakt: zijn trainingsmetingen en de stemmen die op hem werden uitgebracht.
//
// Zonder deze bewaker weigerde de database het ook — maar dan met
// `Failed query: delete from "players"` op het scherm, en zonder te zeggen wat eraan hing.

type Blokkade = {
  collection: CollectionSlug
  where: (id: number | string) => Where
  wat: string
  meervoud: string
}

/** Wat een speler vasthoudt aan het wedstrijdverslag, met een naam die iets zegt. */
const BLOKKEERT: Blokkade[] = [
  { collection: 'throws', where: (id: number | string) => ({ player: { equals: id } }), wat: 'worp', meervoud: 'worpen' },
  { collection: 'sanctions', where: (id: number | string) => ({ player: { equals: id } }), wat: 'sanctie', meervoud: 'sancties' },
  {
    collection: 'matchsheets',
    where: (id: number | string) => ({
      or: [{ 'homeLineup.player': { equals: id } }, { 'awayLineup.player': { equals: id } }] as Where[],
    }),
    wat: 'wedstrijdblad', meervoud: 'wedstrijdbladen',
  },
]

/** Wat enkel van deze speler is en met hem mee verdwijnt. */
const GAAT_MEE: { collection: CollectionSlug; veld: string }[] = [
  { collection: 'trainingmetingen', veld: 'speler' },
  { collection: 'match-mvp-votes', veld: 'player' },
]

/** Het aantal, in woorden die kloppen: "1 worp" en "4 worpen". */
export function telWoord(aantal: number, enkelvoud: string, meervoud: string): string {
  return `${aantal} ${aantal === 1 ? enkelvoud : meervoud}`
}

/** De zin die de gebruiker te zien krijgt als de speler niet weg kan. */
export function weigerBericht(naam: string, delen: string[]): string {
  return `${naam || 'Deze speler'} staat in ${delen.join(' en ')}. `
    + 'Die horen bij het verslag van een gespeelde wedstrijd en mogen niet mee verdwijnen — '
    + 'anders verandert achteraf de uitslag. Zet de speler op non-actief, of verwijder eerst die '
    + 'wedstrijden.'
}

/**
 * Loopt vóór het verwijderen van een speler. Gooit met een leesbare uitleg als het niet kan.
 */
export async function bewaakSpelerVerwijderen(
  payload: Payload,
  spelerId: number | string,
  naam: string,
  req?: PayloadRequest,
): Promise<void> {
  const delen: string[] = []
  for (const blok of BLOKKEERT) {
    const res = await payload
      .count({ collection: blok.collection, where: blok.where(spelerId), req, overrideAccess: true })
      .catch(() => ({ totalDocs: 0 }))
    if (res.totalDocs > 0) delen.push(telWoord(res.totalDocs, blok.wat, blok.meervoud))
  }
  if (delen.length) throw new Error(weigerBericht(naam, delen))

  for (const mee of GAAT_MEE) {
    await payload.delete({
      collection: mee.collection,
      where: { [mee.veld]: { equals: spelerId } },
      req,
      overrideAccess: true,
    })
  }
}
