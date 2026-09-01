import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { ontdubbelWedstrijden } from '@/lib/match-duplicates'
import { ImportLooptAlError, runSeasonImport } from '@/lib/season-import-run'

// Een speelkalender die dubbel in de agenda staat.
//
// Wat er gebeurde: het volledige speelplan (2400 wedstrijden) werd ingeladen met "vervang alles",
// en achteraf stond élke wedstrijd twee keer op het bord. Het bestand zelf was onschuldig —
// nagerekend: 2572 rijen, 2572 unieke wedstrijden, geen enkele dubbel. Twee imports die elkaar
// overlapten dus: zo'n import duurt minuten, en wie in die tijd niets ziet gebeuren drukt
// opnieuw.
//
// Twee dingen horen daaruit te volgen, en die staan hier vast: een tweede import kan er niet
// meer naast lopen, en wat er al dubbel in staat, moet er weer uit kunnen.

let payload: Payload

const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`

/** Twee wedstrijden tussen dezelfde ploegen, op twee speeldagen. */
const kalender = (thuis: string, uit: string) => [
  ['Datum', 'Uur', 'Reeks', 'Thuisploeg', 'Bezoekers'],
  ['13/09/2026', '14:00', '1NAH', thuis, uit],
  ['20/09/2026', '14:00', '1NAH', uit, thuis],
]

async function wedstrijdenVan(naam: string) {
  const teams = await payload.find({
    collection: 'teams', where: { name: { equals: naam } }, depth: 0, limit: 5, overrideAccess: true,
  })
  const ids = teams.docs.map((t) => t.id as number)
  if (ids.length === 0) return []
  const res = await payload.find({
    collection: 'matches',
    where: { or: [{ homeTeam: { in: ids } }, { awayTeam: { in: ids } }] },
    sort: 'id', depth: 0, limit: 100, overrideAccess: true,
  })
  return res.docs
}

describe('een dubbel ingeladen speelplan', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('laat geen tweede import naast een lopende toe', async () => {
    // De grendel zit in het proces dat schrijft, niet in de knop: een tweede aanvraag komt van
    // een andere pagina, een herhaalde POST of een ongeduldige tik — die kent de eerste niet.
    const s = stamp()
    const thuis = `Thuis ${s}`
    const uit = `Uit ${s}`
    const eerste = runSeasonImport(payload, kalender(thuis, uit), { commit: true })
    const tweede = runSeasonImport(payload, kalender(thuis, uit), { commit: true })
      .then(() => null, (e: Error) => e)

    await eerste
    const fout = await tweede
    expect(fout).toBeInstanceOf(ImportLooptAlError)
    expect((fout as Error).message).toMatch(/dubbel/i)

    // En het resultaat is wat het hoort te zijn: twee wedstrijden, niet vier.
    expect(await wedstrijdenVan(thuis)).toHaveLength(2)
  }, 60_000)

  it('telt dezelfde rij maar één keer, ook als ze twee keer in het bestand staat', async () => {
    // Deze kant was al in orde (planSeason herleidt zulke rijen tot één) — vandaar dat het
    // bestand níét de oorzaak was. Wat ontbrak, is dat het gezégd wordt: dertig dubbele rijen
    // horen als getal in de samenvatting te staan, niet verstopt in de foutenlijst.
    const s = stamp()
    const thuis = `Thuis ${s}`
    const uit = `Uit ${s}`
    const rijen = kalender(thuis, uit)
    const metDubbel = [...rijen, rijen[1]] // dezelfde wedstrijd nog eens
    const r = await runSeasonImport(payload, metDubbel, { commit: true })
    expect(r.dubbelInBestand).toBe(1)
    expect(r.aangemaakt?.wedstrijden).toBe(2)
    expect(await wedstrijdenVan(thuis)).toHaveLength(2)
  }, 60_000)

  it('ruimt bestaande dubbels op en houdt de gespeelde wedstrijd', async () => {
    const s = stamp()
    const thuis = `Thuis ${s}`
    const uit = `Uit ${s}`
    await runSeasonImport(payload, kalender(thuis, uit), { commit: true })
    const na1 = await wedstrijdenVan(thuis)
    expect(na1).toHaveLength(2)

    // Nu met de hand een dubbel maken, zoals de tweede import er een maakte: zelfde reeks,
    // zelfde dag, zelfde ploegen — een ander uur.
    const origineel = na1[0]
    const kopie = await payload.create({
      collection: 'matches',
      data: {
        reeks: origineel.reeks,
        homeTeam: origineel.homeTeam,
        awayTeam: origineel.awayTeam,
        date: new Date(new Date(String(origineel.date)).getTime() + 3600_000).toISOString(),
        status: 'scheduled',
        goalAreaDepth: 10,
      },
      overrideAccess: true,
    })
    // En de originele is degene waar al aan gewerkt is.
    await payload.update({
      collection: 'matches', id: origineel.id, data: { status: 'finished' }, overrideAccess: true,
    })
    expect(await wedstrijdenVan(thuis)).toHaveLength(3)

    const proef = await ontdubbelWedstrijden(payload, { commit: false })
    expect(proef.overtollig).toBeGreaterThanOrEqual(1)

    const echt = await ontdubbelWedstrijden(payload, { commit: true })
    expect(echt.verwijderd).toBeGreaterThanOrEqual(1)

    const over = await wedstrijdenVan(thuis)
    expect(over).toHaveLength(2)
    // De gespeelde staat er nog, de lege kopie niet: nooit data weggooien om een importfout op
    // te ruimen.
    expect(over.map((m) => m.id)).toContain(origineel.id)
    expect(over.map((m) => m.id)).not.toContain(kopie.id)
  }, 90_000)
})
