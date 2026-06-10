import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { beforeAll, describe, expect, it } from 'vitest'

import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'

let payload: Payload

// De opstellingpagina laadt thuis- en uitkaart tegelijk; beide riepen getOrCreateMatchSheet aan
// en de verliezer van die race kreeg "The following field is invalid: match" (match is uniek op
// het blad) — waardoor de tegenpartij-kaart niet verscheen. Deze test speelt die race na.
describe('getOrCreateMatchSheet race (thuis + uit tegelijk)', () => {
  let matchId: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    const club = await payload.create({ collection: 'clubs', data: { name: `Raceclub ${stamp}` }, overrideAccess: true })
    const team = async (naam: string) =>
      (
        await payload.create({
          collection: 'teams',
          data: { name: naam, club: club.id, category: 'senioren', reeks: 'LH' },
          overrideAccess: true,
        })
      ).id
    const [thuis, uit] = [await team(`Race thuis ${stamp}`), await team(`Race uit ${stamp}`)]
    const match = await payload.create({
      collection: 'matches',
      data: {
        homeTeam: thuis,
        awayTeam: uit,
        date: new Date().toISOString(),
        status: 'scheduled',
        goalAreaDepth: 10,
        reeks: 'LH',
      },
      overrideAccess: true,
    })
    matchId = Number(match.id)
  })

  it('twee gelijktijdige aanroepen leveren allebei hetzelfde blad op (geen validatiefout)', async () => {
    const [a, b] = await Promise.all([
      getOrCreateMatchSheet(payload, matchId),
      getOrCreateMatchSheet(payload, matchId),
    ])
    expect(a.id).toBeDefined()
    expect(b.id).toBe(a.id)
    // En er bestaat maar één blad voor deze wedstrijd.
    const all = await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, limit: 5, depth: 0 })
    expect(all.docs.length).toBe(1)
  })
})
