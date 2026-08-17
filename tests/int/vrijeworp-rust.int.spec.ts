import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { endHalf, recordThrow, startFreeThrow, startMatch, startNextHalf, buildMatchState } from '@/lib/match-engine'

// Reglement §8: "Na het eindsignaal géén doelpunt meer, BEHALVE een vrije worp die binnen de
// speeltijd werd toegekend." Die vrije worp moet dus na het rustsignaal nog genomen kunnen worden.

let payload: Payload

async function maakWedstrijd() {
  const club = await payload.create({ collection: 'clubs', data: { name: `VW-testclub ${Date.now()}` }, overrideAccess: true })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('VW Thuis')
  const away = await mk('VW Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `VW speler ${van + i}`, shirtNumber: van + i, team: teamId },
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

describe('vrije worp toegekend vóór het rustsignaal (§8)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('blijft na endHalf openstaan en mag nog scoren', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await startFreeThrow(payload, matchId, homeId)

    const naRust = await endHalf(payload, matchId)
    expect(naRust.possession?.freeThrow).toBe(true)
    expect(naRust.possession?.throwsUsed).toBe(0)
    expect(naRust.atHalfTime).toBe(true)

    // De worp wordt alsnog genomen: een vrije worp levert altijd 1 punt op, ook met een rugworp.
    const res = await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'rug',
      point: { x: 0.5, y: 0.97 },
      tapCount: 1,
    })
    expect(res.outcome).toBe('goal')
    expect(res.points).toBe(1)
    expect(res.state.score.home).toBe(1)
  })

  it('sluit een gewoon balbezit wél af bij de rust', async () => {
    const { matchId, homeId } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    const naRust = await endHalf(payload, matchId)
    expect(naRust.possession).toBeNull()
  })

  it('laat geen dubbel balbezit achter als de vrije worp niet meer genomen werd', async () => {
    const { matchId, homeId } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await startFreeThrow(payload, matchId, homeId)
    await endHalf(payload, matchId)
    await startNextHalf(payload, matchId)

    const open = await payload.find({
      collection: 'possessions',
      where: { and: [{ match: { equals: matchId } }, { endOutcome: { exists: false } }] },
      depth: 0,
      limit: 10,
    })
    expect(open.totalDocs).toBe(1)
    const state = await buildMatchState(payload, matchId)
    expect(state.possession?.freeThrow).toBe(false)
    expect(state.match.currentHalf).toBe(2)
  })
})
