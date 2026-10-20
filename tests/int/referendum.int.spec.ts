// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'

// Inlog als dubbel: de Authorization-header bevat de gebruiker als JSON.
vi.mock('@/lib/api-auth', async (origineel) => ({
  ...(await origineel<Record<string, unknown>>()),
  authUser: async (_p: unknown, req: Request) => {
    const a = req.headers.get('authorization')
    return a ? JSON.parse(a) : null
  },
}))

import config from '@/payload.config'
import { POST as beheer } from '@/app/api/federatie/referendum/route'
import { GET as stemGet, POST as stemPost } from '@/app/api/referendum/stem/route'

// Een volledige stemronde door de echte routes: aanmaken, openen, stemmen (met de regels), sluiten,
// bekendmaken → de winnaar staat in het archief.

let payload: Payload
const STAMP = Date.now()
const REEKS = 'RHC'
const SEIZOEN = '2091-2092'
const spelers: { id: number; club: number }[] = []
const fed = { id: 1, roles: ['federatie'] }

const req = (wie: unknown, body?: unknown) =>
  new Request('http://localhost/x', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(wie ? { authorization: JSON.stringify(wie) } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const als = (i: number) => ({ id: 1000 + i, roles: ['club-lid'], player: spelers[i].id })

describe('referendum', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.delete({ collection: 'referendum-rondes', where: { status: { equals: 'open' } }, overrideAccess: true }).catch(() => null)
    await payload.delete({ collection: 'referendum-rondes', where: { seizoen: { equals: SEIZOEN } }, overrideAccess: true }).catch(() => null)
    await payload.delete({ collection: 'matches', where: { reeks: { equals: REEKS } }, overrideAccess: true }).catch(() => null)
    await payload.delete({ collection: 'teams', where: { reeks: { equals: REEKS } }, overrideAccess: true }).catch(() => null)
    const ploegen: number[] = []
    for (const c of [1, 2, 3, 4]) {
      const club = await payload.create({ collection: 'clubs', data: { name: `Ref club ${c} ${STAMP}` }, overrideAccess: true })
      const team = await payload.create({ collection: 'teams', data: { name: `Ref ${c} ${STAMP}`, club: club.id, category: 'senioren', reeks: REEKS }, overrideAccess: true })
      ploegen.push(Number(team.id))
      for (const n of [1, 2]) {
        const p = await payload.create({
          collection: 'players',
          data: { name: `Ref speler ${c}${n}`, team: team.id, shirtNumber: n, birthDate: n === 1 ? '2000-01-01' : '2010-01-01' },
          overrideAccess: true,
        })
        spelers.push({ id: Number(p.id), club: Number(club.id) })
      }
    }
    // Twee afgelopen wedstrijden; de scheidsrechter bevestigde dat iedereen speelde.
    for (const [a, b] of [
      [0, 1],
      [2, 3],
    ]) {
      const m = await payload.create({
        collection: 'matches',
        data: { homeTeam: ploegen[a], awayTeam: ploegen[b], date: '2091-10-01T12:00:00Z', seizoen: SEIZOEN, status: 'finished', goalAreaDepth: 10, reeks: REEKS },
        overrideAccess: true,
      })
      const rij = (i: number) => ({ player: spelers[i].id, rugnummer: (i % 2) + 1, deelgenomen: true })
      await payload.create({
        collection: 'matchsheets',
        data: { match: m.id, status: 'concept', homeLineup: [rij(a * 2), rij(a * 2 + 1)], awayLineup: [rij(b * 2), rij(b * 2 + 1)] },
        overrideAccess: true,
      })
    }
  }, 120_000)

  let rondeId = 0

  it('de federatie maakt een ronde en opent ze', async () => {
    expect((await beheer(req({ id: 2, roles: ['club-beheerder'] }, { actie: 'aanmaken', seizoen: SEIZOEN }))).status).toBe(403)
    const r = (await (await beheer(req(fed, { actie: 'aanmaken', seizoen: SEIZOEN, reeksHeren: REEKS, minWedstrijden: 1 }))).json()) as { id: number }
    rondeId = r.id
    expect((await beheer(req(fed, { actie: 'status', rondeId, status: 'open' }))).status).toBe(200)
  })

  it('wie geen gekoppelde speler heeft, stemt niet', async () => {
    const d = (await (await stemGet(req({ id: 5, roles: ['viewer'] }))).json()) as { magStemmen: boolean; reden: string }
    expect(d.magStemmen).toBe(false)
    expect(d.reden).toContain('gekoppeld')
  })

  it('een speler ziet enkel spelers van andere clubs en stemt volgens de regels', async () => {
    const d = (await (await stemGet(req(als(0)))).json()) as { magStemmen: boolean; kiesbaar: { id: number }[] }
    expect(d.magStemmen).toBe(true)
    expect(d.kiesbaar.map((k) => k.id).sort()).toEqual(spelers.slice(2).map((s) => s.id).sort())

    const fout = await stemPost(req(als(0), { regels: [5, 4, 3, 2, 1].map((p, i) => ({ speler: spelers[i].id, punten: p })) }))
    expect(fout.status).toBe(400)

    const stem = (i: number, keuze: number[]) =>
      stemPost(req(als(i), { regels: [5, 4, 3, 2, 1].map((p, j) => ({ speler: spelers[keuze[j]].id, punten: p })) }))
    expect((await stem(0, [2, 3, 4, 5, 6])).status).toBe(200)
    expect((await stem(1, [2, 4, 3, 5, 7])).status).toBe(200)
    expect((await stem(4, [2, 0, 1, 6, 7])).status).toBe(200)
    // Aanpassen mag: de laatste stem telt, er komt geen tweede bij.
    expect((await stem(4, [2, 0, 1, 7, 6])).status).toBe(200)
    expect((await payload.count({ collection: 'referendum-stemmen', where: { ronde: { equals: rondeId } } })).totalDocs).toBe(3)
  })

  it('sluiten en bekendmaken: de winnaar komt in het archief', async () => {
    expect((await beheer(req(fed, { actie: 'publiceren', rondeId }))).status).toBe(409)
    await beheer(req(fed, { actie: 'status', rondeId, status: 'gesloten' }))
    expect((await stemPost(req(als(0), { regels: [] }))).status).toBe(409)
    const r = (await (await beheer(req(fed, { actie: 'publiceren', rondeId }))).json()) as { winnaars: { prijs: string; naam: string }[] }
    // Speler 2 (club 2) kreeg 3× 5 punten.
    expect(r.winnaars.find((w) => w.prijs === 'Speler van het jaar')?.naam).toBe('Ref speler 21')
    const archief = (await payload.find({ collection: 'referendum-awards', where: { prijs: { equals: 'Speler van het jaar' } }, limit: 1 })).docs[0]
    expect(archief.winnaars?.find((w) => w.jaar === SEIZOEN)?.naam).toBe('Ref speler 21')
    // Belofte (jonger dan 21): enkel de spelers geboren in 2010 tellen.
    expect(r.winnaars.find((w) => w.prijs === 'Belofte van het jaar (jongens)')?.naam).toMatch(/2$/)
  })
})
