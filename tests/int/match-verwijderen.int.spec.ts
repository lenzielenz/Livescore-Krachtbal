import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { MATCH_VERPLICHTE_COLLECTIONS } from '@/lib/match-cleanup'

// Een wedstrijd verwijderen — en alles wat eraan hangt.
//
// Waarom dit een eigen test verdient. In Postgres staat elke `match_id` als NOT NULL, mét een
// sleutel die bij het verwijderen van de wedstrijd op NULL wil zetten. Die twee spreken elkaar
// tegen: de database weigert dan de hele verwijdering. Dat gaat goed zolang de afhankelijke rijen
// eerst weg zijn — en dus zolang MATCH_VERPLICHTE_COLLECTIONS volledig is.
//
// Toen `cv-events` erbij kwam is die lijst niet mee aangevuld, en werd elke video-analyse
// onverwijderbaar: wie op het prullenbakje drukte kreeg `Failed query: delete from "matches"` in
// beeld. Lokaal (SQLite) viel dat niet op, want daar staat die sleutel niet zo.

let payload: Payload

describe('MATCH_VERPLICHTE_COLLECTIONS', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('bevat élke collection die verplícht naar een wedstrijd verwijst, en geen enkele optionele', () => {
    // Niet mijn lijst tegen mijn lijst, maar tegen de échte collections: een nieuwe collection met
    // een verplichte match-relatie laat deze test vallen, en dát is precies het moment om te
    // beslissen of ze mee moet verdwijnen. Een optionele relatie (accidents: het
    // verzekeringsdossier) hoort er juist NIET in — de database koppelt die los en het document
    // overleeft zijn wedstrijd, op elk pad.
    const velden = (c: (typeof payload.config.collections)[number]) =>
      c.fields as { name?: string; relationTo?: unknown; required?: boolean }[]
    const verplicht = payload.config.collections
      .filter((c) => velden(c).some((f) => f.name === 'match' && f.relationTo === 'matches' && f.required === true))
      .map((c) => c.slug)
    const optioneel = payload.config.collections
      .filter((c) => velden(c).some((f) => f.name === 'match' && f.relationTo === 'matches' && f.required !== true))
      .map((c) => c.slug)

    expect(verplicht.length).toBeGreaterThan(0)
    const ontbreekt = verplicht.filter((s) => !(MATCH_VERPLICHTE_COLLECTIONS as readonly string[]).includes(s))
    expect(ontbreekt, `deze collections verwijzen verplicht naar een wedstrijd maar worden niet opgeruimd: ${ontbreekt.join(', ')}`).toEqual([])
    // En het spiegelbeeld: wat optioneel verwijst, mag niet stilletjes mee de vuilbak in.
    const teVeel = (MATCH_VERPLICHTE_COLLECTIONS as readonly string[]).filter((s) => (optioneel as string[]).includes(s))
    expect(teVeel, `deze collections verwijzen optioneel en overleven hun wedstrijd; ze horen niet in de opruimlijst: ${teVeel.join(', ')}`).toEqual([])
  })

  it('ruimt de worpen op vóór het balbezit waar ze in zitten', () => {
    // `throws.possession_id` is óók NOT NULL met een sleutel die op NULL wil zetten: balbezit
    // eerst weghalen weigert de database net zo goed. De hook deed dit ooit met een Promise.all
    // — dan hangt het van het toeval af of het goed gaat, en dat gaat maar bij sómmige
    // wedstrijden mis.
    const lijst = MATCH_VERPLICHTE_COLLECTIONS as readonly string[]
    expect(lijst.indexOf('throws')).toBeLessThan(lijst.indexOf('possessions'))
  })

  it('noemt geen collection die niet bestaat', () => {
    // Een tikfout in de lijst is even erg als een gat: `payload.delete` op een onbekende slug
    // gooit, en die fout werd stil weggevangen.
    const bestaande = new Set(payload.config.collections.map((c) => c.slug))
    for (const slug of MATCH_VERPLICHTE_COLLECTIONS) expect(bestaande.has(slug)).toBe(true)
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

    // Rechtstreeks verwijderen, zónder eerst zelf op te ruimen: dit is de weg van het
    // beheerpaneel en van de REST-API. Werkt dit, dan doet de hook op de collection haar werk —
    // en dát is de weg die tot nu toe niet gedekt was.
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
