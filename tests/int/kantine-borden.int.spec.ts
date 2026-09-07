import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { bouwKantineBorden } from '@/lib/kantine-borden'
import { buildMatchState } from '@/lib/match-engine'
import { recordSimpleGoal, startSimpleMatch } from '@/lib/simple-match-engine'

// De kantinefeeds bouwden hun borden met buildMatchState PER wedstrijd — een tiental query's elk,
// sequentieel. Een club met een dozijn ploegen kwam op een speeldag zo aan honderden round-trips,
// en de tv in de kantine bleef ondertussen wit staan. Nu gaat dat gebatcht.
//
// Deze test bewaakt de twee dingen die daarbij tellen:
//   1. de uitkomst blijft exact dezelfde als wat buildMatchState gaf (stand, status, ploegen);
//   2. het aantal database-oproepen groeit niet mee met het aantal wedstrijden.
// Zonder (2) sluipt de oude N+1 er zo weer in.

let payload: Payload

async function maakWedstrijd(nr: number, doelpunten: { home: number; away: number }) {
  const stamp = `${Date.now()}-${nr}-${Math.floor(Math.random() * 1000)}`
  const club = await payload.create({ collection: 'clubs', data: { name: `Kantineclub ${stamp}` }, overrideAccess: true })
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
  await startSimpleMatch(payload, m.id as number)
  for (let i = 0; i < doelpunten.home; i += 1) await recordSimpleGoal(payload, m.id as number, 'home', 1)
  for (let i = 0; i < doelpunten.away; i += 1) await recordSimpleGoal(payload, m.id as number, 'away', 1)
  return m.id as number
}

/** Telt de database-oproepen die `f` doet. */
async function tel<T>(f: () => Promise<T>): Promise<{ uit: T; oproepen: number }> {
  const methodes = ['find', 'findByID', 'count', 'findGlobal'] as const
  const origineel = methodes.map((m) => [m, payload[m]] as const)
  let n = 0
  for (const [m, fn] of origineel) {
    ;(payload as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => {
      n += 1
      return (fn as (...x: unknown[]) => unknown).call(payload, ...a)
    }
  }
  try {
    return { uit: await f(), oproepen: n }
  } finally {
    for (const [m, fn] of origineel) (payload as unknown as Record<string, unknown>)[m] = fn
  }
}

describe('borden voor het kantinescherm', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('geeft per wedstrijd dezelfde stand, status en ploegen als buildMatchState', async () => {
    const ids = [await maakWedstrijd(1, { home: 3, away: 1 }), await maakWedstrijd(2, { home: 0, away: 2 })]
    const docs = (await payload.find({ collection: 'matches', where: { id: { in: ids } }, depth: 0, pagination: false })).docs

    const borden = await bouwKantineBorden(payload, docs)
    expect(borden.map((b) => b.id)).toEqual(docs.map((d) => d.id))

    for (const bord of borden) {
      const state = await buildMatchState(payload, bord.id)
      expect(bord.status).toBe(state.match.status)
      expect(bord.score).toEqual(state.score)
      expect(bord.home.name).toBe(state.teams.home.name)
      expect(bord.away.name).toBe(state.teams.away.name)
    }
  })

  it('gebruikt een vast aantal database-oproepen, ongeacht het aantal wedstrijden', async () => {
    const eenId = await maakWedstrijd(3, { home: 1, away: 1 })
    const meerIds = [eenId]
    for (let i = 0; i < 4; i += 1) meerIds.push(await maakWedstrijd(10 + i, { home: i, away: 1 }))

    const haal = async (ids: number[]) =>
      (await payload.find({ collection: 'matches', where: { id: { in: ids } }, depth: 0, pagination: false })).docs

    const een = await tel(async () => bouwKantineBorden(payload, await haal([eenId])))
    const meer = await tel(async () => bouwKantineBorden(payload, await haal(meerIds)))

    expect(meer.uit.length).toBe(5)
    // Vijf keer zoveel wedstrijden, evenveel oproepen. (De `find` hierboven zit in beide mee.)
    expect(meer.oproepen).toBe(een.oproepen)
  })

  it('slaat een wedstrijd met een ontbrekende ploeg over in plaats van het scherm leeg te maken', async () => {
    const goedId = await maakWedstrijd(4, { home: 2, away: 0 })
    const docs = (await payload.find({ collection: 'matches', where: { id: { equals: goedId } }, depth: 0 })).docs
    const kapot = { ...docs[0], id: docs[0].id + 1_000_000, homeTeam: 999_999, awayTeam: 999_998 }

    const borden = await bouwKantineBorden(payload, [kapot, ...docs])
    expect(borden.map((b) => b.id)).toEqual([goedId])
  })
})
