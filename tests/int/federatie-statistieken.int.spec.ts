// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { federatieStatistieken } from '@/lib/federatie-statistieken'
import { seasonFromDate } from '@/lib/seasons'

// De statistieken tellen wat er is: leden (jeugd, meisjes, jongens), forfaits per club.
let payload: Payload
const STAMP = Date.now()
let club = 0

describe('federatiestatistieken', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    club = Number((await payload.create({ collection: 'clubs', data: { name: `Stat ${STAMP}` }, overrideAccess: true })).id)
    const ander = Number((await payload.create({ collection: 'clubs', data: { name: `Stat ander ${STAMP}` }, overrideAccess: true })).id)
    const ploeg = async (c: number, n: string) =>
      Number((await payload.create({ collection: 'teams', data: { name: `${n} ${STAMP}`, club: c, category: 'senioren', reeks: 'LD' }, overrideAccess: true })).id)
    const a = await ploeg(club, 'Stat A')
    const b = await ploeg(ander, 'Stat B')
    const lid = (naam: string, geslacht: 'm' | 'v', birthDate: string, extra: Record<string, unknown> = {}) =>
      payload.create({ collection: 'players', data: { name: naam, team: a, shirtNumber: 1, geslacht, birthDate, ...extra }, overrideAccess: true })
    await lid('Meisje jeugd', 'v', '2014-03-01')
    await lid('Dame', 'v', '1995-03-01', { vergunningsstatus: 'geldig', medischAttest: true })
    await lid('Heer', 'm', '1990-03-01', { soortLid: 'lid' })
    const m = await payload.create({
      collection: 'matches',
      data: { homeTeam: a, awayTeam: b, reeks: 'LD', date: new Date().toISOString(), seizoen: seasonFromDate(new Date()), status: 'finished', goalAreaDepth: 10 },
      overrideAccess: true,
    })
    await payload.create({ collection: 'matchsheets', data: { match: m.id, status: 'concept', forfait: { uitslag: 'thuis' } }, overrideAccess: true })
  }, 90_000)

  it('telt per club: leden, jeugd, meisjes, jongens, spelers, forfaits', async () => {
    const s = await federatieStatistieken(payload)
    const c = s.clubs.find((x) => x.id === club)!
    expect(c).toMatchObject({ ploegen: 1, leden: 3, spelers: 2, speelgerechtigd: 1, jeugd: 1, meisjes: 2, jongens: 1, forfaits: 1 })
    expect(s.leden.totaal).toBeGreaterThanOrEqual(3)
    expect(s.wedstrijden.forfaits).toBeGreaterThanOrEqual(1)
  })
})
