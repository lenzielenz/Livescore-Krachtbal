// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'

// Multi-tenant afscherming tussen clubs, door de echte collections en de echte database:
//  - een club ziet en bewerkt enkel de wedstrijdbladen van haar eigen wedstrijden;
//  - de geheime vrijgavecode ziet enkel de federatie;
//  - een club zet geen spelers in een ploeg van een andere club;
//  - medisch attest en doktersverbod zet enkel de federatie;
//  - een club-beheerder leest de gevoelige velden enkel van de eigen leden.

let payload: Payload
const STAMP = Date.now()
const ids = { clubA: 0, clubB: 0, ploegA: 0, ploegB: 0, ploegB2: 0, spelerA: 0, spelerB: 0, matchA: 0, matchB: 0, bladA: 0, bladB: 0 }

const beheerderA = () => ({ id: 999001, roles: ['club-beheerder'], club: ids.clubA, collection: 'users' })
const federatie = { id: 999002, roles: ['federatie'], collection: 'users' }
const supporter = { id: 999003, roles: ['viewer'], collection: 'users' }

describe('afscherming tussen clubs', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const club = async (n: string) => (await payload.create({ collection: 'clubs', data: { name: n }, overrideAccess: true })).id as number
    ids.clubA = await club(`Afscherm A ${STAMP}`)
    ids.clubB = await club(`Afscherm B ${STAMP}`)
    const ploeg = async (n: string, c: number) =>
      (await payload.create({ collection: 'teams', data: { name: n, club: c, category: 'senioren', reeks: 'LH' }, overrideAccess: true })).id as number
    ids.ploegA = await ploeg(`Afscherm A ${STAMP}`, ids.clubA)
    ids.ploegB = await ploeg(`Afscherm B ${STAMP}`, ids.clubB)
    ids.ploegB2 = await ploeg(`Afscherm B2 ${STAMP}`, ids.clubB)
    const speler = async (n: string, t: number) =>
      (await payload.create({ collection: 'players', data: { name: n, team: t, shirtNumber: 1, birthDate: '2000-05-05' }, overrideAccess: true })).id as number
    ids.spelerA = await speler('Speler A', ids.ploegA)
    ids.spelerB = await speler('Speler B', ids.ploegB)
    const match = async (thuis: number, uit: number) =>
      (
        await payload.create({
          collection: 'matches',
          data: { homeTeam: thuis, awayTeam: uit, date: new Date().toISOString(), status: 'scheduled', goalAreaDepth: 10, reeks: 'LH' },
          overrideAccess: true,
        })
      ).id as number
    // Wedstrijd A: club A speelt mee. Wedstrijd B: club A niet (B tegen B2).
    ids.matchA = await match(ids.ploegA, ids.ploegB)
    ids.matchB = await match(ids.ploegB, ids.ploegB2)
    const blad = async (m: number) => (await payload.create({ collection: 'matchsheets', data: { match: m, status: 'concept' }, overrideAccess: true })).id as number
    ids.bladA = await blad(ids.matchA)
    ids.bladB = await blad(ids.matchB)
  }, 90_000)

  it('een club leest enkel de bladen van haar eigen wedstrijden', async () => {
    const res = await payload.find({
      collection: 'matchsheets',
      where: { id: { in: [ids.bladA, ids.bladB] } },
      user: beheerderA(),
      overrideAccess: false,
      depth: 0,
    })
    expect(res.docs.map((d) => d.id)).toEqual([ids.bladA])
  })

  it('een supporter leest geen enkel blad', async () => {
    await expect(
      payload.find({ collection: 'matchsheets', where: { id: { equals: ids.bladA } }, user: supporter, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('de vrijgavecode ziet enkel de federatie', async () => {
    const club = await payload.findByID({ collection: 'matchsheets', id: ids.bladA, user: beheerderA(), overrideAccess: false })
    expect((club as { vrijgaveCode?: unknown }).vrijgaveCode).toBeUndefined()
    const fed = await payload.findByID({ collection: 'matchsheets', id: ids.bladA, user: federatie, overrideAccess: false })
    expect(String((fed as { vrijgaveCode?: unknown }).vrijgaveCode)).toMatch(/^\d{6}$/)
  })

  it('een club bewerkt het blad van een andere wedstrijd niet', async () => {
    await expect(
      payload.update({ collection: 'matchsheets', id: ids.bladB, data: { homeLineup: [] }, user: beheerderA(), overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('een club zet geen speler in een ploeg van een andere club', async () => {
    await expect(
      payload.create({
        collection: 'players',
        data: { name: 'Indringer', team: ids.ploegB, shirtNumber: 9 },
        user: beheerderA(),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({ collection: 'players', id: ids.spelerA, data: { team: ids.ploegB }, user: beheerderA(), overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('een club maakt een eigen speler niet zelf speelgerechtigd', async () => {
    await payload.update({
      collection: 'players',
      id: ids.spelerA,
      data: { medischAttest: true, hogerSpelenVerbod: true, shirtNumber: 7 },
      user: beheerderA(),
      overrideAccess: false,
    })
    const na = await payload.findByID({ collection: 'players', id: ids.spelerA, overrideAccess: true })
    expect(na.shirtNumber).toBe(7)
    expect(Boolean(na.medischAttest)).toBe(false)
    expect(Boolean(na.hogerSpelenVerbod)).toBe(false)
  })

  it('een club-beheerder leest gevoelige velden enkel van eigen leden', async () => {
    const eigen = await payload.findByID({ collection: 'players', id: ids.spelerA, user: beheerderA(), overrideAccess: false })
    const vreemd = await payload.findByID({ collection: 'players', id: ids.spelerB, user: beheerderA(), overrideAccess: false })
    expect(eigen.birthDate).toBeTruthy()
    expect(vreemd.birthDate).toBeUndefined()
  })
})
