import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { runSeasonImport } from '@/lib/season-import-run'

// Het aanvangsuur van een geïmporteerde speelkalender.
//
// De aanleiding: een volledige kalender kwam binnen met kloppende datums, ploegen en reeksen —
// maar élke wedstrijd op 00:00. Excel schrijft een uurcel weg als "14:00:00", en die vorm werd
// afgekeurd. Er werd niets over gezegd, dus zag de import er geslaagd uit.
//
// Het lastigste deel is niet de parser maar de wég terug: de dedupe-sleutel kijkt bewust enkel
// naar de dag, dus hetzelfde bestand opnieuw doorsturen sloeg élke wedstrijd over als "bestaat
// al" — en dan bleef die kalender voorgoed op middernacht staan.

let payload: Payload

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`

/** Een kalenderbestand met twee wedstrijden, met het uur in de vorm die je meegeeft. */
const kalender = (thuis: string, uit: string, uur: string) => [
  ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
  ['13/09/2026', uur, '1NAH', thuis, uit],
  ['20/09/2026', uur, '1NAH', uit, thuis],
]

async function uurVan(matchId: number): Promise<string> {
  const m = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 })
  return String(m.date)
}

/** De twee wedstrijden van deze proef, op ploeg-id gezocht en op datum gesorteerd.
 *
 *  Niet op seizoen filteren: de testdatabase draagt duizenden wedstrijden mee uit andere proeven,
 *  en dan valt de jouwe buiten de eerste bladzijde. */
async function wedstrijdenVan(thuisNaam: string): Promise<{ id: number; date: string }[]> {
  const teams = await payload.find({
    collection: 'teams', where: { name: { equals: thuisNaam } }, depth: 0, limit: 5, overrideAccess: true,
  })
  const ids = teams.docs.map((t) => t.id as number)
  const res = await payload.find({
    collection: 'matches',
    where: { or: [{ homeTeam: { in: ids } }, { awayTeam: { in: ids } }] },
    sort: 'date', depth: 0, limit: 50, overrideAccess: true,
  })
  return res.docs.map((m) => ({ id: m.id as number, date: String(m.date) }))
}

describe('speelkalender importeren met een aanvangsuur', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('zet het uur uit een Excel-export op de wedstrijd', async () => {
    const s = stamp()
    const r = await runSeasonImport(payload, kalender(`Thuis ${s}`, `Uit ${s}`, '14:00:00'), { commit: true })
    expect(r.aangemaakt?.wedstrijden).toBe(2)
    expect(r.uurWaarschuwing).toBeNull()

    const onze = await wedstrijdenVan(`Thuis ${s}`)
    expect(onze).toHaveLength(2)
    // September is zomertijd: 14:00 Belgische tijd = 12:00 UTC.
    expect(onze[0].date).toBe('2026-09-13T12:00:00.000Z')
    expect(onze[1].date).toBe('2026-09-20T12:00:00.000Z')
  }, 60_000)

  it('zet een kalender die op 00:00 staat alsnog recht bij een tweede import', async () => {
    // Precies de situatie waar dit uit voortkomt: eerst binnengekomen zonder leesbaar uur …
    const s = stamp()
    const thuis = `Thuis ${s}`
    const uit = `Uit ${s}`
    const eerste = await runSeasonImport(payload, kalender(thuis, uit, 'namiddag'), { commit: true })
    expect(eerste.aangemaakt?.wedstrijden).toBe(2)
    expect(eerste.uurWaarschuwing).toMatch(/00:00/)

    const onze = await wedstrijdenVan(thuis)
    expect(onze).toHaveLength(2)
    // 00:00 Belgische tijd op 13 september = 22:00 UTC de dag ervoor.
    expect(onze[0].date).toMatch(/T2[23]:00:00/)

    // … en dan hetzelfde bestand nog eens, nu mét een leesbaar uur.
    const proef = await runSeasonImport(payload, kalender(thuis, uit, '14:00:00'), { commit: false })
    expect(proef.nieuweWedstrijden).toBe(0)
    expect(proef.teCorrigerenUren).toBe(2)

    const tweede = await runSeasonImport(payload, kalender(thuis, uit, '14:00:00'), { commit: true })
    expect(tweede.nieuweWedstrijden).toBe(0)
    expect(tweede.bijgewerkteUren).toBe(2)

    const na = await wedstrijdenVan(thuis)
    expect(na).toHaveLength(2) // géén duplicaten
    expect(na[0].date).toBe('2026-09-13T12:00:00.000Z')
    expect(na[1].date).toBe('2026-09-20T12:00:00.000Z')
  }, 60_000)

  it('laat het uur van een gespeelde wedstrijd met rust', async () => {
    // Het aanvangsuur van een gespeelde wedstrijd is geschiedenis; een importbestand hoort dat
    // niet achteraf te verschuiven.
    const s = stamp()
    const thuis = `Thuis ${s}`
    const uit = `Uit ${s}`
    await runSeasonImport(payload, kalender(thuis, uit, 'namiddag'), { commit: true })
    const onze = await wedstrijdenVan(thuis)
    const gespeeld = onze[0].id
    await payload.update({ collection: 'matches', id: gespeeld, data: { status: 'finished' }, overrideAccess: true })
    const voor = await uurVan(gespeeld)

    const r = await runSeasonImport(payload, kalender(thuis, uit, '14:00:00'), { commit: true })
    expect(r.bijgewerkteUren).toBe(1) // enkel de andere, die nog gespeeld moet worden
    expect(await uurVan(gespeeld)).toBe(voor)
  }, 60_000)
})
