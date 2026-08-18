import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { recordPass, recordThrow, startMatch, undoLastThrow } from '@/lib/match-engine'

// Reglement §6.10: een pass verbruikt geen werpbeurt maar verlegt wél de werpplaats. Voorwaarts
// doorgeven is een fout (Item 14.10): opzet voor de tegenpartij vanaf de vórige werpplaats.

let payload: Payload

async function maakWedstrijd() {
  const club = await payload.create({ collection: 'clubs', data: { name: `Pass-testclub ${Date.now()}` }, overrideAccess: true })
  const mk = async (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: '1NAH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const home = await mk('Pass Thuis')
  const away = await mk('Pass Uit')
  const spelers = async (teamId: number, van: number) => {
    const uit: number[] = []
    for (let i = 0; i < 4; i++) {
      const p = await payload.create({
        collection: 'players',
        data: { name: `Pass speler ${van + i}`, shirtNumber: van + i, team: teamId },
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

describe('de pass (§6.10)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('verbruikt geen werpbeurt en verlegt de werpplaats', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)

    // Opzet ligt op de eigen vrijeworplijn (y = 14/46); zijwaarts doorgeven mag.
    const pass = await recordPass(payload, {
      matchId,
      playerId: homePlayers[1],
      point: { x: 0.15, y: 14 / 46 },
    })
    expect(pass.forward).toBe(false)
    // Nog steeds worp 1 van 3: een pass telt niet als werpbeurt.
    expect(pass.state.possession?.nextThrowNumber).toBe(1)
    expect(pass.state.possession?.throwsAllowed).toBe(3)

    // De volgende worp vertrekt vanaf de vangplaats — dat zie je aan de gemeten afstand.
    const worp = await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.15, y: 0.6 },
      tapCount: 1,
    })
    const gemeten = await payload.findByID({ collection: 'throws', id: worp.throwId, depth: 0 })
    // Zuiver in de lengte: (0.6 − 14/46) × 46 m ≈ 13,6 m. Vertrok de worp uit het midden (x 0.5),
    // dan zou de zijwaartse component van 4,9 m de afstand op ~14,4 m brengen.
    expect(gemeten.distance).toBeCloseTo(13.6, 1)
  })

  it('een voorwaartse pass geeft de bal aan de tegenpartij, vanaf de vorige werpplaats', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)

    const pass = await recordPass(payload, {
      matchId,
      playerId: homePlayers[1],
      point: { x: 0.5, y: 0.45 },
    })
    expect(pass.forward).toBe(true)
    expect(pass.state.possession?.side).toBe('away')
    // Opzet vanaf de vórige werpplaats (de eigen vrijeworplijn van thuis), niet vanaf de vangplaats.
    expect(pass.state.possession?.setupY).toBeCloseTo(14 / 46, 3)
  })

  it('undo draait eerst de pass terug, daarna pas de worp', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await recordThrow(payload, {
      matchId,
      playerId: homePlayers[0],
      type: 'nek',
      point: { x: 0.5, y: 0.55 },
      tapCount: 1,
    })
    await recordPass(payload, { matchId, playerId: homePlayers[1], point: { x: 0.2, y: 0.55 } })

    const naUndo1 = await undoLastThrow(payload, matchId)
    // Pass weg, worp blijft: nog altijd worp 2 aan de beurt.
    expect(naUndo1.possession?.nextThrowNumber).toBe(2)
    const passenNaUndo = await payload.count({
      collection: 'match-events',
      where: { and: [{ match: { equals: matchId } }, { type: { equals: 'pass' } }] },
    })
    expect(passenNaUndo.totalDocs).toBe(0)

    const naUndo2 = await undoLastThrow(payload, matchId)
    expect(naUndo2.possession?.nextThrowNumber).toBe(1)
  })

  it('undo draait ook een voorwaartse pass terug (bal komt terug bij de ploeg)', async () => {
    const { matchId, homeId, homePlayers } = await maakWedstrijd()
    await startMatch(payload, matchId, homeId)
    await recordPass(payload, { matchId, playerId: homePlayers[1], point: { x: 0.5, y: 0.45 } })

    const naUndo = await undoLastThrow(payload, matchId)
    expect(naUndo.possession?.side).toBe('home')
    expect(naUndo.possession?.nextThrowNumber).toBe(1)
    const passen = await payload.count({
      collection: 'match-events',
      where: { and: [{ match: { equals: matchId } }, { type: { equals: 'pass' } }] },
    })
    expect(passen.totalDocs).toBe(0)
  })
})
