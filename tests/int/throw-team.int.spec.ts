import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { recordThrow, startMatch } from '@/lib/match-engine'

// De werper moet bij de ploeg horen die aan bal is. Zonder die controle schreef een misklik de
// worp weg onder het team van het balbezit — met een speler van de ándere ploeg erin, waardoor
// alle afgeleide statistiek die speler bij de verkeerde kant rekende.

let payload: Payload

async function maakWedstrijd() {
  const club = await payload.create({ collection: 'clubs', data: { name: `Testclub ${Date.now()}` }, overrideAccess: true })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('Worptest Thuis')
  const away = await mk('Worptest Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `Speler ${van + i}`, shirtNumber: van + i, team: teamId },
        overrideAccess: true,
      })
      uit.push(p.id as number)
    }
    return uit
  }
  const homePlayers = await spelers(home.id as number, 4)
  const awayPlayers = await spelers(away.id as number, 14)
  const match = await payload.create({
    collection: 'matches',
    data: {
      reeks: '1NAH',
      homeTeam: home.id,
      awayTeam: away.id,
      date: new Date().toISOString(),
      status: 'scheduled',
      goalAreaDepth: 10,
      isDemo: true,
      homeLineup: homePlayers,
      awayLineup: awayPlayers,
    },
    overrideAccess: true,
  })
  return { matchId: match.id as number, homeId: home.id as number, homePlayers, awayPlayers }
}

describe('recordThrow — werper hoort bij de ploeg aan bal', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('weigert een speler van de tegenpartij', async () => {
    const { matchId, homeId, homePlayers, awayPlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)

    await expect(
      recordThrow(payload, { matchId, playerId: awayPlayers[0], type: 'nek', tapCount: 1, point: { x: 0.5, y: 0.55 } }),
    ).rejects.toThrow(/hoort niet bij de ploeg/i)

    // De eigen speler mag wél — en er staat daarna precies één worp op de wedstrijd.
    await recordThrow(payload, { matchId, playerId: homePlayers[0], type: 'nek', tapCount: 1, point: { x: 0.5, y: 0.55 } })
    const throwsRes = await payload.find({ collection: 'throws', where: { match: { equals: matchId } }, depth: 0, limit: 10 })
    expect(throwsRes.totalDocs).toBe(1)
  })

  it('weigert een onbekende speler', async () => {
    const { matchId, homeId } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await expect(
      recordThrow(payload, { matchId, playerId: 999_999, type: 'nek', tapCount: 1, point: { x: 0.5, y: 0.55 } }),
    ).rejects.toThrow(/onbekende speler/i)
  })
})
