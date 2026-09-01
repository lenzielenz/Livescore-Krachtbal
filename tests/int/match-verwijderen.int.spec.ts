import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { MATCH_DEPENDENT_COLLECTIONS } from '@/lib/match-cleanup'

// Een wedstrijd verwijderen — en alles wat eraan hangt.
//
// Waarom dit een eigen test verdient. In Postgres staat elke `match_id` als NOT NULL, mét een
// sleutel die bij het verwijderen van de wedstrijd op NULL wil zetten. Die twee spreken elkaar
// tegen: de database weigert dan de hele verwijdering. Dat gaat goed zolang de afhankelijke rijen
// eerst weg zijn — en dus zolang MATCH_DEPENDENT_COLLECTIONS volledig is.
//
// Toen `cv-events` erbij kwam is die lijst niet mee aangevuld, en werd elke video-analyse
// onverwijderbaar: wie op het prullenbakje drukte kreeg `Failed query: delete from "matches"` in
// beeld. Lokaal (SQLite) viel dat niet op, want daar staat die sleutel niet zo.

let payload: Payload

describe('MATCH_DEPENDENT_COLLECTIONS', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('bevat élke collection die naar een wedstrijd verwijst', () => {
    // Niet mijn lijst tegen mijn lijst, maar tegen de échte collections: een nieuwe collection met
    // een match-relatie laat deze test vallen, en dát is precies het moment om te beslissen of ze
    // mee moet verdwijnen met de wedstrijd.
    const verwijzend = payload.config.collections
      .filter((c) =>
        (c.fields as { name?: string; relationTo?: unknown }[]).some(
          (f) => f.name === 'match' && f.relationTo === 'matches',
        ),
      )
      .map((c) => c.slug)

    expect(verwijzend.length).toBeGreaterThan(0)
    const ontbreekt = verwijzend.filter((s) => !(MATCH_DEPENDENT_COLLECTIONS as readonly string[]).includes(s))
    expect(ontbreekt, `deze collections verwijzen naar een wedstrijd maar worden niet opgeruimd: ${ontbreekt.join(', ')}`).toEqual([])
  })

  it('noemt geen collection die niet bestaat', () => {
    // Een tikfout in de lijst is even erg als een gat: `payload.delete` op een onbekende slug
    // gooit, en die fout werd stil weggevangen.
    const bestaande = new Set(payload.config.collections.map((c) => c.slug))
    for (const slug of MATCH_DEPENDENT_COLLECTIONS) expect(bestaande.has(slug)).toBe(true)
  })
})

describe('een analysewedstrijd met videovoorstellen verwijderen', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('ruimt de voorstellen op en verwijdert daarna de wedstrijd', async () => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const club = await payload.create({
      collection: 'clubs',
      data: { name: `Wisclub ${stamp}`, analyseOnly: true },
      overrideAccess: true,
    })
    const team = async (naam: string) =>
      payload.create({
        collection: 'teams',
        data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id, analyseOnly: true },
        overrideAccess: true,
      })
    const home = await team(`Thuis ${stamp}`)
    const away = await team(`Uit ${stamp}`)
    const match = await payload.create({
      collection: 'matches',
      data: {
        reeks: '1NAH', homeTeam: home.id, awayTeam: away.id, date: new Date().toISOString(),
        status: 'scheduled', goalAreaDepth: 10, analyseOnly: true, analyseModus: 'video',
      },
      overrideAccess: true,
    })
    const matchId = match.id as number

    await payload.create({
      collection: 'cv-events',
      data: {
        match: matchId, videoTimeS: 42, eventType: 'worp', confidence: 0.7,
        provenance: { model: 'test-model', modelVersion: '1' },
      },
      overrideAccess: true,
    })

    for (const collection of MATCH_DEPENDENT_COLLECTIONS) {
      await payload.delete({ collection, where: { match: { equals: matchId } }, overrideAccess: true })
    }
    await payload.delete({ collection: 'matches', id: matchId, overrideAccess: true })

    // Weg is weg: geen wedstrijd, en geen voorstel dat naar een verdwenen wedstrijd wijst.
    const weg = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    expect(weg).toBeNull()
    const rest = await payload.find({
      collection: 'cv-events', where: { match: { equals: matchId } }, depth: 0, limit: 1,
    })
    expect(rest.totalDocs).toBe(0)
  }, 30_000)
})
