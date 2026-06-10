import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { beforeAll, describe, expect, it } from 'vitest'

import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'

let payload: Payload

const relIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x && typeof x === 'object' ? (x as { id?: unknown }).id : x)) : []

// Volledige keten van het analyse-delen, tegen een echte Payload-instantie: A vinkt B aan →
// de Users-hook vult de inverse bij B → B heeft daardoor analyse-toegang én ZIET de
// analysewedstrijd van A via dezelfde Where als alle analysepagina's. ("Als ik deel met
// iemand, moet die het aan de andere kant zien — anders heeft het geen zin.")
describe('analyse delen end-to-end', () => {
  let aId: number
  let bId: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const stamp = Date.now()
    const a = await payload.create({
      collection: 'users',
      data: { email: `deler-${stamp}@test.be`, password: 'analyse-test-123', name: 'Deler A', analyseAccess: true },
      overrideAccess: true,
    })
    const b = await payload.create({
      collection: 'users',
      data: { email: `kijker-${stamp}@test.be`, password: 'analyse-test-123', name: 'Kijker B' },
      overrideAccess: true,
    })
    aId = Number(a.id)
    bId = Number(b.id)
  })

  it('A deelt met B → B krijgt de inverse, analyse-toegang én ziet A’s analysewedstrijd', async () => {
    const bVoor = await payload.findByID({ collection: 'users', id: bId, depth: 0 })
    expect(canAnalyse(bVoor)).toBe(false)

    // Delen zoals de Delen-kaart het doet (alleen lezen).
    await payload.update({ collection: 'users', id: aId, data: { analyseDeeltMet: [bId] }, overrideAccess: true })

    const bNa = await payload.findByID({ collection: 'users', id: bId, depth: 0 })
    expect(relIds(bNa.analyseToegangTot)).toContain(String(aId))
    expect(canAnalyse(bNa)).toBe(true)

    // Analysewedstrijd van A opbouwen (club → ploegen → wedstrijd) en door B's bril bekijken.
    const club = await payload.create({
      collection: 'clubs',
      data: { name: `Analyseclub ${aId}`, analyseOnly: true, analyseOwner: aId },
      overrideAccess: true,
    })
    const maakTeam = async (naam: string) =>
      (
        await payload.create({
          collection: 'teams',
          data: { name: naam, club: club.id, category: 'senioren', reeks: 'LH', analyseOnly: true, analyseOwner: aId },
          overrideAccess: true,
        })
      ).id
    const [thuis, uit] = [await maakTeam(`T-thuis-${aId}`), await maakTeam(`T-uit-${aId}`)]
    const match = await payload.create({
      collection: 'matches',
      data: {
        homeTeam: thuis,
        awayTeam: uit,
        date: new Date().toISOString(),
        status: 'scheduled',
        goalAreaDepth: 10,
        reeks: 'LH',
        analyseOnly: true,
        analyseOwner: aId,
      },
      overrideAccess: true,
    })

    const zichtbaar = await payload.find({ collection: 'matches', where: analyseOwnWhere(bNa), depth: 0, limit: 50 })
    expect(zichtbaar.docs.map((m) => m.id)).toContain(match.id)
  })

  it('delen stoppen → B verliest de toegang weer', async () => {
    await payload.update({ collection: 'users', id: aId, data: { analyseDeeltMet: [] }, overrideAccess: true })
    const b = await payload.findByID({ collection: 'users', id: bId, depth: 0 })
    expect(relIds(b.analyseToegangTot)).not.toContain(String(aId))
    expect(canAnalyse(b)).toBe(false)
  })

  it('meedoen & aanpassen vult de bewerk-inverse (en geeft dus ook toegang)', async () => {
    await payload.update({ collection: 'users', id: aId, data: { analyseDeeltBewerkMet: [bId] }, overrideAccess: true })
    const b = await payload.findByID({ collection: 'users', id: bId, depth: 0 })
    expect(relIds(b.analyseBewerkTot)).toContain(String(aId))
    expect(canAnalyse(b)).toBe(true)
  })
})
