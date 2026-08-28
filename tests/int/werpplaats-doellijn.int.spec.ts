import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { recordThrow, startMatch } from '@/lib/match-engine'

// Reglement §6.4: "De doellijn is enkel beperkend bij opzet uit het doelgebied."
// Wordt de bal ín het doelgebied gevangen, dan zet de tegenpartij op vanaf de DOELLIJN en werpt
// ze van daar. Voordien schoof de werpplaats-projectie dat opzetpunt door naar de vrijeworplijn —
// vier meter te ver, waardoor de afstandsstatistiek en het veldschema fout stonden. Na een
// doelpunt blijft de opzet wél op de vrijeworplijn.

let payload: Payload

const DOELLIJN = 10 / 46 // 10 m doelgebied op een totaal van 46 m
const VRIJEWORPLIJN = 14 / 46 // doellijn + 4 m

async function maakWedstrijd() {
  const club = await payload.create({
    collection: 'clubs',
    data: { name: `Werpplaats-testclub ${Date.now()}` },
    overrideAccess: true,
  })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('WP Thuis')
  const away = await mk('WP Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `WP speler ${van + i}`, shirtNumber: van + i, team: teamId },
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

// De worp zelf bewaart geen werpplaats (event-sourcing: enkel de ruwe landing). De gebruikte
// werpplaats blijkt uit de AFGELEIDE afstand — precies de statistiek die scheef stond zolang het
// opzetpunt vier meter opschoof.
async function laatsteAfstand(matchId: number) {
  const res = await payload.find({
    collection: 'throws',
    where: { match: { equals: matchId } },
    sort: '-id',
    depth: 0,
    limit: 1,
  })
  return Number((res.docs[0] as unknown as { distance: number }).distance)
}

describe('werpplaats bij opzet vanaf de doellijn (§6.4)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('houdt de werpplaats op de doellijn na een vangst in het doelgebied', async () => {
    const { matchId, homeId, homePlayers, awayPlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)

    // Thuis valt aan richting y=1; away naar y=0. Deze worp wordt gevangen in het doelgebied aan
    // de y=0-zijde → away zet op vanaf het midden van díe doellijn.
    const vangst = await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.03 },
      tapCount: 2,
    })
    expect(vangst.outcome).toBe('caught')
    expect(vangst.state.possession?.side).toBe('away')
    expect(vangst.state.possession?.setupY).toBeCloseTo(DOELLIJN, 5)

    // De eerste worp van dat balbezit vertrekt van de doellijn (10 m) — niet van de
    // vrijeworplijn (14 m). Landing op y=0.6 = 27,6 m → 17,6 m i.p.v. de foute 13,6 m.
    await recordThrow(payload, {
      matchId,
      playerId: awayPlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.6 },
      tapCount: 2,
    })
    expect(await laatsteAfstand(matchId)).toBeCloseTo(17.6, 1)
  })

  it('schuift een bal die tússen doellijn en vrijeworplijn de grond raakt wél tot de vrijeworplijn', async () => {
    const { matchId, homeId, homePlayers, awayPlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)

    // Opzet op 12 m van de achterlijn: voorbij de doellijn (10 m), maar vóór de vrijeworplijn
    // (14 m) én niet ín het doelgebied. Away schuift dus wél terug tot op de vrijeworplijn:
    // landing op y=0.6 (27,6 m) → 13,6 m in de lengte, plus 1,4 m breedteverschil.
    const vangst = await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.4, y: 12 / 46 },
      tapCount: 2,
    })
    expect(vangst.state.possession?.side).toBe('away')
    expect(vangst.state.possession?.setupY).toBeCloseTo(12 / 46, 5)
    await recordThrow(payload, {
      matchId,
      playerId: awayPlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.6 },
      tapCount: 2,
    })
    expect(await laatsteAfstand(matchId)).toBeCloseTo(Math.hypot(1.4, 13.6), 1)
  })

  it('laat de opzet na een doelpunt op de vrijeworplijn staan', async () => {
    const { matchId, homeId, homePlayers, awayPlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)

    const goal = await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.97 },
      tapCount: 1,
    })
    expect(goal.outcome).toBe('goal')
    expect(goal.state.possession?.side).toBe('away')
    expect(goal.state.possession?.setupY).toBeCloseTo(1 - VRIJEWORPLIJN, 5)

    // Opzet op 32 m (46 − 14), landing op y=0.4 = 18,4 m → 13,6 m.
    await recordThrow(payload, {
      matchId,
      playerId: awayPlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.4 },
      tapCount: 2,
    })
    expect(await laatsteAfstand(matchId)).toBeCloseTo(13.6, 1)
  })
})
