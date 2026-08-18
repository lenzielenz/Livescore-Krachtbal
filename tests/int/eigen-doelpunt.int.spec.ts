import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { recordThrow, startMatch } from '@/lib/match-engine'

// Reglement §6.6: een bal die in het EIGEN doelgebied aan de grond komt, is een doelpunt voor de
// tegenpartij. Dat werd voordien als 'in_field' afgedaan — het punt ging dus verloren.

let payload: Payload

async function maakWedstrijd() {
  const club = await payload.create({ collection: 'clubs', data: { name: `EigenDoelpunt-testclub ${Date.now()}` }, overrideAccess: true })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('ED Thuis')
  const away = await mk('ED Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `ED speler ${van + i}`, shirtNumber: van + i, team: teamId },
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

describe('eigen doelpunt (§6.6)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('levert de tegenpartij een punt op en geeft de bal terug aan de ploeg die het maakte', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)

    // Thuis valt in helft 1 aan richting y=1; y=0.03 ligt dus in het EIGEN doelgebied.
    const res = await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'rug',
      point: { x: 0.5, y: 0.03 },
      tapCount: 1,
    })

    expect(res.outcome).toBe('own_goal')
    expect(res.points).toBe(0)
    expect(res.opponentPoints).toBe(1)
    // Een rugworp in eigen doel telt enkelvoudig — de dubbeltelling beloont de scorende ploeg.
    expect(res.state.score).toEqual({ home: 0, away: 1 })

    // De ploeg die het eigen doelpunt maakte, zet zelf opnieuw op vanaf haar vrijeworplijn.
    expect(res.state.possession?.side).toBe('home')
    expect(res.state.possession?.setupSide).toBe('own')
    expect(res.state.possession?.setupY).toBeCloseTo(14 / 46, 3)
  })

  it('een vangst in het eigen doelgebied blijft een gewone vangst', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    const res = await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.03 },
      tapCount: 2,
    })
    expect(res.outcome).toBe('caught')
    expect(res.state.score).toEqual({ home: 0, away: 0 })
    expect(res.state.possession?.side).toBe('away')
  })
})
