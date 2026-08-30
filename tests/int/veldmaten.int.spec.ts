import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { buildMatchState, recordPass, recordThrow, startMatch } from '@/lib/match-engine'
import { totalLengthM } from '@/lib/field'

// Echte terreinmaten (veldBreedte/veldSpeelveld op de wedstrijd): niet elk veld is reglementair
// 14 × 26 m. Wie de échte afstanden opmeet en invult, moet overal echte meters terugkrijgen —
// worpafstand, landingszone én de passregels. Deze test draait dezelfde wedstrijd twee keer,
// één keer reglementair en één keer op een opgemeten (korter, smaller) terrein, en legt vast
// dat de afgeleide meters mee schalen.

let payload: Payload

// Opgemeten terrein: 12 m breed, 20 m tussen de doellijnen, doelgebied 10 m → 40 m totaal.
const ECHTE_MATEN = { veldBreedte: 12, veldSpeelveld: 20 }

async function maakWedstrijd(maten?: { veldBreedte: number; veldSpeelveld: number }) {
  const club = await payload.create({
    collection: 'clubs',
    data: { name: `Maten-testclub ${Date.now()}-${Math.random()}` },
    overrideAccess: true,
  })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('Maten Thuis')
  const away = await mk('Maten Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `Maten speler ${van + i}`, shirtNumber: van + i, team: teamId },
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
      ...(maten ?? {}),
    },
    overrideAccess: true,
  })
  return { matchId: match.id as number, homeId: home.id as number, homePlayers }
}

describe('echte terreinmaten van begin tot eind', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('meet de worpafstand in échte meters, korter dan op een reglementair veld', async () => {
    // Zelfde genormaliseerde worp op beide velden: de afstand moet met de lengte meeschalen.
    const worp = async (maten?: typeof ECHTE_MATEN) => {
      const { matchId, homeId, homePlayers } = await maakWedstrijd(maten)
      await startMatch(payload, matchId, homeId)
      await recordThrow(payload, {
        matchId,
        playerId: homePlayers[0],
        type: 'nek',
        point: { x: 0.5, y: 0.75 },
        tapCount: 1,
      })
      const res = await payload.find({
        collection: 'throws',
        where: { match: { equals: matchId } },
        sort: '-id',
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      return res.docs[0].distance as number
    }
    // De worp vertrekt van de eigen vrijeworplijn (doelgebied + 4 m) recht vooruit naar y = 0.75.
    // In meters is dat 0.75 × lengte − 14, dus op elk veld een ander getal.
    const reglementair = await worp()
    const opgemeten = await worp(ECHTE_MATEN)
    expect(reglementair).toBeCloseTo(0.75 * totalLengthM(10) - 14, 1)
    expect(opgemeten).toBeCloseTo(0.75 * totalLengthM(10, { speelveldM: 20 }) - 14, 1)
    expect(opgemeten).toBeLessThan(reglementair)
  })

  it('beoordeelt de pass op de echte doellijn: in het eigen doelgebied mag voorwaarts', async () => {
    // y = 0.24 ligt binnen het doelgebied van een 40 m-veld (doellijn 10/40 = 0.25), maar
    // buiten dat van een reglementair veld (10/46 ≈ 0.217). §6.10: in het eigen doelgebied
    // mag voorwaarts gepast worden — dus hetzelfde punt geeft een ander oordeel.
    const pass = async (maten?: typeof ECHTE_MATEN) => {
      const { matchId, homeId, homePlayers } = await maakWedstrijd(maten)
      await startMatch(payload, matchId, homeId)
      await recordPass(payload, { matchId, playerId: homePlayers[1], point: { x: 0.5, y: 0.24 } })
      return recordPass(payload, { matchId, playerId: homePlayers[2], point: { x: 0.5, y: 0.4 } })
    }
    expect((await pass(ECHTE_MATEN)).forward).toBe(false)
    expect((await pass()).forward).toBe(true)
  })

  it('meet passwinst in echte meters en geeft de maten mee in de state', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd(ECHTE_MATEN)
    await startMatch(payload, matchId, homeId)
    // De opzet ligt op de eigen vrijeworplijn: op dit veld 14/40, reglementair 14/46.
    // Achteruit passen naar y = 0.25 is hier dus 4 m terug (en zou reglementair 2,5 m zijn).
    const pass = await recordPass(payload, { matchId, playerId: homePlayers[1], point: { x: 0.5, y: 0.25 } })
    expect(pass.gainM).toBeCloseTo((0.25 - 14 / 40) * 40, 1)

    const state = await buildMatchState(payload, matchId)
    // De client (scorekeeper, veldkaart) moet de maten kunnen zien om hetzelfde te tekenen.
    expect(state.match.veldBreedte).toBe(12)
    expect(state.match.veldSpeelveld).toBe(20)
  })

  it('laat een wedstrijd zonder opgemeten maten reglementair rekenen', async () => {
    const { matchId, homeId } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    const state = await buildMatchState(payload, matchId)
    expect(state.match.veldBreedte).toBeNull()
    expect(state.match.veldSpeelveld).toBeNull()
  })
})
