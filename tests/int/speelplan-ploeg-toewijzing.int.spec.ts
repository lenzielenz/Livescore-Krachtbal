import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { runSeasonImport } from '@/lib/season-import-run'

// De KBC St. Michiels-bug: een tweede/latere import met een net iets andere schrijfwijze van
// dezelfde ploeg maakte in stilte een tweede, lege ploeg aan (geen speelkalender, dubbel in de
// rangschikking). Deze test zet vast dat de gebruiker dat nu vóór het importeren kan sturen: een
// niet-herkende naam koppelen aan de bestaande ploeg, in plaats van standaard een nieuwe aan te
// maken.

let payload: Payload

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`

async function teamsVan(naam: string) {
  const res = await payload.find({
    collection: 'teams', where: { name: { equals: naam } }, depth: 0, limit: 5, overrideAccess: true,
  })
  return res.docs
}

async function wedstrijdenVan(teamId: number) {
  const res = await payload.find({
    collection: 'matches',
    where: { or: [{ homeTeam: { equals: teamId } }, { awayTeam: { equals: teamId } }] },
    sort: 'id', depth: 0, limit: 100, overrideAccess: true,
  })
  return res.docs
}

describe('ploeg-toewijzing bij een niet-herkende naam', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('maakt standaard een nieuwe (dubbele) ploeg aan zonder toewijzing', async () => {
    const s = stamp()
    const origineel = `KBC St. Michiels ${s}`
    const varianten = `KBC Sint Michiels ${s}` // "Sint" i.p.v. "St.": net genoeg om de exacte match te missen
    const tegenstander = `Tegenstander ${s}`

    await runSeasonImport(
      payload,
      [
        ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
        ['13/09/2026', '14:00', '1NAH', origineel, tegenstander],
      ],
      { commit: true },
    )
    expect(await teamsVan(origineel)).toHaveLength(1)

    const proef = await runSeasonImport(
      payload,
      [
        ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
        ['20/09/2026', '14:00', '1NAH', varianten, tegenstander],
      ],
      { commit: false },
    )
    // Zonder toewijzing wordt de andere schrijfwijze als nieuwe ploeg voorgesteld — dat is precies
    // het gedrag dat de duplicaten veroorzaakte, en de reden dat de gebruiker hier moet kunnen
    // ingrijpen.
    expect(proef.nieuwePloegen.map((p) => p.naam)).toContain(varianten)
    expect(proef.gekoppeldePloegen).toHaveLength(0)
  }, 60_000)

  it('koppelt aan de bestaande ploeg wanneer de gebruiker dat kiest, zonder duplicaat', async () => {
    const s = stamp()
    const origineel = `KBC St. Michiels ${s}`
    const varianten = `KBC Sint Michiels ${s}`
    const tegenstander = `Tegenstander ${s}`

    await runSeasonImport(
      payload,
      [
        ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
        ['13/09/2026', '14:00', '1NAH', origineel, tegenstander],
      ],
      { commit: true },
    )
    const bestaand = (await teamsVan(origineel))[0]
    expect(bestaand).toBeTruthy()

    const planSleutel = `${varianten.toLowerCase().replace(/[^a-z0-9]/g, '')}|1NAH`

    const proef = await runSeasonImport(
      payload,
      [
        ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
        ['20/09/2026', '14:00', '1NAH', varianten, tegenstander],
      ],
      { commit: false, teamMappings: { [planSleutel]: { actie: 'bestaand', teamId: bestaand.id as number } } },
    )
    expect(proef.nieuwePloegen).toHaveLength(0)
    expect(proef.gekoppeldePloegen).toHaveLength(1)
    expect(proef.gekoppeldePloegen[0]).toMatchObject({
      bestandNaam: varianten,
      teamId: bestaand.id,
      teamNaam: origineel,
      reeks: '1NAH',
      wedstrijden: 1,
    })

    const echt = await runSeasonImport(
      payload,
      [
        ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
        ['20/09/2026', '14:00', '1NAH', varianten, tegenstander],
      ],
      { commit: true, teamMappings: { [planSleutel]: { actie: 'bestaand', teamId: bestaand.id as number } } },
    )
    expect(echt.aangemaakt?.ploegen).toBe(0) // geen nieuwe ploeg — enkel de tegenstander bestond al niet, telt niet mee hier
    expect(await teamsVan(varianten)).toHaveLength(0) // geen duplicaat aangemaakt

    // Beide wedstrijden staan nu op de bestaande ploeg.
    const wedstrijden = await wedstrijdenVan(bestaand.id as number)
    expect(wedstrijden).toHaveLength(2)
  }, 60_000)

  it('maakt een echt nieuwe ploeg aan onder een eigen naam wanneer gekozen', async () => {
    const s = stamp()
    const ruweNaam = `Onbekende Ploeg ${s}`
    const eigenNaam = `Officiële Naam ${s}`
    const tegenstander = `Tegenstander ${s}`
    const planSleutel = `${ruweNaam.toLowerCase().replace(/[^a-z0-9]/g, '')}|1NAH`

    const echt = await runSeasonImport(
      payload,
      [
        ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
        ['13/09/2026', '14:00', '1NAH', ruweNaam, tegenstander],
      ],
      { commit: true, teamMappings: { [planSleutel]: { actie: 'nieuw', naam: eigenNaam } } },
    )
    expect(echt.aangemaakt?.ploegen).toBe(2) // eigenNaam + tegenstander

    const nieuw = await teamsVan(eigenNaam)
    expect(nieuw).toHaveLength(1)
    expect(await teamsVan(ruweNaam)).toHaveLength(0)

    // De wedstrijd zelf moet nog steeds gevonden worden via de ruwe bestandsnaam.
    const wedstrijden = await wedstrijdenVan(nieuw[0].id as number)
    expect(wedstrijden).toHaveLength(1)
  }, 60_000)
})
