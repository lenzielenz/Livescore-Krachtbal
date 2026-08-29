import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { finishMatch, recordThrow, reopenMatch, resetMatch, startMatch } from '@/lib/match-engine'

// Twee vergissingen die aan de aantekentafel écht gebeuren:
//  1. iemand start een wedstrijd die nog niet bezig was → terugzetten naar 'nog niet gestart';
//  2. iemand drukt op "Einde" terwijl er nog gespeeld wordt → heropenen en gewoon verder doen.
// Plus de beveiliging die het eerste geval helpt voorkomen: twee keer starten kan niet meer.

let payload: Payload

async function maakWedstrijd() {
  const club = await payload.create({
    collection: 'clubs',
    data: { name: `Reset-testclub ${Date.now()}` },
    overrideAccess: true,
  })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('RS Thuis')
  const away = await mk('RS Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `RS speler ${van + i}`, shirtNumber: van + i, team: teamId },
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

const tel = async (collection: 'throws' | 'possessions' | 'match-events', matchId: number) =>
  (await payload.count({ collection, where: { match: { equals: matchId } }, overrideAccess: true })).totalDocs

describe('per ongeluk gestart of beëindigd', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('zet een per ongeluk gestarte wedstrijd terug op nog-niet-gestart', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.6 },
      tapCount: 1,
    })
    expect(await tel('throws', matchId)).toBe(1)

    const state = await resetMatch(payload, matchId)
    expect(state.match.status).toBe('scheduled')
    expect(state.match.currentHalf).toBe(1)
    expect(state.match.clockSeconds).toBe(0)
    expect(state.score).toEqual({ home: 0, away: 0 })
    // Alle afgeleide data is weg: er valt niets meer te herberekenen.
    expect(await tel('throws', matchId)).toBe(0)
    expect(await tel('possessions', matchId)).toBe(0)
    expect(await tel('match-events', matchId)).toBe(0)

    // En ze kan gewoon opnieuw gestart worden alsof er niets gebeurd is.
    const opnieuw = await startMatch(payload, matchId, homeId)
    expect(opnieuw.match.status).toBe('live')
    expect(opnieuw.possession?.side).toBe('home')
  })

  it('weigert een tweede start (dubbele tik maakte vroeger een tweede balbezit)', async () => {
    const { matchId, homeId } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await expect(startMatch(payload, matchId, homeId)).rejects.toThrow(/al gestart/i)
    expect(await tel('possessions', matchId)).toBe(1)
  })

  it('laat na een per ongeluk gedrukt einde gewoon verder aantekenen', async () => {
    const { matchId, homeId, homePlayers, awayPlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.97 },
      tapCount: 1,
    })
    const eind = await finishMatch(payload, matchId)
    expect(eind.match.status).toBe('finished')
    expect(eind.score).toEqual({ home: 1, away: 0 })

    const heropend = await reopenMatch(payload, matchId)
    expect(heropend.match.status).toBe('live')
    // Niets verloren: de score van vóór het eindsignaal staat er nog.
    expect(heropend.score).toEqual({ home: 1, away: 0 })
    // De klok blijft stil tot de aantekenaar ze zelf weer start.
    expect(heropend.match.clockRunning).toBe(false)
    // En het balbezit staat weer open — dít is wat verder aantekenen mogelijk maakt.
    expect(heropend.possession).toBeTruthy()

    const verder = await recordThrow(payload, {
      matchId,
      playerId: awayPlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.03 },
      tapCount: 1,
    })
    expect(verder.state.score).toEqual({ home: 1, away: 1 })
  })

  it('weigert aantekenen zolang de wedstrijd afgelopen is', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await finishMatch(payload, matchId)
    await expect(
      recordThrow(payload, { matchId, playerId: homePlayers[0], type: 'nek', point: { x: 0.5, y: 0.6 }, tapCount: 1 }),
    ).rejects.toThrow(/afgelopen/i)
  })
})
