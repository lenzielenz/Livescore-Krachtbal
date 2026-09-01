import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { startMatch, recordThrow } from '@/lib/match-engine'

// Een speler verwijderen die al gespeeld heeft.
//
// Ook hier staat elke `player_id` als NOT NULL met een sleutel die bij het verwijderen op NULL
// wil zetten — dezelfde tegenspraak die een video-analyse onverwijderbaar maakte. Maar het
// antwoord is een ánder: bij een wedstrijd hoort de bijhorende data mee te verdwijnen, bij een
// speler absoluut niet. Een worp is onwijzigbaar en is de bron van de score; wie een speler met
// zijn worpen mee weggooit, verandert achteraf de uitslag van een gespeelde wedstrijd.
//
// Dus: tegenhouden, met een uitleg. Zonder deze bewaker weigerde de database het ook, maar dan
// met `Failed query: delete from "players"` en zonder te zeggen wat eraan hing.

let payload: Payload

async function maakWedstrijd() {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`
  const club = await payload.create({
    collection: 'clubs', data: { name: `Spelerclub ${stamp}` }, overrideAccess: true,
  })
  const team = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await team(`Thuis ${stamp}`)
  const away = await team(`Uit ${stamp}`)
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
  const homePlayers = await spelers(home.id as number, 1)
  const awayPlayers = await spelers(away.id as number, 11)
  const match = await payload.create({
    collection: 'matches',
    data: {
      reeks: '1NAH', homeTeam: home.id, awayTeam: away.id, date: new Date().toISOString(),
      status: 'scheduled', goalAreaDepth: 10, homeLineup: homePlayers, awayLineup: awayPlayers,
    },
    overrideAccess: true,
  })
  return { matchId: match.id as number, homeId: home.id as number, homePlayers, awayPlayers }
}

describe('een speler verwijderen', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('houdt de verwijdering tegen zodra er worpen op zijn naam staan', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await recordThrow(payload, {
      matchId, playerId: homePlayers[0], type: 'nek', point: { x: 0.5, y: 0.6 }, tapCount: 1,
    })

    await expect(
      payload.delete({ collection: 'players', id: homePlayers[0], overrideAccess: true }),
    ).rejects.toThrow(/worp/i)

    // En hij staat er dus nog — samen met zijn worp.
    const nog = await payload.findByID({ collection: 'players', id: homePlayers[0], depth: 0 })
    expect(nog).toBeTruthy()
  }, 30_000)

  it('zegt in gewone taal wat eraan vasthangt', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await recordThrow(payload, {
      matchId, playerId: homePlayers[0], type: 'nek', point: { x: 0.5, y: 0.6 }, tapCount: 1,
    })
    const fout = await payload
      .delete({ collection: 'players', id: homePlayers[0], overrideAccess: true })
      .then(() => null, (e: Error) => e.message)

    expect(fout).toBeTruthy()
    // Geen SQL, wél een uitweg.
    expect(fout).not.toMatch(/delete from|constraint|\$1/i)
    expect(fout).toMatch(/non-actief|verwijder eerst/i)
  }, 30_000)

  it('laat een speler zonder wedstrijdverleden gewoon verdwijnen', async () => {
    // De bewaker mag niet álles tegenhouden: een verkeerd ingetikte speler moet weg kunnen.
    const { homePlayers } = await maakWedstrijd()
    await payload.delete({ collection: 'players', id: homePlayers[3], overrideAccess: true })
    const weg = await payload
      .findByID({ collection: 'players', id: homePlayers[3], depth: 0 })
      .catch(() => null)
    expect(weg).toBeNull()
  }, 30_000)
})
