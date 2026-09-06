import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import config from '@/payload.config'
import { buildMatchState } from '@/lib/match-engine'
import {
  advanceSimpleHalf,
  adjustRefereeStop,
  adjustSimpleCross,
  adjustSimpleTimeout,
  recordSimpleGoal,
  startSimpleMatch,
  undoSimpleGoal,
} from '@/lib/simple-match-engine'

// Ondoen per ploeg aan de aantekentafel.
//
// Elke ploegkaart heeft een eigen ↩-pijl: je zet een misklik bij één ploeg recht zonder de andere
// aan te raken. Twee dingen moeten daarvoor kloppen — de server neemt écht alleen het laatste
// doelpunt van die kant weg, en de knop weet wanneer er niets meer te ondoen valt (een afgesloten
// helft is vergrendeld). Meteen ook de finished-guard, die op deze weg ontbrak.

let payload: Payload

async function maakWedstrijd() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const club = await payload.create({ collection: 'clubs', data: { name: `Ondoenclub ${stamp}` }, overrideAccess: true })
  const mk = (naam: string) =>
    payload.create({
      collection: 'teams',
      data: { name: naam, reeks: 'LH', category: 'senioren', club: club.id },
      overrideAccess: true,
    })
  const thuis = await mk(`Thuis ${stamp}`)
  const uit = await mk(`Uit ${stamp}`)
  const m = await payload.create({
    collection: 'matches',
    data: {
      reeks: 'LH',
      homeTeam: thuis.id,
      awayTeam: uit.id,
      date: new Date().toISOString(),
      status: 'scheduled',
      goalAreaDepth: 10,
    },
    overrideAccess: true,
  })
  return m.id as number
}

describe('ondoen per ploeg', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  }, 90_000)

  it('neemt enkel het laatste doelpunt van de gevraagde ploeg terug', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)
    await recordSimpleGoal(payload, id, 'away', 1)
    await recordSimpleGoal(payload, id, 'home', 1)
    expect((await buildMatchState(payload, id)).score).toEqual({ home: 3, away: 1 })

    // De uitploeg terugnemen mag de thuisploeg niet raken — ook al scoorde thuis het laatst.
    const na = await undoSimpleGoal(payload, id, 'away')
    expect(na.score).toEqual({ home: 3, away: 0 })

    // En omgekeerd: thuis verliest z'n JONGSTE doelpunt (+1), niet z'n eerste (+2).
    const na2 = await undoSimpleGoal(payload, id, 'home')
    expect(na2.score).toEqual({ home: 2, away: 0 })
  }, 60_000)

  it('doet niets wanneer die ploeg niets heeft staan', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)

    const na = await undoSimpleGoal(payload, id, 'away')
    expect(na.score).toEqual({ home: 2, away: 0 })
  }, 60_000)

  it('zonder ploeg neemt het jongste doelpunt van beide ploegen', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)
    await recordSimpleGoal(payload, id, 'away', 1)

    const na = await undoSimpleGoal(payload, id)
    expect(na.score).toEqual({ home: 2, away: 0 })
  }, 60_000)

  it('raakt een afgesloten helft niet meer aan — de knop weet dat ook', async () => {
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)
    await advanceSimpleHalf(payload, id)
    await recordSimpleGoal(payload, id, 'away', 1)

    const state = await buildMatchState(payload, id)
    // Thuis scoorde enkel in helft 1: geen actieve ondoen-pijl, anders belooft ze iets wat de
    // server weigert. Uit scoorde in helft 2 en heeft er wél een.
    expect(state.lastSimpleGoalBySide.home).toBeNull()
    expect(state.lastSimpleGoalBySide.away).toMatchObject({ side: 'away', points: 1, half: 2 })

    // En de server houdt zich aan diezelfde grens.
    const na = await undoSimpleGoal(payload, id, 'home')
    expect(na.score).toEqual({ home: 2, away: 1 })
  }, 90_000)

  it('weigert elke wijziging aan een afgelopen wedstrijd', async () => {
    // CLAUDE.md, invariant 3. Deze vier wegen stonden open: enkel de UI verborg de knoppen.
    const id = await maakWedstrijd()
    await startSimpleMatch(payload, id)
    await recordSimpleGoal(payload, id, 'home', 2)
    await payload.update({ collection: 'matches', id, data: { status: 'finished' }, overrideAccess: true })

    await expect(undoSimpleGoal(payload, id, 'home')).rejects.toThrow(/afgelopen/i)
    await expect(adjustSimpleCross(payload, id, 'home', 1)).rejects.toThrow(/afgelopen/i)
    await expect(adjustSimpleTimeout(payload, id, 'home', 1)).rejects.toThrow(/afgelopen/i)
    await expect(adjustRefereeStop(payload, id, 1)).rejects.toThrow(/afgelopen/i)

    const na = await buildMatchState(payload, id)
    expect(na.score).toEqual({ home: 2, away: 0 })
  }, 90_000)
})
